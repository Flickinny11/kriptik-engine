# KRIPTIK ENGINE — PROJECT RULES

---

# ForgeLoop Build System

> **THIS SECTION IS THE HIGHEST PRIORITY.** Read this before anything else.
> Full spec: `.forge/FORGELOOP-SPEC.md`

## What Is ForgeLoop

ForgeLoop is the development pipeline for building KripTik. It is NOT the build engine inside KripTik that builds user apps — it is the system that builds the builder. All ForgeLoop files live in `.forge/`.

Pipeline: **Brainstorm → Plan → Compile → Execute → Review**

## ⛔ FORGE / KRIPTIK PRODUCT BOUNDARY (NON-NEGOTIABLE)

ForgeLoop is **permanent development infrastructure** that lives in this repo alongside KripTik's product code. It is NOT scaffolding. Logan will use ForgeLoop for all current and future KripTik development.

**What ForgeLoop is:**
- The Claude Code-based build system Logan uses to develop KripTik (`.forge/` directory)
- It produces PRODUCTION CODE — the code ForgeLoop writes in `src/`, `server/`, `client/` deploys to Vercel and serves real users
- It stays in the repo permanently and is used for every enhancement, update, and new feature
- It cannot be resold (uses Claude Code), but that doesn't matter — it's Logan's dev tool, not a product feature

**What KripTik's build engine is (lives in `src/`):**
- The engine inside KripTik that builds USER apps (uses Opus 4.6 via API, not Claude Code)
- This IS the product. This is what users interact with. This ships and runs in production.

**The critical DATA boundary:**
- ForgeLoop's MCP uses Qdrant collection `forgeloop_dev_codebase` — indexes KripTik's OWN source code so Claude Code can query architecture during development
- KripTik's Brain uses collections like `kriptik_experience` — indexes USER APP data during builds
- **NEVER mix these.** If the product engine queries Qdrant during a user build, it must NEVER hit `forgeloop_dev_codebase`. Users would get KripTik source code architecture instead of their app's context.
- NEVER import from `src/brain/` into `.forge/`. NEVER let ForgeLoop write to product collections.

**If you are making changes and are unsure whether something belongs in ForgeLoop's tooling or in KripTik's product code, STOP and ask.**


## CRITICAL: Memory Protocol

**At the start of EVERY session, read these files first:**
1. `.forge/memory/progress.md` — current state, what happened before, what you need to know
2. `.forge/drift-prevention/constraints.md` — rules you MUST follow (if a plan is active)
3. `.forge/drift-prevention/acceptance-criteria.md` — how your work will be verified

**Before stopping for ANY reason, update:**
1. `.forge/memory/progress.md` — mark completed tasks, note decisions, update context for next session

**If compaction is about to happen:**
1. Write all current reasoning and state to `.forge/memory/progress.md` IMMEDIATELY
2. After compaction, re-read progress.md, constraints.md, and acceptance-criteria.md

## ForgeLoop Commands

- `/forge-brainstorm` — Start a brainstorming session with real-time capture
- `/forge-compile` — Generate all drift-prevention artifacts from active plan
- `/forge-bootstrap` — Force memory loading (runs automatically via hook)
- `/forge-implement` — Execute tasks from the active plan with full verification

## ForgeLoop Rules (NON-NEGOTIABLE)

1. **Never skip the bootstrap.** Read progress.md before any work.
2. **Never modify files outside task scope.** Check constraints.md for file ownership.
3. **Never skip acceptance criteria.** Run ALL checks before marking a task complete.
4. **Always update progress.md.** Even if stopping due to context limits or blockers.
5. **Decisions go in DECISIONS.md.** If you make an architectural choice, log it with reasoning.
6. **Brainstorm reasoning goes in brainstorm-capture.md.** Write it in real-time, not after the fact.

---

## WHAT THIS PROJECT IS

KripTik AI is an AI app builder that constructs complete, production-ready applications from a single user prompt. The codebase has three main parts:
- **`src/`** — The build engine (CURRENTLY BEING REPLACED — see note below)
- **`server/`** — Express.js backend with auth, project CRUD, OAuth, SSE streaming
- **`client/`** — React frontend with streaming chat UI, dashboard, dependency management

---

## ⚠️ ENGINE REPLACEMENT IN PROGRESS

> **The single-agent Lead Agent engine described in this section is the OLD system and is being replaced.**
> The Brain, server, client, design system, and dependency management sections below remain accurate.
> The agent architecture (single Lead Agent + spawned specialists with 11 prohibitions) is DEPRECATED.
> The new engine architecture will be designed and built using ForgeLoop.
> **Do NOT use the 11 prohibitions below as guidance for new engine work.**
> **Do NOT treat `src/` as untouchable.** It will be substantially modified.
> **The `scripts/check-mechanical.sh` script enforces the old rules and may need updating.**

### Old Engine Architecture (src/) — DEPRECATED, BEING REPLACED

