# KRIPTIK ENGINE — IMMUTABLE AUTH SPECIFICATION

> **IF YOU ARE AN AI READING THIS: Everything in this file is LAW. Not suggestion. Not guidance. LAW.**
> **This document defines the authentication and authorization contracts for the KripTik Engine.**
> **Do not deviate from this specification. Do not "improve" cookie settings. Do not swap auth libraries.**
> **If you are about to change any auth behavior, read this document FIRST and follow the change policy at the bottom.**

---

## 1. ARCHITECTURE OVERVIEW

**Stack**: Better Auth + Drizzle ORM + PostgreSQL (Supabase-hosted)

Better Auth is the auth library. Drizzle is the ORM. PostgreSQL on Supabase is the database. That's it. No Supabase Auth. No Firebase Auth. No Auth0. No Clerk.

### Why NOT Supabase Auth

Supabase hosts our PostgreSQL database. It does NOT handle our authentication. Here's why:

1. **Safari ITP cookie bugs**: Supabase Auth sets cookies from `*.supabase.co`, a third-party domain. Safari's Intelligent Tracking Prevention (ITP) blocks or partitions these cookies silently. Users appear logged out. This is not a theoretical concern — it was the primary bug in the old KripTik app.

2. **Vendor lock-in**: Supabase Auth ties session management to Supabase's proprietary token format and refresh logic. If we move databases, we lose auth. Better Auth uses standard session cookies stored in our own PostgreSQL tables.

3. **Cross-domain cookie handling**: Supabase Auth requires `sameSite: none` + `secure: true` for cross-origin requests. This is exactly what Safari blocks. Better Auth lets us control cookie attributes directly, enabling the same-origin strategy that actually works everywhere.

4. **Session control**: Better Auth gives us direct access to session records in PostgreSQL. We can query, expire, and audit sessions with standard SQL. Supabase Auth hides this behind their API.

---

## 2. COOKIE CONTRACT

These cookie settings are not negotiable. Every attribute exists for a specific reason. Changing any of them without understanding the full chain of consequences will break authentication on Safari, iOS, or both.

| Attribute | Value | Rationale |
|-----------|-------|-----------|
| **Prefix** | `kriptik_auth.*` | Namespaced to avoid collisions. Better Auth appends `.session_token`, `.session_data`, etc. |
| **Session Duration** | 7 days (`604800` seconds) | Long enough for casual users, short enough for security. Set via `session.expiresIn` AND `maxAge`. |
| **httpOnly** | `true` — **NEVER false** | Prevents JavaScript access to session cookies. This is non-negotiable. XSS cannot steal sessions. |
| **sameSite** | `lax` — **NEVER `none`** | This is how we solved the Safari ITP issue. See Section 4. `lax` sends cookies on top-level navigations (needed for OAuth callbacks) but blocks cross-site subrequests. `none` is what broke the old app. |
| **secure** | `true` in production, `false` in development | HTTPS-only cookies in production. `false` in dev because localhost doesn't have TLS. |
| **path** | `/` | Cookies are sent on all routes. No path-scoping. |
| **domain** | `.kriptik.app` in production, unset in development | Cross-subdomain cookies in production (covers `kriptik.app` and `api.kriptik.app`). Unset in development so cookies scope to `localhost`. |
| **Cookie cache** | Enabled, 5-minute maxAge | Better Auth's `cookieCache` avoids hitting the database on every request within a 5-minute window. |

### Environment Variable

`COOKIE_DOMAIN` controls the cookie domain. When set, Better Auth's `crossSubDomainCookies` activates:

```
# Production
COOKIE_DOMAIN=.kriptik.app

# Development (unset or absent)
# COOKIE_DOMAIN=
```

### Implementation Reference

```typescript
// server/src/auth.ts
advanced: {
  cookiePrefix: 'kriptik_auth',
  crossSubDomainCookies: {
    enabled: !!process.env.COOKIE_DOMAIN,
    domain: process.env.COOKIE_DOMAIN,
  },
  defaultCookieAttributes: {
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
},
```

---

## 3. CROSS-ORIGIN STRATEGY

