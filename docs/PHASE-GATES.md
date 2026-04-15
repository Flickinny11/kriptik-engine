# PHASE-GATES.md — Deterministic Validation Checkpoints

> **Every phase gate MUST be fully satisfied before proceeding to the next phase.**
> These are not guidelines — they are hard gates. A phase is not complete until every
> checkbox is mechanically verifiable as true.

---

## Phase 1 Gate: Foundation

### Files That Must Exist
```
packages/shared-interfaces/src/prism-engine.ts
packages/shared-interfaces/src/prism-graph.ts
packages/shared-interfaces/src/prism-plan.ts
packages/shared-interfaces/src/prism-events.ts
packages/shared-interfaces/src/prism-backend.ts
packages/shared-interfaces/src/prism-optimization.ts
packages/prism-engine/package.json
packages/prism-engine/tsconfig.json
packages/prism-engine/src/index.ts
packages/prism-engine/src/types.ts
server/src/utils/r2.ts
```

### Types That Must Be Exported from shared-interfaces
```typescript
// Verify with: grep "export" packages/shared-interfaces/src/index.ts | grep prism
IPrismEngine, PrismBuildOptions, PrismEngineConfig
PrismGraph, GraphNode, GraphEdge, Hub, HubTransition
UIElementType, NodeVisualSpec, NodeBehaviorSpec, TextContentSpec, AnimationSpec
Interaction, DataBinding, AtlasRegion, GraphMetadata
AppIntent, AppType, FeatureSpec, VisualStyleSpec, IntegrationSpec
PrismPlan, PrismGraphPlan, HubPlan, ElementPlan, SharedComponentPlan
BackendContract, DataModelPlan, APIEndpointPlan, AuthStrategyPlan
PrismEventType, PrismEvent
BackendTarget, DeploymentTarget
```

### Schema Changes That Must Exist
```sql
-- Verify these columns/tables exist in server/src/schema.ts
-- projects table: engine_type (text, default 'cortex'), prism_config (jsonb, nullable)
-- prism_plans table: id, project_id, user_id, prompt, parsed_intent, graph_plan, status, ...
-- prism_graphs table: id, plan_id, project_id, version, nodes, edges, hubs, metadata, status, ...
-- prism_node_assets table: id, graph_id, node_id, image_url, generated_code, verification_score, status, ...
```

### Mechanical Verification
```bash
# ALL of these must exit 0
cd packages/shared-interfaces && pnpm tsc --noEmit
cd packages/prism-engine && pnpm tsc --noEmit
cd server && pnpm tsc --noEmit
cd client && pnpm tsc --noEmit

# R2 client must export these functions
grep "export.*uploadToR2" server/src/utils/r2.ts
grep "export.*getR2Url" server/src/utils/r2.ts
grep "export.*deleteFromR2" server/src/utils/r2.ts

# New env vars in .env.example
grep "MODAL_PRISM_ENABLED" .env.example
grep "R2_ACCOUNT_ID" .env.example
grep "R2_BUCKET_NAME" .env.example
```

