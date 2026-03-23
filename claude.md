# KRIPTIK ENGINE — CONSTITUTIONAL RULES

> **IF YOU ARE AN AI READING THIS: Everything in this file is LAW. Not suggestion. Not guidance. LAW.**
> **The engine in `src/` is UNTOUCHABLE unless Logan explicitly says otherwise.**
> **If you catch yourself writing orchestration logic, switch statements, phase managers, or hardcoded agent types — STOP. You are building a mechanical system. That is forbidden.**

## WHAT THIS PROJECT IS

KripTik AI is an AI app builder that constructs complete, production-ready applications from a single user prompt. The **kriptik-engine** (in `src/`) is the core — a Brain-driven autonomous agent system where Claude Opus 4.6 (Lead Agent) reasons about what to build, spawns specialists dynamically, and guides them to completion. All knowledge flows through the Brain (a queryable, mutable knowledge graph backed by SQLite). Agents don't follow pipelines — they think.

The Brain is the single source of truth. Agents query it for context, write discoveries back to it, and other agents benefit from what was learned. The user's prompt becomes intent nodes. Competitor analysis becomes discovery nodes. API rate limits become constraint nodes. Everything the system learns persists in the Brain.

### Three Workflows, One Engine
- **Builder**: User enters prompt → Brain seeded with intent → agents build the app
- **Fix My App**: User imports broken app context → Brain seeded with errors/intent → agents rebuild
- **Import App**: User imports codebase → Brain seeded with analysis → agents fill gaps

The engine doesn't know which workflow triggered it. It reads the Brain and builds toward satisfying intent nodes.

---

## ⛔ ABSOLUTE PROHIBITIONS — NEVER DO THESE

These are not preferences. These are hard rules. Violating any of these means you built the wrong thing.

### 1. NO SEQUENTIAL PHASE PIPELINES
NEVER create a system where Phase 1 must complete before Phase 2 starts. The Lead Agent decides what to do next by reasoning about Brain state. There are no "phases."

### 2. NO MECHANICAL ORCHESTRATION
NEVER create coordinator/orchestrator classes that manage agents through state machines, switch statements, or sequential function calls. The Lead Agent IS the orchestrator — it reasons, not follows scripts.

### 3. NO PRE-POPULATED TASK LISTS
NEVER generate all tasks upfront and put them in a queue. Agents discover work as they build. The task list in the Brain evolves with discoveries.

### 4. NO HARDCODED AGENT ROLES
NEVER define fixed agent types (frontend agent, backend agent, etc.). The Lead Agent decides what specialists are needed per-project. A CRUD app might need 2. A real-time collaborative app might need 8.

### 5. NO SILENT AGENTS
NEVER create agents that work without writing discoveries to the Brain. When an agent learns something (API rate limit, data model change, design conflict), it writes to the Brain immediately.

### 6. NO VERIFICATION AS A SEPARATE PHASE
Verification is continuous. Agents verify their own work using tools. The Lead Agent monitors the Brain for conflicts. There is no "verification phase" after building.

### 7. NO ONE-SHOT GENERATION
NEVER generate entire files, plans, or architectures in a single AI call. Agents build incrementally — write a component, test it, discover what's needed, adjust, continue.

### 8. NO FIRE-AND-FORGET EVENTS
All communication flows through the Brain. When the user interrupts, it writes to the Brain. When an agent discovers something, it writes to the Brain. All agents can read all Brain updates.

### 9. NO HARDCODED REGEX FOR UI RENDERING
NEVER use regex pattern matching to determine what to show in the streaming chat UI. The UI renders what the engine emits. Agent roles, colors, and icons are assigned dynamically at spawn time based on what the Lead Agent named the specialist — not from a predefined catalog.

### 10. NO MECHANICAL PATTERNS IN THE UI
The streaming chat, question tiles, correction prompts — none of these should be mechanical. The agents decide what questions to ask (about dependency credentials only during builds). The UI renders what agents emit. If you're writing a switch statement that maps event types to hardcoded UI components, you're doing it wrong.

### 11. NO IMPORTING MECHANICAL SYSTEMS FROM THE OLD APP
The old KripTik app at `/Volumes/Logan T7 Touch/KripTik AI_Trial_antiGravity/` has 154 systems, most mechanical. 72 are REPLACED by this engine. Only UI, auth, and OAuth workflows may be referenced — and even those must be adapted to work with the Brain-driven architecture, not imported wholesale. See `SYSTEM_SORT.md` for the full breakdown.

---

