# ForgeLoop Build System — Reference Spec

> Full spec with all details available in the Claude chat session dated 2026-03-24.
> This file is the quick-reference version for Claude Code sessions.

## What ForgeLoop Is

A structured pipeline: **Brainstorm → Plan → Compile → Execute → Review**
that prevents drift, maintains memory across sessions, and produces production-grade code.

## Architecture

```
Layer 0: MEMORY LAYER — .forge/memory/ (persistent files + Qdrant MCP)
Layer 1: SUPERVISOR — Long-running Claude session (brainstorm + review, never codes)
Layer 2: PLAN COMPILER — /forge-compile skill (generates all drift-prevention artifacts)
Layer 3: EXECUTOR — Claude Code + Agent Teams + Ralph Loop + Hooks + Skills
Layer 4: REVIEW — Supervisor validates output, updates memory layer
```

## Key Files

| File | Purpose | Updated By |
|------|---------|------------|
| `.forge/memory/progress.md` | Current state, next task, session history | Executor (every task) |
| `.forge/memory/DECISIONS.md` | Why things are the way they are | Supervisor (after review) |
| `.forge/memory/brainstorm-capture.md` | Real-time reasoning from brainstorms | Supervisor (during brainstorm) |
| `.forge/drift-prevention/constraints.md` | Architecture rules for current plan | Plan Compiler |
| `.forge/drift-prevention/acceptance-criteria.md` | Machine-checkable "done" conditions | Plan Compiler |
| `.forge/drift-prevention/interface-contracts.md` | Exact signatures to implement | Plan Compiler |
| `.forge/drift-prevention/integration-map.md` | What connects to what | Plan Compiler |
| `.forge/plans/active-plan.md` | Current implementation plan | Supervisor |
| `.forge/plans/prompts/task-N.md` | Per-task executor prompts | Plan Compiler |

## Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | Session begins | Forces memory loading |
| `pre-compact.sh` | Before compaction | Saves critical state |
| `post-edit.sh` | Every file edit | Typecheck + lint |
| `post-task.sh` | Claude stops | Updates progress, checks criteria |

## Skills

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `brainstorm-capture` | Auto during brainstorms | Real-time reasoning capture |
| `plan-compiler` | `/forge-compile` | Generates all drift-prevention artifacts |
| `session-bootstrap` | `/forge-bootstrap` | Forces memory loading |
| `forge-implement` | `/forge-implement` | Full task execution pipeline |

## Implementation Sprints

- **Sprint 0:** Directory structure, hooks, skills, CLAUDE.md update ← DONE
- **Sprint 1:** Memory harness (pre-compact, post-task, multi-session continuity testing)
- **Sprint 2:** Plan compiler (the "one command" artifact generator)
- **Sprint 3:** Architecture map MCP (Qdrant-backed codebase queries)
- **Sprint 4:** Brainstorm capture protocol (Supervisor system prompt)
- **Sprint 5:** Full integration end-to-end test
- **Sprint 6:** Ralph loop + Agent Teams automation


---

## Implementation Sprints (Detailed)

### Sprint 0: Foundation ← COMPLETE
1. ✅ Create `.forge/` directory structure
2. ✅ Write CLAUDE.md with ForgeLoop instructions (restructured to top)
3. ✅ Create session-start hook
4. ✅ Create post-edit hook (typecheck + lint)
5. ✅ Create pre-compact hook
6. ✅ Create post-task hook + check-all-criteria
7. ✅ Create initial progress.md, DECISIONS.md, brainstorm-capture.md
8. ✅ Create all 4 skills + all 5 slash commands
9. ✅ Create ralph-loop.sh wrapper
10. ✅ Wire hooks in settings.local.json
11. ✅ Neutralize old steering scripts (check-mechanical.sh, check-modularity.sh)
12. ✅ Enable Agent Teams env var
13. ✅ Create Supervisor system prompt file
14. ✅ Create /forge-review command
15. ✅ Create state snapshot script
16. ✅ Create Architecture Map MCP scaffold + package.json + reindex script

