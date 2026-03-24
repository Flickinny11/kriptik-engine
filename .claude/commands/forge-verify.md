---
description: "Deep verification — placeholder scan, spec completeness, integration check, acceptance criteria, behavioral verification, environment check. Goes far beyond typecheck."
disable-model-invocation: true
---

Read the skill definition at `.forge/skills/forge-verify/SKILL.md` and follow its instructions exactly.

Run ALL 6 verification phases in order:
1. V1: Placeholder & stub scan (grep for TODO, FIXME, mock, dummy, fake, stub, etc.)
2. V2: Spec completeness (every function/interface in the plan exists and has real implementation)
3. V3: Integration verification (all connections in integration-map.md are actually wired)
4. V4: Acceptance criteria execution (run every command from acceptance-criteria.md)
5. V5: Behavioral verification (code review against plan intent — does it DO what it should?)
6. V6: Environment check (no hardcoded URLs, secrets, or file paths)

Write results to `.forge/logs/verification-report.md`.
If ANY phase fails: do NOT report done. Trigger `/forge-fix` with the failures.
If ALL pass: proceed to `/forge-browser-test`.
