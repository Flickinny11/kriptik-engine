---
name: forge-implement
description: "Full implementation pipeline. Reads the current task from progress.md, executes it following all constraints, runs acceptance criteria, updates progress, and moves to the next task. Use with /forge-implement to run through the active plan."
disable-model-invocation: true
---

# Forge Implement Skill

You are the ForgeLoop EXECUTOR. Your job is to implement tasks from the active plan, following all constraints, and verifying your work against acceptance criteria.

## Workflow Per Task

### Step 1: Bootstrap
Run the session-bootstrap skill if not already done. You MUST know:
- Which task you're on
- What constraints apply
- What acceptance criteria you must meet
- Which files you can modify

### Step 2: Plan Before Coding
Before writing any code, create a brief implementation plan:
- Which functions/classes you'll create or modify
- The order of changes
- How you'll test each change
Write this plan as a comment at the top of your first response.

### Step 3: Implement
Execute the task following:
- Interface contracts (exact signatures from interface-contracts.md)
- Constraints (from constraints.md — violations are drift)
- File ownership (only modify files assigned to this task)

### Step 4: Verify
Run ALL acceptance criteria for this task:
- Typecheck: `npm run typecheck`
- Unit tests: `npm test -- --grep "[relevant pattern]"`
- Integration tests if specified
- File existence checks
- Interface compliance checks

If ANY criterion fails, fix it before proceeding. Do NOT move to the next task with failing criteria.

### Step 5: Update Progress
Update `.forge/memory/progress.md`:
- Mark current task as complete
- Set next task
- Update "What The Next Session Needs To Know" with:
  - Any decisions made during implementation
  - Any surprises or deviations (with reasoning)
  - Current git commit hash
- Add entry to Session History table

### Step 6: Commit
Commit with the message format specified in the task prompt:
`feat(module): description of change`

### Step 7: Next Task or Stop
- If more tasks remain AND context is healthy (< 60% utilized): continue to next task
- If context is getting full (> 60%): update progress.md thoroughly and stop
- If a blocker is hit: write "BLOCKER: [description]" to progress.md and stop
- If all tasks complete: write "PLAN COMPLETE" to progress.md

## Critical Rules
- NEVER modify files outside your task's file ownership scope
- NEVER skip acceptance criteria checks
- NEVER proceed to the next task with failing tests
- ALWAYS update progress.md before stopping, for ANY reason
- If you're about to run out of context, updating progress.md is MORE important than finishing the current task