### Sprint 1: Memory Harness Testing
- Test multi-session continuity: start a task, kill session, start new, verify pickup
- Test pre-compact hook: fill context, verify state saved before compaction
- Test post-task hook: verify progress.md updates happen automatically
- Test state snapshots: run create-snapshot.sh, verify output is useful

### Sprint 2: Plan Compiler
- Write a real plan by hand (for a real KripTik feature)
- Run /forge-compile, verify all 7 artifact types are generated correctly
- Iterate on artifact quality until executor prompts are precise enough for zero-context sessions

### Sprint 3: Architecture Map MCP
- Build the Qdrant-backed MCP server (.forge/mcp/architecture-server.js)
- Implement 6 tools: search_architecture, get_interface, check_integration,
  query_endpoints, query_dependencies, update_map
- Implement reindex.sh for incremental + full reindex
- Register MCP in settings.local.json
- Test: query mid-session, verify accurate current architecture returned
- Wire post-task hook to trigger reindex after completed tasks

### Sprint 4: Brainstorm Capture Protocol
- Write Supervisor system prompt (.forge/supervisor-prompt.md) ← DONE
- Test: 30-minute brainstorm, verify brainstorm-capture.md has full reasoning
- Test: plan from capture document in NEW session, verify zero information loss
- Test: selective extraction ("take thread 2 and 4, plan it")

### Sprint 5: Full Integration
- Run the complete Brainstorm → Plan → Compile → Execute → Review cycle
  on a real KripTik feature end-to-end
- Identify gaps, friction points, failure modes
- Update all artifacts based on lessons learned
- Document everything in DECISIONS.md

### Sprint 6: Automation
- Configure Agent Teams for parallel task execution
- Add review automation (Supervisor auto-reads output via /forge-review)
- Stress test Ralph loop with complex, multi-day implementation
- Test multi-session resilience: kill mid-task, resume, verify zero drift

---

## Success Criteria for ForgeLoop

ForgeLoop is "done" when:

1. Logan can brainstorm for 2 hours, say "plan that," and get a complete plan
   with zero information loss from the brainstorm
2. The plan compiler generates all drift-prevention artifacts in one command
3. Claude Code can execute a 5+ task plan autonomously via Ralph loop with
   zero architectural drift
4. A killed session can be resumed by a new session with zero re-explanation
5. The architecture map MCP returns accurate results mid-session for any query
   about the current codebase
6. The full Brainstorm → Plan → Compile → Execute → Review cycle completes
   without Logan needing to write or read code at any point
7. The patterns are directly reusable for KripTik's internal build engine

---

## How This Maps to KripTik's Build Engine

Everything in ForgeLoop is a prototype for what KripTik's internal build engine
needs when building user apps:

| ForgeLoop Component | KripTik Build Engine Equivalent |
|---|---|
| Supervisor | KripTik's "Brain" / centralized orchestrator |
| Plan Compiler | Build plan generation from user requirements |
| Executor + Agent Teams | Multi-agent build workers (Opus 4.6 via API) |
| Memory Layer | Session state persistence across build steps |
| Architecture Map MCP | Qdrant-backed codebase awareness for build agents |
| Hooks | Quality gates in the build pipeline |
| Ralph Loop | Autonomous build iteration until acceptance criteria met |
| progress.md | Build session manifest / TrailLog |
| DECISIONS.md | Build decision audit trail |
| Drift Prevention Artifacts | Build constraints derived from user requirements |

Building ForgeLoop isn't just a development workflow — it's building KripTik's
core IP. Every pattern proven here translates directly into the product.

---

## Known Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Claude Code doesn't always read memory files at session start | session-start hook forces the read; output is injected into context |
| Compaction loses critical reasoning | pre-compact hook writes state to progress.md before compaction |
| Architecture map goes stale | post-task hook triggers reindex after every completed task |
| Executor ignores constraints.md | Hooks enforce deterministic rules; constraints.md is loaded at session start |
| Plan compiler generates incorrect artifacts | Supervisor reviews before execution begins |
| Token costs explode with Agent Teams | Start with 3 teammates max; use Sonnet for simple tasks, Opus for complex |
| Rate limits hit during parallel execution | Route simple tasks to Sonnet/Haiku; reserve Opus for architectural work |
| brainstorm-capture.md becomes too large | Archive completed brainstorm sessions; keep only the active one |