**Same-origin via Vercel rewrites.** This is the single most important architectural decision in the auth system.

### The Setup

- Frontend: `kriptik.app`
- API server: `api.kriptik.app`
- Vercel rewrite: `kriptik.app/api/*` -> `api.kriptik.app/api/*`

### Why This Works

The browser makes requests to `kriptik.app/api/*`. From the browser's perspective, this is **same-origin**. Vercel's edge network rewrites the request to `api.kriptik.app` at the infrastructure level — the browser never sees the cross-origin hop.

Because the browser thinks it's same-origin:

1. `sameSite: lax` cookies are sent on every request (same-origin requests always include cookies regardless of sameSite)
2. No CORS preflight is needed
3. Safari ITP has nothing to block — there is no third-party domain
4. iOS Safari, iOS Chrome (CriOS), and every other WebKit browser work correctly

### What This Means in Code

```typescript
// client/src/lib/api-config.ts
// In production: API_URL is '' (empty string)
// All requests go to /api/* which Vercel rewrites to api.kriptik.app

// client/src/lib/auth-client.ts
export const authClient = createAuthClient({
  baseURL: API_URL || undefined, // undefined = relative URLs = same-origin
  fetchOptions: {
    credentials: "include",
    cache: "no-store",
  },
});
```

### Hard Rules

- **NEVER use `sameSite: none`**. This is what broke the old app. Safari ITP blocks `none` cookies from third-party contexts. Even with `secure: true`, ITP can partition or delete them.
- **NEVER use CORS credentials for auth cookies**. If you need `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Origin` with a specific domain, you have already lost the same-origin architecture. Fix the rewrite, not the CORS config.
- **NEVER make direct cross-origin requests to `api.kriptik.app` from the frontend**. Always go through the `/api/*` rewrite path.

---

## 4. SESSION MANAGEMENT

### Validation

Sessions are validated server-side using Better Auth's API:

```typescript
const session = await auth.api.getSession({ headers: req.headers });
```

This reads the `kriptik_auth.session_token` cookie from the request headers, validates it against the `session` table in PostgreSQL, and returns the user and session objects.

### Middleware

Two middleware functions in `server/src/middleware/auth.ts`:

**`optionalAuth`** — Populates `req.user` and `req.session` if a valid session exists. Does NOT return 401. Use for endpoints that work with or without auth (e.g., public project views).

**`requireAuth`** — Calls `optionalAuth` internally, then returns 401 if `req.user` is not set. Use for all authenticated endpoints.

```typescript
export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; name: string; image?: string | null };
  session?: { id: string; token: string; expiresAt: Date };
}
```

### Session Storage

Sessions are stored in the `session` table in PostgreSQL:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `text` PK | Session identifier |
| `token` | `text` UNIQUE | Session token (sent as cookie value) |
| `expires_at` | `timestamptz` | Absolute expiration (7 days from creation) |
| `ip_address` | `text` | Client IP at session creation |
| `user_agent` | `text` | Client user agent at session creation |
| `user_id` | `text` FK | References `users.id`, cascades on delete |
| `created_at` | `timestamptz` | Creation timestamp |
| `updated_at` | `timestamptz` | Last update timestamp |

### Safari Retry Logic

The client includes Safari-specific retry logic for session fetches after OAuth redirects. Safari sometimes needs additional time for cookies to become accessible after a top-level navigation:

- First attempt: immediate
- Safari retry: 300ms delay
- iOS Safari final retry: 500ms delay

This is defensive, not architectural. The same-origin strategy makes it rarely necessary, but Safari's cookie timing is unpredictable enough to warrant it.

---

## 5. OAUTH FLOW (Dependency Credentials)

This is NOT the social login OAuth (GitHub/Google sign-in). This is the OAuth flow for collecting credentials that agents need during builds — Replicate API keys, Vercel deploy tokens, Stripe keys, etc.

### Flow

