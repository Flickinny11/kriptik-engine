# Kriptik Prism Engine — Claude Code Build Prompt

> Copy everything below this line into Claude Code (Opus 4.6).

---

You are building the Prism diffusion engine for Kriptik, a production AI app builder. This is a complete production implementation — no placeholders, no stubs, no TODOs. Every function body must be real, working code.

## MANDATORY: Read These Files Before Writing ANY Code

Read these files IN THIS ORDER. Do not skip any. Do not skim. Read completely.

1. `docs/DRIFT-PREVENTION-SENTINEL.md` — **READ FIRST.** Anti-drift tripwires and red lines. This file describes every way you WILL fail if you don't follow it.

2. `docs/DIFFUSION-ENGINE-SPEC.md` — The complete build specification (canonical source of truth). This is a 2000+ line document. Read all 24 sections.

3. `docs/SPEC-CORRECTIONS.md` — Corrections to the spec based on research audit. Apply these mentally as you read the spec.

4. `.claude/CLAUDE.md` — Development rules, RALPH loop, and 10 immutable architectural invariants.

5. `.claude/rules/prism-engine.md` — Prism-specific rules including the sacred pipeline order and contamination-aware repair protocol.

6. `docs/PHASE-GATES.md` — Deterministic checkpoint criteria for each phase. You MUST satisfy every criterion before moving to the next phase.

7. `.claude/rules/integration-bridge.md` — Rules for modifying shared code between engines.

8. `.claude/rules/shared-interfaces.md` — Type contract rules.

9. `.claude/rules/cortex-engine.md` — Three sentences: Cortex is frozen. Don't touch it. No exceptions.

10. `docs/PRE-TASK-HOOK.md` — **Re-read this file before EVERY phase.** It contains drift detection self-interrogation questions.

## MANDATORY: Read Existing Codebase Integration Points

Before creating anything new, read these to understand what exists:

```bash
# Understand the integration surface
cat server/src/routes/execute.ts       # Where engine branching happens
cat server/src/routes/events.ts        # SSE infrastructure to reuse
cat server/src/schema.ts               # Database schema to extend
head -100 client/src/pages/Builder.tsx  # Builder UI to extend
cat client/src/hooks/useEngineEvents.ts # Event hook to extend
cat modal/app.py                       # Existing Modal app (DO NOT MODIFY)
cat packages/shared-interfaces/src/index.ts  # Existing type exports
```

## MANDATORY: Verify Clean Starting State

```bash
pnpm install
cd packages/shared-interfaces && pnpm tsc --noEmit
cd ../cortex-engine && pnpm tsc --noEmit
cd ../../server && pnpm tsc --noEmit
cd ../client && pnpm tsc --noEmit
```

ALL must pass. If any fail, fix them first. Do NOT proceed with errors.

---

## The 10 Immutable Invariants (Memorize These)

Recite before each phase. If you can't state all 10 from memory, re-read CLAUDE.md.

1. **Graph = App** — Knowledge graph persists as runtime representation. Never compiled away.
2. **Self-Contained Nodes** — Each caption is a complete standalone spec.
3. **Contamination-Aware Repair** — NEVER show broken code to repair model. Delete → regenerate from spec.
4. **Contract-First** — tRPC types before frontend/backend code.
5. **SSE Only** — No WebSockets, no polling, no new real-time channels.
6. **Modal Executes, Vercel Routes** — No compute on Vercel.
7. **Text Rendering Solved** — Sharp+SVG / MSDF / Ideogram tiered hybrid.
8. **Bipartite DAG** — Many-to-many elements↔pages. Reparent-on-navigate for PixiJS.
9. **Identical System Prompt** — SGLang system prompt same for ALL containers. Per-node in user message.
10. **Additive Schema** — Never drop/rename/retype columns.

---

## Build Order

Execute phases in exact order. For EACH phase:
1. Re-read `docs/PRE-TASK-HOOK.md`
2. Re-read the relevant spec section
3. Execute the RALPH loop (Read → Audit → Lint → Patch → Halt-check)
4. Verify the phase gate in `docs/PHASE-GATES.md`
5. Run drift detection self-interrogation (10 questions in PRE-TASK-HOOK.md)
6. Only then proceed to the next phase

### Phase 1: Foundation
**Goal:** Database schema, shared types, package skeleton, R2 client.

1. Add to `server/src/schema.ts`:
   - `engineType` text column on `projects` (default `'cortex'`)
   - `prismConfig` jsonb column on `projects` (nullable)
   - `prismPlans` table (spec Section 3)
   - `prismGraphs` table (spec Section 3)
   - `prismNodeAssets` table (spec Section 3)

2. Create `packages/shared-interfaces/src/prism-*.ts` files (spec Section 4):
   - `prism-engine.ts`, `prism-graph.ts`, `prism-plan.ts`, `prism-events.ts`, `prism-backend.ts`, `prism-optimization.ts`
   - Update `index.ts` to re-export all new files

3. Create `packages/prism-engine/` package skeleton (spec Section 2)

4. Create `server/src/utils/r2.ts` (spec Section 23)

5. Update `.env.example` (spec Section 18)

6. **VERIFY PHASE GATE 1** — run all checks from PHASE-GATES.md Phase 1.

### Phase 2: Server Routes
**Goal:** Engine branching, Prism API routes, SSE event extension.

