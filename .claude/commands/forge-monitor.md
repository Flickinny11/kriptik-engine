---
description: "Start real-time monitoring during implementation — build logs, runtime logs, and quality checks running concurrently"
---

Read the skill definition at `.forge/skills/forge-monitor/SKILL.md` and follow its instructions.

Spawn three monitoring teammates:
1. Build log monitor — watches `npx tsc --noEmit --watch` output for errors
2. Runtime log monitor — watches dev server output for crashes, 500s, auth failures, silent errors
3. Quality monitor — checks each edited file for placeholders, stubs, debug logging, constraint violations

All monitors are READ-ONLY. They observe, log, and alert but never modify code.
Log files: `.forge/logs/build-errors.log`, `.forge/logs/runtime-errors.log`, `.forge/logs/quality-check.log`
