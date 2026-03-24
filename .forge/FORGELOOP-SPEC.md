# ForgeLoop Build System — Reference Spec
# Version 2.0 — 2026-03-24

> ForgeLoop is a fully autonomous development system built on Claude Code.
> It is Logan's personal build tool. It is NOT part of KripTik.
> It will be used to build KripTik and any other project Logan works on.

---

## What ForgeLoop Is

ForgeLoop is a **standalone, project-agnostic, autonomous development system** that
wraps Claude Code with persistent memory, drift prevention, and real-environment
verification. It produces production code that deploys to Vercel (or wherever).

**ForgeLoop is NOT:**
- Part of KripTik's product architecture
- The build engine inside KripTik that builds user apps
- Something that can be resold (uses Claude Code)
- Tied to any specific project

**ForgeLoop IS:**
- Logan's personal development tool, used from his Mac
- Permanent infrastructure that lives in `.forge/` inside any project repo
- Completely removable — deleting `.forge/` has zero effect on the project
- Reusable across any project (install `.forge/`, select directory, build)

## Separation from KripTik (NON-NEGOTIABLE)

ForgeLoop and KripTik are completely independent systems that happen to share a repo.

- **ForgeLoop's tooling** (`.forge/` directory) = dev infrastructure, never runs in production
- **ForgeLoop's Qdrant** = local instance on port 6334, collection `forgeloop_dev_codebase`,
  stored at `~/.forgeloop/` (OUTSIDE any project). Indexes project source code for dev queries.
- **KripTik's Qdrant** = Qdrant Cloud, product collections like `kriptik_experience`.
  Indexes user app data during KripTik builds. ForgeLoop NEVER touches these.
- **Code ForgeLoop writes** (in `src/`, `server/`, `client/`) = production code that deploys
- **Zero imports** from `src/brain/` into `.forge/`. Zero shared credentials. Zero entanglement.

If you delete `.forge/` from any project, the project runs identically.

---

## Architecture: 7-Phase Autonomous Pipeline

ForgeLoop's pipeline has 7 phases. Phases 1-2 happen with the Supervisor (brainstorm + plan).
Phases 3-7 are fully autonomous — the Executor implements, builds in a real dev server
environment, monitors, browser-tests, fixes, and retests WITHOUT human intervention.

**ALL agents in ForgeLoop are Claude Code Agent Teams teammates** — intelligent, thinking,
reasoning agents. NOT dumb subagents. The entire system uses Agent Teams.

```
Phase 1: BRAINSTORM — Supervisor captures reasoning in real-time to brainstorm-capture.md
Phase 2: PLAN — Select from capture doc, synthesize into plan with acceptance criteria
Phase 3: IMPLEMENT — Claude Code Agent Teams execute with constraints, hooks, memory, MCP
Phase 4: MONITOR — Agent Teams teammates watch build logs + runtime logs + quality
Phase 5: VERIFY — 6-phase deep verification (placeholders, spec, integration, acceptance,
                   behavioral, environment)
Phase 6: BROWSER TEST — vercel dev localhost, Claude vision + computer use tests actual app,
                        concurrent runtime log monitoring by teammate
Phase 7: FIX & RETEST — Context-aware fixing (reads plan/constraints BEFORE fixing),
                        redeploy to dev, retest in browser
```

**Critical: Phases 4-7 run AFTER EACH implementation phase, not just at the end.**
The per-phase loop is:

```
For EACH phase in the plan:
  Implement code (lead agent works, can spawn teammates)
  → Build in vercel dev (real environment, not sandbox)
  → Teammate uses browser + vision to test what was just implemented
  → Another teammate monitors runtime logs concurrently
  → If issues found → teammate reads full context (plan, spec, constraints,
    artifacts) and makes fixes IN ACCORDANCE with the spec
  → After fix → redeploy to vercel dev → retest in browser
  → ONLY when browser-verified → commit → move to next phase
```

This is the same grind loop Claude Code already does (build → check → fix → repeat)
but with a real dev server environment and browser verification added.

---

## Layer Architecture

### Layer 0: Memory Layer (persistent files that survive everything)
| File | Purpose | Updated By |
|------|---------|------------|
| `progress.md` | Current state, next task, session history | Executor (every task) |
| `DECISIONS.md` | Why things are the way they are | Supervisor (review) |
| `brainstorm-capture.md` | Real-time reasoning from brainstorms | Supervisor (during) |
| `state-snapshots/` | Codebase state at key decisions (git-linked) | create-snapshot.sh |
| Architecture Map MCP | Qdrant-backed live codebase queries | post-task reindex |

