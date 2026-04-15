# Prism Engine — Production Readiness Specification

> **IMMUTABLE ONCE EXECUTION BEGINS.** Do not modify during RALPH loop execution.
> Phases 1-10 built the codebase. Phases 11-15 deploy, wire, test, and harden it.
> After Phase 15, a user can type a prompt into KripTik and receive a working application.

---

## Overview

The Prism engine codebase is complete:
- 9,271 lines of Python Modal workers (GPU + CPU) in `modal/prism/`
- 9,160 lines of TypeScript pipeline logic in `packages/prism-engine/`
- 11 real Express API endpoints in `server/src/routes/prism.ts`
- 7 React UI components + 2 Zustand stores in `client/`
- 3 database tables defined in Drizzle (`server/src/schema.ts`)
- 246 passing unit tests across 18 test files

What remains is deployment, integration, and verification against live infrastructure.

## External Platforms

| Platform | Tool | Purpose |
|----------|------|---------|
| Supabase (PostgreSQL) | drizzle-kit CLI | Database migration & table creation |
| Modal | modal CLI (via Bash) | GPU worker deployment |
| Vercel | Vercel MCP tools | Environment variable management |
| Cloudflare R2 | Cloudflare MCP tools | Object storage bucket verification |

All credentials exist in Vercel's environment variables (shared with Cortex engine).
**Cortex functionality MUST NOT be disturbed.**

## Drift Prevention (Production Phases)

The 10 invariants from phases 1-10 still apply. Additional production rules:

1. **Never modify Cortex env vars.** Only ADD new prism-specific variables.
2. **Never break Cortex builds.** Verify cortex engine still functions after every change.
3. **Never expose API keys to client.** All secrets stay server-side or in Modal secrets.
4. **Database changes remain additive.** No drops, no renames, no type changes.
5. **Test against live infrastructure.** Mocks are insufficient for production verification.

---

## Phase 11: Database & Infrastructure Setup

### Objective
Create prism database tables in Supabase, verify R2 storage, and ensure all environment variables are configured.

### Tasks

1. **Generate Drizzle migrations**
   ```bash
   cd server && npx drizzle-kit generate
   ```
   - Verify migration files exist in `server/drizzle/`
   - Review generated SQL: must be ADDITIVE only (CREATE TABLE, ADD COLUMN)
   - Never DROP TABLE, DROP COLUMN, ALTER TYPE, or RENAME
   - If migration files already exist from cortex tables, new migration must only ADD prism tables

2. **Push database schema**
   ```bash
   cd server && npx drizzle-kit push
   ```
   - Requires `SUPABASE_DATABASE_URL` — retrieve from Vercel env vars via MCP tools
   - Set it locally: `export SUPABASE_DATABASE_URL=<value from Vercel>`
   - Verify tables exist after push: prism_plans, prism_graphs, prism_node_assets
   - Verify projects table has engineType and prismConfig columns

3. **Verify R2 bucket**
   - Use Cloudflare MCP tools (`r2_buckets_list`) to check existing buckets
   - Verify the bucket named in R2_BUCKET_NAME env var exists
   - If not, create it via `r2_bucket_create` MCP tool
   - Verify public access is configured via R2_PUBLIC_URL

4. **Audit environment variables**
   - Use Vercel MCP tools to read current project environment variables
   - Required vars (should exist from Cortex):
     - `ANTHROPIC_API_KEY` — used by Modal planning worker
     - `SUPABASE_DATABASE_URL` — used by drizzle
   - Required prism-specific vars (may need to be added):
     - `MODAL_PRISM_ENABLED=true`
     - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
     - `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
   - MODAL_PRISM_SPAWN_URL, MODAL_PRISM_PLAN_URL, MODAL_PRISM_EDIT_URL, MODAL_PRISM_PREVIEW_URL — set in Phase 12 after Modal deployment
   - **DO NOT modify any existing variables used by Cortex**

5. **Configure Modal secrets**
   - Modal functions reference `modal.Secret.from_name("kriptik-env")`
   - Check if Modal CLI is installed: `which modal || pip install modal`
   - Check authentication: `modal token list` or attempt `modal secret list`
   - If "kriptik-env" secret doesn't exist, create it:
     ```bash
     modal secret create kriptik-env \
       ANTHROPIC_API_KEY=<from Vercel> \
       R2_ACCOUNT_ID=<from Vercel> \
       R2_ACCESS_KEY_ID=<from Vercel> \
       R2_SECRET_ACCESS_KEY=<from Vercel> \
       R2_BUCKET_NAME=<from Vercel> \
       R2_PUBLIC_URL=<from Vercel> \
       API_URL=<from Vercel BETTER_AUTH_URL or API_URL>
     ```
   - If it already exists, verify it contains all required keys

### Gate
- [ ] `server/drizzle/` contains migration files
- [ ] Schema pushed to database without errors
- [ ] R2 bucket exists and is accessible
- [ ] All required env vars present in Vercel
- [ ] Modal secret "kriptik-env" exists with required keys

---

## Phase 12: Modal Deployment & Verification

### Objective
Deploy all Prism GPU/CPU workers to Modal and verify they're operational.

### Prerequisites
- Phase 11 complete (Modal secrets configured, R2 accessible)
- Modal CLI installed and authenticated

### Tasks

1. **Verify Modal CLI**
   ```bash
   which modal || pip install modal
   modal --version
   ```
   If not authenticated, the user must run `modal token set` manually (requires browser).

2. **Deploy prism_app.py**
   ```bash
   modal deploy modal/prism_app.py
   ```
   - This deploys all 12 functions to Modal's infrastructure:
     - GPU: generate_ui_image (L40S), segment_ui_image (L4), generate_node_code (L4×100), verify_node_code (L4)
     - CPU: assemble_pixijs_bundle, generate_backend, serve_preview, generate_prism_plan, edit_node, run_prism_pipeline, health
   - Capture function URLs from deployment output
   - If deployment fails, read error, fix Python issues, redeploy

3. **Verify health endpoint**
   ```bash
   curl -s https://<app-name>--health.modal.run/
   ```
   - The health function URL follows Modal's URL pattern: `https://<workspace>--kriptik-prism-health.modal.run`
   - Expect 200 response

