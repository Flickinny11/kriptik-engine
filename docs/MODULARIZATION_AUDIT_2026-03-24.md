# Build Engine Modularization Audit — 2026-03-24

> **Scope**: Forensic audit of `src/` (engine), `server/`, and enforcement infrastructure to verify build engine modularization boundaries are maintained.

---

## Executive Summary

The build engine's modular architecture is **mostly intact** but has accumulated **feature-specific logic leakage** in two critical files: `src/engine.ts` and `src/agents/runtime.ts`. The server boundary is **perfectly clean**. The tool modules are **well-structured** with only acceptable cross-module type imports. Enforcement scripts are comprehensive but have one ungrandfathered file size violation.

### Scorecard

| Area | Grade | Status |
|------|-------|--------|
| **Server ↔ Engine boundary** | A+ | Zero violations. Lazy import, inline types, no coupling. |
| **Tool modules** | A | Clean registry pattern. Acceptable type-only cross-module imports. |
| **Enforcement scripts** | A- | Comprehensive checks, one file (global-memory.ts) not grandfathered. |
| **engine.ts (bootstrap)** | C | Experience system logic embedded directly instead of delegated. |
| **agents/runtime.ts** | C | Direct DB access, hardcoded roles, embedded business logic. |

---

## 1. engine.ts — Experience System Embedded in Bootstrap

**File**: `src/engine.ts` (212 lines)

The engine should be a thin wiring file that connects Brain, AgentRuntime, Tools, SSE, and Providers. Instead, **~60 lines of experience/learning system orchestration logic** are embedded directly.

### Violations Found

| # | Lines | Issue | Severity |
|---|-------|-------|----------|
| 1 | 103-111 | 5 experience modules instantiated individually in engine (Extractor, Reinforcer, Tracker, Metrics, Retriever) | HIGH |
| 2 | 115-124 | Build-start metrics emission with fire-and-forget SSE call | MEDIUM |
| 3 | 127-164 | Post-build completion listener with event filtering, multi-step workflow (extract → reinforce → emit), and error handling | CRITICAL |
| 4 | 130-134 | Build completion detection via string-matching on node title (`title.includes('complete')`) — duplicated in SSEEmitter | HIGH |
| 5 | 170-175 | Config normalization (6-line ternary to extract userPrompt from initialContext) | MEDIUM |
| 6 | 169-180 | Pre-build experience retrieval orchestration with its own try/catch | HIGH |
| 7 | 167-186 | Dryrun conditional controlling multiple module behaviors | MEDIUM |

### Root Cause

The experience/learning system (Component 28) was wired directly into engine.ts instead of being encapsulated in a single orchestrator module.

### Recommended Fix

Create `src/brain/experience-orchestrator.ts` that:
- Owns all 5 experience sub-modules internally
- Subscribes to Brain events for build completion detection
- Manages pre-build retrieval and post-build extraction/reinforcement
- Exposes a clean interface: `start(projectId, initialContext)`, `stop()`

Engine.ts would then instantiate ONE module instead of five:
```typescript
const experience = new ExperienceOrchestrator({ brain, globalMemory, router, sseEmitter });
if (!config.dryRun) {
  await experience.start(config.projectId, config.initialContext);
}
```

---

## 2. agents/runtime.ts — Internal Access and Hardcoded Roles

**File**: `src/agents/runtime.ts` (885 lines)

### Violations Found

| # | Lines | Issue | Severity |
|---|-------|-------|----------|
| 1 | 416-868 | 7 instances of direct `this.brain.db` access (Drizzle ORM) bypassing BrainService API | CRITICAL |
| 2 | 309-404 | Hardcoded `leadTools()` method defining 3 lead-only tools | CRITICAL |
| 3 | 726-805 | Lead vs specialist role distinction hardcoded in spawning logic | HIGH |
| 4 | 752-787 | Experience relevance scoring (keyword matching, ranking) embedded in specialist spawning | HIGH |
| 5 | 331-340 | Pre-flight validation warnings about Brain state (checking for intent/design_reference nodes) | MEDIUM |
| 6 | 42-47 | Custom `SpecialistExperience` interface duplicating Brain node types | MEDIUM |

### Detail: Direct DB Access (Violation #1)

The runtime imports `agentSessions` schema and uses Drizzle directly:
```typescript
// Line 416 - Direct insert
this.brain.db.insert(agentSessions).values({...}).run();
// Line 439 - Direct select
this.brain.db.select().from(agentSessions).where(...).get();
// Line 691, 836, 864 - Direct updates
this.brain.db.update(agentSessions).set({...}).run();
```

**Fix**: BrainService should expose session CRUD methods (`createSession`, `getSession`, `updateSession`).

### Detail: Experience Filtering (Violation #4)

```typescript
const experienceNodes = this.brain.getNodesByType(this.projectId, 'experience');
const domainLower = config.domainDescription.toLowerCase();
const scored = experienceNodes.map((node) => {
  // ... custom keyword matching and scoring logic
  const hits = domainWords.filter((w) => allTerms.includes(w)).length;
  return { node, content, score: hits };
})
```

This is ML/knowledge-retrieval logic that belongs in ExperienceRetriever, not the generic agent runtime.

### What IS Correct in runtime.ts

