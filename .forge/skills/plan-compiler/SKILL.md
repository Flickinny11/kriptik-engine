---
name: plan-compiler
description: "Generates all drift-prevention artifacts from a plan. Invoke with /forge-compile after a plan has been written to .forge/plans/active-plan.md. Produces constraints, acceptance criteria, interface contracts, integration maps, executor prompts, and hook configurations."
disable-model-invocation: true
---

# Plan Compiler Skill

You are the PLAN COMPILER. Your job is to read a plan and generate ALL artifacts needed to prevent drift during execution.

## Invocation
Run `/forge-compile` to activate.

## Input
- `.forge/plans/active-plan.md` — the plan to compile

## Process

1. **Read the plan** thoroughly. Understand every task, dependency, and acceptance criterion.

2. **Read the current codebase state** — check existing interfaces, types, and integration points relevant to the plan. Use the architecture map MCP if available, otherwise read key files directly.

3. **Generate the following files:**

### A. `.forge/drift-prevention/constraints.md`
Plan-specific rules. Include:
- Architecture rules (what patterns MUST be followed)
- File ownership (which files each task can modify)
- Required patterns (error handling, async patterns, logging)
- Forbidden actions (files NOT to touch, patterns NOT to use)

### B. `.forge/drift-prevention/acceptance-criteria.md`
Machine-checkable "done" conditions per task. Each criterion should be:
- A command that can be run (`npm run typecheck`, `npm test -- --grep "X"`)
- A file existence check
- An interface compliance check
Include both "Must Pass" and "Must NOT" sections per task.

### C. `.forge/drift-prevention/interface-contracts.md`
Exact function signatures, types, and imports for everything being built.
Copy existing interfaces from the codebase verbatim. Define new interfaces precisely.
The executor must implement EXACTLY these — no creative interpretation.

### D. `.forge/drift-prevention/integration-map.md`
What connects to what. For each task:
- What it depends on (upstream)
- What depends on it (downstream)
- Which existing modules it integrates with

### E. Task-specific executor prompts
For each task in the plan, generate a complete prompt file at:
`.forge/plans/prompts/task-N.md`

Each prompt must include:
1. Files to read first (specific paths)
2. What to implement (exact scope)
3. What NOT to touch
4. How to verify (specific test commands)
5. What to update in progress.md when done
6. Git commit message format

### F. `.forge/memory/progress.md` bootstrap
Reset progress.md for the new plan:
- Set all tasks to pending
- Record pre-implementation codebase state
- Clear previous session history
- Set "What The Next Session Needs To Know" with plan context

4. **Commit all generated artifacts** with message:
   `forge: compile plan [plan-id] — N tasks, M acceptance criteria`

5. **Output summary** showing what was generated and confirming readiness for execution.

## Quality Checks Before Output
- Every task has at least one acceptance criterion with a runnable command
- Interface contracts reference real files that exist in the codebase
- No two tasks claim ownership of the same file for modification
- Integration map has no orphaned connections
- All executor prompts reference the constraints and acceptance criteria files