4. **Extract and set function URLs**
   - From `modal deploy` output, extract URLs for:
     - `run_prism_pipeline` → MODAL_PRISM_SPAWN_URL
     - `generate_prism_plan` → MODAL_PRISM_PLAN_URL
     - `edit_node` → MODAL_PRISM_EDIT_URL
     - `serve_preview` → MODAL_PRISM_PREVIEW_URL
   - Use Vercel MCP tools to set these environment variables
   - Also set: `MODAL_PRISM_ENABLED=true`

5. **Verify preview tunnel**
   - `serve_preview` uses `@modal.web_server(8080)` — it exposes a Modal tunnel URL
   - Access the tunnel URL to verify it responds
   - This URL will be passed to the client for live preview iframe

6. **Quick function test**
   - Call `generate_prism_plan` with a minimal test payload:
     ```bash
     curl -X POST https://<plan-url> \
       -H "Content-Type: application/json" \
       -d '{"prompt":"Build a simple hello world page","callback_url":"https://httpbin.org/post"}'
     ```
   - Verify it responds (may take 30-60s on cold start)
   - This validates: Modal networking, secret injection, Anthropic API key

### Gate
- [ ] `modal deploy` completed without errors
- [ ] Health endpoint returns 200
- [ ] All MODAL_PRISM_* URLs set in Vercel environment
- [ ] MODAL_PRISM_ENABLED=true in Vercel
- [ ] Preview tunnel URL is accessible
- [ ] modal/app.py was NOT modified (Cortex Modal app untouched)

---

## Phase 13: UI Completion & Toggle Integration

### Objective
Ensure the engine toggle (Prism/Cortex) is accessible from both the dashboard and builder prompt inputs, wire the live preview from Modal tunnel to the KripTik UI, and complete node editing.

### Tasks

1. **Audit current toggle state**
   - Read `client/src/pages/Builder.tsx` — EngineSelector should be near line 258
   - Read `client/src/pages/Dashboard.tsx` (or equivalent) — check for NLP input bar
   - Read `client/src/components/dashboard/NewProjectModal.tsx` — check engine selection
   - Read `client/src/components/builder/EngineSelector.tsx` — understand component API

2. **Dashboard engine selection**
   - The dashboard must allow users to choose Prism vs Cortex before starting a build
   - If dashboard has a direct NLP/prompt input bar: add EngineSelector toggle below it
   - If dashboard only uses NewProjectModal: verify the modal has engine selection (should exist from Phase 3)
   - The toggle must: default to 'cortex', be clearly labeled, use the existing EngineSelector component
   - DO NOT create a new toggle component

3. **Builder prompt bar toggle**
   - Verify EngineSelector renders beside/below the prompt input in Builder.tsx
   - Toggle must be disabled (`engineLocked`) once a build has started
   - The UI should visually distinguish Prism mode (different accent, mode indicator)
   - When Prism is selected, the builder panels should show Prism-specific UI (PlanApprovalView, GenerationProgress, etc.)

4. **Live preview wiring**
   - When a Prism build completes, the preview URL comes from the `prism_preview_ready` SSE event
   - This URL is the Modal tunnel URL from `serve_preview`
   - Wire this URL into the Builder's right panel as an iframe
   - The preview should auto-appear when `prism_preview_ready` event fires
   - In `usePrismStore`, verify `previewUrl` state is set from the event
   - In Builder.tsx, render an iframe with `src={previewUrl}` when it's available
   - The preview panel should show a loading state during build and the iframe after

