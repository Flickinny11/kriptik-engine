# PRE-TASK-HOOK.md — Read Before EVERY Implementation Task

> **STOP. Read this entire file before writing any code for this task.**
> This hook exists because drift accumulates imperceptibly over long sessions.
> You MUST read this hook AND the relevant phase gate BEFORE each task.

---

## Step 1: Identify Your Current Phase

Which phase are you working on RIGHT NOW? (Pick exactly one)

| Phase | Task | Spec Section |
|-------|------|-------------|
| 1 | Foundation: schema, types, package skeleton, R2 | Sections 2-4 |
| 2 | Server Routes: engine branching, prism routes, SSE | Section 6 |
| 3 | Client: engine selector, stores, event routing | Section 7 |
| 4 | Modal Pipeline: all GPU/CPU worker functions | Section 5 |
| 5 | Planning: intent → plan → approval | Section 8 |
| 6 | Generation: image → segment → graph → code → verify → repair → assemble | Sections 9-13 |
| 7 | Backend: contract-first code gen + deployment | Section 14 |
| 8 | Preview & Deployment: Modal tunnel, Vercel deploy | Sections 15-16 |
| 9 | Editing: node mutation, single-node regen | Section 10 |
| 10 | Testing: all tests from Section 19, CI integration | Section 19 |

## Step 2: Re-Read the Spec Section

Open `docs/DIFFUSION-ENGINE-SPEC.md` and re-read the section(s) listed above for your current phase. Do not rely on your memory of the spec from earlier in this session.

## Step 3: Re-Read the Phase Gate

Open `docs/PHASE-GATES.md` and read the gate for your current phase. You must satisfy every criterion listed before moving to the next phase.

## Step 4: Recite the Invariants

Before writing code, confirm you remember these. If any feel unfamiliar, re-read CLAUDE.md.

1. The graph IS the app (no compilation to different format)
2. Nodes are self-contained (caption alone is sufficient for implementation)
3. Contamination-aware repair (NEVER show broken code to repair model)
4. Contract-first parallel generation (tRPC types BEFORE code)
5. SSE only (no WebSockets, no polling)
6. Modal executes, Vercel routes (no compute on Vercel)
7. Text rendering is solved (Sharp+SVG / MSDF / Ideogram tiered)
8. Bipartite DAG (not hub-and-spoke, reparent-on-navigate adapter)
9. SGLang system prompt is identical across all containers (RadixAttention)
10. Additive schema only (never drop/rename/retype columns)

## Step 5: Audit for Existing Code

Before writing anything new, search for:
```bash
# Search for files you might be about to duplicate
grep -r "SEARCH_TERM" packages/prism-engine/src/
grep -r "SEARCH_TERM" server/src/routes/prism*
grep -r "SEARCH_TERM" client/src/components/builder/prism/
grep -r "SEARCH_TERM" client/src/store/usePrism*
grep -r "SEARCH_TERM" modal/prism*
```

Replace SEARCH_TERM with the function name, type name, or concept you're about to implement.

## Step 6: Proceed with RALPH

Now execute the RALPH loop:
- **R**ead — (you just did this)
- **A**udit — (you just did this)
- **L**int — Run `tsc --noEmit` after EVERY file change
- **P**atch — Targeted changes only
- **H**alt-check — Verify against phase gate when done

---

## Drift Detection Self-Interrogation (Run After EVERY File)

After modifying or creating any file, answer these questions silently:

1. **Type safety:** Did I use `any` where a specific Prism type exists in `shared-interfaces/src/prism-*`?
2. **Real-time:** Did I introduce any communication channel other than SSE via `buildEvents`?
3. **Compute placement:** Did I put ML inference, image processing, or heavy computation on the Express server instead of Modal?
4. **Cortex isolation:** Did I modify any file in `packages/cortex-engine/`, `modal/app.py`, or any non-prism shared-interfaces file?
5. **Schema safety:** Did I modify an existing column type, drop a column, or add a column without a default?
6. **Node containment:** Does every `caption` I generated/referenced fully describe the element without referencing other nodes?
7. **Contamination protocol:** In any repair logic, did I pass broken code or raw error output to a regeneration model?
8. **Contract ordering:** In any code generation flow, did I generate tRPC/Zod contracts BEFORE dispatching frontend/backend code generation?
9. **Env vars:** Did I hardcode any URL, API key, bucket name, or configuration value that should be an environment variable?
10. **Import paths:** Did I import from `@kriptik/cortex-engine` in any Prism code? (This should NEVER happen)

If ANY answer reveals a violation, fix it IMMEDIATELY before proceeding.

---

## Common Drift Patterns (Watch For These)

### Pattern: "Simplification Creep"
You start implementing a parallel code generation system and think "I'll just do sequential for now and parallelize later." NO. The spec says parallel. Implement parallel from the start using `Function.map()` with `order_outputs=False`.

### Pattern: "Verification Shortcut"
You implement code generation but skip SWE-RM verification "for the first pass." NO. Verification is part of the pipeline. A node without verification is not a valid node.

### Pattern: "Flat Graph Regression"
You store nodes in a flat array instead of a proper bipartite DAG with hub memberships. The graph structure is not optional — it IS the application architecture.

### Pattern: "SSE Bypass"
You think "I'll just return the build result directly from the API call" instead of streaming events via SSE. NO. The Modal pipeline runs asynchronously. Results flow through `POST /api/events/callback → buildEvents table → GET /api/events/stream`.

### Pattern: "Monolithic Assembly"
You generate a single large JavaScript file instead of per-node modules loaded by the graph-to-tree adapter. Each node gets its own `{nodeId}.js` module.

### Pattern: "DOM Text Fallback"
You add a `<div>` or `<span>` for text rendering instead of using the tiered text system (Sharp+SVG, MSDF, or Ideogram). The only DOM text allowed is transparent `<input>` overlays for interactive text fields.

### Pattern: "Shared Prompt Pollution"
You add per-node content to the SGLang system prompt. The system prompt is IDENTICAL across all containers. Per-node content goes in the user message ONLY.