### Layer 1: Supervisor (brainstorming + planning + review, NEVER codes)
- Long-running Claude session (claude.ai or persistent Claude Code)
- Maintains brainstorm-capture.md in real-time
- Generates decomposed plans with acceptance criteria
- Reviews output after execution, catches drift
- Updates DECISIONS.md, triggers architecture reindex

### Layer 2: Plan Compiler (`/forge-compile`)
Generates ALL drift-prevention artifacts from a plan in one command:
- constraints.md — architecture rules, file ownership, forbidden actions
- acceptance-criteria.md — machine-checkable done conditions per task
- interface-contracts.md — exact function signatures
- integration-map.md — what connects to what
- Per-task executor prompts in plans/prompts/task-N.md
- progress.md bootstrap for the new plan

### Layer 3: Executor (Claude Code + Agent Teams + the full per-phase pipeline)

The Executor is Claude Code with Agent Teams enabled. The LEAD agent is the session itself.
It reads the plan, implements code, and spawns TEAMMATES (not subagents) for monitoring,
browser testing, and fixing. Every agent in the system is intelligent and reasoning.

**Agent Teams Configuration:**

The LEAD agent:
- Reads progress.md, plan, constraints, contracts at session start
- Implements code for each phase
- Spawns teammates for concurrent work
- Picks up failed tasks from teammates
- Decides when to move to the next phase

Teammates spawned by the lead (ALL are Agent Teams teammates, NOT subagents):

**Build/Runtime Monitor Teammate:**
- Intelligent agent that watches build output AND runtime logs
- Understands what the errors mean in context of the plan
- Can correlate a runtime error with which phase/task likely caused it
- Logs findings to `.forge/logs/build-errors.log` and `.forge/logs/runtime-errors.log`
- Marks CRITICAL vs WARNING based on reasoning about impact

**Browser Test Teammate:**
- Uses Claude Code's vision + computer use + browser control
- Navigates to what was just implemented in vercel dev (localhost)
- Clicks buttons, fills forms, tests auth flows, interacts with features
- Takes screenshots and compares visual output against plan/spec
- Cross-references with runtime logs from the monitor teammate
- Detects silent failures: 200 with error body, stale state, auth expiry

**Context-Aware Fix Teammate:**
- Spawned ONLY when browser test or runtime monitor finds issues
- BEFORE touching code, reads: active-plan.md, constraints.md,
  interface-contracts.md, integration-map.md, progress.md
- Uses the full real-time context from brainstorming artifacts
- Makes fixes IN ACCORDANCE with the spec — not random fixes
- Saves, redeploys vercel dev, then the browser test teammate re-verifies
- Maximum 3 fix cycles per phase. After 3: writes BLOCKER to progress.md

### Layer 4: Deterministic Enforcement (Hooks — zero AI judgment)

Hooks run automatically. They don't think. They enforce.

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | Session begins | Forces memory loading + version check |
| `pre-compact.sh` | Before compaction | Saves critical state to progress.md |
| `post-edit.sh` | Every file edit | Typecheck + lint (deterministic) |
| `post-task.sh` | Claude stops | Progress reminder + criteria check + reindex |
| `check-all-criteria.sh` | Ralph loop | Runs all acceptance checks |
| `create-snapshot.sh` | On demand | Git-linked codebase state snapshot |
| `version-check.sh` | Session start | Detects Claude Code version changes |

### Layer 5: Review Loop (Supervisor validates, feeds corrections back)
- `/forge-review` compares output against plan
- Checks for drift, constraint violations, missing features
- Updates DECISIONS.md with any new decisions
- Archives completed plans
- If drift found: generates correction prompts for the Executor

---

## Dev Server Environment: vercel dev

ForgeLoop builds in a REAL environment, not a blind sandbox.

`vercel dev` provides:
- Production-like localhost (emulates Vercel deployment environment)
- Auto-syncs environment variables from Vercel Cloud
- Serverless function emulation
- Hot reload on file changes
- Full Node.js runtime with all project dependencies

**How it works in the per-phase loop:**
1. Lead agent starts `vercel dev --listen 3000` at session start
2. After implementing code, lead agent waits for hot reload
3. Browser test teammate navigates to localhost:3000
4. Monitor teammate reads the vercel dev output stream
5. If a fix is made, the file save triggers hot reload automatically
6. Browser test teammate refreshes and re-verifies

**Environment variables:** `vercel dev` pulls env vars from Vercel Cloud.
For local-only vars, `.env.local` is used (gitignored).
`VERCEL_ENV=development` is set automatically.

**Auth:** Logan must log in manually for auth-dependent testing.
The browser test teammate waits for Logan to complete login before proceeding.

**Production-only features:** External webhooks, real payment flows, third-party
OAuth callbacks that require real URLs — these are marked "SKIP — requires production"
in the browser test report. Everything else is tested locally.

---