## THE ENGINE (`src/`) — DO NOT MODIFY WITHOUT EXPLICIT PERMISSION

The engine is a ~6,200 line TypeScript library. It is complete and tested. Logan built this with extensive care. **Do not refactor, restructure, or "improve" anything in `src/` unless Logan specifically asks.**

### Architecture

```
src/
├── brain/                 SQLite knowledge graph
│   ├── schema.ts          Drizzle ORM table definitions (nodes, edges, embeddings)
│   ├── brain-service.ts   CRUD + semantic query interface
│   ├── embeddings.ts      HuggingFace sentence-transformers + Qdrant integration
│   └── template.ts        Template brain seeding (~28 constraint nodes)
├── agents/
│   ├── runtime.ts         Agent spawning, lifecycle, Claude API streaming, budget tracking
│   └── prompts/
│       ├── lead.ts        Lead Agent system prompt + reasoning loop
│       └── specialist.ts  Specialist Agent system prompt
├── tools/
│   ├── index.ts           Tool registry and interface definitions
│   ├── sandbox/           File ops, commands, dev server, screenshots (Playwright)
│   ├── verify/            TS errors, security SAST, placeholders, intent satisfaction, full verification
│   ├── analyze/           Intent analysis, competitor crawl, API probing, component mapping, web search
│   ├── design/            Design references → Brain nodes
│   └── vision/            Screenshot comparison, UI pattern extraction (stubs)
├── providers/             LLM provider abstraction (Anthropic, OpenAI, Google, XAI)
│   ├── router.ts          ProviderRouter — routes to appropriate provider
│   ├── anthropic.ts       Claude API integration, streaming, extended thinking
│   └── [others].ts        GPT-4, Gemini, Grok providers
├── bridge/
│   ├── sse-emitter.ts     SSE streaming bridge for UI
│   └── user-input.ts      User directives → Brain writer
├── config/                Model configs, service settings
├── types/index.ts         Shared type definitions
├── engine.ts              initEngine() entry point
└── index.ts               Public API exports
```

### How Agents Work
Each agent runs a reasoning loop:
1. Query the Brain for current state relevant to my domain
2. Reason about what to do next (extended thinking)
3. Take action (write code, run tests, probe an API, invoke a tool)
4. Write discoveries/results back to the Brain
5. Check if my task is complete or if new information changes my approach
6. Repeat until the Lead Agent determines my work is done

This is NOT mechanical. The agent genuinely reasons at each step.

### The Lead Agent's Loop
Watches the Brain, not agent output streams:
1. Read Brain state — what's known, built, blocked, conflicting
2. Evaluate progress against intent nodes
3. Decide next actions: spawn specialist? redirect one? run verification? ask user?
4. Act on decisions
5. Repeat until intent is satisfied

### Tools Available to Agents
Tools are capabilities, NOT pipeline steps. Agents call them when they reason they should.

- **search_web** — Brave Search API
- **analyze_competitors** — Fetch competitor sites, extract features/nav/pricing
- **probe_api** — Real HTTP requests to APIs, discover auth/rate limits/response formats
- **map_components** — Component/page/route map linked to intent satisfaction
- **load_design_references** — Design_References.md → Brain nodes
- **verify_errors** — tsc --noEmit
- **check_security** — SAST surface areas for agent review
- **check_placeholders** — 28 patterns for TODO/stubs/credential leaks
- **evaluate_intent_satisfaction** — Project files vs intent success criteria
- **run_full_verification** — Composite: errors + placeholders + security + intent
- **start_dev_server** / **stop_dev_server** / **take_screenshot** — Sandbox tools

---

## THE SERVER (`server/`)

Express.js backend. Auth via Better Auth + Drizzle ORM on PostgreSQL (Supabase).

```
server/src/
├── routes/
│   ├── projects.ts      Project CRUD (create, list, get, delete) — owner-scoped
│   ├── execute.ts       Start builds — lazy-imports engine, streams SSE events
│   ├── events.ts        SSE event stream + replay endpoint for returning users
│   ├── oauth.ts         OAuth flow handlers + provider catalog (178 providers)
│   └── credentials.ts   Credential vault operations
├── middleware/
│   ├── auth.ts          Session validation via Better Auth
│   └── ownership.ts     Project ownership verification (user can only access own projects)
├── oauth/
│   ├── catalog.ts       178 OAuth provider configs with scopes and endpoints
│   ├── manager.ts       OAuth flow orchestration
│   ├── crypto.ts        PKCE + state generation
│   └── types.ts         OAuth type definitions
├── vault/               Encrypted credential storage
├── auth.ts              Better Auth config (email/password + social providers)
├── db.ts                PostgreSQL connection via Drizzle
├── schema.ts            DB schema: users, sessions, accounts, projects, build_events, credentials
└── index.ts             Express server setup, route registration
```