1. Agent discovers it needs credentials for a service (e.g., Replicate)
2. Agent writes a `request_user_input` to the Brain with the provider name
3. Engine emits SSE event -> Frontend renders a QuestionTile with "Connect" button
4. User clicks "Connect" -> Frontend calls `POST /api/oauth/start` with `{ providerId, projectId }`
5. Server generates PKCE pair (`code_verifier` + `code_challenge` via SHA-256)
6. Server generates UUID state token
7. Server stores state in `oauth_states` table with 10-minute expiry
8. Server returns authorization URL -> Frontend redirects user (or opens popup)
9. User authorizes on provider's site
10. Provider redirects to `{API_URL}/api/oauth/callback/{providerId}?code=...&state=...`
11. Server validates state (exists, not expired, provider matches)
12. Server consumes state (deletes from `oauth_states` — **one-time use**)
13. Server exchanges code for tokens using `code_verifier` (PKCE)
14. Server encrypts tokens and stores in credential vault
15. Server returns HTML that posts message to opener window (for popup flow)
16. Brain is notified -> Agent can now use the credentials

### Security Properties

- **PKCE on every flow**: `code_verifier` is 32 random bytes (base64url). `code_challenge` is SHA-256 of verifier (base64url). This prevents authorization code interception.
- **State validation**: UUID state token prevents CSRF. Stored server-side, not in cookies or localStorage.
- **10-minute state expiry**: If the user doesn't complete the flow in 10 minutes, the state is invalid.
- **One-time state consumption**: State is deleted from the database immediately after use. Replay attacks are impossible.
- **Server-side token exchange**: Authorization codes are exchanged for tokens server-side. Tokens never touch the browser.

### Provider Catalog

`server/src/oauth/catalog.ts` defines 150+ OAuth providers with their authorization URLs, token URLs, default scopes, and PKCE requirements. The catalog is static — defined in code, not in the database.

Providers are initialized lazily when first needed. A provider is only available if its `{PROVIDER}_CLIENT_ID` and `{PROVIDER}_CLIENT_SECRET` environment variables are set.

Custom provider implementations exist for: GitHub, Vercel, Netlify, Google, Cloudflare, Slack, Discord, Notion, Stripe. All others use the generic OAuth2 provider class.

---

## 6. CREDENTIAL VAULT

### Encryption

All OAuth tokens are encrypted at rest using **AES-256-GCM**.

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key source**: `VAULT_ENCRYPTION_KEY` environment variable
- **IV**: Unique random IV per encryption operation
- **Auth tag**: GCM provides built-in authentication — tampering is detected on decryption

The encryption/decryption functions are in `server/src/oauth/crypto.ts`. Tokens are encrypted before insertion and decrypted only when an agent needs them.

### Isolation

Credentials are isolated along three dimensions:

| Dimension | Enforcement |
|-----------|-------------|
| **Per-user** | `userId` column, FK to `users.id` |
| **Per-project** | `projectId` column, FK to `projects.id` |
| **Per-provider** | `providerId` column (e.g., "replicate", "vercel", "stripe") |

A unique index on `(userId, projectId, providerId)` ensures exactly one active credential per user per project per provider. Storing a new credential for the same triple replaces the existing one (delete + insert, not update).

### Schema

```sql
credentials (
  id              text PK,
  user_id         text FK -> users.id CASCADE,
  project_id      text FK -> projects.id CASCADE,
  provider_id     text NOT NULL,
  encrypted_tokens jsonb NOT NULL,  -- AES-256-GCM envelope {iv, ciphertext, tag}
  provider_user_id text,            -- e.g., GitHub username
  provider_email   text,            -- e.g., user@example.com
  status           text DEFAULT 'active',
  created_at       timestamptz,
  updated_at       timestamptz,
  UNIQUE(user_id, project_id, provider_id)
)
```

### Operations

| Operation | Function | Description |
|-----------|----------|-------------|
| Store | `storeCredential()` | Encrypts tokens, upserts into vault |
| Retrieve | `getCredential()` | Decrypts and returns tokens for active credentials |
| List | `listCredentials()` | Returns metadata (no decrypted tokens) for a user's project |
| Revoke | `revokeCredential()` | Sets `status = 'revoked'` — soft delete, tokens remain encrypted |

Agents access credentials through the `getCredential()` function, which requires all three isolation keys (userId, projectId, providerId). There is no function that returns credentials across projects or users.

