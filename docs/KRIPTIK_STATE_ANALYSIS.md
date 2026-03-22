# KRIPTIK CURRENT STATE ANALYSIS
## Date: 2026-03-21
## Analyst: Claude Opus 4.6 via Claude Code

---

### 1. ENGINE CORE

#### `src/engine.ts` — initEngine() entry point (213 lines)
**What it does**: Single entry point for starting a build. Wires together Brain, AgentRuntime, tools, SSE, user input, and the entire Component 28 learning system.

**Initialization sequence** (exactly as code executes):
1. Creates `EmbeddingService` (HuggingFace + Qdrant connection)
2. Creates `BrainService` (SQLite + Drizzle ORM)
3. Creates `GlobalMemoryService` (Qdrant named vectors)
4. **In parallel**: Seeds template brain (28 constraint nodes) AND initializes global memory collection
5. Creates `SSEEmitter`, connects it to Brain events
6. Creates `ProviderRouter` (Anthropic key only passed explicitly; others from env)
7. Creates `AgentRuntime` with brain, router, budget cap
8. Creates sandbox (local filesystem or injected provider)
9. Builds tool registry, registers on runtime
10. Creates `UserInputHandler`
11. Wires Component 28: ExperienceExtractor, ExperienceReinforcer, ExperienceTracker (starts immediately), ExperienceMetrics
12. Emits initial experience metrics via SSE (non-blocking)
13. Subscribes to Brain `node:created` events — listens for status nodes with "complete" in title to trigger post-build experience extraction + reinforcement
14. **If NOT dryRun**: Retrieves experience from global memory, THEN starts Lead Agent

**EngineHandle returned**: pause, resume, terminate, sendDirective, respondToQuestion, onEvent, brain, runtime

**Critical observation**: The `resume` method calls `startLead` again — it creates a NEW lead agent session, not resuming the old one. Pause aborts all agents via AbortController. This means pause/resume effectively restarts the entire build.

#### `src/agents/runtime.ts` — AgentRuntime (885 lines)
**What it does**: Core agent lifecycle management. Contains the reasoning loop, tool registration, brain tools, lead-only tools (spawn_specialist, terminate_specialist, request_user_input), session management, and budget enforcement.

**The reasoning loop** (lines 469-687):
1. Seeds conversation with "Begin. Read the Brain for current state and start your work."
2. Calls LLM via ProviderRouter with system prompt + all messages + all tools
3. Processes response: emits thinking blocks, text blocks via SSE
4. Handles tool calls: executes tools, logs to Brain activity, returns results to conversation
5. Handles `end_turn` → agent decided to stop → breaks loop
6. Handles `max_tokens` → sends "continue" message → loops
7. Rate limit errors → 30s wait → retry
8. Context management: at 80% of max tokens, compacts via `brain.compact()` — gathers all nodes the agent created, builds a text summary, resets conversation with that summary

**Agent spawning**: Lead gets brain tools + lead tools (spawn_specialist, terminate_specialist, request_user_input). Specialists get brain tools + requested sandbox/verify/analyze tools (or ALL registered tools if none specified). Specialists also receive relevant experience nodes filtered by keyword overlap with their domain description.

**Budget enforcement**: Tracks estimated spend per-API-call using pricing data. When cap hit, aborts ALL agents via AbortController.

**No streaming**: Despite the SSE architecture, the actual LLM calls use `messages.create()` not streaming. Events are emitted AFTER the full response is received. This means the UI won't see incremental typing — it gets the full response chunk at once.

#### `src/agents/prompts/lead.ts` — Lead Agent system prompt (201 lines)
**What it does**: Builds the Lead Agent's system prompt with mode-specific context and detailed reasoning guidelines.

**Key sections in the prompt**:
- UNDERSTAND phase: analyze_intent, ask about scale, read constraints, search+analyze competitors, probe APIs, map components, load design references
- BUILD phase: spawn vertical-domain specialists, monitor Brain
- VERIFY phase: run_build, verify_errors, check_placeholders, evaluate_intent_satisfaction, visual verification, table-stakes check, conflict check, error check
- Experience guidance: evaluate relevance, weigh strength, apply judgment, note divergence
- Specialist management: vertical domains, don't pre-plan all, monitor through Brain
- Completion: ALL verification must pass before writing "Build Complete" status node

**Not a pipeline**: The prompt explicitly says these are reasoning guidelines, not enforced sequence. The Lead Agent can interleave, skip, or add steps.

#### `src/agents/prompts/specialist.ts` — Specialist system prompt (123 lines)
**What it does**: Builds specialist prompts with role, domain description, and optionally past experience. Instructs specialists to query Brain, build incrementally, write discoveries, verify own work.

**Experience section**: If relevant experiences are found (keyword-matched from Brain experience nodes), they're formatted as advisory knowledge with strength scores and types.

#### `src/brain/brain-service.ts` — BrainService (537 lines)
**What it does**: SQLite knowledge graph with Qdrant semantic search. Full CRUD for nodes and edges. EventEmitter-based pub/sub for Brain events.

