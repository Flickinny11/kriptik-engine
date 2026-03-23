# Dependency Management System — Architecture

This document explains the architecture of KripTik's dependency management system: how the MCP client works, how the service registry is structured, how the browser agent fallback operates, and how tokens are stored.

## Two-Layer Architecture

**Layer 1 — MCP Client (~80% of services):** A universal OAuth 2.1 + PKCE client that connects to any MCP-enabled service. One implementation replaces per-service OAuth integrations. The user authenticates directly with the service (creating an account if needed), and KripTik receives scoped tokens.

**Layer 2 — Browser Agent Fallback (~20% of services):** For services without MCP servers, Browser Use automates account signup. The user approves the action, the agent fills forms, handles email verification via Gmail MCP, and extracts credentials.

## MCP Client — How It Works

The MCP client lives in `server/src/mcp/` and implements the full MCP authorization spec.

### Authorization Flow

```
1. Client receives service's MCP server URL (e.g., mcp.supabase.com/mcp)
                    │
2. discovery.ts: GET → MCP server URL
                    │
   Server responds 401 + WWW-Authenticate header with resource_metadata URL
                    │
3. discovery.ts: Fetch Protected Resource Metadata (RFC 9728)
   → /.well-known/oauth-protected-resource
   → Returns authorization_servers[], scopes_supported[]
                    │
4. discovery.ts: Fetch Authorization Server Metadata (RFC 8414)
   → /.well-known/oauth-authorization-server
   → Returns authorize endpoint, token endpoint, registration endpoint
                    │
5. registration.ts: Dynamic Client Registration (RFC 7591)
   → POST to registration endpoint with client_name, redirect_uris, grant_types
   → Returns client_id + client_secret (stored encrypted)
                    │
6. client.ts: Generate PKCE code_verifier (64-byte) + code_challenge (SHA-256)
                    │
7. client.ts: Build authorization URL with:
   → client_id, redirect_uri, code_challenge, code_challenge_method=S256
   → scope from metadata, state (random UUID stored in mcp_oauth_states)
                    │
8. Browser opens authorization URL in popup (600x700)
   → User authenticates at the service, consents to scopes
   → Service redirects to /api/mcp/callback?code=...&state=...
                    │
9. routes/mcp.ts: Callback handler validates state, exchanges code for tokens
   → POST to token endpoint with code, code_verifier, client_id, redirect_uri
   → Returns access_token, refresh_token, expires_in, scope
                    │
10. token-store.ts: Tokens encrypted (AES-256-GCM) and stored in mcp_connections
                    │
11. Callback returns HTML that posts mcp_oauth_complete to window.opener
    → Client receives message, updates UI state
                    │
12. client.ts: tools/list call discovers available MCP tools
    → Cached in mcp_tool_caches (24hr TTL) + in-memory cache (5min)
```

### Token Refresh

When an access token expires, the client automatically uses the refresh token:

```
client.ts: getValidToken()
    │
    ├── Token not expired? → Return it
    │
    └── Token expired?
        ├── Has refresh_token? → POST to token endpoint with grant_type=refresh_token
        │   ├── Success → Update stored tokens, return new access_token
        │   └── Failure → Mark connection as needs_reauth
        │
        └── No refresh_token? → Mark connection as needs_reauth
```

The health check endpoint (`POST /api/mcp/health-check`) runs every 5 minutes via the client-side Zustand store, proactively refreshing tokens before users encounter expiry.

### Key Classes and Functions

| Function | File | Purpose |
|----------|------|---------|
| `getMcpClient()` | `client.ts` | Returns singleton MCP client instance |
| `startAuthFlow()` | `client.ts` | Initiates OAuth — returns authorization URL |
| `completeAuthFlow()` | `client.ts` | Exchanges auth code for tokens |
| `getValidToken()` | `client.ts` | Returns valid token, auto-refreshing if needed |
| `discoverTools()` | `client.ts` | Calls tools/list on MCP server |
| `getCachedTools()` | `client.ts` | Returns cached tools or null |
| `discoverServiceMetadata()` | `discovery.ts` | Full metadata discovery chain |
| `getOrRegisterClient()` | `registration.ts` | Dynamic registration with caching |
| `storeMcpTokens()` | `token-store.ts` | Encrypt and store tokens |
| `getMcpTokens()` | `token-store.ts` | Decrypt and retrieve tokens |
| `listMcpConnections()` | `token-store.ts` | List all connections for a user |
| `deleteMcpConnection()` | `token-store.ts` | Revoke and delete connection |