---

## 7. DATA ISOLATION

Every database query that touches user data is scoped by `ownerId` (or `userId`) AND `projectId`. This is enforced at the application layer in every route handler and service function.

### Query Scoping Rules

| Table | Scoping | Enforcement |
|-------|---------|-------------|
| `projects` | `WHERE owner_id = $userId` | All project queries filter by authenticated user's ID |
| `build_events` | `WHERE project_id = $projectId` (project ownership verified first) | Project ownership middleware runs before event queries |
| `credentials` | `WHERE user_id = $userId AND project_id = $projectId` | Both dimensions required on every credential operation |
| `oauth_states` | `WHERE user_id = $userId` | State tokens are user-scoped |
| `session` | Managed by Better Auth | Sessions are inherently user-scoped via `user_id` FK |

### Ownership Middleware

`server/src/middleware/ownership.ts` verifies that the authenticated user owns the requested project before any route handler executes. This is defense-in-depth — even if a route handler forgets to filter by `ownerId`, the middleware has already rejected unauthorized access.

### RLS as Defense-in-Depth

PostgreSQL Row-Level Security (RLS) policies on Supabase provide an additional layer. Even if the application layer has a bug that leaks cross-user data, RLS policies on the `projects`, `credentials`, and `build_events` tables prevent the database from returning rows the user shouldn't see.

RLS is not the primary enforcement mechanism — the application layer is. RLS is the safety net.

### SSE Stream Isolation

SSE event streams are project-scoped. When a client connects to the SSE endpoint, the server verifies project ownership and only emits events for that specific project. There is no broadcast. There is no cross-project event leakage.

---

## 8. SOCIAL PROVIDERS (Login/Signup) — FROZEN CONFIGURATION

> **THIS SECTION IS FROZEN.** Social login is working in production as of 2026-03-19.
> Do NOT change env var names, callback URLs, trustedOrigins, or the flow described here.
> If a CI check fires a warning about social auth files being modified, READ THIS FIRST.

### Production Configuration (VERIFIED WORKING)

| Setting | Value | Notes |
|---------|-------|-------|
| `BETTER_AUTH_URL` | `https://api.kriptik.app` | Determines OAuth callback redirect_uri base |
| `FRONTEND_URL` | `https://kriptik.app` | Added to trustedOrigins; used as callbackURL base |
| `COOKIE_DOMAIN` | `.kriptik.app` | Cross-subdomain cookies (covers kriptik.app AND api.kriptik.app) |
| Google `redirect_uri` | `https://api.kriptik.app/api/auth/callback/google` | Must match Google Cloud Console |
| GitHub `redirect_uri` | `https://api.kriptik.app/api/auth/callback/github` | Must match GitHub OAuth App settings |
| Google `client_id` | `176326592484-dulikeh7gtakrd9468s9knk4pv0phcm3.apps.googleusercontent.com` | From Vercel env |
| GitHub `client_id` | `Ov23li8VPam8BbRZNBpB` | From Vercel env |

### Why These Specific Values

The 403 bug on 2026-03-19 was caused by `FRONTEND_URL` having the WRONG value (inherited from the old app — probably `https://kriptik-ai-opus-build.vercel.app`). Better Auth builds `trustedOrigins` from `FRONTEND_URL`. When the browser at `https://kriptik.app` sent `Origin: https://kriptik.app`, the server rejected it because that origin wasn't trusted.

**Fix:** Deleted old encrypted env vars and recreated as plaintext with correct values. Redeployed backend.

### Currently Supported Providers

| Provider | Env Vars | Callback URL |
|----------|----------|-------------|
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `https://api.kriptik.app/api/auth/callback/github` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://api.kriptik.app/api/auth/callback/google` |

### Configuration Pattern (DO NOT CHANGE)

```typescript
// server/src/auth.ts — conditional spread (provider only registered if env vars exist)
socialProviders: {
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  } : {}),
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  } : {}),
},

// trustedOrigins — MUST include https://kriptik.app
trustedOrigins: [
  'http://localhost:5173',
  'http://localhost:3001',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
],
```