**Key methods**: writeNode (creates node + generates embedding + stores in Qdrant), updateNode (re-embeds if content changed), invalidateNode (creates resolution node, removes from Qdrant), addEdge, query (semantic search via Qdrant → hydrate from SQLite), getRelated (graph traversal with depth), getConflicts, compact (gathers agent's nodes into text summary), subscribe (EventEmitter filter by projectId).

**Migration**: Raw SQL `CREATE TABLE IF NOT EXISTS` in constructor. Not using Drizzle migrations. Tables: brain_nodes, brain_edges, agent_sessions, brain_activity_log.

**External services**: Qdrant (vector search), HuggingFace (embeddings via @huggingface/inference).

#### `src/brain/schema.ts` — Drizzle schema (131 lines)
**Node types**: intent, constraint, discovery, artifact, decision, task, status, user_directive, design_reference, api_contract, error, resolution, experience (13 types)

**Edge types**: requires, conflicts_with, implements, refines, replaces, blocks, enables, discovered_by, relates_to (9 types)

**Node statuses**: active, superseded, invalidated, completed

**Agent statuses**: active, paused, completed, failed

**Activity types**: read, write, query, spawn, tool_invoke, decision, user_interrupt

#### `src/brain/embeddings.ts` — EmbeddingService (142 lines)
**What it does**: Wraps HuggingFace Inference API for `sentence-transformers/all-MiniLM-L6-v2` (384-dim vectors) and Qdrant for vector storage/search.

**Key detail**: Truncates text to 500 chars before embedding. Batch embedding is NOT truly batched — it uses `Promise.all` on individual calls.

**Collection management**: `ensureCollection` is idempotent (tracks in-memory Set). Creates payload indexes for projectId and nodeType on first creation.

#### `src/brain/template.ts` — Template brain seeding (278 lines)
**What it does**: Seeds 28 constraint nodes into each new project's Brain. Idempotent — checks for existing template constraints.

**The 28 constraints (3 categories)**:
- **Anti-slop (15)**: No icon libraries as design, no emoji, no generic gradients, no placeholder images, no lorem ipsum, no coming soon, no identical card layouts, no generic welcome hero, no default Tailwind colors, no generic spinners, no hardcoded test data, no alert()/confirm(), no console.log, no inline styles, no CDN icon libraries
- **Design system (5)**: Typography hierarchy, complete color system, consistent spacing (4/8px), consistent border radius, consistent transitions
- **Quality floor (8)**: Form labels+validation, async loading/error/empty states, alt text, keyboard accessibility, consistent navigation, mobile responsiveness, meaningful API errors, complete auth flows

**Links constraints**: Star topology edges (relates_to) within each category.

#### `src/bridge/sse-emitter.ts` — SSEEmitter (269 lines)
**What it does**: Translates Brain events and AgentRuntime events into 18 SSE event types for the frontend.

**Event types**: agent_thinking, agent_tool_call, agent_tool_result, agent_text, agent_discovery, agent_file_write, agent_error, agent_spawned, agent_stopped, agent_compacted, brain_node_created, brain_node_updated, brain_edge_created, brain_conflict_detected, user_input_requested, build_progress, build_complete, experience_extracted, experience_metrics

**Special handling**: `classifyToolCall` maps write_file → agent_file_write, brain_write_node with discovery → agent_discovery. Status nodes with "complete" → build_complete. User directives with awaitingResponse → user_input_requested. Error nodes → agent_error.

#### `src/bridge/user-input.ts` — UserInputHandler (91 lines)
**What it does**: Handles free-form directives and structured question responses from the UI. Writes them as user_directive Brain nodes. Question responses are linked to the question node via refines edge.

#### `src/providers/router.ts` — ProviderRouter (50 lines)
**What it does**: Routes model strings to the appropriate provider. Finds first provider that `supports()` the model string.

**Providers registered**: AnthropicProvider (if key), OpenAIProvider (if key), XAIProvider (if key), GoogleProvider (always, but stub).

**GoogleProvider**: Always added but described as "stub — will throw on use."

#### `src/providers/anthropic.ts` — AnthropicProvider (151 lines)
**What it does**: Full Anthropic SDK integration. Handles adaptive thinking for 4.6 models (no explicit budget needed) vs explicit budget for older models. Translates between engine's LLMContentBlock format and Anthropic's format including thinking blocks.

**Pricing**: Opus $15/$75, Sonnet $3/$15, Haiku $1/$5 per 1M tokens.

#### `src/config/models.ts` — Model configuration (62 lines)
**Current config**: ALL models set to `claude-opus-4-6` (Lead, Specialist, Analysis, Vision). Comments show alternative configurations (cost-optimized, mixed-provider, budget, speed).

**Thinking budget**: 10,000 tokens for all roles. Context: 180K max tokens, 80% compaction threshold, 16K max output.

---

### 2. BRAIN & LEARNING SYSTEM (Component 28)

#### `src/brain/global-memory.ts` — GlobalMemoryService (612 lines)
**Fully implemented.** Creates `kriptik_experience` Qdrant collection with 4 named vectors (semantic, domain, outcome, user_intent), each 384-dim Cosine distance. Creates payload indexes for experienceType, context.frameworks, context.integrations, context.appType, strength. Uses a metadata point (zero vectors, UUID 0) for build count and decay cycle tracking.

**Spreading activation query**: `queryExperience()` fires parallel searches across all provided signal dimensions. Results are merged into a convergence map. Convergence score = `(dimensionsHit / totalSearched) × avgSimilarity × strengthWeight` where `strengthWeight = strength × (1 + log(reinforcements + 1)) / (1 + log(contradictions + 1))`. Sorted by convergence score descending.

**Reinforcement**: `reinforceExperience` — diminishing returns: `newStrength = min(1.0, current + 0.05 × (1 - current))`. `weakenExperience` — never to zero: `newStrength = max(0.01, current × 0.85)`.

**Decay cycle**: `runDecayCycle` scrolls all non-metadata points, applies 0.5% decay (`strength × 0.995`), batches updates. Updates lastDecayCycle metadata.

**Stats**: `getExperienceStats` scrolls all points, computes totals, averages, by-type counts, top activated.

#### `src/brain/experience-extractor.ts` — ExperienceExtractor (308 lines)
**Fully implemented.** After build completes, gathers all Brain data (intents, discoveries, constraints, errors, artifacts, directives, decisions, resolutions), serializes it, sends to `claude-sonnet-4-20250514` for reflection. LLM returns JSON array of structured learnings.

**Experience types extracted**: pattern_success, pattern_failure, recovery, user_preference, tool_effectiveness, design_decision, integration_insight, discovery (8 types).

**Key details**: Skips extraction if < 5 total nodes. Caps discoveries at 30, errors at 20, resolutions at 20, artifacts at 20 to prevent prompt explosion. Filters out template constraints. Parses JSON from LLM response (regex match for JSON array). Initial strength clamped to 0.1-0.9.

**Missing types noted in the prompt questions**: There is NO `verification_insight`, `design_verification`, or `intent_mapping_outcome` experience type. These DO NOT EXIST.

#### `src/brain/experience-retriever.ts` — ExperienceRetriever (181 lines)
**Fully implemented.** Runs BEFORE first agent reasoning iteration (in engine.ts, before `runtime.startLead()`).

**Flow**: Extracts domain keywords from prompt + speculation data. Abstractifies intent (strips "build me", "create", "with X"). Fires spreading activation query with all 4 signals. Diversifies results (round-robin across experience types, max 15). Writes each as a Brain `experience` node with `[Past Experience]` title prefix. Increments activation in global memory (non-blocking).

**No speculation data available**: The `speculationData` parameter exists but is never passed by engine.ts — it always passes undefined. This means context filters (frameworks, integrations, appType) are always empty at retrieval time.

#### `src/brain/experience-reinforcer.ts` — ExperienceReinforcer (142 lines)
**Fully implemented.** Called after experience extraction in engine.ts's brain subscriber.

**Logic**: Finds experience nodes in project Brain → extracts globalExperienceId → if build successful (intent satisfaction > 0.7), reinforces all used experiences. If failed (satisfaction < 0.4), weakens all. Mixed outcome → no strength change. Always increments activation count. Every 10 builds, triggers decay cycle.

**determineBuildOutcome**: Reads Brain state — counts intents, errors, resolutions, user directives. Success = presence of "complete" status node. Intent satisfaction = completedIntents/totalIntents. `totalTokens` and `specialistCount` are always 0 (never populated).

#### `src/brain/experience-tracker.ts` — ExperienceTracker (213 lines)
**Partially effective.** Subscribes to Brain events and tracks experience interactions.

**What works**: Tracks new experience nodes being added. Detects if discovery/decision nodes contain specific text signals (e.g., "based on past experience", "diverging from experience").

**Limitation**: The "consulted" tracking relies on activity:logged events with type 'read' and a matching targetNodeId. But the Brain's `logActivity` is called with `targetNodeId: null` for most operations, and the `brain_query` tool doesn't log individual node reads. So `consulted` tracking likely never fires in practice.

**Limitation**: The `recordInteractionFromReference` method has a fuzzy matching approach — when it detects a divergence/follow signal, it checks ALL experience nodes to see if the node's content mentions part of the experience title. This could produce false matches.

#### `src/brain/experience-metrics.ts` — ExperienceMetrics (214 lines)
**Fully implemented.** Computes snapshots (strength distribution, by-type, top activated/reinforced/contradicted, domain coverage), model readiness assessment, and SSE-formatted output.

**Limitation**: `computeDetailedStats` uses `queryExperience` with a broad semantic signal ("software development patterns") and limit 1000 to approximate scrolling all points. This is acknowledged as "not ideal for large collections" in a code comment. For a real production system with thousands of experiences, this would miss data.

#### Is there real-time steering during builds?
**NO.** Experience is injected at build start (retriever → Brain nodes) and extracted at build end (extractor → global memory). During the build, agents can query experience nodes from the Brain, but there is no mid-build mechanism that injects new experience, adjusts experience strength, or steers agents based on real-time performance.

#### Are there ANY stubs in the learning system?
**NO.** All 6 Component 28 files are fully implemented with real logic. No stub returns, no TODOs, no placeholder implementations.

---

### 3. INTENT SYSTEM

#### `src/tools/analyze/intent.ts` — analyze_intent tool (93 lines)
**Fully implemented.** Sends user prompt to LLM with a deeply detailed system prompt. Returns structured JSON with:
- explicit_intents (title, description, success_criteria)
- inferred_needs (title, description, reason, success_criteria, priority)
- scale_intent (personal/commercial/internal + reasoning + implications)
- estimated_complexity (level, estimated_specialists, key_challenges, risk_areas)
- critical_unknowns (question, why_it_matters, default_assumption)
- required_integrations (service, purpose, needs_credentials, documentation_url)

**Experience-aware**: Includes top 10 experience nodes from Brain in the analysis prompt.

#### Is there an "Intent Manifest"?
**Not as a single document.** The Lead Agent's system prompt instructs it to write EVERY explicit intent AND inferred need as separate Brain nodes. There is no single "Intent Manifest" document. The Brain IS the manifest — intent nodes + inferred need nodes collectively represent the complete intent.

#### Are inferred needs derived?
**Yes, by the LLM.** The analyze_intent prompt is extremely detailed about inferring needs (15-30 for a typical commercial app). It gives the example: "if a user says 'build an AI video generator app', they also need: a media player, download button, share button, generation queue, library of previous videos, loading states, error handling, cancel, storage management, format options."

#### Is competitor/category analysis performed?
**Yes.** `analyze_competitors` (301 lines) crawls real URLs. Tries Firecrawl first (with screenshots for vision analysis), falls back to basic HTML fetch. Extracts headings, nav items, features, tech signals (React, Vue, Stripe, etc.), pricing signals. Sends all crawl data + screenshots to Claude for synthesis. Returns per-competitor analysis + common features (table stakes) + differentiating features + UX patterns + visual patterns.

**Web search**: `search_web` (63 lines) uses Brave Search API. Agents use this to find competitor URLs before passing them to analyze_competitors.

#### Is there intent drift detection?
**No explicit mechanism.** The Lead Agent's prompt tells it to monitor the Brain for conflicts and new discoveries, but there is no dedicated tool or subsystem for detecting drift from original intent during builds.

#### What happens when verification finds the build doesn't satisfy intent?
**The Lead Agent decides.** The prompt says: "If ANY check fails, do NOT declare complete. Instead: identify what's missing, spawn or redirect specialists to fix it, re-verify after fixes." This is reasoning-driven, not mechanical.

---

### 4. VERIFICATION SYSTEM

#### Tools available:

1. **verify_errors** (`typescript.ts`, 56 lines) — Runs `npx tsc --noEmit --pretty`. Parses error lines. Returns structured errors with file, line, column, code, message.

2. **check_placeholders** (`placeholders.ts`, 109 lines) — 28 regex patterns across 3 attention levels (high/medium/low). High: TODO, FIXME, not-implemented, lorem ipsum, exposed credentials (sk-...), placeholder values, test emails, example URLs, test data. Medium: HACK, XXX, placeholder, stub, console.log, empty catch, `as any`, ts-ignore, alert/confirm. Low: example.com domain.

3. **check_security** (`security.ts`, 123 lines) — Surfaces code locations handling: auth/sessions, DB queries with user input, file uploads, env vars/secrets, payment data, external API calls with credentials. Returns file locations + relevant lines for agent review. Does NOT declare verdicts.

4. **evaluate_intent_satisfaction** (`intent-satisfaction.ts`, 303 lines) — Reads intent node from Brain, extracts success_criteria, checks each against project files. Heuristic-based: looks for route-like file paths, PascalCase component names, file references, keyword searches in source files. Returns pass/fail/requires_runtime_test per criterion.

5. **run_full_verification** (`full-verification.ts`, 98 lines) — Runs all 4 above + conflict check + error node check in one call. Returns combined summary.

6. **score_design** (`design-score.ts`, 38 lines) — **STUB.** Returns `{ status: 'stub', message: 'Design scoring not yet connected.' }`. Does nothing.

#### What the verification system DOES check:
- TypeScript compilation errors ✅
- Placeholder/TODO/stub markers ✅
- Intent satisfaction via file inspection ✅
- Security-relevant code locations ✅
- Brain conflicts ✅
- Active error nodes ✅

#### What the verification system DOES NOT check:
- ❌ Build errors (separate `run_build` tool exists but not part of full verification)
- ❌ Runtime errors (no mechanism to catch JS runtime errors)
- ❌ Lint errors (no ESLint integration)
- ❌ Visual/design quality scoring (STUB)
- ❌ Screenshot analysis (take_screenshot exists but not integrated into verification)
- ❌ Interactive element testing (no click/form/navigation testing)
- ❌ Mobile responsiveness (no viewport testing)
- ❌ AI slop detection (constraint nodes exist but no automated checking)
- ❌ Design_References.md compliance checking
- ❌ Text readability (contrast, size)
- ❌ Auth flow testing
- ❌ Dev server runtime behavior verification
- ❌ Production-readiness beyond "compiles"

#### What happens when a check fails?
The Lead Agent's prompt instructs it to NOT declare complete and to spawn/redirect specialists to fix issues. The verification tools return data; the agent reasons about what to do. There is no automatic retry loop in code.

---

### 5. DESIGN SYSTEM

#### `Design_References.md` (1216 lines, 40KB)
**EXISTS in project root.** Comprehensive reference covering 16 sections of advanced design techniques:
1. WebGL Shader Libraries (curtains.js, PixiJS, react-vfx)
2. GLSL Shader Ecosystem (glslify, lygia, gl-noise)
3. Three.js TSL & WebGPU
4. Post-Processing Effects
5. Page Transition Systems
6. Advanced Scroll Engines (Lenis, GSAP ScrollTrigger)
7. Cursor & Interaction Libraries
8. Ray Marching & SDFs
9. Noise & Procedural Generation
10. Fluid & Physics Simulation
11. Advanced Shader Cookbook
12. No-Code WebGL Tools
13. 3D Asset Pipeline
14. View Transitions API
15. Integration Recipes
16. Performance Patterns

#### `src/tools/design/references.ts` — load_design_references tool (79 lines)
**Fully implemented.** Reads markdown file, splits on `##` headings, writes each section as a `design_reference` Brain node. Not an AI call — purely mechanical parsing.

#### The 28 anti-slop constraints
Listed in full in template.ts analysis above (Section 1). They are written as Brain constraint nodes at build start, not as code-enforced rules.

#### Is there category-specific design intelligence?
**NO.** There is no mechanism to select different design patterns for SaaS vs e-commerce vs portfolio. Design references are loaded wholesale regardless of app type.

#### Is there composition intelligence?
**NO.** No layout patterns for specific page types (pricing page, landing page, dashboard). The component map tool asks the LLM to design layouts, but there's no structured composition intelligence.

#### How is design knowledge seeded?
The Lead Agent's prompt instructs it to call `load_design_references` with the path to Design_References.md. This writes ~16 design_reference nodes to the Brain. Specialists then query these nodes when making design decisions.

#### Is there GPU/performance optimization intelligence?
**Only in Design_References.md Section 16** ("Performance Patterns for Heavy Effects"). This gets loaded as a Brain node but there's no enforcement or automated checking.

---

### 6. TOOLS & CAPABILITIES

#### Complete tool inventory (25 tools):

**Brain tools** (8, built into runtime — every agent gets these):
1. `brain_write_node` — Create Brain node
2. `brain_update_node` — Update existing node
3. `brain_add_edge` — Create edge between nodes
4. `brain_query` — Semantic search across Brain
5. `brain_get_nodes_by_type` — Get nodes by type/status
6. `brain_get_node` — Get node by ID with edges
7. `brain_get_conflicts` — Get conflict edges
8. `brain_invalidate_node` — Invalidate node with reason

**Lead-only tools** (3):
9. `spawn_specialist` — Spawn new specialist agent
10. `terminate_specialist` — Gracefully terminate specialist
11. `request_user_input` — Ask user a question

**Sandbox tools** (7):
12. `write_file` — Write file to sandbox
13. `read_file` — Read file from sandbox
14. `edit_file` — Find and replace in file
15. `list_files` — List files (skips node_modules, .git)
16. `run_command` — Execute shell command (60s timeout)
17. `run_build` — npm run build
18. `run_tests` — npm test

**Dev server tools** (2):
19. `start_dev_server` — Start dev server, wait for ready
20. `stop_dev_server` — Kill dev server process

**Screenshot tool** (1):
21. `take_screenshot` — Playwright screenshot (configurable viewport, full page, wait for selector)

**Verification tools** (5):
22. `verify_errors` — TypeScript compilation
23. `check_placeholders` — Pattern scan
24. `check_security` — Security location surfacing
25. `evaluate_intent_satisfaction` — Intent criteria checking
26. `run_full_verification` — All-in-one verification

**Analysis tools** (5):
27. `analyze_intent` — Deep intent + inferred needs extraction
28. `analyze_competitors` — Web crawl + LLM synthesis
29. `probe_api` — Real API endpoint probing
30. `map_components` — Full component/page/route/model map
31. `search_web` — Brave Search API

**Design tools** (1):
32. `load_design_references` — Parse markdown → Brain nodes

**Analysis helper tool** (1):
33. `analyze_codebase` — Returns instructions (not a real tool — tells agent to use sandbox tools)

**Vision tools** (3, ALL STUBS):
34. `score_design` — **STUB**
35. `compare_screenshots` — **STUB**
36. `extract_ui_patterns` — **STUB**

#### Missing tools:
- ❌ No MCP client tools (mcp_connect, mcp_invoke)
- ❌ No deployment tools (deploy_to_vercel, push_to_github, deploy_to_netlify)
- ❌ No interaction testing tool
- ❌ No lint tool
- ❌ No runtime error capture tool

#### What tools do specialists receive?
If the Lead specifies tool names, only those. If no names specified (empty array), ALL registered tools. Brain tools are always included.

---

### 7. TRAINING INFRASTRUCTURE

**DOES NOT EXIST.** There is:
- No `src/steering/` directory
- No `src/training/` directory
- No files related to training, fine-tuning, or model training
- No references to RunPod training infrastructure
- No JSONL export or training data preparation
- No model evaluation or graduation logic
- No trajectory collection

The only reference to "training" in the codebase is the experience learning system (Component 28), which stores learnings in Qdrant, NOT as training data for model fine-tuning.

---

### 8. INFRASTRUCTURE & CONFIGURATION

#### External service dependencies:
| Service | Required? | Purpose | Env Var |
|---------|-----------|---------|---------|
| Qdrant | Required | Semantic search + global experience memory | QDRANT_URL, QDRANT_API_KEY |
| HuggingFace | Semi-required | Embedding generation (sentence-transformers) | HF_API_KEY |
| Anthropic API | Required | LLM for Lead Agent, specialists, analysis | ANTHROPIC_API_KEY |
| Brave Search | Required | Web search for competitor discovery | BRAVE_SEARCH_API_KEY |
| Firecrawl | Optional | Enhanced competitor crawling with screenshots | FIRECRAWL_API_KEY |
| OpenAI | Optional | GPT models as specialist alternative | OPENAI_API_KEY |
| xAI | Optional | Grok models as specialist alternative | XAI_API_KEY |
| Google AI | Optional | Gemini models (stub provider) | GOOGLE_API_KEY |
| Playwright | Required | Screenshots via Chromium | (bundled) |

#### Redis/BullMQ: NOT CONFIGURED. Zero references in src/ code. Only appears in experience-retriever.ts as a keyword in the DOMAIN_KEYWORDS set.

#### Docker: NO docker-compose.yml. Modal is the production container runtime.

#### Deployment: Vercel (frontend + API), Modal (engine execution).

#### CLAUDE.md: Extremely comprehensive (the one in repo root). Covers constitutional rules, architecture, engine structure, server structure, client structure, design system, full flow, multi-user isolation, tech stack, deployment infrastructure, and what's not done yet.

---

### 9. CRITICAL GAPS SUMMARY

1. **No streaming LLM responses**: Runtime uses `messages.create()` not streaming. UI gets full response chunks, not token-by-token. Impact: Poor perceived performance during long agent reasoning.

2. **Vision tools are all stubs**: score_design, compare_screenshots, extract_ui_patterns return stub objects. Impact: No automated visual quality verification. The Lead Agent's prompt says to visually verify but the tools don't work.

3. **No deployment tools**: No push_to_github, deploy_to_vercel, deploy_to_netlify. Impact: Builds can't be deployed automatically.

4. **No runtime error detection**: No mechanism to capture JavaScript runtime errors from the dev server. Impact: Apps that compile but crash at runtime won't be caught.

5. **No interaction testing**: No tool to click buttons, fill forms, test navigation flows. Impact: Can't verify that interactive elements actually work.

6. **No mobile responsiveness testing**: take_screenshot defaults to 1280x800. No automated mobile viewport testing. Impact: Mobile breakage won't be caught.

7. **No AI slop enforcement**: 28 anti-slop constraints exist as Brain nodes, but no automated tool checks for violations. The agent must reason about them. Impact: Slop patterns could slip through if the agent doesn't query/enforce constraints.

8. **Pause/resume restarts the build**: `resume` calls `startLead` which creates a new agent session. All conversation history is lost. Impact: Resume doesn't continue where it left off.

9. **ExperienceTracker 'consulted' detection doesn't work**: Brain query tool doesn't log individual node reads with targetNodeId. Impact: Can't track which experiences agents actually consulted.

10. **ExperienceReinforcer has incomplete BuildOutcome**: totalTokens and specialistCount are always 0. Impact: Outcome assessment is incomplete.

11. **ExperienceMetrics uses approximate data retrieval**: Uses semantic query with limit 1000 instead of true scroll. Impact: May miss experiences in large collections.

12. **No speculation data for experience retrieval**: The speculationData parameter in retrieveForBuild is never populated. Impact: Context filters (frameworks, integrations, appType) are always empty at retrieval time.

13. **No real-time steering**: Experience is only injected at build start and extracted at build end. Impact: No mid-build course correction based on experience.

14. **analyze_codebase is not a real tool**: Returns instructions telling the agent to use other tools. Impact: Import mode has no automated codebase analysis.

15. **Google provider is a stub**: Always registered but throws on use. Impact: Gemini models can't be used.

---

### 10. MECHANICAL PATTERN AUDIT

| File | Pattern Type | Description |
|------|-------------|-------------|
| `src/bridge/sse-emitter.ts:69-151` | Switch statement | `handleEngineEvent` uses switch on event.type to route events. This is a reasonable translation layer, not orchestration — each case is a data transform, not a behavioral decision. **Acceptable.** |
| `src/bridge/sse-emitter.ts:154-161` | Tool classification | `classifyToolCall` uses if-chain on tool names. Again, data classification for the UI, not behavioral control. **Acceptable.** |
| `src/bridge/sse-emitter.ts:164-241` | Switch statement | `handleBrainEvent` switches on event type for UI translation. **Acceptable.** |
| `src/tools/analyze/competitors.ts:36-47` | Regex tech detection | `extractTechSignalsFromText` uses hardcoded string matching. This is signal extraction from HTML, not orchestration. **Acceptable.** |
| `src/tools/verify/intent-satisfaction.ts:158-180` | Regex extraction | `extractComponentNames`, `extractRoutePatterns` use regex for heuristic file matching. **Acceptable.** |
| `src/tools/verify/placeholders.ts:16-49` | Hardcoded regex patterns | 28 placeholder detection patterns. This is a scanner, not a decision maker. **Acceptable.** |
| `src/tools/verify/security.ts:14-48` | Hardcoded security concerns | 6 security concern patterns. Scanner, not orchestration. **Acceptable.** |

**Verdict**: ZERO mechanical orchestration violations found. All switch statements and regex patterns are in data-transform or scanning layers, never in behavioral control flow. The engine genuinely lets agents reason.

---

### 11. STUB/PLACEHOLDER AUDIT

| File:Area | What's Stubbed | What It Should Do |
|-----------|---------------|-------------------|
| `src/tools/verify/design-score.ts` | Entire tool | AI vision scoring of screenshot quality against design references |
| `src/tools/vision/compare.ts` | Entire tool | Visual comparison between two screenshots (similarity score + difference descriptions) |
| `src/tools/vision/extract-patterns.ts` | Entire tool | Extract UI components, layout, colors, typography from screenshots |
| `src/providers/google.ts` | Provider | Full Gemini API integration (throws on use) |
| `src/tools/analyze/codebase.ts` | Tool logic | Should actually analyze codebase structure, not return instructions |

**No TODOs or FIXMEs found in src/ code.** The stubs are clearly marked as stubs in their descriptions.

---

### 12. INTEGRATION MAP

| File | What It Does | Imports | Imported By | Events | External Services |
|------|-------------|---------|------------|--------|------------------|
| `src/engine.ts` | Entry point, wires all systems | brain-service, embeddings, template, global-memory, experience-*, runtime, tools/index, sse-emitter, user-input, router, types | src/index.ts, server execute.ts | Subscribes to brain events, emits experience_metrics/experience_extracted | Qdrant, HuggingFace, Anthropic |
| `src/agents/runtime.ts` | Agent lifecycle, reasoning loop | brain-service, schema, types, prompts/lead, prompts/specialist, config, router, provider types | engine.ts, src/index.ts | Emits agent:thinking/text/tool_call/tool_result/error/spawned/stopped/compacted | Anthropic (via router) |
| `src/agents/prompts/lead.ts` | Lead system prompt | None | runtime.ts | None | None |
| `src/agents/prompts/specialist.ts` | Specialist system prompt | None | runtime.ts | None | None |
| `src/brain/brain-service.ts` | Knowledge graph CRUD + semantic search | events, uuid, drizzle, better-sqlite3, schema, embeddings, types | engine.ts, experience-*, user-input, runtime.ts | Emits brain:event (node:created/updated/invalidated, edge:created, activity:logged) | SQLite, Qdrant, HuggingFace |
| `src/brain/schema.ts` | Drizzle table definitions | drizzle-orm | brain-service.ts, runtime.ts, types/index.ts | None | None |
| `src/brain/embeddings.ts` | Embedding + vector ops | @qdrant/js-client-rest, @huggingface/inference | brain-service.ts, global-memory.ts, engine.ts | None | Qdrant, HuggingFace |
| `src/brain/template.ts` | 28 constraint seeding | brain-service | engine.ts | None | Qdrant, HuggingFace (via brain-service) |
| `src/brain/global-memory.ts` | Cross-project experience memory | @qdrant/js-client-rest, embeddings, types | engine.ts, experience-extractor, experience-retriever, experience-reinforcer, experience-metrics | None | Qdrant, HuggingFace |
| `src/brain/experience-extractor.ts` | Post-build learning extraction | uuid, brain-service, global-memory, router, types | engine.ts | None | Anthropic (claude-sonnet-4-20250514) |
| `src/brain/experience-retriever.ts` | Build-start experience recall | uuid, brain-service, global-memory, types | engine.ts | None | Qdrant, HuggingFace (via global-memory) |
| `src/brain/experience-reinforcer.ts` | Pathway strengthening/weakening | brain-service, global-memory, types | engine.ts | None | Qdrant (via global-memory) |
| `src/brain/experience-tracker.ts` | Monitor agent-experience interactions | brain-service, types | engine.ts | Subscribes to brain events | None |
| `src/brain/experience-metrics.ts` | Observability/stats | global-memory | engine.ts | None | Qdrant (via global-memory) |
| `src/bridge/sse-emitter.ts` | Event translation for UI | events, brain-service, types | engine.ts | Subscribes to brain events, emits SSE events | None |
| `src/bridge/user-input.ts` | User directive/response handler | brain-service | engine.ts | None | Qdrant, HuggingFace (via brain-service) |
| `src/providers/router.ts` | Model → provider routing | anthropic, openai, google, xai, types | engine.ts, runtime.ts | None | None |
| `src/providers/anthropic.ts` | Anthropic SDK wrapper | @anthropic-ai/sdk, types | router.ts | None | Anthropic API |
| `src/providers/openai.ts` | OpenAI SDK wrapper | openai, types | router.ts | None | OpenAI API |
| `src/providers/google.ts` | Google AI stub | types | router.ts | None | (stub) |
| `src/providers/xai.ts` | xAI/Grok wrapper | types | router.ts | None | xAI API |
| `src/tools/index.ts` | Tool registry assembly | sandbox, verify, analyze, design, vision | engine.ts | None | None |
| `src/tools/analyze/intent.ts` | Intent extraction | helpers, router | analyze/index.ts | None | Anthropic (via router) |
| `src/tools/analyze/competitors.ts` | Competitor crawling + analysis | helpers, router, config | analyze/index.ts | None | Firecrawl, target URLs, Anthropic |
| `src/tools/analyze/api-probe.ts` | API endpoint probing | helpers, router, config | analyze/index.ts | None | Target APIs, Anthropic |
| `src/tools/analyze/components.ts` | Component mapping | helpers, router | analyze/index.ts | None | Anthropic (via router) |
| `src/tools/analyze/web-search.ts` | Web search | helpers, config | analyze/index.ts | None | Brave Search API |
| `src/tools/analyze/codebase.ts` | Codebase analysis (instructions) | None | analyze/index.ts | None | None |
| `src/tools/analyze/helpers.ts` | JSON extraction, safeFetch, LLM JSON | router, config | intent, competitors, api-probe, components | None | Target URLs |
| `src/tools/design/references.ts` | Design ref loading | sandbox | design/index.ts | None | None |
| `src/tools/sandbox/provider.ts` | Filesystem + command abstraction | node:child_process, node:fs, config | All sandbox tools, engine.ts | None | Local filesystem |
| `src/tools/sandbox/filesystem.ts` | write/read/edit/list files | sandbox/provider | sandbox/index.ts | None | Local filesystem |
| `src/tools/sandbox/commands.ts` | run_command, run_build, run_tests | sandbox/provider, config | sandbox/index.ts | None | Local filesystem |
| `src/tools/sandbox/dev-server.ts` | Start/stop dev server | node:child_process, sandbox/provider, config | sandbox/index.ts | None | Local filesystem |
| `src/tools/sandbox/screenshot.ts` | Playwright screenshots | sandbox/provider, config | sandbox/index.ts | None | Playwright/Chromium |
| `src/tools/verify/typescript.ts` | tsc --noEmit | sandbox/provider | verify/index.ts | None | TypeScript compiler |
| `src/tools/verify/placeholders.ts` | Pattern scanning | sandbox/provider, config | verify/index.ts, full-verification.ts | None | None |
| `src/tools/verify/security.ts` | Security location surfacing | sandbox/provider | verify/index.ts | None | None |
| `src/tools/verify/intent-satisfaction.ts` | Criteria checking | sandbox/provider | verify/index.ts, full-verification.ts | None | None |
| `src/tools/verify/full-verification.ts` | All-in-one verification | sandbox/provider, placeholders, intent-satisfaction, config | verify/index.ts | None | None |
| `src/tools/verify/design-score.ts` | STUB | None | verify/index.ts | None | None |
| `src/tools/vision/compare.ts` | STUB | None | vision/index.ts | None | None |
| `src/tools/vision/extract-patterns.ts` | STUB | None | vision/index.ts | None | None |
| `src/tools/vision/index.ts` | Vision tool assembly | compare, extract-patterns | tools/index.ts | None | None |

---

### 13. BUILD LIFECYCLE TRACE

1. **User submits prompt** → Server calls `initEngine(config)` — `src/engine.ts:52`
2. **Embedding service created** → HuggingFace + Qdrant clients initialized — `src/brain/embeddings.ts:26`
3. **Brain created** → SQLite DB opened, WAL mode, tables created — `src/brain/brain-service.ts:43-116`
4. **Global memory + template seeding (parallel)** → Qdrant `kriptik_experience` collection ensured + 28 constraint nodes written to Brain — `src/brain/global-memory.ts:52`, `src/brain/template.ts:226`
5. **SSE emitter connected to Brain** → Subscribes to brain:event — `src/bridge/sse-emitter.ts:61`
6. **Provider router created** → Anthropic provider registered — `src/providers/router.ts:14`
7. **Agent runtime created** → Brain, router, budget cap wired — `src/agents/runtime.ts:51`
8. **Tool registry built and registered** → 25+ tools from all modules — `src/tools/index.ts:20`
9. **Experience tracker started** → Subscribes to Brain events — `src/brain/experience-tracker.ts:39`
10. **Experience metrics emitted** → Non-blocking SSE event — `src/brain/experience-metrics.ts:129`
11. **Build complete listener wired** → Brain subscription for status nodes with "complete" — `src/engine.ts:127`
12. **Experience retrieved** → Spreading activation query → Brain experience nodes written — `src/brain/experience-retriever.ts:33`
13. **Lead Agent started** → Session created, system prompt built, reasoning loop begins — `src/agents/runtime.ts:713`
14. **Lead queries Brain** → Reads constraints, experience nodes — Brain tools in `src/agents/runtime.ts:102-306`
15. **Lead runs analyze_intent** → LLM extracts intents + inferred needs — `src/tools/analyze/intent.ts:23`
16. **Lead searches web + analyzes competitors** → Brave Search → Firecrawl/fetch → LLM synthesis — `src/tools/analyze/web-search.ts`, `src/tools/analyze/competitors.ts`
17. **Lead probes APIs** → Real HTTP requests to external APIs — `src/tools/analyze/api-probe.ts`
18. **Lead maps components** → LLM produces complete component map — `src/tools/analyze/components.ts`
19. **Lead loads design references** → Design_References.md → Brain nodes — `src/tools/design/references.ts`
20. **Lead spawns specialists** → Each gets domain description, tools, experience — `src/agents/runtime.ts:748`
21. **Specialists run reasoning loops** → Query Brain, write code, write discoveries — `src/agents/runtime.ts:469`
22. **Lead monitors Brain** → Reads status, conflicts, errors, task completion — Brain tools
23. **Lead runs verification** → TypeScript check, placeholder scan, intent satisfaction, security review — `src/tools/verify/`
24. **Lead writes "Build Complete" status node** → `brain_write_node` with type 'status'
25. **Brain subscription fires** → Status node with "complete" detected — `src/engine.ts:128-134`
26. **Experience extracted** → Brain data → LLM reflection → structured learnings → global memory — `src/brain/experience-extractor.ts:49`
27. **Experience reinforced** → Build outcome determined, used experiences reinforced/weakened — `src/brain/experience-reinforcer.ts:29`
28. **Decay cycle check** → Every 10 builds, gentle decay applied — `src/brain/experience-reinforcer.ts:54`
29. **Metrics emitted** → Updated experience stats sent via SSE — `src/brain/experience-metrics.ts:129`

---

### 14. EXPERIENCE LIFECYCLE TRACE

1. **Build N completes** → Status node created with "complete" in title — `src/engine.ts:131-134`
2. **ExperienceExtractor.extractAndStore()** called — `src/brain/experience-extractor.ts:49`
3. **gatherBuildData()** → Reads all node types from project Brain (intents, discoveries, constraints, errors, artifacts, directives, decisions, resolutions) — `src/brain/experience-extractor.ts:91`
4. **reflectOnBuild()** → Serializes build data, sends to Claude Sonnet for LLM reflection — `src/brain/experience-extractor.ts:134`
5. **LLM returns JSON array** of structured learnings (pattern_success, pattern_failure, recovery, user_preference, tool_effectiveness, design_decision, integration_insight, discovery) — `src/brain/experience-extractor.ts:155-173`
6. **Each learning → ExperienceNode** → Written to Qdrant with 4 named vectors (semantic, domain, outcome, user_intent) — `src/brain/global-memory.ts:120`
7. **SSE event emitted**: experience_extracted with count and types — `src/engine.ts:140-144`
8. **ExperienceReinforcer.determineBuildOutcome()** → Reads Brain state, determines success, intent satisfaction, error counts — `src/brain/experience-reinforcer.ts:67`
9. **reinforceFromBuild()** → Finds experience nodes in project Brain → extracts globalExperienceIds → reinforces or weakens based on outcome — `src/brain/experience-reinforcer.ts:29`
10. **Decay check** → If buildCount % 10 === 0, runs `globalMemory.runDecayCycle()` — `src/brain/experience-reinforcer.ts:54`
11. **Updated metrics emitted** via SSE — `src/engine.ts:152-157`

--- **Build N+1 starts** ---

12. **ExperienceRetriever.retrieveForBuild()** called BEFORE Lead Agent starts — `src/engine.ts:169-180`
13. **Domain keywords extracted** from user prompt — `src/brain/experience-retriever.ts:90`
14. **Intent abstractified** — strip "build me", "create", etc. — `src/brain/experience-retriever.ts:118`
15. **Spreading activation query** → 4 parallel searches across semantic/domain/outcome/user_intent vectors → convergence scoring — `src/brain/global-memory.ts:165`
16. **Results diversified** → Round-robin across experience types, max 15 — `src/brain/experience-retriever.ts:131`
17. **Written as Brain nodes** → Type `experience`, title `[Past Experience] ...`, contains strength, source project, frameworks, integrations — `src/brain/experience-retriever.ts:63`
18. **Activation incremented** in global memory (non-blocking) — `src/brain/experience-retriever.ts:84`
19. **Lead Agent starts** → Sees experience nodes in Brain, references them in reasoning — `src/agents/prompts/lead.ts:163-174`
20. **Specialists spawned** → Get relevant experiences filtered by keyword overlap — `src/agents/runtime.ts:752-787`

**All steps are implemented.** No stubs in this lifecycle.

---

### 15. RAW FILE INVENTORY

| File | Description |
|------|-------------|
| `src/engine.ts` | initEngine() entry point — wires Brain, Runtime, Tools, SSE, Learning |
| `src/index.ts` | Public API exports for the engine package |
| `src/engine.test.ts` | Engine integration tests |
| `src/engine.stress-test.ts` | Stress tests for concurrent agents |
| `src/types/index.ts` | Shared TypeScript types (BrainNode, ExperienceNode, BuildOutcome, etc.) |
| `src/agents/runtime.ts` | AgentRuntime — reasoning loop, tools, session management, budget |
| `src/agents/prompts/lead.ts` | Lead Agent system prompt builder |
| `src/agents/prompts/specialist.ts` | Specialist Agent system prompt builder |
| `src/brain/brain-service.ts` | BrainService — SQLite CRUD + Qdrant semantic search + EventEmitter |
| `src/brain/brain-service.test.ts` | BrainService unit tests |
| `src/brain/schema.ts` | Drizzle ORM schema (brainNodes, brainEdges, agentSessions, activityLog) |
| `src/brain/embeddings.ts` | EmbeddingService — HuggingFace + Qdrant wrapper |
| `src/brain/template.ts` | Template brain seeding (28 constraints, 3 categories) |
| `src/brain/global-memory.ts` | GlobalMemoryService — 4-vector Qdrant experience collection |
| `src/brain/experience-extractor.ts` | Post-build LLM reflection → structured learnings |
| `src/brain/experience-retriever.ts` | Build-start experience recall with diversification |
| `src/brain/experience-reinforcer.ts` | Pathway strengthening/weakening based on outcomes |
| `src/brain/experience-tracker.ts` | Agent-experience interaction monitoring |
| `src/brain/experience-metrics.ts` | Observability: strength distribution, domain coverage, model readiness |
| `src/brain/__tests__/experience-extractor.test.ts` | Extractor unit tests |
| `src/brain/__tests__/experience-integration.test.ts` | Integration tests for full learning lifecycle |
| `src/brain/__tests__/experience-prompts.test.ts` | Prompt formatting tests |
| `src/brain/__tests__/experience-reinforcer.test.ts` | Reinforcer unit tests |
| `src/brain/__tests__/experience-retriever.test.ts` | Retriever unit tests |
| `src/brain/__tests__/global-memory.test.ts` | GlobalMemoryService unit tests |
| `src/bridge/sse-emitter.ts` | SSEEmitter — translates events for frontend (18 event types) |
| `src/bridge/user-input.ts` | UserInputHandler — directives and question responses |
| `src/providers/router.ts` | ProviderRouter — model string → provider routing |
| `src/providers/anthropic.ts` | AnthropicProvider — full SDK integration with thinking |
| `src/providers/openai.ts` | OpenAIProvider — GPT/o-series integration |
| `src/providers/google.ts` | GoogleProvider — stub (throws on use) |
| `src/providers/xai.ts` | XAIProvider — Grok integration |
| `src/providers/types.ts` | LLM provider interface contract |
| `src/providers/index.ts` | Provider exports |
| `src/providers/providers.test.ts` | Provider unit tests |
| `src/config/models.ts` | Model strings, thinking budgets, context limits |
| `src/config/services.ts` | External service endpoints, timeouts, limits |
| `src/config/index.ts` | Config re-exports |
| `src/tools/index.ts` | Tool registry assembly |
| `src/tools/tools.test.ts` | Tool integration tests |
| `src/tools/analyze/index.ts` | Analysis tool assembly |
| `src/tools/analyze/intent.ts` | analyze_intent — deep intent extraction |
| `src/tools/analyze/competitors.ts` | analyze_competitors — web crawl + LLM synthesis |
| `src/tools/analyze/api-probe.ts` | probe_api — real API endpoint probing |
| `src/tools/analyze/components.ts` | map_components — full component/page/route map |
| `src/tools/analyze/web-search.ts` | search_web — Brave Search API |
| `src/tools/analyze/codebase.ts` | analyze_codebase — returns instructions (not functional) |
| `src/tools/analyze/helpers.ts` | extractJSON, safeFetch, createLLMJSON utilities |
| `src/tools/design/index.ts` | Design tool assembly |
| `src/tools/design/references.ts` | load_design_references — markdown → Brain nodes |
| `src/tools/sandbox/index.ts` | Sandbox tool assembly |
| `src/tools/sandbox/provider.ts` | SandboxProvider interface + local filesystem implementation |
| `src/tools/sandbox/filesystem.ts` | write_file, read_file, edit_file, list_files |
| `src/tools/sandbox/commands.ts` | run_command, run_build, run_tests |
| `src/tools/sandbox/dev-server.ts` | start_dev_server, stop_dev_server |
| `src/tools/sandbox/screenshot.ts` | take_screenshot via Playwright |
| `src/tools/verify/index.ts` | Verification tool assembly |
| `src/tools/verify/typescript.ts` | verify_errors — tsc --noEmit |
| `src/tools/verify/placeholders.ts` | check_placeholders — 28 regex patterns |
| `src/tools/verify/security.ts` | check_security — security location surfacing |
| `src/tools/verify/intent-satisfaction.ts` | evaluate_intent_satisfaction — criteria checking |
| `src/tools/verify/full-verification.ts` | run_full_verification — all-in-one check |
| `src/tools/verify/design-score.ts` | score_design — **STUB** |
| `src/tools/vision/index.ts` | Vision tool assembly |
| `src/tools/vision/compare.ts` | compare_screenshots — **STUB** |
| `src/tools/vision/extract-patterns.ts` | extract_ui_patterns — **STUB** |

**Total**: 62 TypeScript files in src/ (including tests). ~7,200 lines of production code (excluding tests).
