# KripTik Build Engine Architecture — Internal Reference

> **Purpose**: Structured analysis for integration spec authoring. Covers the build engine internals only — no UI/frontend details.
>
> **Generated**: 2026-03-18 | **Codebase**: `Flickinny11/kriptik-engine`

---

## 1. Build Orchestration Model

### What Replaced the Old Wave-Based System

The old KripTik app used a sequential phase/wave pipeline (Phase 1 → Phase 2 → ... → complete). **This is completely gone.** The new engine has zero sequential phases, zero state machines, zero pipeline gates. This is an explicit architectural prohibition (see `claude.md` §ABSOLUTE PROHIBITIONS).

### How Builds Actually Work

The engine is a **Brain-driven autonomous agent system**. A single Lead Agent (Claude Opus 4.6) reasons about what to build, spawns specialist agents dynamically, and guides them to completion. There is no orchestrator class, no coordinator, no task queue — the Lead Agent IS the orchestrator, and it reasons (via extended thinking) rather than following scripts.

**Core principle**: Agents don't follow pipelines — they think. The Lead Agent reads Brain state, reasons about what's needed, acts, and repeats.

### The Brain — Centralized Living Knowledge System

The **Brain** is the single source of truth for all build knowledge. It is a queryable, mutable knowledge graph.

**Implementation**: `src/brain/brain-service.ts` — class `BrainService`

**Storage**:
- **SQLite** (via `better-sqlite3` + Drizzle ORM) for structured node/edge/session/activity data
- **Qdrant** (vector DB) for semantic search embeddings
- **HuggingFace** `sentence-transformers/all-MiniLM-L6-v2` (384-dim vectors) for embedding generation

**Per-project isolation**: Each project gets its own SQLite file (`/brains/{projectId}.db`) and its own Qdrant collection (`brain_{projectId}`).

#### Brain Tables (SQLite)

| Table | Purpose |
|-------|---------|
| `brain_nodes` | Knowledge nodes — intents, constraints, discoveries, artifacts, decisions, tasks, errors, resolutions, design references, API contracts, user directives, status updates |
| `brain_edges` | Relationships between nodes — requires, conflicts_with, implements, refines, replaces, blocks, enables, discovered_by, relates_to |
| `agent_sessions` | Agent lifecycle tracking — role, model, status, token usage, parent agent, context summary |
| `brain_activity_log` | Append-only audit trail — reads, writes, queries, spawns, tool invocations, decisions, user interrupts |

#### Node Types (`src/brain/schema.ts:4-17`)

```typescript
const NODE_TYPES = [
  'intent',            // What the user wants (explicit + inferred)
  'constraint',        // Rules, limitations, quality standards
  'discovery',         // Things learned during the build
  'artifact',          // Generated files/components
  'decision',          // Architectural decisions
  'task',              // Work items
  'status',            // Progress updates
  'user_directive',    // User input/corrections during build
  'design_reference',  // Design patterns from Design_References.md
  'api_contract',      // External API specs discovered via probing
  'error',             // Errors encountered
  'resolution',        // How errors/conflicts were resolved
] as const;
```

#### Edge Types

```typescript
const EDGE_TYPES = [
  'requires', 'conflicts_with', 'implements', 'refines',
  'replaces', 'blocks', 'enables', 'discovered_by', 'relates_to',
] as const;
```

#### What Agents Read From / Write To

**All coordination between agents happens through the Brain, not through direct communication.**