### OAuth Callback Flow (VERIFIED WORKING)

1. User at `kriptik.app` clicks "Sign in with Google/GitHub"
2. Client calls `authClient.signIn.social({ provider, callbackURL: 'https://kriptik.app/dashboard' })`
3. POST goes to `kriptik.app/api/auth/sign-in/social` (same-origin via Vercel rewrite → `api.kriptik.app`)
4. Better Auth validates `Origin: https://kriptik.app` against `trustedOrigins` (includes `FRONTEND_URL`)
5. Returns redirect URL to Google/GitHub with `redirect_uri=https://api.kriptik.app/api/auth/callback/{provider}`
6. Browser navigates to OAuth provider (top-level navigation — always allowed by ITP)
7. User authorizes
8. Provider redirects to `https://api.kriptik.app/api/auth/callback/{provider}` (top-level navigation)
9. Better Auth creates session, sets cookies with `domain: .kriptik.app` (top-level → ITP allows)
10. Redirects to `https://kriptik.app/dashboard`
11. Dashboard calls `getSession()` → `GET /api/auth/get-session` (same-origin → cookie sent)
12. User is authenticated

### What Breaks This Flow

| Change | Result |
|--------|--------|
| `FRONTEND_URL` wrong or missing | `trustedOrigins` doesn't include `kriptik.app` → 403 on social login |
| `BETTER_AUTH_URL` wrong | `redirect_uri` points to wrong domain → OAuth provider rejects callback |
| `COOKIE_DOMAIN` wrong or missing | Cookies don't cover both domains → session lost after OAuth redirect |
| `sameSite` changed to `none` | Safari ITP blocks cookies → users appear logged out |
| Frontend `vercel.json` missing `/api/*` rewrite | All API calls return SPA HTML → nothing works |
| Google/GitHub OAuth App callback URL mismatch | Provider returns "redirect_uri_mismatch" error |

### Adding New Social Providers

1. Register OAuth app with provider, set callback URL: `https://api.kriptik.app/api/auth/callback/{provider}`
2. Set `{PROVIDER}_CLIENT_ID` and `{PROVIDER}_CLIENT_SECRET` in Vercel backend env vars
3. Add conditional spread to `socialProviders` in `server/src/auth.ts`
4. Add `signInWith{Provider}` function in `client/src/lib/auth-client.ts`
5. Add button to login/signup pages
6. **Test on Safari and iOS Safari before deploying to production**
7. **Redeploy backend** (env vars only take effect on new deployments)
8. Update this section of AUTH_SPEC.md with the new provider's details

---

## 9. SECURITY INVARIANTS

These must ALWAYS be true. If any of these are violated, the system is compromised.

1. **Session cookies are httpOnly**. JavaScript cannot read `kriptik_auth.*` cookies. No exceptions.

2. **Session cookies use `sameSite: lax`**. Never `none`. Never `strict` (breaks OAuth callbacks).

3. **PKCE is used on every OAuth flow**. Both social login (via Better Auth) and dependency credential collection (via OAuth Manager). No implicit grants. No flows without PKCE.

4. **OAuth state tokens are single-use**. Consumed (deleted) immediately after validation. Replay is impossible.

5. **OAuth state tokens expire in 10 minutes**. Stale states are rejected.

6. **All credential tokens are encrypted at rest**. AES-256-GCM. The `VAULT_ENCRYPTION_KEY` env var must be set in all environments. Unencrypted tokens never touch the database.

7. **Every data query is owner-scoped**. No endpoint returns data belonging to another user or another project. This is enforced at both the application layer and the database layer (RLS).

8. **Session validation is server-side**. The client sends cookies. The server validates against PostgreSQL. No JWT-only validation. No client-side session interpretation.

9. **Token exchange happens server-side**. Authorization codes are exchanged for tokens on the server. Tokens are encrypted and stored in the vault. The browser never holds OAuth tokens for third-party services.

10. **`BETTER_AUTH_SECRET` is set in all environments**. This secret signs session tokens. If it's not set or if it's weak, sessions can be forged.

11. **Passwords have a minimum length of 8 characters**. Enforced by Better Auth's `minPasswordLength` config.

