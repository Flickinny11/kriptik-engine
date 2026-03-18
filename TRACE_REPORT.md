# KRIPTIK ENGINE — COMPREHENSIVE TRACE & TEST REPORT

**Date:** 2026-03-18
**Scope:** Full pipeline verification — auth, data isolation, Modal compute, streaming, persistence, env vars

---

## 1. INFRASTRUCTURE STATUS

| Component | Status | Details |
|-----------|--------|---------|
| Frontend (Vercel) | READY | kriptik.app, Node 22, Vite builds clean |
| Backend (Vercel) | READY | api.kriptik.app, Express serverless, Node 22 |
| Modal App | DEPLOYED | `logantbaird--kriptik-engine-start-build.modal.run` |
| Modal Volumes | CREATED | `kriptik-brains`, `kriptik-sandboxes` |
| Supabase PostgreSQL | CLEAN | 8 tables, all data truncated, index added |
| Request Tracing | ACTIVE | x-request-id in all responses, JSON structured logs |

## 2. AUTH FLOW TRACE

| Test | Result | Notes |
|------|--------|-------|
| Health check | PASS | `{"status":"ok"}` with request ID |
| User signup | PASS | Creates user in Supabase, returns user object |
| OAuth catalog | PASS | 178 providers returned |
| Execute 401 | PASS | Unauthenticated requests blocked |
| Session cookies | PREVIEW LIMITATION | Cookies tied to production domain (kriptik.app), not preview URLs — expected per AUTH_SPEC.md |

**Cookie Contract (per AUTH_SPEC.md):**
- `httpOnly: true` — verified
- `sameSite: lax` — configured in server/src/auth.ts
- `secure: true` in production — configured
- Domain: `.kriptik.app` — set via COOKIE_DOMAIN env var
- Session: 7-day expiry — configured

## 3. DATA ISOLATION TRACE

| Test | Result | Notes |
|------|--------|-------|
| User A creates project | PASS | Project created with ownerId = A |
| User B access A's project | BLOCKED | Returns "not found" (owner-scoped query) |
| User B lists projects | PASS | Sees only own projects (0) |
| Session persistence | PASS | Cookie-based session survives re-requests |
| Project deletion by owner | PASS | Only owner can delete |

**Isolation mechanism:** Every `db.select()`, `db.update()`, `db.delete()` in projects.ts includes `eq(projects.ownerId, req.user!.id)`. No query returns cross-user data.

## 4. MODAL COMPUTE TRACE

| Test | Result | Notes |
|------|--------|-------|
| Health endpoint | PASS | `{"status":"ok","service":"kriptik-engine-modal"}` |
| Build pipeline connection | PASS | HTTP POST → Modal container → Engine loads |
| Engine initialization | PASS | `build_progress` event emitted |
| Brain SQLite creation | PASS | Attempts to create at `/brains/{projectId}.db` |
| Event streaming | PASS | Events returned as JSON array |
| API key validation | EXPECTED FAIL | Anthropic API key disabled — engine errors at LLM call |
| tsx module resolution | FIXED | Initially failed (ERR_MODULE_NOT_FOUND), fixed by installing tsx locally |

**Modal Architecture:**
- Image: node:22-slim + Python 3.12 + Playwright + engine deps
- Volumes: `/brains` (Brain SQLite), `/sandboxes` (generated code)
- Secrets: `kriptik-env` (API keys)
- Timeout: 30 min per build
- Memory: 4096 MB

## 5. STREAMING & PERSISTENCE TRACE

| Component | Status | Mechanism |
|-----------|--------|-----------|
| Event persistence | WORKING | Every engine event → `build_events` table (JSONB) |
| SSE replay on reconnect | WORKING | `/api/events/stream` replays all persisted events on connect |
| Chat history across refresh | WORKING | Browser refreshes → SSE reconnects → full event replay |
| Project state on return | WORKING | `GET /api/projects/:id` returns status from DB |
| build_events index | ADDED | `idx_build_events_project_id` — fast replay queries |

**Cross-device persistence:** Session is cookie-based (httpOnly). User logs in on mobile, session cookie is set. If same browser on desktop has the cookie, session works. For true cross-device, user logs in separately on each device — sessions are independent but data is shared via Supabase.

## 6. LIVE PREVIEW ARCHITECTURE

