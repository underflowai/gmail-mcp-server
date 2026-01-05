# Gmail MCP Server

An MCP (Model Context Protocol) server that exposes Gmail tools via Streamable HTTP transport. Enables AI assistants to read, search, organize, and draft emails in your Gmail inbox.

## Features

- **23 Gmail tools** for comprehensive inbox management
- **Two-layer OAuth**: MCP-level JWT authentication + Google OAuth for Gmail access
- **Secure token storage**: SQLite with AES-256-GCM encryption for refresh tokens
- **Streamable HTTP transport**: Stateless mode for easy deployment
- **Automatic token refresh**: Proactive refresh 5 minutes before expiry

## Requirements

- Node.js >= 20.0.0
- Google Cloud project with Gmail API enabled
- OAuth 2.0 credentials (Web application type)

## Installation

```bash
git clone <repository-url>
cd gmail-mcp
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `BASE_URL` | Public URL of the server |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OAUTH_REDIRECT_URI` | OAuth callback URL (e.g., `http://localhost:3000/oauth/callback`) |
| `TOKEN_ENCRYPTION_KEY` | 32-byte key for encrypting stored tokens |
| `JWT_SECRET` | Secret for signing MCP-level JWTs |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `DB_URL` | SQLite database path (default: `./data/gmail-mcp.db`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

### Generating Secrets

```bash
# Generate TOKEN_ENCRYPTION_KEY (32 bytes, base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## Running the Server

```bash
# Production
npm run build
npm start

# Development (with hot reload)
npm run dev
```

The server exposes:
- `POST /mcp` - MCP protocol endpoint
- `GET /healthz` - Health check
- `GET /oauth/start` - Initiate Gmail OAuth flow
- `GET /oauth/callback` - OAuth callback handler
- `GET /.well-known/oauth-protected-resource` - OAuth discovery

## Available Tools

### Authentication
| Tool | Description |
|------|-------------|
| `gmail.status` | Check if Gmail is connected |
| `gmail.authorize` | Initiate OAuth flow to connect Gmail |

### Reading Messages
| Tool | Description |
|------|-------------|
| `gmail.searchMessages` | Search using Gmail query syntax |
| `gmail.getMessage` | Get a single message by ID |
| `gmail.listThreads` | List conversation threads |
| `gmail.getThread` | Get all messages in a thread |
| `gmail.getAttachmentMetadata` | Get attachment info (filename, size, MIME type) |

### Labels
| Tool | Description | Scope Required |
|------|-------------|----------------|
| `gmail.listLabels` | List all labels with counts | - |
| `gmail.getLabelInfo` | Get label details | - |
| `gmail.addLabels` | Add labels to messages/threads | `gmail.labels` |
| `gmail.removeLabels` | Remove labels from messages/threads | `gmail.labels` |
| `gmail.createLabel` | Create a custom label | `gmail.labels` |

### Message Organization
| Tool | Description | Scope Required |
|------|-------------|----------------|
| `gmail.archiveMessages` | Archive messages/threads | `gmail.labels` |
| `gmail.unarchiveMessages` | Move back to inbox | `gmail.labels` |
| `gmail.markAsRead` | Mark as read | `gmail.labels` |
| `gmail.markAsUnread` | Mark as unread | `gmail.labels` |
| `gmail.starMessages` | Add star | `gmail.labels` |
| `gmail.unstarMessages` | Remove star | `gmail.labels` |

### Drafts
| Tool | Description | Scope Required |
|------|-------------|----------------|
| `gmail.createDraft` | Create a new draft | `gmail.compose` |
| `gmail.listDrafts` | List all drafts | - |
| `gmail.getDraft` | Get draft content | - |
| `gmail.updateDraft` | Update existing draft | `gmail.compose` |
| `gmail.deleteDraft` | Delete a draft | `gmail.compose` |

## OAuth Scopes

Request scopes when calling `gmail.authorize`:

| Scope | Permissions |
|-------|-------------|
| `gmail.readonly` | Read messages, threads, labels |
| `gmail.labels` | Modify labels, archive, star, mark read/unread |
| `gmail.compose` | Create, update, and delete drafts |

Example:
```json
{
  "scopes": ["gmail.readonly", "gmail.labels", "gmail.compose"]
}
```

## Architecture

```
MCP Client → Fastify HTTP (/mcp) → MCP Server → Gmail Client → Google APIs
                    ↓
            Token Store (SQLite) ← encrypted credentials
```

### Key Components

- **`src/index.ts`** - Entry point
- **`src/config.ts`** - Zod-validated configuration
- **`src/http/server.ts`** - Fastify HTTP server
- **`src/mcp/server.ts`** - MCP server with all tools
- **`src/gmail/client.ts`** - Gmail API wrapper with token refresh
- **`src/auth/mcpOAuth.ts`** - MCP-level JWT authentication
- **`src/auth/googleOAuth.ts`** - Google OAuth flow with PKCE
- **`src/store/sqlite.ts`** - SQLite token storage with encryption

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint

# Run single test file
npx vitest run tests/unit/crypto.test.ts
```

## Error Handling

The server uses JSON-RPC error codes:

| Code | Type | Description |
|------|------|-------------|
| `-32001` | `NOT_AUTHORIZED` | User not authenticated or token revoked |
| `-32602` | `INVALID_ARGUMENT` | Invalid input parameters |
| `-32000` | `GMAIL_API_ERROR` | Gmail API error or rate limit |

When `invalid_grant` is returned from Google (token revoked), stored tokens are cleared and the user must re-authorize.

## Security

- Refresh tokens encrypted with AES-256-GCM before storage
- MCP-level JWTs (HS256) with 1-hour lifetime
- Google OAuth with PKCE support
- CSRF protection via state parameter

## License

MIT