- Tool registration via `.registerTool()`/`.registerTools()` — pluggable
- Brain tools listed dynamically via `brainTools()` — any Brain capability exposed
- ProviderRouter abstraction — LLM provider properly abstracted
- No direct imports from `/tools` directory — tools registered, not imported
- Reasoning loop (lines 469-709) — generic, doesn't assume specific tools
- Specialist prompt does NOT reference specific tools

---

## 3. Server ↔ Engine Boundary — CLEAN

**Status: PERFECT COMPLIANCE**

| Check | Result |
|-------|--------|
| Direct engine imports | 0 found across all 34 server TypeScript files |
| Lazy dynamic import in execute.ts | Properly implemented with `/* @vite-ignore */` |
| Inline engine types | EngineHandle defined inline at execute.ts:12-31 |
| Engine feature logic in server | None — OAuth, credentials, auth all server-local |
| Native deps at startup | None — engine deps lazy-loaded |

The execute.ts lazy loading pattern is exemplary:
```typescript
const ENGINE_PATH = '../../../src/engine.js';
async function loadEngine() {
  const mod = await import(/* @vite-ignore */ ENGINE_PATH);
  return mod.initEngine as (...args: any[]) => Promise<EngineHandle>;
}
```

---

## 4. Tool Modules — WELL-STRUCTURED

**Status: CLEAN with acceptable coupling**

### Registry Pattern (src/tools/index.ts)
Clean factory function assembles all tools via dependency injection:
```typescript
export function buildToolRegistry(config: ToolRegistryConfig): ToolDefinition[] {
  return [
    ...createSandboxTools(config.sandbox),
    ...createVerifyTools(config.sandbox),
    ...createAnalyzeTools({ router: config.router }),
    ...createDesignTools({ sandbox: config.sandbox }),
    ...createVisionTools(),
  ];
}
```

### Cross-Module Imports (Acceptable)

| Import Pattern | Count | Assessment |
|----------------|-------|------------|
| verify/ → sandbox/provider.ts (type-only) | 5 | Acceptable — interface dependency |
| design/ → sandbox/provider.ts (type-only) | 1 | Acceptable — needs file reading |
| analyze/ → providers/router.ts (type-only) | 4 | Acceptable — needs LLM calls |
| tools → config/ | 3 | Correct pattern — config is global |
| verify internal (full-verification → placeholders, intent-satisfaction) | 2 | Minor — sibling module coupling |

No tool files import from `agents/` or `brain/` directly — they properly use `ToolContext` for Brain access.

---

## 5. Enforcement Infrastructure

### Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| `scripts/check-modularity.sh` | 500-line max, engine protection, cross-layer imports | Active |
| `scripts/check-mechanical.sh` | All 11 Constitutional Rules from claude.md | Active |

### Husky Hooks

| Hook | Runs |
|------|------|
| `.husky/pre-commit` | modularity + mechanical checks on staged files |
| `.husky/pre-push` | Full TypeScript typecheck on engine, server, client |

### File Size Compliance

| File | Lines | Status |
|------|-------|--------|
| `src/agents/runtime.ts` | 885 | Grandfathered |
| `src/brain/brain-service.ts` | 537 | Grandfathered |
| `src/brain/global-memory.ts` | 612 | **NOT GRANDFATHERED** — violation |

### Circular Dependencies

**Zero found.** Dependency graph is strictly hierarchical:
- `engine.ts` → brain, agents, tools, providers, bridge, config
- `agents` → brain, config, providers
- `tools` → agents (type-only), config
- `brain` → providers (type-only)
- `bridge` → brain (type-only)
- `providers`, `config` — leaf modules

---

## 6. Action Items

### Must Fix (Modularization Violations)

1. **Create `ExperienceOrchestrator`** — Extract all experience logic from engine.ts into a single module that owns the lifecycle (pre-build retrieval, tracking, post-build extraction/reinforcement, metrics emission)

2. **Add BrainService session methods** — Expose `createSession()`, `getSession()`, `updateSessionTokens()`, `updateSessionStatus()` so runtime.ts stops accessing `this.brain.db` directly

3. **Extract experience filtering from runtime.ts** — Move the keyword-matching relevance scoring (lines 752-787) into ExperienceRetriever

4. **Grandfather or split global-memory.ts** — Either add it to the modularity script's exception list or split it into smaller modules

### Should Fix (Architecture Hygiene)

5. **Unify build completion detection** — Currently duplicated between engine.ts (line 130) and SSEEmitter. Create a single source of truth.

6. **Remove pre-flight validation from spawn_specialist** — The warnings about missing intent/design_reference nodes encode workflow assumptions that don't belong in the runtime.

7. **Align SpecialistExperience type** — Use Brain node types directly instead of a custom interface in runtime.ts.

### Acceptable As-Is

- Tool cross-module type imports (SandboxProvider, ProviderRouter)
- Lead prompt referencing specific tool names (prompt is configuration, not code)
- Lead/specialist role distinction (acceptable pragmatic choice, not a hard violation)
- Config imports from any module

---

## Conclusion

The modularization architecture is **structurally sound**. The server boundary, tool modules, enforcement scripts, and dependency graph are all clean. The two areas of concern — engine.ts and runtime.ts — represent **feature logic leakage** from the experience/learning system (Component 28), not a systemic architectural breakdown. The fixes are well-scoped: one new orchestrator module and a few BrainService method additions would restore clean modular boundaries.
