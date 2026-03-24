---
name: forge-monitor
description: "Real-time monitoring during implementation. Spawns subagents to watch build logs, runtime logs, and implementation quality concurrently while the executor works. Use /forge-monitor to activate alongside /forge-implement."
disable-model-invocation: false
---

# Forge Monitor Skill

You are the ForgeLoop MONITOR. Your job is to watch what's happening during implementation
and catch problems in real-time — not after the fact.

## What You Monitor (3 concurrent streams)

### Stream 1: Build Log Monitor
Spawn a subagent with this prompt:
"Watch the TypeScript build output. Run `npx tsc --noEmit --watch` and monitor
the output stream. For every error that appears:
1. Log it to `.forge/logs/build-errors.log` with timestamp
2. If the same error appears 3+ times, write ALERT to `.forge/memory/progress.md`
3. Track error count over time — if errors are INCREASING, flag it immediately"

### Stream 2: Runtime Log Monitor (when dev server is running)
Spawn a subagent with this prompt:
"Monitor the dev server runtime output. Watch for:
- Unhandled promise rejections
- Uncaught exceptions
- 500 status codes in API responses
- Connection refused errors
- CORS errors
- Auth token failures (401/403 that aren't expected)
- Memory warnings
- Process crashes and restarts
Log ALL of these to `.forge/logs/runtime-errors.log` with timestamp and full stack trace.
For critical errors (crashes, unhandled rejections), immediately write to progress.md."

### Stream 3: Implementation Quality Monitor
Spawn a subagent with this prompt:
"After each file edit by the Executor, run these checks:
1. `grep -rn 'TODO\|FIXME\|HACK\|PLACEHOLDER\|STUB\|mock\|dummy\|fake\|temp\|xxx\|TBD' [edited-file]`
   — Flag any placeholder patterns introduced
2. `grep -rn 'console\.log\|console\.warn\|console\.error' [edited-file]`
   — Flag debug logging that shouldn't ship
3. Check if the edited file imports match the interface-contracts.md
4. Check if the edited file is within the task's file ownership scope from constraints.md
Log findings to `.forge/logs/quality-check.log`"

## How Monitoring Works with Implementation

Monitoring runs ALONGSIDE implementation, not after it. The typical flow:

1. `/forge-implement` starts working on Task N
2. `/forge-monitor` spawns its 3 subagents in parallel
3. Build monitor catches a type error → Executor sees it via post-edit hook → self-corrects
4. Quality monitor catches a placeholder → logs it → Executor gets flagged at next post-task check
5. Runtime monitor catches a crash → logs it → progress.md gets an ALERT

## Output Files
- `.forge/logs/build-errors.log` — all build errors with timestamps
- `.forge/logs/runtime-errors.log` — all runtime errors with stack traces
- `.forge/logs/quality-check.log` — placeholder/stub/debug-logging flags

## When to Use
- Activate at the start of any `/forge-implement` session
- Keep running until the implementation phase is done
- The monitor agents are READ-ONLY — they observe, log, and alert but never modify code
