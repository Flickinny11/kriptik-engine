---
description: "Context-aware fixing — reads plan, constraints, and interface contracts BEFORE making any fix. Fixes must comply with the spec. Retests after fixing. Loops up to 3 cycles."
disable-model-invocation: true
---

Read the skill definition at `.forge/skills/forge-fix/SKILL.md` and follow its instructions exactly.

## CRITICAL: Read context BEFORE touching code.
1. Read the failure report (verification-report.md or browser-test-report.md)
2. Read active-plan.md, constraints.md, interface-contracts.md, integration-map.md
3. Diagnose the root cause WITH plan context
4. Write diagnosis to `.forge/logs/fix-diagnosis.md`
5. Apply minimal fix that respects all constraints
6. Re-run the check that caught the failure
7. If fixed: run full `/forge-verify` then `/forge-browser-test`
8. If new failures: loop back (max 3 cycles)
9. After 3 failed cycles: write BLOCKER to progress.md and stop

NEVER fix by: commenting out code, swallowing errors, weakening types,
duplicating code, changing tests to match wrong behavior, or removing features.