The current engine in `src/` is a ~6,200 line TypeScript library built around a single Lead Agent
that reasons about the Brain (SQLite knowledge graph) and spawns specialists. Key components that
WILL BE PRESERVED and adapted:
- **Brain (`src/brain/`)** — SQLite knowledge graph + Qdrant embeddings. This stays.
- **Tools (`src/tools/`)** — Sandbox, verify, analyze, design, vision. These stay.
- **Providers (`src/providers/`)** — Multi-LLM routing. This stays.
- **Bridge (`src/bridge/`)** — SSE streaming. This stays.
- **Config (`src/config/`)** — Settings. This stays.
- **Types (`src/types/`)** — Shared types. Will be extended.

Components being REPLACED:
- **Agent runtime (`src/agents/runtime.ts`)** — Single Lead Agent + specialist spawning
- **Agent prompts (`src/agents/prompts/`)** — Lead and specialist system prompts
- **Engine entry (`src/engine.ts`)** — initEngine() orchestration

### Three Workflows, One Engine (STILL VALID)
- **Builder**: User enters prompt → Brain seeded with intent → agents build the app
- **Fix My App**: User imports broken app context → Brain seeded with errors/intent → agents rebuild
- **Import App**: User imports codebase → Brain seeded with analysis → agents fill gaps

The engine doesn't know which workflow triggered it. It reads the Brain and builds toward satisfying intent nodes. This pattern remains regardless of which agent architecture drives it.

### Tools Available to Agents (STILL VALID)
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

