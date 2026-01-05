# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run start          # Run compiled server
npm run dev            # Dev mode with hot reload (tsx watch)
npm run test           # Run unit tests (vitest)
npm run test:coverage  # Tests with coverage report
npm run lint           # ESLint
npm run typecheck      # Type checking only
```

Run a single test file: `npx vitest run tests/unit/crypto.test.ts`

## Architecture Overview

This is an MCP (Model Context Protocol) server that exposes Gmail inbox tools via Streamable HTTP transport. It implements two-layer OAuth: MCP-level JWT authentication and Google OAuth for Gmail access. Supports **multi-inbox**: users can connect multiple Gmail accounts and switch between them.

### Core Data Flow

```
MCP Client → Fastify HTTP (/mcp) → MCP Server → Gmail Client → Google APIs
                ↓
        Token Store (SQLite) ← encrypted credentials
```

### Key Modules

- **`src/index.ts`** - Entry point; initializes config, token store, MCP server, HTTP server
- **`src/config.ts`** - Zod-validated environment configuration with lazy initialization
- **`src/http/server.ts`** - Fastify server exposing `/mcp`, `/oauth/*`, `/healthz`, `/.well-known/*`
- **`src/mcp/server.ts`** - MCP server with 26 tools registered; validates inputs with Zod schemas
- **`src/gmail/client.ts`** - Gmail API wrapper with token refresh logic (5-min threshold, exponential backoff)
- **`src/auth/mcpOAuth.ts`** - MCP-level OAuth: JWT issuance, validation, discovery endpoints
- **`src/auth/googleOAuth.ts`** - Google OAuth flow with PKCE support and state management
- **`src/store/sqlite.ts`** - SQLite token store with composite key `(mcp_user_id, email)` for multi-account; refresh tokens encrypted with AES-256-GCM

### Authentication Layers

1. **MCP-level**: JWT access tokens (HS256, 1hr lifetime) with `sub` claim as user identity
2. **Gmail-level**: Google OAuth tokens stored per MCP user; supports readonly, labels, compose scopes

### Multi-Account Support

- Users can connect multiple Gmail accounts per MCP user ID
- First account becomes the default automatically
- All tools accept optional `email` parameter to target specific account (defaults to default account)
- `gmail.listAccounts` lists connected accounts; `gmail.setDefaultAccount` changes default; `gmail.removeAccount` disconnects an account
- Database uses composite primary key `(mcp_user_id, email)`

### Tool Categories (26 tools)

- Status/Auth: `gmail.status`, `gmail.authorize`
- Account Management: `gmail.listAccounts`, `gmail.setDefaultAccount`, `gmail.removeAccount`
- Read: `gmail.searchMessages`, `gmail.getMessage`, `gmail.listThreads`, `gmail.getThread`, `gmail.getAttachmentMetadata`
- Labels: `gmail.getLabelInfo`, `gmail.listLabels`, `gmail.addLabels`, `gmail.removeLabels`, `gmail.createLabel`
- Modifications: `gmail.archiveMessages`, `gmail.unarchiveMessages`, `gmail.markAsRead`, `gmail.markAsUnread`, `gmail.starMessages`, `gmail.unstarMessages`
- Drafts: `gmail.createDraft`, `gmail.listDrafts`, `gmail.getDraft`, `gmail.updateDraft`, `gmail.deleteDraft`

### Error Handling Pattern

Custom error classes in `src/utils/errors.ts` map to MCP JSON-RPC codes:
- `NotAuthorizedError` / `InsufficientScopeError` → -32001
- `InvalidArgumentError` / `AccountNotFoundError` → -32602
- `GmailApiError` / `RateLimitedError` → -32000

### Required Environment Variables

See `.env.example`. Key variables: `PORT`, `BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`

### Token Refresh Behavior

Gmail client proactively refreshes access tokens 5 minutes before expiry. On `invalid_grant` (revocation), tokens are cleared and user must re-authorize. Transient errors retry with exponential backoff (max 3 attempts).