### Database Schema (PostgreSQL via Supabase)
- **users** / **sessions** / **accounts** / **verification** — Better Auth managed (auth tables)
- **projects** — id, name, description, ownerId, status, engineSessionId, brainDbPath, sandboxPath
- **buildEvents** — id, projectId, eventType, eventData (JSONB), createdAt (append-only log for chat replay)
- **credentials** — id, userId, projectId, service, encryptedData (AES-256-GCM)

### Key Design Decisions
- **Engine is lazy-loaded**: `execute.ts` uses `await import('../../../src/engine.js')` at build start, not at module load. This prevents native deps (better-sqlite3, playwright) from blocking server startup.
- **Project isolation**: Every query is scoped by `ownerId` AND `projectId`. No data leaks between users or projects.
- **Build events are append-only**: Once written, never modified. Chat replay reads them in order.
- **OAuth catalog is static**: 178 providers defined in code. The UI checks this catalog to show "Connect" buttons when agents ask about dependencies.

---

## THE CLIENT (`client/`)

React + Vite + Three.js + GSAP + Tailwind + Radix UI.

```
client/src/
├── pages/
│   ├── LoginPage.tsx      Login form + OAuth buttons
│   ├── SignupPage.tsx      Registration form
│   ├── Dashboard.tsx       Project cards, NLP input, create project
│   └── Builder.tsx         Main builder — streaming chat + code editor + live preview
├── components/
│   ├── builder/           Builder-specific components
│   │   ├── AgentStreamView.tsx      Top-level stream container (Feed/Lanes toggle)
│   │   ├── UnifiedFeedView.tsx      Chronological feed — all agents interleaved
│   │   ├── SwimLaneView.tsx         Parallel lanes — one per active agent
│   │   ├── AgentResponseBox.tsx     Individual response box with streaming content
│   │   ├── AgentBadge.tsx           Agent identity (color, icon, name)
│   │   ├── AgentIconSDF.tsx         SDF-rendered agent icon (not lucide, not emoji)
│   │   ├── BrainOrb.tsx             3D brain visualization
│   │   ├── BrainConnector.tsx       Visual line from agent to brain during read/write
│   │   ├── TypeAnimatedText.tsx     Typewriter streaming text animation
│   │   ├── WarpBackground.tsx       Animated background shader
│   │   ├── QuestionTile.tsx         Agent question display with options + OAuth Connect
│   │   └── CorrectionPrompt.tsx     User inline correction on any response box
│   ├── ui/                Reusable primitives (Radix-based)
│   │   ├── ProjectCard3D.tsx        3D project card for dashboard
│   │   ├── GenerateButton3D.tsx     3D generate button
│   │   └── [radix wrappers]         button, card, dialog, form, input, etc.
│   ├── layouts/           Page layout wrappers
│   └── shaders/           GLSL fragment/vertex shaders
├── hooks/
│   ├── useEngineEvents.ts   SSE subscription — listen for engine events
│   └── useAgentTracker.ts   Track active agents and state across events
├── store/
│   ├── useUserStore.ts      Zustand user state
│   └── useProjectStore.ts   Zustand project state
├── lib/
│   ├── api-client.ts        HTTP client with auth cookies
│   ├── api-config.ts        API endpoint config
│   ├── auth-client.ts       Better Auth client wrapper
│   └── utils.ts             Classname utilities
├── App.tsx                  React Router setup
├── main.tsx                 Entry point
└── index.css                Tailwind + custom animations
```

### Key UI Concepts

**Streaming Chat**: Two view modes (toggle at top):
- **Unified Feed**: Single chronological stream, each agent color-coded, filter chips to isolate agents
- **Swim Lanes**: Vertical columns per agent (max 4 visible), time flows down, cross-agent connectors

**Response Boxes**: One per agent reasoning cycle (thinking → actions → tool calls → code writes until next thinking block). Boxes auto-grow as content streams. Contain: thinking block (expandable), response text (type-animated), tool calls with results, code diffs.

**Agent Identity**: Colors and icons assigned dynamically when the Lead Agent spawns a specialist. The UI doesn't know in advance what agents will exist. It reacts to `agent_spawned` events and assigns visual identity from a palette.