### Invariant Checks
- [ ] `engine_type` column defaults to `'cortex'` (existing projects unaffected)
- [ ] `prism_config` column is nullable (cortex projects don't use it)
- [ ] No existing columns were modified or removed
- [ ] No existing shared-interfaces files (non-prism) were modified
- [ ] `prism-engine` package depends on `@kriptik/shared-interfaces`

---

## Phase 2 Gate: Server Routes

### Files That Must Exist
```
server/src/routes/prism.ts
server/src/modal/prism-manager.ts
```

### Routes That Must Respond
```bash
# Verify (server must be running on localhost:3001)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/prism/build        # 401 (auth required)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/prism/plan/approve  # 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/prism/plan/reject   # 401
curl -s -o /dev/null -w "%{http_code}" -X GET  http://localhost:3001/api/prism/plan/test     # 401
curl -s -o /dev/null -w "%{http_code}" -X GET  http://localhost:3001/api/prism/graph/test    # 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/prism/graph/test/edit # 401
curl -s -o /dev/null -w "%{http_code}" -X GET  http://localhost:3001/api/prism/models        # 200
curl -s -o /dev/null -w "%{http_code}" -X GET  http://localhost:3001/api/prism/config        # 200
```

### Engine Branching Verification
```typescript
// execute.ts must contain this pattern (verify with grep):
// project.engineType === 'prism'  → handlePrismBuild
// Default path                    → existing cortex logic (UNCHANGED)
```

### Invariant Checks
- [ ] `execute.ts` defaults to cortex when `engineType` is missing or unrecognized
- [ ] All prism routes require authentication via `requireAuth`
- [ ] `prism-manager.ts` exports `startPrismBuild(config)` and `isPrismEnabled()`
- [ ] Prism routes are mounted at `/api/prism` prefix
- [ ] Events route (`events.ts`) was NOT modified (prism events flow through existing infrastructure)
- [ ] No WebSocket or polling endpoint was created

---

## Phase 3 Gate: Client Engine Selection

### Files That Must Exist
```
client/src/components/builder/EngineSelector.tsx
client/src/components/builder/prism/PlanApprovalView.tsx
client/src/components/builder/prism/GenerationProgress.tsx
client/src/components/builder/prism/NodeStatusGrid.tsx
client/src/components/builder/prism/GraphVisualization.tsx
client/src/components/builder/prism/NodeInspector.tsx
client/src/components/builder/prism/ImagePreview.tsx
client/src/store/usePrismStore.ts
client/src/store/usePrismConfigStore.ts
```

### Store Shape Verification
```typescript
// usePrismStore must contain these state fields:
// currentPlan: PrismPlan | null
// currentGraph: PrismGraph | null
// pipelinePhase: string (one of the defined phases)
// progress: number (0-100)
// generatedImageUrl: string | null
// previewUrl: string | null
// nodeStatuses: Record<string, NodeStatus>
// handlePrismEvent(event: PrismEvent): void
```

### Invariant Checks
- [ ] EngineSelector uses Radix Select (not a custom dropdown)
- [ ] Engine selector locked after first build starts
- [ ] `useEngineEvents.ts` routes `prism_*` events to `usePrismStore.handlePrismEvent`
- [ ] Existing cortex event handling is UNCHANGED
- [ ] All new components use existing Glass styling and Kriptik color tokens
- [ ] No new CSS files or design tokens were introduced
- [ ] `Builder.tsx` renders Prism panels only when `engineType === 'prism'`
- [ ] `NewProjectModal.tsx` includes engine selection, defaults to `'cortex'`

---

## Phase 4 Gate: Modal Pipeline

### Files That Must Exist
```
modal/prism_app.py
modal/prism/orchestrator.py
modal/prism/planning.py
modal/prism/flux_worker.py
modal/prism/sam_worker.py
modal/prism/codegen_worker.py
modal/prism/verify_worker.py
modal/prism/assembly_worker.py
modal/prism/backend_worker.py
modal/prism/preview_server.py
modal/prism/utils/graph.py
modal/prism/utils/atlas.py
modal/prism/utils/text.py
```

### Function Verification
```python
# prism_app.py must define these Modal functions:
# generate_ui_image     (gpu="L40S")
# segment_ui_image      (gpu="L4")
# generate_node_code    (gpu="L4", min_containers=50, buffer_containers=50)
# verify_node_code      (gpu="L4")
# assemble_pixijs_bundle (cpu)
# generate_backend       (cpu or gpu)
# serve_preview          (cpu, @modal.web_server)
# run_prism_pipeline     (cpu, timeout=1800)
```

### Invariant Checks
- [ ] `modal deploy modal/prism_app.py` succeeds
- [ ] App name is `kriptik-prism` (NOT `kriptik-engine`)
- [ ] FLUX.2 Klein weights are pre-downloaded in gpu_image
- [ ] SAM 3.1 weights are pre-downloaded in gpu_image
- [ ] Qwen3-Coder-Next weights are pre-downloaded in codegen_image
- [ ] `modal/app.py` was NOT modified
- [ ] `generate_node_code` has `min_containers=50` and `buffer_containers=50`
- [ ] Orchestrator uses `Function.map()` with `order_outputs=False` for code gen
- [ ] All events are POSTed to `callbackUrl` (not returned directly)

---

## Phase 5 Gate: Planning Pipeline

### Verification
- [ ] A text prompt produces a structured `AppIntent` via Claude Opus 4.6
- [ ] AppIntent uses reasoning-first pattern (reasoning field before structured fields)
- [ ] Inferred needs mapper expands app type to feature dependency tree
- [ ] Commercial classification triggers appropriate requirements (landing page, auth, payment)
- [ ] Security requirements are inferred (input validation, CSRF, XSS, rate limiting)
- [ ] Plan generation produces a complete `PrismGraphPlan` with all hubs, elements, shared components
- [ ] Every `ElementPlan.caption` is self-contained (test with the standalone engineer criterion)
- [ ] Backend contract (tRPC types + Zod schemas) is generated DURING planning, BEFORE code gen
- [ ] Plan is persisted to `prism_plans` table
- [ ] Plan is returned to client for display in PlanApprovalView
- [ ] Approval triggers Modal pipeline dispatch
- [ ] Rejection triggers re-generation with feedback

---

## Phase 6 Gate: Generation Pipeline

### Pipeline Order Verification
The pipeline MUST execute in this exact order:
```
FLUX.2 image gen → SAM 3.1 segmentation → post-segmentation verification →
graph construction → texture atlas packing → parallel code gen →
SWE-RM verification → contamination-aware repair → PixiJS assembly
```

### Critical Path Checks
- [ ] FLUX.2 generates one image PER HUB (not one image for entire app)
- [ ] SAM 3.1 uses text prompts from element plan types ("navigation bar", "hero card", etc.)
- [ ] Post-segmentation verification uses vision model for binary pass/fail
- [ ] Graph construction matches segments to planned elements by spatial proximity + semantic similarity
- [ ] Texture atlas uses MaxRects bin packing, 2048×2048, 2px padding between sprites
- [ ] Code gen uses SGLang with IDENTICAL system prompt across all containers
- [ ] Code gen dispatches ALL nodes in parallel via `Function.map(order_outputs=False)`
- [ ] SWE-RM uses continuous scoring: ≥0.85 pass, 0.60-0.84 borderline, <0.60 fail
- [ ] Repair protocol: DELETE code → regenerate from spec only → NEVER show broken code
- [ ] Second repair failure: error description only (natural language, not raw error)
- [ ] Third failure: escalate to Claude Opus 4.6
- [ ] Assembly produces: index.html, app.js, graph.json, nodes/{id}.js, atlases/*.png, fonts/*.fnt
- [ ] Graph-to-tree adapter implements reparent-on-navigate for shared nodes

---

## Phase 7 Gate: Backend Generation

- [ ] tRPC router types generated from plan's BackendContract
- [ ] Zod validation schemas generated for all endpoints
- [ ] Backend nodes generated in parallel against contract slices
- [ ] Convergence gate runs: `tsc --noEmit` + AJV schema validation + route resolution
- [ ] Convergence gate catches frontend API calls without backend handlers
- [ ] Backend deploys to user-selected targets (Cloudflare Workers, Lambda, Vercel, etc.)

---

## Phase 8 Gate: Preview & Deployment

- [ ] Modal tunnel serves assembled bundle via HTTPS
- [ ] Preview URL returned via `prism_preview_ready` SSE event
- [ ] Builder iframe loads the tunnel URL
- [ ] Frontend deploys to Vercel via SDK
- [ ] Published apps accessible at `{slug}.kriptik.app`
- [ ] Backend manifest stored in `prism_graphs.backendManifest`

---

## Phase 9 Gate: Editing & Iteration

- [ ] Editing a node regenerates ONLY that node's code
- [ ] Neighbor nodes are NOT regenerated
- [ ] Graph edges preserved unless edit explicitly changes relationships
- [ ] Atlas is NOT repacked (node's region stays the same)
- [ ] Graph version increments
- [ ] Only the bundle's changed module file is swapped
- [ ] Preview updates within 5 seconds of edit

---

## Phase 10 Gate: Testing & Hardening

### Test File Verification
```
packages/prism-engine/src/__tests__/planning/intent-parser.test.ts
packages/prism-engine/src/__tests__/planning/plan-generator.test.ts
packages/prism-engine/src/__tests__/planning/needs-mapper.test.ts
packages/prism-engine/src/__tests__/graph/graph-construction.test.ts
packages/prism-engine/src/__tests__/graph/atlas-packer.test.ts
packages/prism-engine/src/__tests__/graph/graph-to-tree.test.ts
packages/prism-engine/src/__tests__/graph/shared-nodes.test.ts
packages/prism-engine/src/__tests__/codegen/prompt-builder.test.ts
packages/prism-engine/src/__tests__/codegen/codegen-dispatch.test.ts
packages/prism-engine/src/__tests__/verification/scoring.test.ts
packages/prism-engine/src/__tests__/verification/repair-protocol.test.ts
packages/prism-engine/src/__tests__/assembly/bundler.test.ts
packages/prism-engine/src/__tests__/backend/contract-generator.test.ts
packages/prism-engine/src/__tests__/backend/convergence-gate.test.ts
tests/e2e/prism/build-flow.test.ts
tests/e2e/prism/edit-flow.test.ts
tests/smoke/prism/quick-build.test.ts
```

### Final Verification
```bash
pnpm tsc --noEmit                    # All packages typecheck
pnpm test                             # All unit tests pass
pnpm test:smoke:prism                 # Smoke test < 60 seconds
modal deploy modal/prism_app.py       # Modal deployment succeeds
```

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests pass
- [ ] Smoke test completes in <60 seconds
- [ ] CI pipeline includes prism-engine typecheck and tests
- [ ] No `any` types in prism-engine source code (excluding test mocks)
- [ ] No hardcoded URLs, API keys, or configuration values in source code

---

## Phase 11 Gate: Database & Infrastructure

### Verification
```bash
# Migration files exist
ls server/drizzle/ 2>/dev/null  # must contain files

# Schema pushed (verify via drizzle-kit push succeeding)
cd server && npx drizzle-kit push

# R2 bucket accessible (verified via Cloudflare MCP tools)

# Modal secrets configured
modal secret list 2>/dev/null | grep kriptik-env
```

### Invariant Checks
- [ ] No existing tables were modified (additive only)
- [ ] No Cortex environment variables were changed
- [ ] R2 bucket is accessible
- [ ] Modal secret "kriptik-env" contains all required keys
- [ ] `server/drizzle/` contains migration files

---

## Phase 12 Gate: Modal Deployment

### Verification
```bash
# Modal deploy succeeded
# Verified by successful `modal deploy modal/prism_app.py`

# Health endpoint responds
curl -s <MODAL_HEALTH_URL>  # returns 200

# Function URLs set in Vercel (verified via Vercel MCP tools)
```

### Invariant Checks
- [ ] App name is `kriptik-prism`
- [ ] Health endpoint returns 200
- [ ] MODAL_PRISM_SPAWN_URL set in Vercel
- [ ] MODAL_PRISM_PLAN_URL set in Vercel
- [ ] MODAL_PRISM_EDIT_URL set in Vercel
- [ ] MODAL_PRISM_PREVIEW_URL set in Vercel
- [ ] MODAL_PRISM_ENABLED=true in Vercel
- [ ] modal/app.py was NOT modified

---

## Phase 13 Gate: UI Completion & Toggle

### Files Verified
```
client/src/components/builder/EngineSelector.tsx      (exists from Phase 3)
client/src/pages/Builder.tsx                           (EngineSelector + preview)
client/src/components/dashboard/NewProjectModal.tsx    (engine selection)
client/src/store/usePrismStore.ts                      (previewUrl state)
```

### Verification
```bash
grep -q "EngineSelector" client/src/pages/Builder.tsx && echo PASS
grep -q "engineType" client/src/components/dashboard/NewProjectModal.tsx && echo PASS
grep -q "previewUrl" client/src/store/usePrismStore.ts && echo PASS
cd client && pnpm tsc --noEmit
```

### Invariant Checks
- [ ] Engine toggle defaults to 'cortex'
- [ ] Toggle locks after build starts
- [ ] Preview panel displays Modal tunnel URL when build completes
- [ ] `prism_preview_ready` event triggers preview display
- [ ] NodeInspector edit submits to API
- [ ] No Cortex UI behavior was changed
- [ ] `tsc --noEmit` passes for client

---

## Phase 14 Gate: E2E Integration

### Verification
- [ ] `docs/E2E-VERIFICATION-LOG.md` exists
- [ ] At least one build attempt documented with results
- [ ] All integration bugs found are documented with their fixes
- [ ] Cortex regression check documented as passing

---

## Phase 15 Gate: Production Hardening

### Verification
```bash
# Rate limiting
grep -q "rateLimit\|rate.*limit\|rateLimiter" server/src/routes/prism.ts && echo PASS

# Error format
grep -q "prism_build_error" server/src/routes/prism.ts && echo PASS

# Input validation
grep -q "length\|maxLength\|validate" server/src/routes/prism.ts && echo PASS
```

### Invariant Checks
- [ ] Rate limiting on all prism routes
- [ ] Error responses follow prism_build_error format
- [ ] Input validation on all mutation endpoints
- [ ] No API keys in client-accessible responses
- [ ] Auth required on all prism routes
- [ ] Cortex engine still works (regression check)
- [ ] Final smoke test passes
- [ ] `docs/E2E-VERIFICATION-LOG.md` complete with all test results