## Token Storage

Tokens are stored server-side only — the browser never sees actual tokens.

### Encryption

- Algorithm: AES-256-GCM (via `server/src/oauth/crypto.ts`)
- Key derivation: From `BETTER_AUTH_SECRET` environment variable
- Each token record contains: encrypted access_token, refresh_token, expires_at, scopes
- Registration data (client_id, client_secret) is encrypted separately

### Database Schema (mcp_connections table)

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| userId | TEXT | Owner (FK to users) |
| serviceId | TEXT | Service identifier (matches registry) |
| mcpServerUrl | TEXT | MCP server URL |
| authServerIssuer | TEXT | Authorization server issuer URL |
| encryptedTokens | JSON | AES-256-GCM encrypted token payload |
| encryptedRegistration | JSON | AES-256-GCM encrypted client registration |
| status | TEXT | connected, needs_reauth, error, disconnected |
| connectedAt | TIMESTAMP | When connection was established |
| lastRefreshedAt | TIMESTAMP | Last token refresh time |

### Security Properties

- Tokens never leave the server — client UI only sees connection status
- Tokens belong to the USER, not KripTik — if user leaves, tokens are revoked but service accounts remain
- PKCE prevents authorization code interception
- OAuth state parameter prevents CSRF
- Resource indicators (RFC 8707) scope tokens to specific MCP servers

## Service Registry

The service catalog lives in `server/src/services/` and defines all services KripTik can connect to.

### Structure

Each `ServiceRegistryEntry` has:

```typescript
{
  id: string;              // Unique slug: "supabase", "vercel", "fal-ai"
  name: string;            // Display name: "Supabase"
  description: string;     // One-sentence description
  websiteUrl: string;      // Official site URL
  category: ServiceCategory; // One of 13 categories
  iconSlug: string;        // simple-icons slug for branded logo
  brandColor: string;      // Hex color for accent theming
  mcp: McpServerInfo | null; // MCP server info or null (fallback required)
  browserFallbackAvailable: boolean;
  instanceModel: InstanceModel; // How it maps to projects
  pricing: PricingTier[];  // Array of pricing tiers
  tags: string[];          // Search/filter tags
}
```

### Categories (13 total)

database, hosting, auth, payments, email, monitoring, ai-ml, design, communication, storage, analytics, devtools, other

### Adding a New Service

1. Add entry to `SERVICE_REGISTRY` array in `server/src/services/registry.ts`
2. Set `mcp` field:
   - MCP available: `{ url: 'https://mcp.example.com/mcp', authMethod: 'oauth' }`
   - No MCP: `null`
