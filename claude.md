# KRIPTIK ENGINE — CONSTITUTIONAL RULES

## WHAT THIS PROJECT IS

This is the core build engine for KripTik AI, an AI app builder that constructs complete, production-ready applications from a single user prompt. It uses a central "Brain" (a queryable, mutable knowledge graph backed by PostgreSQL) and autonomous AI agents that read from and write to the Brain as they work.

The Brain is the single source of truth. Agents don't follow a pipeline — they reason about what to do next by querying the Brain for what's known, what's needed, and what's been discovered. Every agent enriches the Brain as it works, so downstream work benefits from upstream learning.

## ABSOLUTE PROHIBITIONS — NEVER DO THESE

### 1. NO SEQUENTIAL PHASE PIPELINES
NEVER create a system where Phase 1 must complete before Phase 2 starts, or where steps execute in a hardcoded order. The Lead Agent decides what to do next based on reasoning about the current state of the Brain. There are no "phases" — there are capabilities the Lead Agent can invoke when it determines they're needed.

### 2. NO MECHANICAL ORCHESTRATION
NEVER create coordinator/orchestrator classes that manage agent lifecycle through state machines, switch statements, or sequential function calls. The Lead Agent IS the orchestrator — it reasons about what specialists to spawn, what work to assign, and when to change course. Orchestration logic lives in the Lead Agent's reasoning, not in code.

### 3. NO PRE-POPULATED TASK LISTS
NEVER generate all tasks upfront and load them into a queue for agents to execute. Agents discover work as they build. The Lead Agent maintains a living task list in the Brain that evolves as agents make discoveries. Any agent can propose new tasks, split existing tasks, or flag tasks as unnecessary.

### 4. NO HARDCODED AGENT ROLES
NEVER define fixed agent types (frontend agent, backend agent, etc.) with predetermined capabilities. The Lead Agent decides what specialists are needed based on the specific project. A simple CRUD app might need 2 specialists. A real-time collaborative app might need 8. The team composition is dynamic and adaptive.

### 5. NO SILENT AGENTS
NEVER create agents that work in isolation without communicating discoveries. Every agent writes discoveries, constraints, and decisions to the Brain. When an agent learns something that could affect other agents' work (API has a rate limit, data model needs a new field, design pattern conflicts with accessibility), it writes that to the Brain immediately.

### 6. NO VERIFICATION AS A SEPARATE PHASE
NEVER create a post-build verification step that runs after all building is done. Verification is continuous — agents verify their own work as they go, the Lead Agent monitors the Brain for conflicts and issues, and specialized verification tools are invoked whenever the Lead Agent determines they're needed. Verification is a tool, not a phase.

### 7. NO ONE-SHOT GENERATION
NEVER generate entire files, plans, or architectures in a single AI call. Agents build incrementally — write a component, test it, discover what's needed next, adjust, continue. The plan evolves with the build.

### 8. NO FIRE-AND-FORGET EVENTS
NEVER create one-way event pipelines where agents emit events but can't receive them. All communication flows through the Brain. When the user interrupts via the UI, it writes to the Brain. When an agent makes a discovery, it writes to the Brain. All agents can read all Brain updates relevant to their domain.

## ARCHITECTURAL PRINCIPLES

### The Brain
- PostgreSQL-backed knowledge graph (using existing Supabase instance)
- Node types: intent, constraint, discovery, artifact, decision, task, status, user_directive
- Relationship types: requires, conflicts_with, implements, refines, replaces, blocks, enables
- Semantic query via embeddings (Qdrant) so agents can ask natural-language questions
- Real-time subscriptions (Supabase Realtime) so the UI can show brain activity
- Every node has: created_by (agent or user), project_id, timestamps, confidence score

### Agent Runtime
- Lead Agent: Opus 4.6 with extended thinking. Never writes code. Maintains holistic vision, decomposes work, evaluates progress against intent, makes architectural decisions, spawns/despawns specialists as needed.
- Specialist Agents: Spawned on demand by Lead Agent. Each owns a domain (not a layer). Builds vertically — creates schema, API routes, UI components, and tests for their domain. Has access to Brain + sandbox + tools.
- Tool Access: Agents invoke tools (verify_security, check_design, probe_api, run_tests, etc.) when they reason that they should, not on a schedule.
- Communication: All through the Brain. No direct agent-to-agent messaging outside the Brain.