Follow spec Section 6. Key points:
- `execute.ts`: branch on `project.engineType`, default to cortex
- Create `server/src/routes/prism.ts` with all routes
- Create `server/src/modal/prism-manager.ts`
- Do NOT modify `events.ts` (prism events flow through existing path)

**VERIFY PHASE GATE 2.**

### Phase 3: Client Engine Selection
**Goal:** Engine selector in UI, Prism stores, event routing.

Follow spec Section 7. Key points:
- `EngineSelector.tsx` — Radix Select, glass styling
- `usePrismStore.ts` — full state shape per spec
- Extend `useEngineEvents.ts` — route `prism_*` events
- Create all Prism builder panel components

**VERIFY PHASE GATE 3.**

### Phase 4: Modal Pipeline
**Goal:** All Modal GPU/CPU worker functions.

Follow spec Section 5. Key points:
- `modal/prism_app.py` — app definition, images, volumes, secrets
- All workers in `modal/prism/` — REAL implementations, not stubs
- FLUX.2 uses diffusers library
- SAM 3.1 uses segment_anything with text prompts
- SGLang with shared system prompt + RadixAttention
- SWE-RM for verification
- Assembly produces per-node modules (NOT monolithic bundle)
- Preview via `@modal.web_server`

**CRITICAL:** `generate_node_code` MUST have `min_containers=50, buffer_containers=50`.
**CRITICAL:** Orchestrator MUST use `Function.map(order_outputs=False)`, NOT sequential loops.

**VERIFY PHASE GATE 4.**

### Phase 5: Planning Pipeline
**Goal:** NLP → structured plan → user approval.

Follow spec Section 8 + SPEC-CORRECTIONS.md Correction 4. Key points:
- Intent parsing via Claude Opus 4.6 with tool_use for schema enforcement
- Reasoning-first pattern in AppIntent
- Domain knowledge graph with initial 20 app type mappings
- Inferred needs expansion to second/third-order dependencies
- Security requirements inferred for every app type
- Backend contract generated DURING planning (contract-first)
- Self-contained captions for every element (test with standalone engineer criterion)

**VERIFY PHASE GATE 5.**

### Phase 6: Generation Pipeline (THE CORE)
**Goal:** Image → segment → verify → graph → verify captions → atlas → code → verify → repair → assemble.

Follow spec Sections 9-13 + SPEC-CORRECTIONS.md Corrections 2,3. Key points:
- FLUX.2 generates ONE IMAGE PER HUB (not one for entire app)
- SAM 3.1 (not SAM 3) with text prompts from element types
- Post-segmentation verification: binary pass/fail
- Caption verification blast: verify each caption against its element image BEFORE code gen
- Atlas packing: MaxRects, 2048×2048, 2px padding
- Code gen: parallel, identical system prompt, per-node user message
- SWE-RM: ≥0.85 pass, 0.60-0.84 borderline, <0.60 fail
- **CONTAMINATION-AWARE REPAIR: DELETE → regenerate from spec → NEVER show broken code**
- Assembly: per-node modules, graph.json, atlases, shared utilities
- Graph-to-tree adapter with reparent-on-navigate

**VERIFY PHASE GATE 6.** This is the most critical gate.

### Phase 7: Backend Generation
Spec Section 14. Contract-first, parallel, convergence gate.
**VERIFY PHASE GATE 7.**

### Phase 8: Preview & Deployment
Spec Sections 15-16. Modal tunnel, Vercel deploy.
**VERIFY PHASE GATE 8.**

### Phase 9: Editing & Iteration
Spec Section 10. Single-node regen, graph version increment.
**VERIFY PHASE GATE 9.**

### Phase 10: Testing & Hardening
Spec Section 19. ALL tests. CI integration. Smoke test < 60s.
**VERIFY PHASE GATE 10.**

---

## Drift Detection (Run After EVERY Phase)

After completing each phase, answer these 10 questions. If ANY answer is wrong, fix before proceeding:

1. Did I use only types from `shared-interfaces/src/prism-*`?
2. Did I introduce any real-time channel other than SSE?
3. Did I put compute-heavy work on the Express server?
4. Did I modify any Cortex file or non-prism shared-interfaces file?
5. Did I modify existing column types or drop columns?
6. Are all captions self-contained (standalone engineer test)?
7. In repair logic, did I ever pass broken code to a model?
8. Are tRPC/Zod contracts generated BEFORE code gen dispatches?
9. Did I hardcode any URL, key, or config that should be an env var?
10. Did I import from `@kriptik/cortex-engine` in any Prism code?

---

## When You're Done

Run the complete verification:
```bash
# Typecheck
pnpm tsc --noEmit

# Tests
pnpm test

# Modal
modal deploy modal/prism_app.py

# Smoke
pnpm test:smoke:prism

# SSE verification
curl -N "http://localhost:3001/api/events/stream?projectId=test" &
curl -X POST "http://localhost:3001/api/events/callback/test" \
  -H "Content-Type: application/json" \
  -d '{"type":"prism_build_progress","data":{"phase":"test"}}'

# Tripwire scan (from DRIFT-PREVENTION-SENTINEL.md)
grep -rn "failed_code\|broken_code\|previous_code" modal/prism/
grep -rn "WebSocket\|Socket\.IO\|setInterval.*fetch" packages/prism-engine/ server/src/routes/prism*
grep -rn "import.*diffusers\|import.*torch" server/src/
grep -rni "agent.*session\|esaa\|brain.*sqlite\|design.*pioneer\|anti.slop" packages/prism-engine/ modal/prism/
```

Report the results of each verification step.
