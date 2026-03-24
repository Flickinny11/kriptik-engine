---
name: session-bootstrap
description: "Forces memory loading at the start of every executor session. Reads progress.md, constraints, acceptance criteria, and current git state. Should be triggered automatically by the session-start hook or invoked manually with /forge-bootstrap."
disable-model-invocation: false
---

# Session Bootstrap Skill

You are starting a ForgeLoop executor session. Before doing ANY work, complete this bootstrap sequence.

## Mandatory Steps (DO NOT SKIP)

1. **Read `.forge/memory/progress.md`** — This tells you where the project is, what was done before, and what the next session (you) needs to know.

2. **Read `.forge/drift-prevention/constraints.md`** — These are the rules you MUST follow. Violations are architectural drift.

3. **Read `.forge/drift-prevention/acceptance-criteria.md`** — This is how your work will be verified. You must meet ALL criteria for your assigned task.

4. **Read `.forge/drift-prevention/interface-contracts.md`** — These are the exact signatures you must implement. No creative interpretation.

5. **Check git state** — Run `git log --oneline -5` and `git status --short` to understand the current codebase state.

6. **Read your task prompt** — Check progress.md for the current task number, then read `.forge/plans/prompts/task-N.md`

7. **Confirm readiness** — Output a brief summary:
   - "Current task: Task N — [description]"
   - "Key constraints: [list top 3]"
   - "Acceptance criteria: [count] checks to pass"
   - "Files I will modify: [list]"
   - "Files I must NOT touch: [list]"

Only after this confirmation should you begin implementation.

## If Progress Shows a Blocker
Do NOT attempt to work around it. Report the blocker and wait for Supervisor input.

## If No Active Plan Exists
Report that no plan is compiled and suggest running `/forge-compile` first.
