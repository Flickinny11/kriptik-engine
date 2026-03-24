---
description: "Execute tasks from the active plan with full verification"
disable-model-invocation: true
---

Read the skill definition at `.forge/skills/forge-implement/SKILL.md` and follow its instructions exactly.

First, run the session-bootstrap protocol if not already done:
1. Read `.forge/memory/progress.md` to find the current task
2. Read `.forge/drift-prevention/constraints.md` for rules
3. Read `.forge/drift-prevention/acceptance-criteria.md` for verification

Then read the current task's executor prompt from `.forge/plans/prompts/task-N.md` (where N is the current task number from progress.md).

Execute the task following all constraints. After implementation:
1. Run ALL acceptance criteria checks
2. Fix any failures before proceeding
3. Update `.forge/memory/progress.md`
4. Commit with the specified message format
5. Move to the next task if context allows (< 60% utilized)