---

## Files Inventory

### Memory Layer (.forge/memory/)
| File | Status | Purpose |
|------|--------|---------|
| progress.md | ✅ LIVE | Heartbeat — current state, next task, session history |
| DECISIONS.md | ✅ LIVE | Why things are the way they are (never deleted, only appended) |
| brainstorm-capture.md | ✅ LIVE | Real-time reasoning log during brainstorms |
| state-snapshots/ | ✅ DIR EXISTS | Codebase state snapshots linked to git commits |

### Plans (.forge/plans/)
| File | Status | Purpose |
|------|--------|---------|
| active-plan.md | EMPTY (awaiting first brainstorm) | Current implementation plan |
| prompts/ | ✅ DIR EXISTS | Per-task executor prompts (generated by plan compiler) |
| archive/ | ✅ DIR EXISTS | Completed plans |

### Drift Prevention (.forge/drift-prevention/)
| File | Status | Purpose |
|------|--------|---------|
| constraints.md | EMPTY (generated by /forge-compile) | Plan-specific architecture rules |
| acceptance-criteria.md | EMPTY (generated by /forge-compile) | Machine-checkable done conditions |
| interface-contracts.md | EMPTY (generated by /forge-compile) | Exact signatures to implement |
| integration-map.md | EMPTY (generated by /forge-compile) | What connects to what |

### Hooks (.forge/hooks/)
| File | Status | Purpose |
|------|--------|---------|
| session-start.sh | ✅ LIVE | Forces memory loading at session start |
| pre-compact.sh | ✅ LIVE | Saves critical state before compaction |
| post-edit.sh | ✅ LIVE | Typecheck + lint on every file edit |
| post-task.sh | ✅ LIVE | Progress reminder + acceptance criteria check |
| check-all-criteria.sh | ✅ LIVE | Runs all criteria checks (used by Ralph loop) |
| create-snapshot.sh | ✅ LIVE | Creates git-linked state snapshot |

### Skills (.forge/skills/)
| Skill | Status | Invocation |
|-------|--------|------------|
| brainstorm-capture | ✅ LIVE | Auto during brainstorms / /forge-brainstorm |
| plan-compiler | ✅ LIVE | /forge-compile |
| session-bootstrap | ✅ LIVE | /forge-bootstrap |
| forge-implement | ✅ LIVE | /forge-implement |

### Slash Commands (.claude/commands/)
| Command | Status | Purpose |
|---------|--------|---------|
| /forge-brainstorm | ✅ LIVE | Start brainstorm with real-time capture |
| /forge-compile | ✅ LIVE | Generate all drift-prevention artifacts |
| /forge-bootstrap | ✅ LIVE | Force memory loading |
| /forge-implement | ✅ LIVE | Execute tasks from active plan |
| /forge-review | ✅ LIVE | Review completed execution against plan |

### Architecture Map MCP (.forge/mcp/)
| File | Status | Purpose |
|------|--------|---------|
| architecture-server.js | ⏳ SCAFFOLD | Qdrant-backed MCP server (Sprint 3) |
| reindex.sh | ⏳ SCAFFOLD | Re-index changed files (Sprint 3) |
| package.json | ✅ READY | Dependencies defined, not yet installed |

### Other Files
| File | Status | Purpose |
|------|--------|---------|
| .forge/FORGELOOP-SPEC.md | ✅ THIS FILE | Reference spec |
| .forge/ralph-loop.sh | ✅ LIVE | Autonomous execution wrapper |
| .forge/supervisor-prompt.md | ✅ LIVE | Supervisor system prompt for long-running sessions |

### Claude Code Configuration
| Setting | Status | Purpose |
|---------|--------|---------|
| .claude/settings.local.json hooks | ✅ WIRED | PostToolUse, Stop, PreCompact hooks active |
| CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS | ✅ ENABLED | Agent Teams env var set |
| CLAUDE.md ForgeLoop section | ✅ AT TOP | Memory protocol, commands, rules — first thing Claude reads |

---

*This document is the authoritative ForgeLoop reference.
Full design rationale available in the original Supervisor chat session (2026-03-24).*