12. **The `credentials: "include"` fetch option is set on the auth client**. Without this, cookies are not sent on requests, even same-origin ones in some browsers.

13. **The `cache: "no-store"` fetch option is set on auth requests**. Safari has known issues with cached cookie state. Every auth request must hit the network.

---

## 10. TESTING REQUIREMENTS

Before any auth change ships to production, ALL of the following must pass:

### Core Flows

- [ ] **Email signup**: New user signs up with email/password -> session cookie set -> redirected to dashboard -> session persists on refresh
- [ ] **Email login**: Existing user logs in -> session cookie set -> redirected to dashboard
- [ ] **Social login (GitHub)**: Click "Sign in with GitHub" -> OAuth flow completes -> session cookie set -> user exists in `users` table with linked `account` row
- [ ] **Social login (Google)**: Same as GitHub flow
- [ ] **Sign out**: Session cookie cleared -> subsequent requests return 401 -> localStorage cleared

### Session Persistence

- [ ] **Page refresh**: Authenticated user refreshes page -> still authenticated
- [ ] **New tab**: Authenticated user opens new tab to app -> still authenticated
- [ ] **7-day expiry**: Session created 7+ days ago -> returns 401 -> user must re-authenticate

### Project Isolation

- [ ] **Own projects only**: User A creates project -> User B cannot see it via API or UI
- [ ] **Own credentials only**: User A stores credential -> User B cannot retrieve it
- [ ] **Own events only**: User A's build events are not visible to User B's SSE stream

### Browser Compatibility

- [ ] **Safari macOS**: Full auth flow works (signup, login, session persistence, OAuth)
- [ ] **Safari iOS**: Full auth flow works (this is the browser that broke the old app)
- [ ] **Chrome iOS (CriOS)**: Full auth flow works (uses WebKit under the hood)
- [ ] **Chrome desktop**: Full auth flow works
- [ ] **Firefox desktop**: Full auth flow works

### OAuth Dependency Flow

- [ ] **Start flow**: `POST /api/oauth/start` returns valid authorization URL with PKCE params
- [ ] **Callback**: OAuth callback exchanges code for tokens -> tokens encrypted in vault
- [ ] **State expiry**: State token older than 10 minutes is rejected
- [ ] **State replay**: Using the same state token twice fails (consumed on first use)
- [ ] **Credential retrieval**: Stored credential can be decrypted and returned via `getCredential()`

### Negative Tests

- [ ] **No cookie manipulation**: Modifying cookie value results in 401, not a different user's session
- [ ] **No cross-project access**: Requesting `GET /api/projects/{otherUsersProjectId}` returns 403 or 404
- [ ] **No CORS bypass**: Direct cross-origin request to `api.kriptik.app` without rewrite does not receive auth cookies

---

## 11. CHANGE POLICY

### Adding a New Social Login Provider

1. Register OAuth app with the provider (get client ID and secret)
2. Set `{PROVIDER}_CLIENT_ID` and `{PROVIDER}_CLIENT_SECRET` in environment variables
3. Add provider config to `socialProviders` in `server/src/auth.ts`
4. Add sign-in function in `client/src/lib/auth-client.ts`
5. Add UI button to login/signup pages
6. Deploy to preview environment
7. Test on Safari and iOS Safari (see Testing Requirements)
8. Deploy to production

### Changing Session Duration

1. Update `session.expiresIn` in `server/src/auth.ts`
2. Update `defaultCookieAttributes.maxAge` in `server/src/auth.ts` (these MUST match)
3. Update the "7 days" references in this document
4. Deploy to preview and verify session expiry behavior
5. Deploy to production

### Modifying Cookie Settings

**Do not modify cookie settings unless you have a specific, documented reason and have tested on Safari iOS.**

1. Read this entire document
2. Understand WHY the current setting exists (the rationale column in Section 2)
3. Make the change in `server/src/auth.ts`
4. Deploy to preview
5. Run the FULL browser compatibility test suite (Section 10)
6. Get explicit approval
7. Deploy to production

### Adding a New OAuth Dependency Provider

