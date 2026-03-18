# KRIPTIK ENGINE — DEEP AUDIT & GAP ANALYSIS
## Date: 2026-03-15

---

## A. Architecture Map

The engine has 4 layers:

### Brain Layer (WORKING — tested with 20/20 passing integration tests)
- SQLite database (better-sqlite3 + Drizzle ORM) — each project gets its own brain.db
- 4 tables: brain_nodes, brain_edges, agent_sessions, brain_activity_log
- brain_nodes: id, project_id, node_type (12 types: intent/constraint/discovery/artifact/decision/task/status/user_directive/design_reference/api_contract/error/resolution), title, content (JSON), confidence (0-1), created_by, parent_node_id, status (active/superseded/invalidated/completed), metadata, embedding_id, timestamps
- brain_edges: source→target with 9 edge types (requires/conflicts_with/implements/refines/replaces/blocks/enables/discovered_by/relates_to)
- agent_sessions: tracks active agents, their role, model, token usage, who spawned them
- brain_activity_log: every read/write/query/spawn/tool_invoke logged
- Qdrant semantic search via HuggingFace all-MiniLM-L6-v2 (384-dim embeddings)
- EventEmitter-based subscriptions for real-time UI events
- Methods: writeNode, updateNode, invalidateNode, addEdge, getNode, getNodesByType, query (semantic), getRelated (graph traversal), getConflicts, subscribe, logActivity, compact

### Agent Layer (WORKING — tested with real Claude Opus API calls)
- AgentRuntime class manages agent lifecycle
- runReasoningLoop: the core — calls Claude API with system prompt + tools + conversation history, processes tool_use blocks, handles context compaction at 80% of 180K token limit, rate limit retry, error recovery
- Lead Agent: claude-opus-4-6 with 10K thinking budget. Gets brain tools (8) + lead-only tools (3: spawn_specialist, terminate_specialist, request_user_input)
- Specialists: spawned by Lead, get brain tools + ALL registered tools by default (or scoped subset)
- Seed message: "Begin. Read the Brain for current state and start your work."
- Agent sessions tracked in SQLite with token usage

