---
description: "Compile the active plan into all drift-prevention artifacts"
disable-model-invocation: true
---

Read the skill definition at `.forge/skills/plan-compiler/SKILL.md` and follow its instructions exactly.

The plan to compile is at `.forge/plans/active-plan.md`.

Generate all drift-prevention artifacts as specified in the skill:
- constraints.md
- acceptance-criteria.md
- interface-contracts.md
- integration-map.md
- Per-task executor prompts in .forge/plans/prompts/
- Updated progress.md bootstrap

After generation, commit all artifacts and output a summary.