## Verification Protocol (6 Phases)

After each implementation phase AND after all phases complete:

1. **Placeholder Scan** — grep for TODO, FIXME, STUB, mock, dummy, fake, placeholder,
   empty function bodies, hardcoded values, commented-out blocks, `any` types
2. **Spec Completeness** — every function/interface/type/endpoint in the plan exists
   with a real implementation (not empty/stub)
3. **Integration Verification** — all connections from integration-map.md are actually
   wired (imported AND called, not just imported)
4. **Acceptance Criteria** — run every command from acceptance-criteria.md
5. **Behavioral Verification** — code review against plan intent: does the code path
   actually produce the described behavior? Not just "does it compile."
6. **Environment Check** — no hardcoded URLs, secrets, file paths

---

## Browser Testing Protocol

The browser test teammate (Agent Teams teammate, NOT subagent) does:

1. **Smoke test** — page loads, no console errors, no failed network requests
2. **Feature testing** — for each feature this phase implemented:
   - Navigate to it
   - Interact with it (click, fill, submit)
   - Screenshot and compare against plan expectations
   - Check runtime logs for backend errors during interaction
3. **Silent failure detection:**
   - Auth silently expired (logged-out state when should be logged in)
   - API returns 200 with error body
   - Data not persisting after refresh
   - SSE not streaming
   - Stale state from cache not invalidated
   - Race conditions from fast clicks
   - Missing error feedback (action fails, UI shows nothing)
4. **Cross-reference** — compare visual observations with runtime log entries

---

## Context-Aware Fixing Protocol

When the browser test teammate or monitor teammate finds issues, a fix teammate
is spawned. This teammate is an Agent Teams teammate with full reasoning capability.

**Pre-fix (MANDATORY):**
1. Read the failure report
2. Read active-plan.md, constraints.md, interface-contracts.md, integration-map.md
3. Diagnose root cause WITH plan context
4. Write diagnosis to `.forge/logs/fix-diagnosis.md`

**Fix rules:**
- Minimal change — fix the specific failure, nothing else
- Respect file ownership from constraints.md
- Respect interface contracts — don't change signatures
- No new placeholders, TODO, or swallowed errors
- Log each fix to `.forge/logs/fix-log.md`

**Anti-patterns (NEVER do):**
- Fix by commenting out code
- Fix by adding try-catch that swallows errors
- Fix by weakening types (string → any)
- Fix by duplicating code instead of importing
- Fix a test by changing the test to match wrong behavior
- Fix by removing the failing feature

**After fix:** Save file → vercel dev hot-reloads → browser test teammate
refreshes and re-verifies. Loop up to 3 cycles. After 3: BLOCKER.

---

## Done Gate

Implementation is ONLY done when:
- [ ] Every phase individually browser-tested and passing
- [ ] Final deep verification passes all 6 verification phases
- [ ] Final full browser walkthrough of ALL features in sequence passes
- [ ] Zero unresolved CRITICAL entries in runtime-errors.log
- [ ] Zero placeholders, stubs, TODO, mock data in plan scope
- [ ] progress.md says "PLAN VERIFIED AND BROWSER-TESTED"

---

## Files Inventory

### Skills (`.forge/skills/*/SKILL.md`) — 8 total
| Skill | Lines | Purpose |
|-------|-------|---------|
| `brainstorm-capture` | 51 | Real-time reasoning capture during brainstorms |
| `plan-compiler` | 79 | Generates all 7 drift-prevention artifact types |
| `session-bootstrap` | 46 | Forces memory loading at session start |
| `forge-implement` | 255 | **Full autonomous pipeline** (per-phase loop with browser testing) |
| `forge-monitor` | 68 | 3 monitoring streams (build, runtime, quality) |
| `forge-verify` | 151 | 6 verification phases |
| `forge-browser-test` | 156 | Dev server + vision + computer use + runtime log cross-reference |
| `forge-fix` | 126 | Context-aware fixing with anti-pattern rules, max 3 cycles |

### Commands (`.claude/commands/forge-*.md`) — 10 total
| Command | Purpose |
|---------|---------|
| `/forge-brainstorm` | Start brainstorm with real-time capture |
| `/forge-compile` | Generate all drift-prevention artifacts from plan |
| `/forge-bootstrap` | Force memory loading at session start |
| `/forge-implement` | **Full autonomous pipeline** (all 7 phases chain automatically) |
| `/forge-monitor` | Start concurrent monitoring (if running separately) |
| `/forge-verify` | Deep 6-phase verification |
| `/forge-browser-test` | Browser testing with vision + computer use |
| `/forge-fix` | Context-aware fixing |
| `/forge-review` | Post-execution review against plan |
| `/forge-version-check` | Detect Claude Code updates, suggest ForgeLoop adaptations |