### How Agents Work
Each agent runs a loop:
1. Query the Brain for current state relevant to my domain
2. Reason about what to do next (using Claude's extended thinking)
3. Take action (write code, run tests, probe an API, invoke a tool)
4. Write discoveries/results back to the Brain
5. Check if my current task is complete or if new information changes my approach
6. Repeat until the Lead Agent determines my work is done

This is NOT a mechanical loop with fixed iterations. The agent genuinely reasons at each step. It might decide to change approach, ask the Lead for guidance (by writing a question to the Brain), or flag a conflict it discovered.

### The Lead Agent's Reasoning Loop
The Lead Agent watches the Brain, not agent output streams. Its loop:
1. Read current Brain state — what's known, what's been built, what's blocked, what's conflicting
2. Evaluate progress against intent nodes — are we on track to satisfy the user's goals?
3. Decide next actions: spawn a new specialist? redirect an existing one? run verification tools? ask the user for clarification?
4. Act on decisions
5. Repeat continuously until intent is satisfied

### Three Workflows, One Engine
- **Builder**: Brain initialized from user prompt → intent analysis → competitor analysis → API probing → specialists build
- **Fix My App**: Brain initialized from captured streaming chat context → intent extracted from broken app → specialists rebuild
- **Import App**: Brain initialized from codebase analysis → gaps identified → user selects completions → specialists build missing pieces

The engine doesn't know or care which workflow triggered it. It reads the Brain and builds toward satisfying the intent nodes it finds there.

## TECH STACK

- Runtime: Node.js + TypeScript (strict mode)
- Database: Supabase PostgreSQL (reuse existing KripTik instance)
- AI: Anthropic SDK direct (claude-opus-4-6 for Lead, configurable for specialists)
- Embeddings: Qdrant for semantic Brain queries
- Sandbox: Modal containers for code execution
- Streaming: SSE for UI communication
- No frameworks for the engine itself — pure TypeScript, no Express, no Next.js. This is a library/module that will be imported into KripTik's existing backend.

## FILE STRUCTURE

```
src/
  brain/
    schema.ts          — Brain table definitions (Drizzle ORM)
    brain-service.ts   — CRUD + semantic query interface for Brain nodes
    embeddings.ts      — Embedding generation + Qdrant integration for semantic queries
  agents/
    runtime.ts         — Agent spawning, lifecycle, Claude API streaming
    lead-agent.ts      — Lead Agent system prompt + reasoning loop
    specialist.ts      — Specialist Agent base + tool access
  tools/
    index.ts           — Tool registry and interface definitions
    sandbox.ts         — Modal sandbox tool (file ops, terminal, build, test)
    verify.ts          — Verification tools (security, accessibility, design, errors)
    analyze.ts         — Analysis tools (competitor crawl, API probe, codebase analysis)
    vision.ts          — Vision tools (screenshot scoring, visual comparison)
  bridge/
    sse-emitter.ts     — SSE streaming bridge for UI consumption
    user-input.ts      — User interrupt/directive handler → Brain writer
  types/
    index.ts           — Shared type definitions
  index.ts             — Main entry point: initEngine(projectId, mode, initialContext)
```

This is a SMALL codebase. The entire engine should be under 5,000 lines. Complexity lives in agent reasoning, not in code. If you find yourself writing orchestration logic, stop — you're building a mechanical system.

## WHAT SUCCESS LOOKS LIKE

When this engine receives a user prompt like "Build me an AI video generator app that uses Replicate for generation":

1. The Lead Agent creates intent nodes in the Brain, then reasons about what it needs to know
2. It invokes competitor analysis (tool), API probing against Replicate (tool), and inferred needs analysis — writing all discoveries to the Brain
3. It reasons about team composition: "This needs a core video pipeline specialist, a UI specialist, and later a polish specialist"
4. It spawns specialists who query the Brain for their domain context and start building
5. A specialist discovers Replicate has a 25MB upload limit → writes this constraint to Brain → Lead sees it → adjusts UI specialist's context to include file size validation
6. Specialists continuously verify their work (invoking verification tools when they reason they should)
7. Lead monitors Brain, sees intent satisfaction trending toward complete, spawns a Polish specialist for the last 10%
8. Polish specialist queries Brain for design references and competitor visual patterns, scores current screenshots, fixes gaps
9. Lead determines all intent nodes are satisfied → triggers deploy
10. Total Brain state is persisted — if user comes back to iterate, the Brain remembers everything

No phases. No waves. No gates. Agents reasoning their way to a complete app.