**Correction Prompt**: User clicks any response box → enters correction text → writes a contextual `user_directive` to the Brain → Lead Agent reads it and decides how to handle (spawn fix specialist, redirect existing one, write constraint for future work). Build never stops.

**Question Tiles**: Agents ask questions ONLY about dependency auth credentials during builds. Questions are rendered as tiles with "Connect" buttons if an OAuth flow exists for that service. Nothing is hardcoded — the agent writes the question text, the options, and the explanations. The UI enriches the display by checking the OAuth catalog.

---

## DESIGN SYSTEM

**READ `Design_References.md` BEFORE WRITING ANY UI CODE.** It is the ONLY source of allowed dependencies, animation techniques, and visual patterns.

Key rules:
- **NO lucide-react icons, NO emojis** — custom SDF/3D icons only
- **NO flat CSS cards** — everything has depth, realistic shadows, photorealistic textures
- **NO glassmorphism, NO particles** — use the actual techniques in Design_References.md
- Dependencies: curtains.js (DOM→WebGL), GSAP + ScrollTrigger, OGL, SDF ray marching, WebGL fluid simulation, domain warping noise, displacement mapping, chromatic aberration
- All animations 60fps minimum. Virtualize long lists. Efficient 3D rendering.

---

## HOW THE FULL FLOW WORKS

1. User logs in → sees Dashboard with project cards
2. User types prompt into NLP input → clicks Generate
3. Server creates project (status: `idle`) → navigates to Builder
4. Builder page calls `POST /api/execute` with prompt + projectId
5. Server lazy-loads engine → calls `initEngine()` → engine starts Lead Agent
6. Lead Agent reasons: analyze intent → research competitors → probe APIs → decide team composition → spawn specialists
7. Engine emits SSE events → server persists to `build_events` table → pipes to frontend via SSE
8. Frontend renders events in streaming chat (Unified Feed or Swim Lanes)
9. Lead Agent asks user about dependency credentials (via `request_user_input` tool → Brain → SSE → QuestionTile)
10. User clicks "Connect" → OAuth flow → credentials stored in vault → Brain notified
11. Specialists build the app in the sandbox — writing files, running commands, verifying with tools
12. Live UI preview shows the running app (sandbox dev server + iframe)
13. Code editor shows generated files
14. Lead Agent determines all intent nodes satisfied → build complete
15. User returns later → frontend calls `GET /api/events/replay?projectId=X` → full chat history reconstructed

---

## MULTI-USER / MULTI-PROJECT ISOLATION

This system is designed for viral traffic. Isolation is absolute:

- **Every query** is scoped by `ownerId` AND `projectId`
- **Every project** has its own Brain SQLite file, its own sandbox directory, its own Modal Volume (in production)
- **Build events** are stored per-project in PostgreSQL — `WHERE project_id = $1`
- **Credentials** are per-user, per-project — AES-256-GCM encrypted
- **No endpoint** returns cross-project or cross-user data
- **SSE streams** are project-scoped — you only receive events for your project
- **In production**: each build runs in its own Modal container with its own mounted volume

---

## TECH STACK

| Layer | Technology |
|-------|-----------|
| Engine | Node.js + TypeScript (strict), SQLite (better-sqlite3 + Drizzle), Qdrant, HuggingFace embeddings |
| AI | Anthropic SDK (Opus 4.6 for Lead, configurable for specialists), multi-provider via ProviderRouter |
| Server | Express.js, Better Auth, Drizzle ORM, PostgreSQL (Supabase) |
| Client | React 19, Vite, Three.js, GSAP, curtains.js, OGL, Tailwind, Radix UI, Zustand |
| Sandbox | Local filesystem (dev), Modal containers (production) |
| Streaming | SSE (server-sent events) |
| Node Version | 22 LTS (see `.nvmrc`) |

---

## WHAT SUCCESS LOOKS LIKE

User types: "Build me an AI video generator app that uses Replicate"

1. Lead Agent creates intent nodes → reasons about what it needs to know
2. Invokes competitor analysis, API probing against Replicate — writes discoveries to Brain
3. Reasons about team: "Need a video pipeline specialist, UI specialist, later a polish specialist"
4. Spawns specialists who query Brain and start building
5. Specialist discovers Replicate has 25MB upload limit → writes constraint → Lead sees it → UI specialist gets file size validation
6. Specialists verify their work continuously (tools, not phases)
7. Lead sees intent satisfaction trending complete → spawns Polish specialist for last 10%
8. Lead determines all intents satisfied → build complete
9. Brain state persisted — user comes back, everything is there

No phases. No waves. No gates. Agents reasoning their way to a complete app.

