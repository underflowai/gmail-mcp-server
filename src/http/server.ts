import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Config } from '../config.js';
import type { TokenStore } from '../store/interface.js';
import type { McpServerInstance } from '../mcp/server.js';
import { createMcpOAuth } from '../auth/mcpOAuth.js';
import { createGoogleOAuth } from '../auth/googleOAuth.js';

export interface HttpServerDependencies {
  config: Config;
  tokenStore: TokenStore;
  mcpServer: McpServerInstance;
}

export async function createHttpServer(deps: HttpServerDependencies): Promise<FastifyInstance> {
  const { config, tokenStore, mcpServer } = deps;

  // Create OAuth handlers
  const mcpOAuth = createMcpOAuth({ config });
  const googleOAuth = createGoogleOAuth({ config, tokenStore });

  const server = Fastify({
    logger: {
      level: 'info',
    },
  });

  // Custom JSON body parser
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Form-urlencoded parser (required for OAuth token endpoint)
  server.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const params = new URLSearchParams(body as string);
      const result: Record<string, string> = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      done(null, result);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // CORS handling
  if (config.allowedOrigins.length > 0) {
    server.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && config.allowedOrigins.includes(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
        reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
      }

      if (request.method === 'OPTIONS') {
        reply.status(204).send();
      }
    });
  }

  // Health check endpoint
  server.get('/healthz', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await tokenStore.cleanupExpiredStates();
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch {
      reply.status(503);
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        issues: ['Token store unavailable'],
      };
    }
  });

  // MCP Streamable HTTP endpoint
  server.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request.raw;
    const res = reply.raw;
    await mcpServer.handleRequest(req, res, request.body);
    reply.hijack();
  });

  server.get('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request.raw;
    const res = reply.raw;
    await mcpServer.handleRequest(req, res);
    reply.hijack();
  });

  // MCP OAuth endpoints
  server.get('/oauth/authorize', mcpOAuth.authorizeEndpointHandler);
  server.post('/oauth/token', mcpOAuth.tokenEndpointHandler);

  // Dynamic Client Registration (RFC 7591)
  server.post('/oauth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      client_name?: string;
      redirect_uris?: string[];
    } | null;

    // Generate client credentials
    const clientId = randomBytes(16).toString('hex');
    const clientSecret = randomBytes(32).toString('hex');

    reply.status(201);
    return {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: body?.client_name ?? 'MCP Client',
      redirect_uris: body?.redirect_uris ?? [],
      token_endpoint_auth_method: 'client_secret_post',
    };
  });

  // Google OAuth endpoints
  server.get('/oauth/start', googleOAuth.startHandler);
  server.get('/oauth/callback', googleOAuth.callbackHandler);

  // Well-known endpoints for MCP OAuth discovery
  server.get('/.well-known/oauth-protected-resource', async () => {
    return {
      resource: config.baseUrl,
      authorization_servers: [config.baseUrl],
    };
  });

  server.get('/.well-known/oauth-authorization-server', async () => {
    return {
      issuer: config.baseUrl,
      authorization_endpoint: `${config.baseUrl}/oauth/authorize`,
      token_endpoint: `${config.baseUrl}/oauth/token`,
      registration_endpoint: `${config.baseUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
    };
  });

  return server;
}
