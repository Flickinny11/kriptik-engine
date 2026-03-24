# ForgeLoop Progress

## Current Plan
- Plan ID: forgeloop-setup
- Plan file: N/A (initial system setup — building ForgeLoop itself)
- Started: 2026-03-24
- Last session: Initial setup via Claude Supervisor (claude.ai)

## Current State
- Last completed task: Sprint 0 — Full foundation + CLAUDE.md restructure + all scaffolding
- Next task: Sprint 1 — Memory harness testing (verify multi-session continuity)
- Active blockers: None
- Last git commit: (pending — all ForgeLoop files need initial commit)

## What The Next Session Needs To Know

### ForgeLoop is the build system for building KripTik — NOT the engine inside KripTik
- ForgeLoop wraps Claude Code with memory, drift prevention, and spec-driven execution
- The internal KripTik build engine (for building user apps) will be built USING ForgeLoop
- These are two different systems. Do not confuse them.

### What's Installed (Sprint 0 — COMPLETE)

**Directory structure:** .forge/ with memory/, plans/, drift-prevention/, skills/, hooks/, mcp/, logs/

**Memory files:**
- progress.md (this file) — heartbeat, updated every task
- DECISIONS.md — 5 decisions logged (D-001 through D-005)
- brainstorm-capture.md — empty template, ready for first brainstorm

**Hooks (all wired in .claude/settings.local.json):**
- session-start.sh — forces memory loading (fires on session start)
- pre-compact.sh — saves state before compaction (fires on PreCompact)
- post-edit.sh — typecheck + lint (fires on every Edit/Write)
- post-task.sh — progress reminder + criteria check (fires on Stop)
- check-all-criteria.sh — runs all acceptance checks (used by Ralph loop)
- create-snapshot.sh — creates git-linked codebase state snapshot

**Skills (4):** brainstorm-capture, plan-compiler, session-bootstrap, forge-implement

**Slash Commands (5):**
- /forge-brainstorm — start brainstorm with real-time capture
- /forge-compile — generate all drift-prevention artifacts from plan
- /forge-bootstrap — force memory loading
- /forge-implement — execute tasks from active plan
- /forge-review — review completed execution against plan

**Ralph loop:** .forge/ralph-loop.sh — autonomous execution wrapper with safety limits

**Supervisor prompt:** .forge/supervisor-prompt.md — for long-running brainstorm sessions

**Agent Teams:** ENABLED via CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in settings

**Architecture Map MCP:** SCAFFOLD ONLY — .forge/mcp/ has server.js scaffold,
  reindex.sh scaffold, and package.json. Actual implementation is Sprint 3.

### CLAUDE.md Changes
- ForgeLoop section moved to TOP (highest priority, first thing read)
- Old "UNTOUCHABLE engine" language removed
- Old 11 prohibitions wrapped in DEPRECATION NOTICE
- Engine components split: KEEP (Brain, tools, providers, bridge) vs REPLACE (agents, engine.ts)
- Reduced from 627 lines / 46KB to 288 lines / 14KB
- Server, client, design system, dependency mgmt, learning engine sections preserved

### Old Steering Scripts Neutralized
- scripts/check-mechanical.sh — advisory only (exit 0 always), skippable
- scripts/check-modularity.sh — engine protection relaxed, cross-layer checks kept
- .husky/pre-commit — runs both (now non-blocking for engine work)

### What's NOT Built Yet (Sprints 1-6)
- Sprint 1: Memory harness TESTING (hooks exist, need to verify they work in practice)
- Sprint 2: Plan compiler TESTING (skill exists, need a real plan to test artifact generation)
- Sprint 3: Architecture Map MCP (scaffold only — needs full Qdrant implementation)
- Sprint 4: Brainstorm capture TESTING (skill exists, needs 30-min brainstorm test)
- Sprint 5: Full integration end-to-end test on a real KripTik feature
- Sprint 6: Ralph loop + Agent Teams automation stress test

### Old Artifacts Still Present (low priority cleanup)
- scripts/session-continuity.sh — REPLACED by ForgeLoop. Do not use.
- .ralphex/ — REPLACED by .forge/. Do not use.
- 120+ subdirectory CLAUDE.md files — Mostly claude-mem logs, not steering.

### KripTik Architecture Context
- Current engine in src/ is single Lead Agent system — BEING REPLACED
- Components being kept: Brain, Tools, Providers, Bridge, Config, Types
- Components being replaced: Agent runtime (src/agents/), Engine entry (src/engine.ts)
- Server (server/) and Client (client/) are stable
- New engine architecture NOT yet designed — that's what ForgeLoop brainstorm is for

## Sprint 0 Testing Checklist
- [ ] Open Claude Code, type /forge-bootstrap — verify progress.md displays
- [ ] Type /forge-brainstorm — verify brainstorm mode activates
- [ ] Edit a .ts file — verify post-edit hook fires typecheck
- [ ] Let Claude finish responding — verify post-task hook shows reminder
- [ ] git commit — verify check-mechanical.sh runs in advisory mode
- [ ] Kill session, start new one — verify progress.md carries state
- [ ] Run .forge/hooks/create-snapshot.sh — verify snapshot created

## Session History
| Session | Date | What Happened |
|---------|------|---------------|
| Supervisor (claude.ai) | 2026-03-24 | Full ForgeLoop design from research. Sprint 0 complete: directory structure, all hooks, all skills, all commands, ralph loop, supervisor prompt, /forge-review, state snapshots, CLAUDE.md restructure, old scripts neutralized, Agent Teams enabled, Architecture Map MCP scaffolded, full spec written. |