5. **SSE event routing verification**
   - Read `client/src/hooks/useEngineEvents.ts` — verify `prism_*` event routing
   - Read `client/src/store/usePrismStore.ts` — verify `handlePrismEvent` handles ALL event types:
     - `prism_intent_parsed`, `prism_needs_mapped`, `prism_plan_generated`
     - `prism_image_generating`, `prism_image_complete`
     - `prism_segmentation_started`, `prism_segmentation_complete`
     - `prism_graph_constructed`
     - `prism_codegen_started`, `prism_node_complete`, `prism_node_verified`
     - `prism_assembly_started`, `prism_assembly_complete`
     - `prism_preview_ready`, `prism_build_complete`, `prism_build_error`

6. **Node editing UI**
   - Read `client/src/components/builder/prism/NodeInspector.tsx`
   - Verify it can display node details: caption, elementType, visualSpec
   - Wire caption editing: editable text field → submit button → API call
   - Submit calls: `POST /api/prism/graph/:graphId/edit` with `{ nodeId, caption }`
   - Show loading state during regeneration, success state after
   - Verify the API endpoint exists in `server/src/routes/prism.ts`

7. **TypeScript verification**
   ```bash
   cd client && pnpm tsc --noEmit
   ```
   Fix any type errors before proceeding.

### Gate
- [ ] Engine toggle visible on dashboard (via modal or prompt bar)
- [ ] Engine toggle visible on builder prompt bar
- [ ] Toggle defaults to 'cortex', locks after build starts
- [ ] Preview panel displays Modal tunnel URL when build completes
- [ ] `prism_preview_ready` event triggers preview display
- [ ] NodeInspector can submit edits to API
- [ ] `tsc --noEmit` passes for client

---

## Phase 14: End-to-End Integration Testing

### Objective
Execute a REAL end-to-end build through the live Prism pipeline and fix any integration bugs discovered.

### Prerequisites
- Phases 11-13 complete (infrastructure deployed, Modal running, UI wired)
- Either local dev server running or testing against deployed Vercel instance

### Tasks

1. **Prepare test environment**
   - Option A: Start dev server locally
     ```bash
     cd server && SUPABASE_DATABASE_URL=<url> MODAL_PRISM_ENABLED=true pnpm dev &
     ```
   - Option B: Deploy to Vercel and test against production
     ```bash
     cd server && pnpm build
     # Use Vercel MCP tools to deploy
     ```
   - Ensure all env vars are available to the running server

2. **Create a prism project**
   ```bash
   curl -X POST http://localhost:3001/api/projects \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"name":"E2E Test Coffee Shop","engineType":"prism"}'
   ```
   - Verify project created with `engineType='prism'`
   - Capture `projectId` from response

3. **Submit a build prompt**
   ```bash
   curl -X POST http://localhost:3001/api/prism/build \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"projectId":"<id>","prompt":"Build a landing page for a coffee shop with a hero section, menu grid showing 6 items with prices, and a contact form with name, email, and message fields"}'
   ```
   - This triggers: intent parsing → needs mapping → plan generation
   - Monitor SSE stream for events

4. **Monitor SSE events**
   ```bash
   curl -N http://localhost:3001/api/events/stream?projectId=<id> \
     -H "Authorization: Bearer <token>"
   ```
   - Watch for events in sequence:
     - `prism_intent_parsed` → `prism_plan_generated`
   - If planning fails: check Modal logs, fix and retry

5. **Verify and approve plan**
   ```bash
   curl http://localhost:3001/api/prism/plan/<planId> \
     -H "Authorization: Bearer <token>"
   ```
   - Verify plan has: hubs, elements per hub, shared components, backend contract
   - Approve:
   ```bash
   curl -X POST http://localhost:3001/api/prism/plan/approve \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"planId":"<id>"}'
   ```

6. **Track full pipeline execution**
   - Continue monitoring SSE stream
   - Expected event sequence:
     1. `prism_image_generating` (per hub)
     2. `prism_image_complete` (per hub)
     3. `prism_segmentation_started` / `prism_segmentation_complete`
     4. `prism_graph_constructed`
     5. `prism_codegen_started` / `prism_node_complete` (per node, 100+ events)
     6. `prism_verification_started` / `prism_node_verified` (per node)
     7. `prism_assembly_started` / `prism_assembly_complete`
     8. `prism_preview_ready`
     9. `prism_build_complete`