### Hooks (`.forge/hooks/*.sh`) — 7 total
| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | Session begins | Forces memory loading + version check |
| `pre-compact.sh` | Before compaction | Saves critical state |
| `post-edit.sh` | Every file edit | Typecheck + lint |
| `post-task.sh` | Claude stops | Progress + criteria check + reindex trigger |
| `check-all-criteria.sh` | Ralph loop | Runs all acceptance checks |
| `create-snapshot.sh` | On demand | Git-linked state snapshot |
| `version-check.sh` | Session start | Detects Claude Code version changes |

### Architecture Map MCP (`.forge/mcp/`) — BUILT
| File | Purpose |
|------|---------|
| `architecture-server.js` (502 lines) | Qdrant-backed MCP with 6 tools |
| `reindex-cli.js` (160 lines) | Standalone reindex CLI |
| `reindex.sh` | Shell wrapper (loads .env, nvm) |
| `start-mcp.sh` | MCP launcher (loads .env, nvm) |
| `package.json` | Dependencies installed (98 packages) |

MCP tools: search_architecture, get_interface, check_integration,
query_endpoints, query_dependencies, update_map

### Local Infrastructure (`~/.forgeloop/` — OUTSIDE any project)
| Item | Purpose |
|------|---------|
| `qdrant-forgeloop` binary | Qdrant v1.17.0 arm64, port 6334 |
| `forgeloop-qdrant.sh` | Start/stop/status script |
| `qdrant-config.yaml` | Port 6334, storage path, telemetry off |
| `qdrant-storage/` | Vector data (per-project collections) |

### Other Files
| File | Purpose |
|------|---------|
| `FORGELOOP-SPEC.md` | THIS FILE — authoritative reference |
| `supervisor-prompt.md` | 4-mode Supervisor system prompt |
| `ralph-loop.sh` | Autonomous execution wrapper |
| `.env` | Local Qdrant + HF credentials (gitignored) |
| `logs/.gitignore` | Log directory |
| `memory/progress.md` | Heartbeat — current state |
| `memory/DECISIONS.md` | Decision log (D-001 through D-007) |
| `memory/brainstorm-capture.md` | ForgeLoop UI webapp concept captured |
| `drift-prevention/` | Artifacts generated by plan compiler |
| `plans/` | Active plan + prompts + archive |

---

## Success Criteria

ForgeLoop is working when:

1. Logan brainstorms for 2 hours, says "plan that," gets a complete plan
   with zero information loss from the brainstorm
2. `/forge-compile` generates all drift-prevention artifacts in one command
3. `/forge-implement` runs the full autonomous pipeline:
   - Implements code per phase
   - Builds in vercel dev (real environment)
   - Agent Teams teammates monitor logs, test browser, fix issues
   - Each phase is browser-verified before moving forward
   - Final walkthrough confirms everything works end-to-end
4. A killed session can resume via progress.md with zero re-explanation
5. Architecture Map MCP returns accurate codebase queries mid-session
6. The full cycle completes without Logan writing or reading code
7. ForgeLoop works on ANY project, not just KripTik

---

## Known Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Claude Code doesn't read memory at start | session-start hook forces the read |
| Compaction loses reasoning | pre-compact hook writes state before compaction |
| Architecture map goes stale | post-task hook triggers background reindex |
| Executor ignores constraints | Hooks enforce deterministic rules |
| Plan compiler generates bad artifacts | Supervisor reviews before execution |
| Token costs explode with Agent Teams | Limit teammates; Sonnet for simple, Opus for complex |
| Rate limits during parallel execution | Route simple tasks to Sonnet/Haiku |
| vercel dev doesn't start | Fall back to npm run dev |
| Auth-dependent tests fail without login | Browser test teammate waits for Logan |
| Fix cycle exceeds 3 attempts | BLOCKER written, Supervisor takes over |
| ForgeLoop Qdrant mixed with product Qdrant | Separate: local port 6334 vs Qdrant Cloud |

---

## Future: ForgeLoop UI Webapp

Concept captured in `.forge/memory/brainstorm-capture.md` (Threads 1-6).

Key decisions made:
- Web app on Vercel (not desktop) — accessible from anywhere
- Project-agnostic — select any repo, install .forge/ if needed
- Killer feature: text selection with reasoning context from brainstorm-capture.md
- Build UI AFTER validating ForgeLoop workflow in Cursor first

Pending decisions: where Claude Code runs remotely, auth model, easy deploy options.

---

*This document is the authoritative ForgeLoop reference. Version 2.0.*
*Decisions log: `.forge/memory/DECISIONS.md` (D-001 through D-007)*
*Full design rationale: original Supervisor chat sessions (2026-03-24)*