## THE SERVER (`server/`) — STILL ACCURATE

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
│   └── ownership.ts     Project ownership verification
├── oauth/               OAuth catalog (178 providers), flow orchestration, PKCE, crypto
├── mcp/                 MCP OAuth 2.1 client — discovery, registration, tokens, tools
├── vault/               Encrypted credential storage
├── services/            Service registry (38 services), categories, custom servers
├── browser-agent/       Automated signup for non-MCP services
├── auth.ts              Better Auth config
├── db.ts                PostgreSQL connection via Drizzle
├── schema.ts            DB schema (users, sessions, projects, build_events, credentials, mcp tables)
└── index.ts             Express server setup
```

### Key Design Decisions
- **Engine is lazy-loaded**: `execute.ts` uses dynamic import at build start, not at module load
- **Project isolation**: Every query scoped by `ownerId` AND `projectId`
- **Build events are append-only**: Once written, never modified
- **OAuth catalog is static**: 178 providers defined in code

---

## THE CLIENT (`client/`) — STILL ACCURATE

React + Vite + Three.js + GSAP + Tailwind + Radix UI.

```
client/src/
├── pages/              LoginPage, SignupPage, Dashboard, Builder, DependenciesPage, etc.
├── components/
│   ├── builder/        AgentStreamView, UnifiedFeedView, SwimLaneView, AgentResponseBox,
│                       AgentBadge, AgentIconSDF, BrainOrb, BrainConnector,
│                       TypeAnimatedText, WarpBackground, QuestionTile, CorrectionPrompt
│   ├── dependencies/   ConnectButton, ConnectionStatusIndicator, FallbackApprovalDialog,
│                       TierSelector, EmailMcpBanner
│   ├── ui/             Radix-based primitives, ProjectCard3D, GenerateButton3D
│   ├── shaders/        GLSL fragment/vertex shaders
│   └── layouts/        Page layout wrappers
├── hooks/              useEngineEvents, useAgentTracker, useDependencyConnect
├── store/              useUserStore, useProjectStore, useDependencyStore (Zustand)
├── lib/                api-client, api-config, auth-client, utils
├── App.tsx             React Router setup
├── main.tsx            Entry point
└── index.css           Tailwind + custom animations
```

### Key UI Concepts
- **Streaming Chat**: Unified Feed (chronological) and Swim Lanes (per-agent columns)
- **Agent Identity**: Colors and icons assigned dynamically at spawn time
- **Correction Prompt**: User clicks response box → enters correction → writes to Brain
- **Question Tiles**: Agents ask about dependency credentials during builds

---

## DESIGN SYSTEM

**READ `Design_References.md` BEFORE WRITING ANY UI CODE.**

- **NO lucide-react icons, NO emojis** — custom SDF/3D icons only
- **NO flat CSS cards** — everything has depth, realistic shadows, photorealistic textures
- **NO glassmorphism, NO particles** — use techniques in Design_References.md
- Dependencies: curtains.js, GSAP + ScrollTrigger, OGL, SDF ray marching, WebGL fluid simulation
- All animations 60fps minimum. Virtualize long lists.

---

## TECH STACK

| Layer | Technology |
|-------|-----------|
| Engine | Node.js + TypeScript (strict), SQLite (better-sqlite3 + Drizzle), Qdrant, HuggingFace embeddings |
| AI | Anthropic SDK (Opus 4.6 primary), multi-provider via ProviderRouter |
| Server | Express.js, Better Auth, Drizzle ORM, PostgreSQL (Supabase) |
| Client | React 19, Vite, Three.js, GSAP, curtains.js, OGL, Tailwind, Radix UI, Zustand |
| Sandbox | Local filesystem (dev), Modal containers (production) |
| Streaming | SSE (server-sent events) |
| Node Version | 22 LTS (see `.nvmrc`) |

---

## DEPLOYMENT INFRASTRUCTURE

- **Frontend**: Vercel → kriptik.app (Vite, Node 22)
- **Backend**: Vercel → api.kriptik.app (Express serverless)
- **Modal**: `kriptik-engine` app (Node 22 + Playwright, 8GB RAM, 24hr timeout)
- **Supabase**: PostgreSQL with 8+ tables
- **GitHub**: `Flickinny11/kriptik-engine`

### Build Execution Dual Path
- **Modal path** (`MODAL_ENABLED=true`): Calls Modal HTTP endpoint with callbackUrl for streaming
- **Local path** (default): Lazy-imports engine from `src/`, runs in-process

---

## DEPENDENCY MANAGEMENT SYSTEM — STILL ACCURATE

Full details in original documentation. Key points:
- 38 real developer services across 13 categories
- MCP OAuth 2.1 + PKCE for ~80% of services
- Browser agent fallback for non-MCP services
- Per-project dependency management with instance models
- Key files: `server/src/mcp/`, `server/src/services/`, `server/src/browser-agent/`, `client/src/components/dependencies/`

---

## CONTINUOUS LEARNING ENGINE (Component 28) — STILL ACCURATE

The learning engine makes every build smarter. Key files in `src/brain/`:
- `global-memory.ts` — Qdrant multi-vector collection with 4 named vectors
- `experience-extractor.ts` — Post-build LLM reflection
- `experience-retriever.ts` — Build-start experience recall
- `experience-reinforcer.ts` — Pathway strengthening/weakening
- `experience-tracker.ts` — Agent-experience interaction monitoring
- `experience-metrics.ts` — Observability and quality trends

### Rules for Learning Engine
- **Do not make it mechanical.** The LLM decides what to learn, not hardcoded rules.
- **Experience is advisory, not prescriptive.** Agents reason WITH experience, not follow it.
- **Do not modify reinforcement formulas without understanding the math.**

---

## CRITICAL REMINDERS

- Node 22 required (see `.nvmrc`) — Node 24 causes Vite ESM deadlock
- Server uses Express 4 (not 5) — wildcard routes use `/*` not `/*splat`
- Engine import is LAZY in execute.ts — do not make it static
- Design_References.md is the ONLY source of allowed UI dependencies
- No lucide-react, no emojis, no icon libraries — custom SDF/3D only
- AUTH_SPEC.md is the immutable auth contract — read before touching auth
- `@types/*` and `typescript` must be in server `dependencies` (not devDeps) for Vercel builds
- Server TypeScript must NOT import engine paths directly — use dynamic import
- Client uses React 19 + `@react-three/fiber@9` + `@react-three/drei@10.7.7`

---

## ⚠️ OLD ARTIFACTS THAT MAY CONFLICT WITH FORGELOOP

The following artifacts were created for the old single-agent engine and may steer
future sessions toward the deprecated architecture. Be aware of them:

- **`scripts/check-mechanical.sh`** — Enforces the old 11 prohibitions via grep patterns.
  The new engine architecture MAY use patterns this script blocks (e.g., orchestration
  classes, task lists, agent role definitions). This script runs on pre-commit via Husky.
  **It may need to be updated or disabled when building the new engine.**

- **`scripts/check-modularity.sh`** — Enforces engine file protection and import boundaries.
  Some of these rules are still valid (import boundaries), but the "engine protection"
  rules that block modifications to `src/` are deprecated.

- **`.husky/pre-commit`** — Runs both scripts above. May block valid commits for new engine work.

- **`scripts/session-continuity.sh`** — Old session handoff mechanism.
  **REPLACED by ForgeLoop's memory harness** (progress.md + hooks). Do not use.

- **`.ralphex/`** — Old Ralph loop progress tracking. **REPLACED by `.forge/`**. Do not use.

- **120+ subdirectory CLAUDE.md files** — Most are auto-generated `claude-mem` activity logs,
  not steering content. A few in `src/agents/` and `src/brain/` may reference the old architecture.
  These are low-priority for cleanup — ForgeLoop's constraints.md overrides them during execution.

---

## MULTI-USER / MULTI-PROJECT ISOLATION — STILL ACCURATE

This system is designed for viral traffic. Isolation is absolute:
- Every query scoped by `ownerId` AND `projectId`
- Every project has its own Brain SQLite file, sandbox directory, Modal Volume
- Build events stored per-project in PostgreSQL
- Credentials per-user, per-project with AES-256-GCM encryption
- SSE streams are project-scoped