### Tools Layer (MIX — some real, some stubs)
Registered tools via toolRegistry (32 total):
- Sandbox (8 tools): write_file, read_file, edit_file, list_files, run_command, run_build, run_tests — ALL REAL via local filesystem SandboxProvider. take_screenshot is STUB.
- Verify (5 tools): verify_errors (REAL - runs tsc --noEmit), check_security (REAL - 10 CWE regex patterns), check_placeholders (REAL - 10 patterns), score_design (STUB), evaluate_intent_satisfaction (REAL - inspects files against success_criteria from brain nodes)
- Analyze (6 tools): analyze_intent (REAL - Opus call with inferred needs, scale intent, critical unknowns), analyze_competitors (REAL - fetches URLs, parses HTML, synthesizes with Opus), probe_api (REAL - probes discovery endpoints, captures rate limit headers, fetches docs, synthesizes with Opus), map_components (REAL - Opus call producing full component map), search_web (STUB), analyze_codebase (SEMI-STUB - returns instructions)
- Design (1 tool): load_design_references (REAL - reads markdown file, parses ## sections, writes to brain as design_reference nodes)
- Vision (2 tools): compare_screenshots (STUB), extract_ui_patterns (STUB)
- Brain tools (8, hardcoded in runtime): all REAL
- Lead-only tools (3, hardcoded in runtime): all REAL

### Bridge Layer (IMPLEMENTED — tested via integration test)
- SSEEmitter: subscribes to brain events, translates to 17 SSE event types for frontend
- UserInputHandler: sendDirective (free-form) and respondToQuestion (linked to question node)
- initEngine(): wires Brain + Runtime + Tools + SSE + UserInput, returns EngineHandle

### What does NOT exist:
- No Modal sandbox integration (local filesystem only via SandboxProvider interface)
- No template brain seeding (brain starts empty every time)
- No Playwright/screenshot capability
- No web search (Brave/Serper)
- No Firecrawl integration (competitor analysis uses basic fetch + HTML regex)
- No anti-slop constraint nodes or design system enforcement
- No run_full_verification tool (Lead must manually call each verify tool)

---

## B. Tool Inventory

| # | Tool | File | Status | Real External Calls? | Returns | Limitations |
|---|------|------|--------|---------------------|---------|-------------|
| 1 | write_file | sandbox.ts | WORKING | No (local fs) | {written: path} | Local only, no Modal |
| 2 | read_file | sandbox.ts | WORKING | No (local fs) | {path, content} | Local only |
| 3 | edit_file | sandbox.ts | WORKING | No (local fs) | {edited: path} or error | Single replace only |
| 4 | list_files | sandbox.ts | WORKING | No (local fs) | {directory, files[]} | Skips node_modules/.git |
| 5 | run_command | sandbox.ts | WORKING | Yes (child_process) | {stdout, stderr, exitCode} | 60s timeout, 10MB buffer |
| 6 | run_build | sandbox.ts | WORKING | Yes (npm run build) | {success, stdout, stderr} | Assumes npm scripts exist |
| 7 | run_tests | sandbox.ts | WORKING | Yes (npm test) | {success, stdout, stderr} | Assumes test script exists |
| 8 | take_screenshot | sandbox.ts | STUB | No | {status: 'stub'} | Not connected to Playwright |
| 9 | verify_errors | verify.ts | WORKING | Yes (npx tsc) | {success, errors[]} | TypeScript only |
| 10 | check_security | verify.ts | WORKING | No (regex) | {findings[], bySeverity} | 10 patterns, regex only, no semantic analysis |
| 11 | check_placeholders | verify.ts | WORKING | No (regex) | {placeholders[], byType} | 10 patterns |
| 12 | score_design | verify.ts | STUB | No | {status: 'stub'} | Not connected to vision |
| 13 | evaluate_intent_satisfaction | verify.ts | IMPLEMENTED | No (file inspection) | {satisfied, results[]} | Heuristic pattern matching, not AI-verified. Checks file existence/keywords, may miss semantic failures |
| 14 | analyze_intent | analyze.ts | WORKING | Yes (Opus API call) | {analysis: {explicit_intents, inferred_needs, scale_intent, ...}} | Uses training knowledge for inferred needs, not real research |
| 15 | analyze_competitors | analyze.ts | IMPLEMENTED | Yes (fetch URLs) | {analysis: {common_features, table_stakes...}} | Basic HTML scraping only. Requires URLs upfront — can't discover competitors (search_web is stub). No vision analysis. |
| 16 | probe_api | analyze.ts | IMPLEMENTED | Yes (real HTTP) | {discovery[], analysis} | Probes 7 discovery paths. Good for documented APIs. Can't find undocumented constraints. |
| 17 | map_components | analyze.ts | IMPLEMENTED | Yes (Opus API call) | {componentMap: {pages, components, routes, models...}} | Quality depends on brain context quality. Untested with real data. |
| 18 | search_web | analyze.ts | STUB | No | {status: 'stub'} | Critical gap — engine can't discover anything on the web |
| 19 | analyze_codebase | analyze.ts | SEMI-STUB | No | {instruction, steps[]} | Just returns instructions for agent to follow manually |
| 20 | load_design_references | design.ts | WORKING | No (file read) | {loaded, sections[]} | Reads Design_References.md, writes sections as brain nodes |
| 21 | compare_screenshots | vision.ts | STUB | No | {status: 'stub'} | Not connected |
| 22 | extract_ui_patterns | vision.ts | STUB | No | {status: 'stub'} | Not connected |

Plus 8 brain tools and 3 lead-only tools (all WORKING).

### Specific tool audit:
- **analyze_intent:** YES extracts inferred needs, scale intent, critical unknowns. Exhaustive system prompt demanding 15-30 inferred needs.
- **analyze_competitors:** YES does real web crawling (basic fetch), but requires URLs to be provided — it can't DISCOVER competitors because search_web is a stub.
- **probe_api:** YES makes real HTTP calls. Probes 7 discovery endpoints, captures rate limit headers, fetches docs, synthesizes with Opus.
- **map_components:** YES links components back to intents/inferred needs via "satisfies" arrays.
- **load_design_references:** YES reads Design_References.md and seeds brain with sections.
- **evaluate_intent_satisfaction:** YES exists. Inspects files against success_criteria. Returns pass/fail/requires_runtime_test per criterion with evidence.
- **run_full_verification:** DOES NOT EXIST. Lead must call verify_errors, check_placeholders, check_security, evaluate_intent_satisfaction individually.
- **take_screenshot:** STUB. No Playwright.
- **search_web:** STUB. No Brave Search.

---

## C. Brain Analysis

### SQLite Schema:
4 tables, all with project_id indexes:
- **brain_nodes:** 12 columns (id, project_id, node_type, title, content JSON, confidence, created_by, parent_node_id, status, metadata JSON, embedding_id, timestamps)
- **brain_edges:** 8 columns (id, project_id, source_node_id, target_node_id, edge_type, weight, created_by, metadata JSON, created_at)
- **agent_sessions:** 10 columns (id, project_id, agent_role, agent_model, status, context_summary, total_tokens_used, spawned_by, timestamps)
- **brain_activity_log:** 6 columns (id, project_id, agent_session_id, activity_type, target_node_id, detail JSON, created_at)

**12 node types:** intent, constraint, discovery, artifact, decision, task, status, user_directive, design_reference, api_contract, error, resolution

**9 edge types:** requires, conflicts_with, implements, refines, replaces, blocks, enables, discovered_by, relates_to

**Semantic search:** Qdrant integrated via HuggingFace all-MiniLM-L6-v2 (384-dim). Every writeNode generates an embedding and upserts to Qdrant. query() embeds the question, searches Qdrant filtered by project_id, returns brain_nodes ranked by similarity. Payload indexes on projectId and nodeType for filtering. TESTED AND WORKING.

**Template brain:** DOES NOT EXIST. Brain starts empty. No pre-seeded anti-slop constraints, no design system defaults, no common patterns.

**Anti-slop nodes:** DO NOT EXIST. The Design_References.md can be loaded via load_design_references, but there are no constraint nodes that say "never use generic gradients" or "never use lucide-react defaults." The specialists have no guardrails against AI slop aesthetics.

**How agents interact with brain:** 8 brain tools (write_node, update_node, add_edge, query, get_nodes_by_type, get_node, get_conflicts, invalidate_node). Every write auto-logs to activity_log. EventEmitter broadcasts to SSE bridge.

---

## D. Lead Agent Prompt

The Lead Agent system prompt is in src/agents/lead-agent.ts, built dynamically by buildLeadSystemPrompt(). It includes:

**UNDERSTAND/BUILD/VERIFY reasoning guidelines:** YES. Explicitly labeled with a disclaimer: "These are NOT sequential phases enforced by code. They are reasoning guidelines. You may interleave them, go back, skip steps that don't apply, or add steps."

**Completion rules requiring verification:** YES. 7-point checklist:
1. run_build returns zero errors
2. verify_errors returns zero blocking issues
3. check_placeholders finds zero stubs/TODOs
4. evaluate_intent_satisfaction called for EVERY intent AND inferred need
5. Table-stakes check against competitor analysis
6. brain_get_conflicts returns empty
7. No active error nodes

"MUST NOT write any node with 'complete' or 'done' until ALL pass. NON-NEGOTIABLE."

**References brain for decisions:** YES. Instructs to query brain for state, write intents/needs as nodes, use brain for all coordination.

**Inferred needs:** YES. Instructs to "Write EVERY explicit intent AND inferred need as separate brain nodes. The inferred needs are just as important as explicit intents."

**Scale-aware building:** YES. References scale_intent from analyze_intent and instructs to run analyze_competitors if commercial.

**Anti-slop:** Partial. References load_design_references for design intelligence, but no explicit anti-slop rules in the prompt itself.

**Key weakness:** The Lead Agent prompt references tools that are stubs (search_web for finding competitor URLs, take_screenshot for visual verification). The verification checklist includes steps that can't actually be executed (screenshot verification).

---

## E. Gap Analysis — What's Missing

### P0 — Engine Can't Solve Coding Without These

**1. Web Search (search_web)**
- What's missing: The ability to search the web. Currently a stub returning "not connected."
- Why it matters: The Lead Agent can't discover competitor URLs, can't find API documentation URLs, can't research technology choices. analyze_competitors requires URLs but the Lead has no way to find them. probe_api can accept documentation URLs but the Lead can't find those either. The engine is blind to the outside world.
- Where: src/tools/analyze.ts, search_web tool
- Dependencies: Brave Search API key (or Serper/Tavily)
- Priority: P0

**2. Screenshot/Visual Verification (take_screenshot)**
- What's missing: Playwright-based screenshot capability. Currently a stub.
- Why it matters: The engine can't see what it built. It can verify TypeScript compiles and files exist, but it can't tell if the app looks right, if layouts are broken, if buttons are positioned correctly, if colors match the design direction. The stress test built a 42-file Next.js app that probably has visual issues the engine can't detect.
- Where: src/tools/sandbox.ts, take_screenshot tool
- Dependencies: Playwright (npm install playwright), a running dev server in the sandbox
- Priority: P0

**3. Modal Sandbox Integration**
- What's missing: The SandboxProvider interface exists and is clean, but only a local filesystem implementation (createLocalSandbox) exists. No Modal container integration.
- Why it matters: In production, each project needs an isolated sandbox with its own filesystem, installed dependencies, running dev server, and Playwright browser. Without Modal, the engine can only run locally on the developer's machine.
- Where: src/tools/sandbox.ts — need createModalSandbox() implementing SandboxProvider
- Dependencies: Modal SDK (@modal/client or HTTP API), Modal account with container orchestration
- Priority: P0 for production, P1 for demo

**4. Dev Server Management**
- What's missing: No tool to start/stop/manage a development server in the sandbox. Specialists can run `npm run dev` via run_command, but there's no way to know when the server is ready, what port it's on, or to stop it cleanly.
- Why it matters: take_screenshot needs a running dev server. Visual verification needs to load the app. Without managed dev server lifecycle, screenshots will fail.
- Where: New tool in sandbox.ts or a new file
- Dependencies: SandboxProvider needs a startDevServer/stopDevServer method
- Priority: P0 (blocks screenshot verification)

### P1 — Significantly Degrades Quality

**5. Anti-Slop Brain Seeding**
- What's missing: No template brain with anti-slop constraints. Every project starts with an empty brain. There are no nodes saying "never use lucide-react icons with generic Tailwind", "never use purple/blue gradients on hero sections", "never use generic placeholder text."
- Why it matters: Without explicit anti-slop constraints in the brain, specialists default to standard AI coding patterns — the exact generic output KripTik exists to prevent.
- Where: New function in brain-service.ts or a dedicated src/brain/template.ts
- Dependencies: A curated list of anti-slop rules (exists as domain knowledge, needs to be codified)
- Priority: P1

**6. Firecrawl Integration for Competitor Analysis**
- What's missing: analyze_competitors uses basic fetch + HTML regex parsing. This misses: JavaScript-rendered content, visual layout analysis, interactive feature discovery, behind-login features.
- Why it matters: Basic HTML scraping catches ~30% of what a competitor site does. SPAs render almost nothing in the initial HTML. The competitor analysis will be shallow and miss critical features.
- Where: src/tools/analyze.ts, analyze_competitors tool
- Dependencies: Firecrawl API key
- Priority: P1

**7. Vision-Based Competitor Analysis**
- What's missing: Even with Firecrawl, the engine can't SEE competitor sites. It can read their HTML/text but can't understand their visual design, layout patterns, or animation approach.
- Where: src/tools/vision.ts (stubs exist)
- Dependencies: Playwright screenshots + Claude Vision API calls
- Priority: P1

**8. run_full_verification Composite Tool**
- What's missing: No single tool that runs the complete verification suite. The Lead must manually call 6-7 different tools and check each result.
- Why it matters: The Lead might skip verification steps, forget to check all intents, or declare complete after only partial verification. A composite tool ensures nothing is missed.
- Where: src/tools/verify.ts
- Dependencies: All existing verify tools
- Priority: P1

**9. Runtime/Functional Testing**
- What's missing: No tool to actually USE the built app — navigate pages, click buttons, fill forms, verify that user flows work end-to-end.
- Why it matters: evaluate_intent_satisfaction checks file existence, not functionality. A file can exist with correct-looking code that crashes at runtime. The stress test app had 42 files but we don't know if login actually works.
- Where: New tool, likely in verify.ts or a new functional-test.ts
- Dependencies: Playwright, running dev server
- Priority: P1

**10. Specialist System Prompt Needs Design Context**
- What's missing: The specialist system prompt (specialist.ts) doesn't mention design references, anti-slop patterns, or visual quality. It just says "build incrementally, write discoveries, verify your work."
- Why it matters: Specialists are the ones writing code. If they don't know about the design system, they'll use default AI patterns.
- Where: src/agents/specialist.ts buildSpecialistSystemPrompt
- Dependencies: Design reference nodes in brain (from load_design_references)
- Priority: P1

### P2 — Nice to Have for V1

**11. Cost Tracking/Budget Limits**
- What's missing: Token usage is tracked per agent session in the DB, but there's no budget enforcement. The engine will run until it finishes or times out, regardless of cost.
- Where: src/agents/runtime.ts
- Priority: P2

**12. Agent Resume/Handoff**
- What's missing: When an agent's context compacts, it gets a summary and continues. But if the engine restarts, agents can't resume — they start fresh with a compacted brain.
- Where: src/agents/runtime.ts
- Priority: P2

**13. Streaming/Non-Blocking API Calls**
- What's missing: The runtime uses non-streaming Claude API calls (messages.create, not stream). This means tool calls don't start executing until the full response is received.
- Where: src/agents/runtime.ts runReasoningLoop
- Priority: P2 (works fine, just slower)

---

## F. What's Salvageable From the Old Codebase

The old codebase at /Volumes/Logan T7 Touch/KripTik AI_Trial_antiGravity/ is massive — 154 systems, ~500 server TS files, a 12,883-line BuildLoopOrchestrator. The COMPREHENSIVE-ARCHITECTURAL-ANALYSIS.md documents it thoroughly.

### Already brought over:
- Design_References.md (40KB Awwwards-level effects catalog) — in the engine root
- The brain concept (knowledge graph) — reimplemented cleanly from scratch

### Worth extracting as domain knowledge (NOT code):

1. **Intent Lock system prompts** (intent-lock.ts) — the system prompts for deep intent analysis. The engine's analyze_intent prompt is already good, but the old one had specific patterns for extracting "AppSoul" (visual identity, personality, anti-patterns). Could enrich the current intent analysis.

2. **Anti-Slop Manifesto** (design-style-agent.ts, anti-slop-detector.ts) — hardcoded banned patterns: "no purple-blue gradients", "no generic hero with centered H1", "no lucide-react icon soup". These are regex patterns that should become brain constraint nodes.

3. **Placeholder detection patterns** (placeholder-eliminator.ts) — ~40 regex patterns vs our current 10. The old system was more thorough.

4. **Verification agent system prompts** — the 6 verification agents (error-checker, code-quality, visual-verifier, security-scanner, placeholder-eliminator, design-style-agent) had carefully crafted system prompts. Worth reading for prompt engineering patterns.

5. **Brave Search integration** (web-search-service.ts) — actual Brave Search API integration code. Could be adapted for our search_web stub.

6. **Firecrawl integration** (firecrawl-service.ts) — actual Firecrawl API integration. Could be adapted.

7. **OAuth integration workflows** (~200 integrations) — the UI and connection flows already exist in the old frontend.

### NOT worth extracting:
- The BuildLoopOrchestrator (12,883 lines of mechanical phase management)
- The TeamDispatcher/AgentPoolDispatcher (mechanical agent coordination)
- The wave orchestrator (8 hardcoded sequential waves)
- Any of the 40+ "mechanical-sequential" services
- The DAG task generator (pre-populated task lists violate CLAUDE.md)
- The Queen/Worker agent system (deprecated)

---

## G. Honest Assessment

### How far is the engine from solving coding?

The architecture is right. The brain works. Agents coordinate through it. The reasoning loop handles tool_use correctly. The stress test proved the system can: extract intents, spawn domain-specific specialists, write 42+ real files, detect and resolve conflicts, recover from agent errors — all autonomously.

But it's about 40% of the way to a working demo. The stress test also proved the system:
- Can't verify what it built (no screenshots, no functional testing)
- Can't discover information (no web search)
- Doesn't load design intelligence before building (Design_References.md wasn't loaded in either test run — the Lead didn't call load_design_references)
- Doesn't enforce anti-slop constraints
- Runs only locally (no Modal sandbox)

### Critical path to working demo:

1. **search_web** — Connect Brave Search. ~50 lines. Unblocks competitor discovery.
2. **take_screenshot** — Implement with Playwright. ~100 lines. Requires dev server management.
3. **Dev server management** — start_dev_server/stop_dev_server in sandbox. ~80 lines.
4. **Anti-slop brain seeding** — Template brain with constraint nodes. ~100 lines.
5. **Specialist prompt enhancement** — Add design context awareness. ~20 lines.
6. **run_full_verification** — Composite tool. ~80 lines.
7. **Test the full loop** — Run stress test with all fixes, verify the Lead actually uses the intelligence tools before building.

### Biggest technical risks:
1. **The Lead Agent might not follow its own prompt.** We can give it perfect instructions, but Claude might shortcut the UNDERSTAND phase and jump to BUILD. The stress test showed it sometimes does this. Mitigation: more explicit instructions, or a pre-flight check in code that verifies brain has intent/design_reference nodes before allowing specialist spawning.
2. **Token costs.** Each Opus API call with 10K thinking costs ~$0.05-0.15. A full build with 5 specialists making 20 calls each = ~$15-30. This is expensive.
3. **Context window limits.** The 180K context window fills up fast when specialists are reading brain nodes + writing code. Compaction helps but loses nuance.
4. **Concurrent agent timing.** Multiple specialists writing to the same sandbox simultaneously could cause file conflicts. No file locking exists.

### Order of operations:
1. search_web (unblocks competitor analysis)
2. Anti-slop brain seeding (improves quality immediately)
3. Specialist prompt enhancement (improves quality immediately)
4. take_screenshot + dev server management (unblocks visual verification)
5. run_full_verification composite tool (ensures nothing is skipped)
6. Full integration test with all fixes

### Estimated scope:
- ~400-500 new lines of code
- 2-3 focused sessions
- Most work is in connecting external services (Brave Search, Playwright) and writing brain seeding content (anti-slop rules)

The architecture doesn't need changes. The brain, agents, and tool system are solid. What's missing is the intelligence and verification plumbing that makes the engine SMART — the difference between an engine that writes code and one that builds apps.

---

## H. Post-Audit Changes (2026-03-15 Session 2)

The following gaps from Section E were addressed:

| Gap | Status | What Was Built |
|-----|--------|---------------|
| #1 search_web | **WORKING** | Brave Search API integration in analyze.ts. Returns {title, url, description, age} results. |
| #2 take_screenshot | **WORKING** | Playwright-based screenshots in sandbox.ts. Returns base64 PNG. |
| #4 Dev server management | **WORKING** | start_dev_server / stop_dev_server in sandbox.ts. Process tracking, ready-polling, idempotent. |
| #5 Anti-slop brain seeding | **WORKING** | src/brain/template.ts — 28 constraint nodes (15 anti-slop, 5 design-system, 8 quality-floor). Seeded on engine init, idempotent. |
| #6 Firecrawl integration | **IMPLEMENTED** | analyze_competitors in analyze.ts tries Firecrawl first (markdown + screenshot), falls back to basic fetch. Adds visual analysis via Claude Vision when screenshot available. |
| #7 Vision-based competitor analysis | **IMPLEMENTED** | Firecrawl screenshot → passed to Opus synthesis for visual pattern analysis. |
| #8 run_full_verification | **WORKING** | Composite tool in verify.ts. Runs: tsc, placeholders, security, intent satisfaction, conflict check, error node check. Returns PASS/FAIL verdict. |
| #10 Specialist prompt enhancement | **WORKING** | specialist.ts now instructs specialists to query constraint and design_reference nodes before writing UI code. |

Additionally:
- **check_placeholders enhanced** from 10 patterns to 28 patterns with 3 severity levels (blocking/warning/info)
- **CLAUDE.md updated** with new capabilities section documenting all tools available to agents
- **.env.example updated** with BRAVE_SEARCH_API_KEY and FIRECRAWL_API_KEY

### Remaining gaps:
| Gap | Status | Notes |
|-----|--------|-------|
| #3 Modal sandbox | Still missing | Local-only. SandboxProvider interface ready for Modal implementation. |
| #9 Runtime/functional testing | Still missing | Playwright can screenshot but can't click/navigate/test flows yet. |
| #11 Cost tracking | Still missing | Token usage tracked but no budget enforcement. |
| #12 Agent resume | Still missing | Context compaction works but no cross-restart resume. |
| #13 Streaming API calls | Still missing | Non-streaming Claude calls. Works but slower. |

### New dependencies added:
- `playwright` — screenshot capture

### New env vars:
- `BRAVE_SEARCH_API_KEY` — required for web search
- `FIRECRAWL_API_KEY` — optional, enhances competitor analysis

### Test results:
- 13/13 new tool tests passing
- 20/20 existing brain tests still passing
- TypeScript compiles clean (0 errors)