- Agents **read**: intent nodes, constraint nodes, discovery nodes, task nodes, decision nodes, design_reference nodes, artifact nodes (to see what's been built), error nodes
- Agents **write**: discovery nodes (new findings), artifact nodes (files created), error nodes (blockers), task nodes (new work), constraint nodes (API limits found), decision nodes, status nodes (progress)
- The Lead Agent **monitors**: conflicts (via `brain_get_conflicts`), errors, task completion, overall intent satisfaction

#### Brain Tools (available to ALL agents)

| Tool | Description |
|------|------------|
| `brain_write_node` | Create a new knowledge node |
| `brain_update_node` | Update existing node (content, status, confidence) |
| `brain_add_edge` | Create relationship between nodes |
| `brain_query` | Semantic search across all brain nodes (natural language → Qdrant vector search → SQLite join) |
| `brain_get_nodes_by_type` | Get all nodes of a type (e.g., all `intent` nodes, all `constraint` nodes) |
| `brain_get_node` | Get specific node by ID with edges |
| `brain_get_conflicts` | Get all `conflicts_with` edges |
| `brain_invalidate_node` | Mark node invalid with reason, creates resolution node, removes from vector search |

---

## 2. Agent Architecture

### Hierarchy

**Two-tier system: Lead Agent → Specialist Agents**

There is still a Lead Agent concept, but it is NOT a hardcoded role type. The Lead is the first agent spawned and has exclusive access to management tools. Specialists are spawned dynamically by the Lead based on what the project needs.

### Lead Agent (`src/agents/prompts/lead.ts`)

- **Model**: `claude-opus-4-6` (configured in `src/config/models.ts:14`)
- **Role**: Strategic orchestrator. NEVER writes code.
- **Exclusive tools**: `spawn_specialist`, `terminate_specialist`, `request_user_input`
- **Responsibilities**: Intent analysis, competitor research, API probing, component mapping, design direction, spawning/monitoring specialists, conflict resolution, verification

### Specialist Agents (`src/agents/prompts/specialist.ts`)

- **Model**: Configurable per-specialist (default: `claude-opus-4-6`, can be any supported model)
- **Role**: Domain-specific builders. Own vertical domains (NOT horizontal layers).
- **Tools**: All brain tools + all registered tools (sandbox, verify, analyze, design, vision) — or a subset specified at spawn time
- **Key behaviors**: Autonomous within domain, write discoveries to Brain immediately, verify own work, no waiting for permission

### Important: No Hardcoded Agent Roles

The Lead decides what specialists are needed per-project. A CRUD app might need 2 specialists. A real-time collaborative app might need 8. Specialists own **vertical domains** like "video-pipeline", "auth-and-billing", "gallery-and-sharing" — NOT "frontend" and "backend".

### Agent Communication

**There is no direct agent-to-agent communication.** All coordination flows through the Brain:

1. Specialist discovers API rate limit → writes `constraint` node to Brain
2. Other specialists query Brain → find the constraint → adapt their work
3. Lead monitors Brain → sees conflicts between nodes → resolves by invalidating one

### The Reasoning Loop (`src/agents/runtime.ts:469-709`)

Every agent (Lead and Specialist) runs the same core loop:

```
while (!aborted) {
  1. Call LLM (Claude/GPT/etc.) with system prompt + conversation + tools
  2. Process response: emit text/thinking to SSE, handle tool calls
  3. If tool calls: execute tools, add results to conversation, continue
  4. If end_turn: agent decided to stop → break
  5. If max_tokens: response truncated → prompt continuation → continue
  6. If error: write error node to Brain, retry if rate limit, else break
  7. If context ~80% full: compact (summarize agent's work), reset conversation
}
```

**Context window management**: At 80% of `MAX_TOKENS` (180,000), the agent's conversation is compacted — Brain stores a summary of the agent's contributions, conversation is reset with the summary as seed.

### Budget Enforcement

- `budgetCapDollars` set per build (default: $5)
- Runtime tracks `estimatedSpendDollars` using provider pricing tables
- When budget exceeded: all agents aborted, `agent:error` event emitted

### USE_TEAM_SYSTEM / Phase B

These are **legacy references from the old app** that no longer exist in the engine. The old app had `USE_TEAM_SYSTEM` as a feature flag for its Phase B team-based building. The new engine has no such flag — the team/agent system is the ONLY way builds work. There is no fallback to a non-team system.

---

## 3. Build Flow: Prompt to Deployed App

### Entry Point

`POST /api/execute` → `server/src/routes/execute.ts`

### Step-by-Step Flow

#### 1. Build Initialization
- Server creates project record (status: `building`)
- Server either:
  - **Local path**: Lazy-imports `src/engine.ts`, calls `initEngine()` in-process
  - **Modal path** (when `MODAL_ENABLED=true`): POSTs to Modal HTTP endpoint

#### 2. Engine Startup (`src/engine.ts:46-118`)
```typescript
initEngine({
  projectId, mode, initialContext,
  anthropicApiKey, qdrantUrl, brainDbPath, sandboxRootDir,
  budgetCapDollars
})
```
- Creates `EmbeddingService` (HuggingFace + Qdrant)
- Creates `BrainService` (SQLite + embeddings)
- **Seeds template brain** (`seedTemplateBrain`): 28 constraint nodes covering anti-slop patterns, design system requirements, quality floor standards — written as `constraint` type nodes with categories: `anti-slop`, `design-system`, `quality-floor`
- Creates `SSEEmitter` (bridges Brain events → frontend events)
- Creates `ProviderRouter` (multi-LLM provider)
- Creates `AgentRuntime` (agent lifecycle manager)
- Registers all tools (sandbox, verify, analyze, design, vision)
- **Starts Lead Agent** → kicks off reasoning loop

#### 3. Lead Agent UNDERSTAND Phase (reasoning, not enforced)

The Lead Agent's system prompt provides reasoning guidelines (NOT sequential phases). In practice, the Lead typically:

1. **`analyze_intent`** — Deep intent extraction from user prompt. Returns:
   - Explicit intents (what user asked for)
   - Inferred needs (15-30 things user didn't say but needs — loading states, error handling, empty states, edge cases)
   - Scale intent (personal/commercial/internal)
   - Critical unknowns
   - Required integrations

2. **`request_user_input`** — Asks user about scale/usage intent (writes `user_directive` node with `awaitingResponse: true`)

3. **Reads constraint nodes** — The 28 template constraints seeded at startup

4. **`search_web`** + **`analyze_competitors`** — Brave Search to find competitor URLs, then Firecrawl/basic-fetch crawling with LLM synthesis. Extracts: table-stakes features, differentiating features, UX patterns, visual patterns, pricing models

5. **`probe_api`** — HTTP probing of external APIs (Replicate, Stripe, etc.) — discovers auth requirements, rate limits, request/response formats

6. **`map_components`** — Complete blueprint: every page, component, API route, data model, integration, interaction flow

7. **`load_design_references`** — Reads `Design_References.md`, parses `##` sections, writes each as a `design_reference` node to Brain

Each of these writes results as Brain nodes (intents, constraints, discoveries, design_references).

#### 4. Lead Agent BUILD Phase

- Spawns specialists based on component map
- Each specialist gets: domain description, which components/routes they own, relevant intents/constraints, design direction, dependencies
- Specialists run autonomously — query Brain, write code, run tests, write discoveries back
- Lead monitors Brain for: conflicts, errors, discoveries requiring plan changes, task completion

#### 5. Lead Agent VERIFY Phase

Must pass ALL before declaring complete:
1. `run_build` — zero TypeScript errors
2. `verify_errors` — zero blocking issues
3. `check_placeholders` — zero TODOs/stubs/lorem ipsum
4. `evaluate_intent_satisfaction` — for EVERY intent AND inferred need node
5. `take_screenshot` — visual verification of key pages
6. Table-stakes check from competitor analysis
7. `brain_get_conflicts` — returns empty
8. No unresolved error nodes

#### 6. Completion

Lead writes `status` node with title "Build Complete" → SSE emits `build_complete` → server updates project status → frontend shows completion.

### Modes

| Mode | Trigger | Brain Seeding |
|------|---------|--------------|
| `builder` | User enters prompt | Intent nodes from prompt |
| `fix` | User imports broken app | Error/intent nodes from captured context |
| `import` | User imports codebase | Analysis nodes from codebase scan |

---

## 4. Asset Generation Current State

### Flux Dev Integration

**There is currently NO Flux Dev integration in the engine.** The codebase has no image generation pipeline, no Flux references, and no asset generation tools.

The current tools handle:
- **Code generation**: Specialists write code via `write_file` sandbox tool
- **Screenshots**: Playwright-based `take_screenshot` for visual verification
- **Vision analysis**: `compare_screenshots` and `extract_ui_patterns` tools exist as **stubs** (not fully implemented)

### Where Image Generation Would Fit

Based on the architecture, image/asset generation would be added as:
1. A new tool module in `src/tools/` (e.g., `src/tools/generate/`)
2. Registered in `buildToolRegistry()` in `src/tools/index.ts`
3. Specialists would call the tool when they need assets
4. Generated assets stored in the sandbox filesystem (`/sandboxes/{projectId}/`)
5. Asset metadata written to Brain as `artifact` nodes

### Modal Sandbox Setup

See §7 Infrastructure below for full Modal details. The sandbox has full filesystem access, Node.js 22, and Playwright — but no GPU compute or image generation capabilities currently.

---

## 5. Design System

### Design_References.md

**File**: `/Design_References.md` (40KB, root of project)

**When it gets loaded**: The Lead Agent calls `load_design_references` tool during the UNDERSTAND phase. This parses every `##` section from the markdown and writes each as a `design_reference` node in the Brain.

**Implementation**: `src/tools/design/references.ts` — `createDesignReferencesTool()`

**How it works**:
1. Reads the markdown file from sandbox filesystem
2. Splits on `## ` headings
3. Skips sections < 50 chars
4. For each section: writes a `design_reference` node with `{ section_title, reference_content, source_file }`
5. Each node gets a vector embedding in Qdrant for semantic search

**When agents consult it**: Specialists query the Brain for `design_reference` nodes when making design decisions. The specialist system prompt explicitly instructs:
> "Query for design_reference nodes — these contain advanced UI techniques and patterns that produce premium, distinctive interfaces. Use these instead of default patterns."

### Design Decision Flow

1. Template brain seeds 28 `constraint` nodes at startup (anti-slop rules, design system requirements, quality floor)
2. Lead loads `Design_References.md` → `design_reference` nodes in Brain
3. When spawning specialists, Lead includes design direction in `domain_description`
4. Specialists query Brain for constraints + design references before writing UI code
5. Verification phase includes visual screenshot review

### Key Design Constraints (from template brain)

- **Anti-slop** (15 rules): No icon libraries as design elements, no emoji, no generic gradients, no placeholder images, no Lorem Ipsum, no Coming Soon sections, no identical card layouts, no generic welcome copy, no default Tailwind colors, no generic spinners, no hardcoded test data, no alert()/confirm(), no console.log, no duplicate inline styles, no CDN icon libraries
- **Design system** (5 rules): Typography hierarchy, complete color system, consistent spacing (4/8px), consistent border radius, consistent transitions
- **Quality floor** (8 rules): Form labels + validation, loading/error/empty states, alt text, keyboard accessibility, consistent navigation, mobile responsive, meaningful API errors, complete auth flows

---

## 6. Key Files and Contracts

### BUILD_SPEC.md / INTENT_LOCK_ARTIFACT.md

**These do not exist in the new engine.** The old wave-based system used static spec documents. The new engine replaces them with **Brain nodes**:

| Old Concept | New Equivalent |
|-------------|---------------|
| BUILD_SPEC.md | `intent` nodes + `constraint` nodes + `task` nodes in the Brain |
| INTENT_LOCK_ARTIFACT.md | `intent` nodes with `success_criteria` fields |
| Design spec | `design_reference` nodes loaded from Design_References.md |
| API contracts | `api_contract` nodes written by `probe_api` tool |

### The "Sacred Contract"

The old Sacred Contract (intent lock, inferred needs, competitive analysis) is now **distributed across Brain nodes**:

| Sacred Contract Element | Brain Node Type | Written By |
|------------------------|----------------|------------|
| Explicit intents | `intent` nodes | `analyze_intent` tool |
| Inferred needs | `intent` nodes (with `reason` field) | `analyze_intent` tool |
| Competitive analysis | `discovery` nodes | `analyze_competitors` tool |
| Table-stakes features | `constraint` nodes | Lead Agent (from competitor analysis) |
| API constraints | `constraint` nodes | `probe_api` tool |
| Success criteria | Field on `intent` nodes | `analyze_intent` tool |

**Intent satisfaction is verified programmatically**: `evaluate_intent_satisfaction` tool reads intent node's `success_criteria`, inspects project files for: file existence, route existence, component implementation, keyword presence. Returns pass/fail/requires_runtime_test per criterion.

### DESIGN_REFERENCES.md → Design_References.md

**File exists**: `/Design_References.md` (40KB). Used actively via `load_design_references` tool. Contains proven design patterns: WebGL shader libraries, scroll engines, cursor libraries, page transition systems, post-processing effects, integration recipes, performance patterns.

### Other Key Files

| File | Purpose |
|------|---------|
| `claude.md` | Constitutional rules — absolute prohibitions, architecture documentation, deployment details |
| `AUTH_SPEC.md` | Immutable auth contract (Better Auth + Supabase) |
| `SYSTEM_SORT.md` | Sort of 154 old app systems: what's replaced, what's reusable, what's dead |
| `AUDIT_REPORT.md` | Codebase audit results |
| `MECHANICAL_SCAN_REPORT.md` | Verification: zero mechanical pattern violations |
| `TRACE_REPORT.md` | System tracing results |

---

## 7. Infrastructure

### Modal Containers

**App definition**: `modal/app.py` — Modal App `kriptik-engine`

**Container image** (`engine_image`):
- Base: `node:22-slim` + Python 3.12
- System packages: `git`, `build-essential`, `curl`, `python3`, Playwright deps (`libnss3`, `libatk-bridge2.0-0`, `libdrm2`, `libxkbcommon0`, `libgbm1`, `libasound2`, `libatspi2.0-0`, `libxshmfence1`)
- Global installs: `tsx@4`, Playwright Chromium
- Engine source baked into image at `/app/`
- Dependencies installed via `npm ci --omit=dev`
- FastAPI for the HTTP endpoint

**Container specs**:
- Memory: 4096 MB
- Timeout: 1800s (30 min) per build
- Secrets: `kriptik-env` (contains all API keys)

**Persistent volumes**:
| Volume | Mount Point | Purpose |
|--------|------------|---------|
| `kriptik-brains` | `/brains` | Per-project Brain SQLite files |
| `kriptik-sandboxes` | `/sandboxes` | Per-project generated code |

**Build endpoint**: `https://logantbaird--kriptik-engine-start-build.modal.run` (POST)

**Build runner**: `modal/run-engine.ts` — reads JSON config from stdin, calls `initEngine()`, streams newline-delimited JSON events to stdout.

### Supabase Tables (PostgreSQL)

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `users` | id, email, name, credits (default 500), tier (default 'free') | User accounts |
| `session` | id, token, userId, expiresAt | Auth sessions (Better Auth) |
| `account` | id, accountId, providerId, userId, accessToken, refreshToken | OAuth accounts |
| `verification` | id, identifier, value, expiresAt | Email verification |
| `projects` | id, name, ownerId, status, engineSessionId, brainDbPath, sandboxPath | Project records |
| `build_events` | id (serial), projectId, eventType, eventData (JSONB) | Append-only SSE event log |
| `credentials` | id, userId, projectId, providerId, encryptedTokens (JSONB/AES-256-GCM) | Encrypted OAuth tokens |
| `oauth_states` | id, userId, providerId, codeVerifier, redirectUri, expiresAt | PKCE flow state |

**Project status values**: `idle` | `building` | `complete` | `failed`

### Credential Gateway / Vault

**Implementation**: `server/src/vault/vault-service.ts`

- Per-user, per-project, per-provider encrypted credential storage
- Encryption: AES-256-GCM (via `server/src/oauth/crypto.ts`)
- Agents access credentials through Brain `discovery` nodes written on OAuth completion
- No background token refresh — agents refresh on-demand when expired
- OAuth catalog: 178 provider configurations in `server/src/oauth/catalog.ts`

**Vault API** (server routes):
- `POST /api/credentials` — store
- `GET /api/credentials/:projectId` — list (metadata only, no decrypted tokens)
- `DELETE /api/credentials/:projectId/:providerId` — revoke

### Build Sandbox Setup

**Local mode** (`src/tools/sandbox/provider.ts`):
- `createLocalSandbox(rootDir)` — filesystem operations scoped to `rootDir`
- Path traversal protection: resolved paths must start with `rootDir`
- Command execution via `child_process.execFile` with shell mode
- Timeouts: 60s per command, 10MB output buffer

**Modal mode**:
- Same `SandboxProvider` interface, but filesystem is a Modal volume
- Sandbox root: `/sandboxes/{projectId}/`
- Brain DB: `/brains/{projectId}.db`

### Pre-installed npm Packages (in engine)

```json
{
  "@anthropic-ai/sdk": "^0.39.0",
  "@huggingface/inference": "^4.13.15",
  "@qdrant/js-client-rest": "^1.12.0",
  "better-sqlite3": "^11.7.0",
  "drizzle-orm": "^0.38.0",
  "openai": "^6.29.0",
  "playwright": "^1.58.2",
  "uuid": "^11.0.0",
  "zod": "^3.24.0"
}
```

Note: These are the ENGINE's dependencies, not the generated app's. Generated apps install their own dependencies via `run_command` tool (`npm install ...`).

### APIs Available Inside a Build

**LLM Providers** (via `ProviderRouter`):
| Provider | Models | Env Var |
|----------|--------|---------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-5.4, gpt-5.3, gpt-5.2, o3 | `OPENAI_API_KEY` |
| Google | gemini-3.1-pro-preview, gemini-3.1-flash-lite (stub) | `GOOGLE_API_KEY` |
| xAI | grok-4.20, grok-4, grok-4.1-fast | `XAI_API_KEY` |

**External Services**:
| Service | Purpose | Env Var |
|---------|---------|---------|
| Brave Search | Web search for competitor discovery | `BRAVE_SEARCH_API_KEY` |
| Firecrawl | Enhanced web crawling with screenshots | `FIRECRAWL_API_KEY` |
| Qdrant | Vector DB for semantic Brain search | `QDRANT_URL`, `QDRANT_API_KEY` |
| HuggingFace | Embedding generation | `HF_API_KEY` |

**All environment variables** (from `.env.example`):
```
ANTHROPIC_API_KEY=           # Required
OPENAI_API_KEY=              # Optional
GOOGLE_API_KEY=              # Optional
XAI_API_KEY=                 # Optional
BRAVE_SEARCH_API_KEY=        # Required
FIRECRAWL_API_KEY=           # Optional
QDRANT_URL=                  # Required
QDRANT_API_KEY=              # Optional
HF_API_KEY=                  # Optional
```

**Modal-specific**:
```
MODAL_ENABLED=               # true to use Modal containers
MODAL_SPAWN_URL=             # Modal HTTP endpoint URL
```

### SSE Event Types (engine → frontend)

```typescript
type SSEEventType =
  | 'agent_thinking' | 'agent_tool_call' | 'agent_tool_result'
  | 'agent_text' | 'agent_discovery' | 'agent_file_write'
  | 'agent_error' | 'agent_spawned' | 'agent_stopped' | 'agent_compacted'
  | 'brain_node_created' | 'brain_node_updated' | 'brain_edge_created'
  | 'brain_conflict_detected' | 'user_input_requested'
  | 'build_progress' | 'build_complete';
```

---

## 8. Complete Tool Registry

All tools registered via `buildToolRegistry()` in `src/tools/index.ts`:

### Sandbox Tools (`src/tools/sandbox/`)
| Tool | File | Description |
|------|------|------------|
| `write_file` | filesystem.ts | Write/create files in sandbox |
| `read_file` | filesystem.ts | Read file contents |
| `edit_file` | filesystem.ts | Search-and-replace edit |
| `list_files` | filesystem.ts | Directory listing |
| `run_command` | commands.ts | Shell command execution (60s timeout) |
| `run_build` | commands.ts | `npm run build` |
| `run_tests` | commands.ts | `npm test` |
| `start_dev_server` | dev-server.ts | Start dev server in sandbox |
| `stop_dev_server` | dev-server.ts | Stop dev server |
| `take_screenshot` | screenshot.ts | Playwright screenshot of running app |

### Analyze Tools (`src/tools/analyze/`)
| Tool | File | Description |
|------|------|------------|
| `search_web` | web-search.ts | Brave Search API |
| `analyze_codebase` | codebase.ts | Codebase structure analysis |
| `analyze_intent` | intent.ts | Deep intent extraction with inferred needs (LLM-powered) |
| `analyze_competitors` | competitors.ts | Web crawling + LLM synthesis of competitor apps |
| `probe_api` | api-probe.ts | HTTP probing of external APIs |
| `map_components` | components.ts | Component/page/route/model mapping (LLM-powered) |

### Verify Tools (`src/tools/verify/`)
| Tool | File | Description |
|------|------|------------|
| `verify_errors` | typescript.ts | `tsc --noEmit` type checking |
| `check_security` | security.ts | SAST surface area analysis |
| `check_placeholders` | placeholders.ts | 28 patterns for TODOs/stubs/lorem/credential leaks |
| `design_score` | design-score.ts | Design quality evaluation |
| `evaluate_intent_satisfaction` | intent-satisfaction.ts | Per-criterion file inspection against intent success_criteria |
| `run_full_verification` | full-verification.ts | Composite: errors + placeholders + security + intent satisfaction |

### Design Tools (`src/tools/design/`)
| Tool | File | Description |
|------|------|------------|
| `load_design_references` | references.ts | Parse Design_References.md → Brain design_reference nodes |

### Vision Tools (`src/tools/vision/`)
| Tool | File | Description |
|------|------|------------|
| `compare_screenshots` | compare.ts | Compare current vs reference screenshots (stub) |
| `extract_ui_patterns` | extract-patterns.ts | Extract UI patterns from screenshot (stub) |

---

## 9. Key Architectural Patterns for Integration

### Adding a New Tool

1. Create tool file in appropriate `src/tools/` subdirectory
2. Export a `create*Tool()` function returning `ToolDefinition`
3. Register in the subdirectory's `index.ts` barrel
4. Tool automatically available to all agents (or subset via `spawn_specialist` `tools` param)

### ToolDefinition Interface

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;  // JSON Schema
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

interface ToolContext {
  projectId: string;
  sessionId: string;
  brain: BrainService;
}
```

### Writing Results to Brain

Tools or agents write results as Brain nodes. Pattern:
```typescript
await ctx.brain.writeNode(
  ctx.projectId,
  'artifact',              // node type
  'Generated hero image',  // title
  { filePath: 'public/hero.png', type: 'image', source: 'flux-dev', ... },
  ctx.sessionId,           // created_by
);
```

### Event Flow for New Capabilities

```
Tool executes → writes artifact node to Brain
  → Brain emits 'node:created' event
  → SSEEmitter translates to 'brain_node_created' SSE event
  → Frontend receives and renders
```

### SandboxProvider Contract

Any new asset generation that produces files must go through the `SandboxProvider` interface:
```typescript
interface SandboxProvider {
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  editFile(path: string, search: string, replace: string): Promise<{ matched: boolean }>;
  listFiles(directory: string, recursive: boolean): Promise<string[]>;
  runCommand(command: string, args?: string[], cwd?: string): Promise<CommandResult>;
}
```

For binary files (images), use `writeFile` with base64 or write via `runCommand`.

---

## 10. What Does NOT Exist Yet (Relevant to Visual Fabrication)

- No image generation pipeline (no Flux Dev, no DALL-E, no Stable Diffusion)
- No GPU compute in Modal containers (current image is CPU-only)
- No binary file handling in `SandboxProvider.writeFile` (expects string content)
- No asset management system (no CDN upload, no asset registry)
- Vision tools (`compare_screenshots`, `extract_ui_patterns`) are stubs
- No deploy tools (Vercel, GitHub integration not wired)
- No interaction testing tool

### Integration Points for Visual Fabrication

1. **New tool module**: `src/tools/generate/` with tools like `generate_image`, `generate_texture`, etc.
2. **Modal GPU containers**: Would need a separate Modal function with GPU (A10G/A100) for Flux inference
3. **Binary file support**: Either extend `SandboxProvider` for binary or use `runCommand` to write base64-decoded files
4. **Asset tracking**: `artifact` nodes in Brain with metadata (dimensions, format, generation params, prompt)
5. **Design reference integration**: Load visual fabrication patterns into Brain alongside existing design references
6. **Specialist spawning**: Lead Agent would spawn a "visual-assets" or "image-generation" specialist with access to generation tools