7. **Fix integration bugs**
   - **This step is where reality meets code.** Expect issues.
   - Common bugs and how to fix them:
     - **Serialization mismatch**: Python dict keys vs TypeScript interface fields → fix field naming
     - **URL construction**: callback URL missing protocol, R2 paths wrong → fix URL building
     - **Timeouts**: Modal cold start on first call → increase timeout or add retry
     - **Event format**: Python emits extra/missing fields → align with PrismEvent type
     - **Auth flow**: Bearer token not forwarded to Modal callback → fix callback auth
     - **Database insert**: JSONB column expects object, receives string → fix serialization
   - For each bug: identify root cause, fix it, verify the fix
   - **Document every bug and fix** in `docs/E2E-VERIFICATION-LOG.md`

8. **Verify final output**
   - Bundle exists in R2 at `{projectId}/{version}/bundles/frontend/`
   - Preview URL is accessible and renders the generated app
   - Graph is persisted in `prism_graphs` table with correct structure

9. **Test node editing** (if pipeline succeeds)
   ```bash
   curl -X POST http://localhost:3001/api/prism/graph/<graphId>/edit \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"nodeId":"<id>","caption":"A rounded blue button, 180px wide, that says Contact Us"}'
   ```
   - Verify only that node regenerates
   - Verify preview updates

10. **Cortex regression check**
    - Create a cortex project and verify it still works
    - This ensures Phase 14 changes didn't break existing functionality

### Gate
- [ ] `docs/E2E-VERIFICATION-LOG.md` exists with documented test results
- [ ] Prism project created successfully
- [ ] Build pipeline executed (success or documented failures with fixes)
- [ ] All integration bugs found are documented with fixes
- [ ] Cortex regression check passes

### Note on Partial Success
If the full pipeline doesn't complete end-to-end, that's OK for this phase. The goal is to:
1. Exercise every integration point
2. Find and fix bugs
3. Document what works and what needs more work
4. Get as far through the pipeline as possible

Document the furthest point reached and all fixes applied.

---

## Phase 15: Production Hardening

### Objective
Add rate limiting, audit error handling, perform security review, and run final production verification.

### Tasks

1. **Rate limiting for Prism routes**
   - Add rate limiting middleware to all `/api/prism/*` routes
   - Limits:
     - Builds: 10 per hour per user
     - Plan fetches: 100 per hour per user
     - Node edits: 50 per hour per user
   - Use `express-rate-limit` package (check if already in server dependencies)
   - If not installed: `cd server && pnpm add express-rate-limit`
   - Apply to prism router in `server/src/routes/prism.ts`
   - DO NOT add rate limiting to non-prism routes

2. **Error handling audit**
   - Every prism route must return errors in the `prism_build_error` format:
     ```typescript
     {
       type: 'prism_build_error',
       data: {
         phase: string,          // which pipeline phase failed
         message: string,        // user-friendly, NO stack traces
         nodeId?: string,        // which node failed (if applicable)
         recoverable: boolean,   // can the user retry?
         suggestion: string,     // actionable next step
       },
       timestamp: string,
       progress: number,
     }
     ```
   - Audit each route handler for:
     - Missing try/catch blocks
     - Raw error messages leaking to client
     - Missing error events emitted to SSE
   - Add proper error handling where missing

3. **Input validation**
   - Prompt: max 10,000 characters, non-empty after trim
   - Plan approval/rejection: valid planId format, valid status
   - Node edit: valid graphId, valid nodeId, non-empty caption
   - Config/models endpoints: no body validation needed (GET only)
   - Return 400 with clear message for invalid input

4. **Security review**
   - Verify: no API keys in any HTTP response body
   - Verify: no raw error messages or stack traces in HTTP responses
   - Verify: `requireAuth` middleware on ALL prism routes
   - Verify: CORS allows only the KripTik frontend origin
   - Verify: Modal callback URL uses HTTPS
   - Verify: R2 signed URLs (if used) have expiration

5. **Performance baseline**
   - Document expected performance:
     - Planning phase: <30 seconds
     - Full build (simple app): <10 minutes
     - Preview load: <5 seconds after build
     - SSE event latency: <1 second
   - If any are significantly out of range, investigate and optimize

6. **Final smoke test**
   - Full flow: create project → build → approve → wait → preview
   - Edit flow: edit one node → verify regeneration
   - Cortex flow: create cortex project → verify it still works
   - Document results in `docs/E2E-VERIFICATION-LOG.md`

7. **Update documentation**
   - Update `docs/PHASE-STATE.md`: all 15 phases COMPLETE
   - Finalize `docs/E2E-VERIFICATION-LOG.md` with all test results
   - The Prism engine is production-ready

### Gate
- [ ] Rate limiting active on all prism routes
- [ ] All error responses follow prism_build_error format
- [ ] Input validation on all mutation endpoints
- [ ] No security vulnerabilities found
- [ ] Performance within acceptable bounds (or documented)
- [ ] Smoke test passes
- [ ] Cortex regression check passes
- [ ] `docs/E2E-VERIFICATION-LOG.md` documents all final tests