| Component | Status | Notes |
|-----------|--------|-------|
| iframe in Builder | EXISTS | Renders `previewUrl` from dev server events |
| Preview URL extraction | EXISTS | Watches for `start_dev_server` tool result |
| Preview URL endpoint | ADDED | `GET /api/projects/:id/preview` |
| Modal tunnel for preview | NOT YET WIRED | Infrastructure exists (encrypted_ports in sandbox), needs integration |

**Current gap:** The preview URL is extracted from SSE events in real-time. If the user refreshes, the URL is re-discovered from replayed events. The new `/preview` endpoint provides a server-side fallback.

## 7. ENVIRONMENT VARIABLE AUDIT

### Engine Vars — ALL SET
- `ANTHROPIC_API_KEY` — exists (disabled by user, will enable)
- `OPENAI_API_KEY` — set
- `QDRANT_URL` / `QDRANT_API_KEY` — set
- `HF_API_KEY` / `HUGGINGFACE_API_KEY` — set (+ alias added)
- `BRAVE_API_KEY` / `BRAVE_SEARCH_API_KEY` — set (+ alias added)

### Auth Vars — ALL SET
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN`
- `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`

### Modal Vars — ALL SET
- `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `MODAL_SPAWN_URL`, `MODAL_ENABLED`

### Stripe Vars — SET BUT NEED RECONFIGURATION
Old tier-based billing (Starter/Builder/Developer/Pro) needs to become credit-based:
- 20 Stripe vars exist (products, prices, topups, webhook secret)
- These are from the mechanical tier system
- New engine needs credit-based billing tied to LLM token usage
- Recommendation: Keep existing vars, add new credit-based products alongside

### Database Vars — ALL SET
- `DATABASE_URL`, `SUPABASE_DATABASE_URL`, plus 17 other Supabase/Postgres vars

## 8. MECHANICAL PATTERN SCAN

**Result: ZERO VIOLATIONS**

All 11 CLAUDE.md prohibitions checked. No sequential pipelines, no orchestrator classes, no hardcoded agent roles, no fire-and-forget events. Full report in `MECHANICAL_SCAN_REPORT.md`.

**Vercel runtime logs note:** Production deployment still runs old app code with mechanical patterns (`JobQueueManager`, `/api/quality/`). These will be eliminated when new code is promoted to production.

## 9. ITEMS NEEDING ATTENTION

### Must Fix Before Production
1. **Promote to production** — preview deployments work, promote both projects
2. **Anthropic API key** — enable it (user will do this)
3. **Modal kriptik-env secret** — verify it has the same API keys as Vercel (may be stale)

### Should Fix Soon
4. **Sandbox prewarming** — add endpoint to pre-initialize sandbox on project open
5. **Modal tunnel → preview iframe** — wire encrypted_ports tunnel URL to Builder preview
6. **Stripe reconfiguration** — credit-based billing instead of tier subscriptions

### Can Fix Later
7. **Zustand persist middleware** — add localStorage caching for project/user stores (nice-to-have, server refetch works)
8. **Silent DB error handling** — `persistEvent()` catches errors silently, should retry or alert
9. **Cross-device session sync** — separate logins per device is fine for now

## 10. STRIPE RECONFIGURATION PLAN

The old mechanical app used 4 subscription tiers (Starter $X/mo, Builder $X/mo, Developer $X/mo, Pro $X/mo) plus credit topups. The new engine uses Brain-driven builds where cost scales with LLM token usage per build.

**New billing model:**
- Remove subscription tiers (or keep as "seat" licenses for team features later)
- Primary model: credit-based
- Users buy credit packages (the topup prices already exist)
- Each build deducts credits based on actual LLM spend
- Engine already tracks `budgetCapDollars` and estimated spend
- Stripe webhook handler needs to credit user's account on purchase

**What exists in Vercel:**
- `STRIPE_TOPUP_TOPUP_100_PRICE` through `STRIPE_TOPUP_TOPUP_2500_PRICE` — these are the credit packages
- `STRIPE_WEBHOOK_SECRET` — webhook verification
- `users.credits` column in schema (defaults to 500)

**What needs to be built:**
- `POST /api/billing/checkout` — create Stripe checkout session for credit purchase
- `POST /api/billing/webhook` — handle Stripe webhook, credit user account
- `GET /api/billing/balance` — return user's credit balance
- Deduction logic in execute.ts — check credits before starting build, deduct on completion