3. If no MCP, set `browserFallbackAvailable: true` and add workflow template in `server/src/browser-agent/templates.ts`
4. Set `iconSlug` to the simple-icons slug (check https://simpleicons.org)
5. If no simple-icons logo exists, add custom SVG path to `client/src/components/ui/icons/BrandIcon.tsx`
6. Set `instanceModel`: `project-per-project`, `api-key-per-project`, or `shared`
7. Add accurate `pricing` tiers from the service's pricing page

### Adding a Custom MCP Server (User-Added)

Users can add their own MCP servers via `server/src/services/custom-servers.ts`:

```typescript
customServerToRegistryEntry(entry: CustomMcpServerEntry): ServiceRegistryEntry
validateMcpServerUrl(url: string): boolean
```

Custom servers get a generated ID prefixed with `custom-` and default to `shared` instance model.

## Browser Agent Fallback

For services without MCP servers, Browser Use automates account signup. Located in `server/src/browser-agent/`.

### Flow

```
1. User approves signup in FallbackApprovalDialog
                    │
2. session-manager.ts: Creates session, generates secure password
                    │
3. browser-use-client.ts: Launches Browser Use session
   → Navigates to service's signup URL (from template)
   → Fills form fields: name, email, generated password
   → Submits form
                    │
4. Email verification needed?
   ├── User has Gmail MCP? → email-verifier.ts polls for verification email
   │   → Extracts code/link → agent enters it automatically
   │
   └── No email MCP? → Sends "paste your code" prompt to chat
       → User pastes code → agent enters it
                    │
5. SMS verification needed?
   → Always prompts user to paste code (no SMS interception)
                    │
6. credential-generator.ts: Extracts API keys from service dashboard
   → Stores in encrypted vault (AES-256-GCM)
                    │
7. Session completes → client updates connection state
```

### Workflow Templates

Each non-MCP service has a template in `templates.ts` defining:
- Signup URL and form field selectors
- Verification type (email, SMS, none)
- Post-signup credential extraction steps

Current templates: fal.ai, Replicate, RunPod, Render, Railway, Fly.io, DigitalOcean, Heroku

### Cost

~$0.08-0.10 per signup using Browser Use at $0.006/step (typical signup is 10-15 steps).

### Error Handling

- Max 2 retries per session
- On failure: shows error message with retry option and manual signup fallback
- Session state tracked with progress messages streamed to the client in real-time

## Client Architecture

### Pages

| Page | Route | Purpose |
|------|-------|---------|
| DependenciesPage | `/dependencies` | Main catalog with My Dependencies / Browse All modes |
| DependencyDashboard | `/dependencies/:serviceId` | Individual service management |
| ProjectDependenciesPage | `/projects/:projectId/dependencies` | Per-project dependency view |

### State Management

`useDependencyStore` (Zustand) centralizes:
- Service registry data (cached from `/api/services`)
- MCP connection states (from `/api/mcp/connections`)
- Tool caches per service (from `/api/mcp/:serviceId/tools`)
- Health check interval (every 5 minutes)

### Connect Flow Components

- **ConnectButton** — Handles 6 states: disconnected, connecting, connected, error, needs_reauth, needs_upgrade
- **useDependencyConnect** hook — OAuth popup lifecycle, postMessage callbacks, browser agent coordination
- **FallbackApprovalDialog** — Approval + progress display + verification code input
- **TierSelector** — Post-connection subscription plan picker
- **ConnectionStatusIndicator** — Branded logo with animated status dot

### Adaptive Dashboard Panels

DependencyDashboard renders panels conditionally based on MCP tool capabilities via `categorizeTools()`:
- **hasBilling** → Billing panel (keywords: billing, invoice, charge, payment, cost)
- **hasSubscription** → Subscription panel (subscription, plan, tier, upgrade, downgrade)
- **hasApiKeys** → API Keys panel (api_key, token, secret, credential)
- **hasProjectManagement** → Project Instances panel (project, instance, database, environment)
- **hasUsageData** → Usage panel (usage, metrics, stats, bandwidth, storage)
- **hasDatabase** → Database panel (database, table, schema, query, migration)

Panels not supported by the service's MCP tools are omitted. For anything unavailable via MCP, an external link to the service's dashboard is shown.

### Planning Tile Integration

`QuestionTile.tsx` supports dual-mode operation:
- New MCP flow: Matches agent-suggested services against the registry, renders ConnectButton
- Legacy OAuth: Falls back to traditional OAuth catalog for non-MCP services
- Automatic protocol detection via `findMatchingService()` — agents need no knowledge of which system a service uses

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `BROWSER_USE_API_KEY` | Production only | Browser Use Cloud API key |
| `API_BASE_URL` or `BACKEND_URL` | Production | OAuth callback base URL |
| `BETTER_AUTH_SECRET` | Yes | Token encryption key derivation |

## Related Database Tables

| Table | Purpose |
|-------|---------|
| `mcp_connections` | Encrypted token storage per user per service |
| `mcp_tool_caches` | Cached MCP tools/list results (24hr TTL) |
| `mcp_oauth_states` | Temporary CSRF state during OAuth flow |
| `project_service_instances` | Project-to-service associations with instance details |