---

## NOTES FOR FUTURE SESSIONS

### What's Been Done
- Engine built and tested (~7,000 lines, 52 files in `src/`)
- Server with auth, project CRUD, OAuth catalog (178 providers), SSE streaming, request tracing
- Client with login, signup, dashboard, builder with premium streaming chat UI
- Unified Feed + Swim Lane views with SDF agent icons, Brain orb, correction prompts
- Full auth flow working (Better Auth + Supabase PostgreSQL) — AUTH_SPEC.md defines immutable contract
- Project creation and isolation verified (cross-user, cross-project)
- System sort of 154 old app systems completed (see `SYSTEM_SORT.md`)
- Architecture enforcement: `scripts/check-modularity.sh` + `scripts/check-mechanical.sh` + Husky hooks
- Mechanical pattern scan: ZERO violations across all 11 prohibitions (see `MECHANICAL_SCAN_REPORT.md`)
- MCP Client Core: Universal MCP OAuth 2.1 + PKCE client in `server/src/mcp/` — metadata discovery, dynamic client registration, token storage, refresh, tools/list caching. Routes at `/api/mcp/`. DB tables: `mcp_connections`, `mcp_tool_caches`, `mcp_oauth_states`.
- Service Registry: Dependency catalog data layer in `server/src/services/` — 38 real developer services across 13 categories with MCP server URLs, pricing tiers, instance models, and brand metadata. Types in `registry-types.ts`, categories in `categories.ts`, catalog in `registry.ts`, custom MCP server support in `custom-servers.ts`. Client has `simple-icons` installed for branded logo rendering (25/38 services covered, rest need custom SVGs).
- Connect Flow: One-click dependency connection system in `client/src/components/dependencies/` — ConnectButton (handles both MCP OAuth popup and browser-agent fallback flows with 6 states: disconnected/connecting/connected/error/needs_reauth/needs_upgrade), ConnectionStatusIndicator (branded logo + animated status dot), FallbackApprovalDialog (user approval for non-MCP browser agent signup with progress tracking), TierSelector (post-connection subscription plan picker). Hook: `useDependencyConnect` in `client/src/hooks/` manages OAuth popup lifecycle, postMessage callbacks, connection state, and instance creation. Server: `/api/services` routes serve registry data + handle instance creation. QuestionTile updated to use MCP ConnectButton when service registry matches found, with legacy OAuth fallback.
- Browser Agent Fallback: Automated account signup for services without MCP servers in `server/src/browser-agent/`. Uses Browser Use (open source, MIT) for browser automation. Components: `types.ts` (session/template/progress types), `templates.ts` (workflow templates for 8 non-MCP services: fal.ai, Replicate, RunPod, Render, Railway, Fly.io, DigitalOcean, Heroku), `browser-use-client.ts` (abstraction over Browser Use Cloud API with local dev simulation fallback), `session-manager.ts` (session lifecycle, progress streaming, retry logic with max 2 retries), `credential-generator.ts` (20-char cryptographic password generation with AES-256-GCM vault storage), `email-verifier.ts` (Gmail MCP integration for automatic verification code extraction with polling + manual paste-your-code fallback for SMS/unsupported email). Routes at `/api/browser-agent/` with endpoints: start, status (with long-polling), verify, cancel, retry. Client: `useDependencyConnect` hook extended with `startBrowserFallback`, `submitVerification`, `cancelFallback`, `retryFallback`, `getBrowserAgentState`. FallbackApprovalDialog enhanced with verification code input, error/retry states, auto-scrolling progress. Env: `BROWSER_USE_API_KEY` for production, local simulation without it.
- Email MCP Banner & Navigation: "Dependencies" added to HoverSidebar (left nav) and UserMenu dropdown (top-right). Route `/dependencies` added to App.tsx pointing to `DependenciesPage` (shell for Task 6 catalog). `EmailMcpBanner` in `client/src/components/dependencies/` — warm glass banner on Dashboard that checks for Gmail/Outlook MCP connection via `getMcpConnections()`, dismissible with localStorage persistence per user, only shows when email not connected AND user has projects. Connect button detects provider from user's email domain, opens MCP OAuth popup. Listens for `mcp_oauth_complete` postMessage to update state.
- Dependency Management View: Full catalog and management page in `client/src/pages/DependenciesPage.tsx`. Two modes: "My Dependencies" (connected services only) and "Browse All" (full 38-service catalog). Features: real-time search filtering across service names/descriptions/tags, 13 category filter tabs with counts that adapt to view mode, project selector dropdown for filtering by specific project, responsive grid (4 cols 1920px, 3 cols 1024px, 2 cols tablet, 1 col mobile). Each DependencyTile shows branded BrandIcon with service color, MCP badge, connection status dot, pricing summary, and full ConnectButton with OAuth popup and browser-agent fallback support. Animated layout transitions via Framer Motion. Loading skeleton tiles. Empty state for no results. Warm glass design matching Dashboard: gradient backgrounds, backdrop blur, realistic shadows with depth, inset highlights, hover elevation effects. All data fetched from `/api/services` and `/api/services/categories` endpoints. Connection state managed via `useDependencyConnect` hook. Clicking a connected tile navigates to `/dependencies/:serviceId` for the individual dashboard.
- Individual Dependency Dashboard: Full service management view in `client/src/pages/DependencyDashboard.tsx`. Route: `/dependencies/:serviceId`. Header with large branded logo, connection status badge (6 states with color-coded dots), connected-since timestamp, and action buttons (Refresh, Open Dashboard external link, Disconnect). Overview panel shows current tier, instance model, MCP tool count, and category. Project Instances panel shows per-project cards with masked API keys, reveal/copy buttons, and environment badges. Subscription panel displays all pricing tiers as selectable cards with current plan highlighted, supports both MCP-based plan changes and external link fallback. API Keys panel shows live/test keys with reveal/copy/create actions. Billing panel shows MCP-fetched data when available, otherwise links to external billing page. MCP Tools panel lists all discovered tools with expandable parameter schemas. All panels render conditionally based on `categorizeTools()` which inspects tool names and descriptions for capability keywords (billing, subscription, api_key, project, usage, database). Warm glass styling with brand color accents, depth shadows, and Framer Motion staggered entrance animations.
- Per-Project Dependency Management: Project-scoped dependency view in `client/src/pages/ProjectDependenciesPage.tsx`. Route: `/projects/:projectId/dependencies`. Shows all services associated with a specific project with per-instance details (instance model type, environment badge, external ID, masked API keys with reveal/copy). "Add Dependency" button opens a searchable mini catalog dialog with category filter chips — connected services can be added directly, unconnected services show ConnectButton inline. "Remove from Project" with confirmation dialog that clarifies account/data is preserved. Database: `project_service_instances` table in `server/src/schema.ts` tracks project-service associations with instance model, environment, external ID, masked API key, and status. Server: `GET /api/services/project/:projectId/dependencies` lists project deps enriched with registry data, `DELETE /api/services/:serviceId/project/:projectId` removes association, `POST /api/services/:serviceId/create-instance` now persists to DB with duplicate detection. Client: `apiClient.getProjectDependencies()` and `apiClient.removeProjectDependency()` methods added. DependenciesPage project selector now navigates to `/projects/:projectId/dependencies` instead of filtering in-place.
- State Management & Full Wiring: Global Zustand dependency store in `client/src/store/useDependencyStore.ts` centralizes service registry, MCP connections, tool caches, and connection health monitoring across all pages. Planning tiles (QuestionTile in Builder) now receive service registry and MCP connection states from the global store, showing MCP ConnectButton for service matches with one-click OAuth popup flow. DependenciesPage and DependencyDashboard sync with the global store for cached registry data and tools. Server: `POST /api/mcp/health-check` endpoint validates token status for all user connections, attempting refresh for expired tokens. Client: `apiClient.checkConnectionHealth()` method added. Health checks run every 5 minutes via the store's interval, detecting token expiry and marking connections as `needs_reauth`. Builder page auto-creates project service instances when MCP OAuth completes during a build via `apiClient.createServiceInstance()`. Full flow wired: planning tile Connect button → OAuth popup → global store update → tools fetched → project instance created → agent can use service tools.
- Dependency System Verification & Polish (Task 10): Full audit of Tasks 1-9 completed. Zero placeholders/stubs/TODOs found in dependency code. All user flows verified logically correct (connect via MCP OAuth, browser agent fallback, catalog browsing, individual dashboard, project dependency management). Added 13 missing brand icons to `BrandIcon.tsx` (atlassian, datadog, digitalocean, figma, linear, render, replicate, turso, flydotio, amazonwebservices, heroku, amplitude, pinecone, postmark, fal) — all 38 registry services now have branded icons. Lazy loading already implemented via React.lazy() in App.tsx. Responsive grids verified: 1-col mobile → 2-col tablet → 3-col narrow desktop → 4-col wide desktop. Accessibility improvements: global focus-visible indicator in index.css (KripTik orange outline), Escape key handlers added to all dialogs/dropdowns, ARIA attributes (role="dialog", aria-modal, aria-labelledby) added to FallbackApprovalDialog and ProjectDependenciesPage dialogs. Error feedback added to ProjectDependenciesPage for failed instance creation. DependencyDashboard now shows a "not connected" prompt with navigation when visiting while disconnected. Build passes clean, zero type errors in dependency files.