1. Add the provider to the catalog in `server/src/oauth/catalog.ts`
2. If the provider has non-standard OAuth behavior, create a custom provider class in `server/src/oauth/providers/`
3. Set `{PROVIDER}_CLIENT_ID` and `{PROVIDER}_CLIENT_SECRET` env vars
4. Test the full flow: start -> authorize -> callback -> vault storage -> retrieval
5. Deploy

---

## 12. OLD APP COOKIE ISSUE ANALYSIS

The old KripTik app (`/Volumes/Logan T7 Touch/KripTik AI_Trial_antiGravity/`) had a persistent authentication bug on Safari and iOS. This section documents what went wrong and why the new architecture is immune.

### What the Old App Did

```
Frontend: kriptik.app
API:      api.kriptik.app (different origin)
Cookies:  sameSite: none, secure: true
CORS:     Access-Control-Allow-Credentials: true
          Access-Control-Allow-Origin: https://kriptik.app
```

The frontend made cross-origin `fetch()` requests to `api.kriptik.app` with `credentials: "include"`. The server set cookies with `sameSite: none` + `secure: true` and returned permissive CORS headers.

### Why It Broke on Safari

Safari's Intelligent Tracking Prevention (ITP) treats `sameSite: none` cookies from a different origin as third-party tracking cookies. ITP either:

1. **Blocks the cookie entirely** — the `Set-Cookie` header is silently ignored
2. **Partitions the cookie** — the cookie exists but is not sent on subsequent requests to the same origin from a different context
3. **Expires the cookie after 7 days** (or less in newer WebKit versions) — even if `maxAge` says otherwise

The result: users on Safari appeared logged out randomly. OAuth callbacks would set a cookie that was immediately invisible to the frontend. Sessions would vanish between page loads.

### Why the New Architecture Is Immune

```
Frontend: kriptik.app
API:      kriptik.app/api/* (same origin from browser's perspective)
Rewrite:  Vercel edge rewrites /api/* -> api.kriptik.app/api/*
Cookies:  sameSite: lax, httpOnly: true
CORS:     Not needed (same-origin)
```

The browser never makes a cross-origin request. It sends requests to `kriptik.app/api/*`, which is same-origin. Vercel rewrites the request at the infrastructure layer. The browser has no idea `api.kriptik.app` exists.

Because everything is same-origin:

- ITP has nothing to classify as third-party
- `sameSite: lax` cookies are always sent on same-origin requests
- No CORS headers are needed
- No `Access-Control-Allow-Credentials` is needed
- The cookie domain `.kriptik.app` covers both the frontend and API subdomains for top-level navigations (OAuth callbacks)

### Lesson

**Never use cross-origin cookie-based auth in a production web app that needs to work on Safari.** Safari's ITP is aggressive, opaque, and gets stricter with every WebKit release. The only reliable strategy is same-origin via infrastructure rewrites.

---

## ENVIRONMENT VARIABLES REFERENCE

| Variable | Required | Description |
|----------|----------|-------------|
| `BETTER_AUTH_SECRET` | Yes | Signs session tokens. Must be a strong random string (32+ chars). |
| `COOKIE_DOMAIN` | Production only | `.kriptik.app` — enables cross-subdomain cookies. Unset in development. |
| `FRONTEND_URL` | Production only | `https://kriptik.app` — added to trusted origins. |
| `GITHUB_CLIENT_ID` | For GitHub login | GitHub OAuth app client ID. |
| `GITHUB_CLIENT_SECRET` | For GitHub login | GitHub OAuth app client secret. |
| `GOOGLE_CLIENT_ID` | For Google login | Google OAuth app client ID. |
| `GOOGLE_CLIENT_SECRET` | For Google login | Google OAuth app client secret. |
| `VAULT_ENCRYPTION_KEY` | Yes | AES-256 key for credential vault encryption. Must be exactly 32 bytes (or 64 hex chars). |
| `API_URL` | Development only | `http://localhost:3001` — direct API URL for local dev. Empty/unset in production (same-origin via rewrite). |
| `NODE_ENV` | Yes | `production` or `development` — controls `secure` cookie flag. |