### Deployment Infrastructure (as of 2026-03-19)
- **Frontend**: Vercel project `prj_MqCB45npYNv8fyQ37mLvtHfmOyqz` → kriptik.app (Vite, Node 22)
- **Backend**: Vercel project `prj_WdJ8bvaORsFLf9C0TtHiBYTm3tPK` → api.kriptik.app (Express serverless)
- **Modal**: App `kriptik-engine` deployed with Node 22 + Playwright + Design_References deps
  - Build endpoint: `https://logantbaird--kriptik-engine-start-build.modal.run`
  - Health: `https://logantbaird--kriptik-engine-health.modal.run`
  - Volumes: `kriptik-brains` (Brain SQLite), `kriptik-sandboxes` (generated code)
  - Secrets: `kriptik-env` (API keys)
  - Memory: 8GB, Timeout: 24 hours, keep_warm: 1
  - Pre-installed: React, Vite, Next.js, Three.js, GSAP, curtains.js, OGL, Tailwind, Radix, Zustand
  - Real-time streaming: events POST'd to callback URL line-by-line (not batch)
  - Graceful shutdown: SIGTERM/SIGINT handlers close Brain DB properly
- **Supabase**: PostgreSQL with 8 tables + `idx_build_events_project_id` index
- **GitHub**: `Flickinny11/kriptik-engine`, both Vercel projects linked
- **Vercel Team**: `team_Dc3dRfYzsIxYPiaqu2kgVcJJ` (Logan's projects)

### Build Execution Dual Path
`server/src/routes/execute.ts` has two paths:
- **Modal path** (when `MODAL_ENABLED=true`): Calls Modal HTTP endpoint with callbackUrl for real-time event streaming. Each event is POST'd to `/api/events/callback/:projectId` and persisted immediately.
- **Local path** (default): Lazy-imports engine from `src/`, runs in-process
The `MODAL_SPAWN_URL` env var points to the Modal web endpoint.

### Mechanical Pattern Enforcement
- `scripts/check-mechanical.sh` — scans for all 11 CLAUDE.md prohibitions (run on pre-commit)
- `scripts/check-modularity.sh` — max file size, engine protection, import boundaries
- NO lucide-react anywhere — all 5 previous violations fixed, using custom SDF icons
- NO "Phase 1/2" language in comments — use "First", "Then", "Replay then stream"
- Event deduplication in client via `seenIds` set
- Iframe sandbox: `allow-scripts allow-forms allow-popups` (NO allow-same-origin — XSS prevention)

### Stripe Integration (needs reconfiguration)
The old app's Stripe setup used mechanical tier-based billing (Starter/Builder/Developer/Pro plans).
The new engine needs **credit-based billing** where users buy credits that are consumed per-build
based on LLM token usage. The Stripe product/price IDs on Vercel are from the old tier system.
New billing system needs:
- Credit packages (replace tier subscriptions)
- Per-build cost tracking (engine already tracks estimated spend via `budgetCapDollars`)
- Webhook handler for credit purchases
- UI for credit balance + purchase flow

### What's NOT Done Yet
- Anthropic API key needs to be activated (key exists in Vercel, just disabled by Logan)
- App hosting: `{app-slug}.kriptik.app` subdomain system (wildcard DNS + publish endpoint)
- Speculative prompt execution (intent classification while typing, sandbox prewarming)
- Deploy tools in engine: `src/tools/deploy/` (push_to_github, deploy_to_vercel, deploy_to_netlify, verify_deployment)
- Sandbox prewarming on user login (architecture designed, not implemented)
- Sandbox idle timeout with activity beacon (30 min idle, reset on UI interaction)
- Live UI preview via Modal tunnel (infrastructure exists, not wired to frontend iframe)
- OAuth individual provider flows (catalog exists, flows not wired)
- Credential vault encryption (AES-256-GCM structure exists, uses BETTER_AUTH_SECRET as fallback)
- Interaction testing tool not in engine yet
- Fix My App / Import App capture tools not in engine yet
- Vision tool stubs not implemented
- Stripe billing reconfiguration (old tiers → credit-based)
- Mobile responsive optimization

### Critical Reminders
- The engine in `src/` is UNTOUCHABLE without explicit permission
- Node 22 required (see `.nvmrc`) — Node 24 causes Vite ESM deadlock
- Server uses Express 4 (not 5) — wildcard routes use `/*` not `/*splat`
- Engine import is LAZY in execute.ts — do not make it static or server startup blocks
- Design_References.md is the ONLY source of allowed UI dependencies
- Every UI element must have depth, realistic shadows — no flat CSS
- No lucide-react, no emojis, no icon libraries — custom SDF/3D only
- AUTH_SPEC.md is the immutable auth contract — read it before touching auth
- `@types/*` and `typescript` must be in server `dependencies` (not devDeps) for Vercel builds
- Server TypeScript must NOT import engine paths directly — use inline types + opaque dynamic import
- Modal image needs `tsx` installed locally in `/app` (not just globally)
- Client uses React 19 + `@react-three/fiber@9` + `@react-three/drei@10.7.7` (all React 19 native)

---

## Continuous Learning Engine (Component 28)

The learning engine makes every build smarter than the last. It extracts learnings from completed builds, stores them in a global experience memory, retrieves relevant experience at build time, and strengthens pathways that produce good outcomes.

### Data Flow

```
Build Starts → ExperienceRetriever queries global memory → writes experience Brain nodes
     ↓
Agents reason with experience nodes (advisory, not prescriptive)
     ↓
Build Completes → ExperienceExtractor sends Brain data to LLM for reflection
     ↓
LLM extracts structured learnings → GlobalMemoryService.writeExperience()
     ↓
ExperienceReinforcer evaluates build outcome → strengthens/weakens used experiences
     ↓
ExperienceMetrics emits observability data via SSE
```

### Key Files

| File | Purpose |
|------|---------|
| `src/brain/global-memory.ts` | Qdrant multi-vector collection (`kriptik_experience`) with 4 named vectors (semantic, domain, outcome, user_intent). Spreading activation queries with convergence scoring. |
| `src/brain/experience-extractor.ts` | Post-build LLM reflection using cost-effective model (Sonnet). Extracts pattern successes, failures, recovery patterns, user preferences, tool effectiveness, design decisions, integration insights. |
| `src/brain/experience-retriever.ts` | Build-start experience recall. Multi-signal query, diversification, writes as `experience` type Brain nodes. Runs BEFORE first agent reasoning iteration. |
| `src/brain/experience-reinforcer.ts` | Pathway strengthening/weakening based on build outcomes. Successful builds reinforce used experiences (diminishing returns). Failed builds weaken them (never to zero). Periodic decay every 10 builds. |
| `src/brain/experience-tracker.ts` | Monitors agent-experience interactions during builds. Tracks consulting, following, and diverging from experience nodes. |
| `src/brain/experience-metrics.ts` | Observability: strength distribution, domain coverage, model readiness assessment, build quality trends. |

### Experience Node Schema

Each experience has 4 embedding dimensions in Qdrant (384-dim each):
- `semantic` — general meaning
- `domain` — technical domain (frameworks, integrations)
- `outcome` — success/failure/recovery context
- `user_intent` — what the user was trying to accomplish

Convergence scoring: results appearing across more dimensions score dramatically higher.

Strength formula: `convergenceScore = (dimensionsHit / totalSearched) × avgSimilarity × strengthWeight`
Where `strengthWeight = strength × (1 + log(reinforcements + 1)) / (1 + log(contradictions + 1))`

### What NOT to Do

- **Do not make the learning engine mechanical.** The LLM decides what to learn, not hardcoded rules.
- **Do not force agents to follow experience.** Experience is advisory knowledge, not commands.
- **Do not hardcode what constitutes a "good" or "bad" learning.** The LLM evaluates significance.
- **Do not make experience retrieval blocking if it fails.** All experience operations are wrapped in try/catch.
- **Do not modify the reinforcement formulas without understanding the math.** Diminishing returns on reinforcement and never-zero weakening are intentional.

### SSE Event Types Added

- `experience_extracted` — emitted after post-build extraction with learning count
- `experience_metrics` — emitted at build start and after reinforcement with observability data

### Session Continuity

Use `scripts/session-continuity.sh` to save state before context degradation:
```bash
bash scripts/session-continuity.sh "Phase N" "Summary of what was done"
```
Then commit, push, and start a new session. Resume by reading CLAUDE.md, docs/INTEGRATION_MAP.md, and /tmp/kriptik-session-handoff.md.
