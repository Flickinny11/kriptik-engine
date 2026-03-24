---
description: "Review completed execution against the plan. Checks for drift, updates DECISIONS.md, creates state snapshot, archives plan if complete."
disable-model-invocation: true
---

You are in REVIEW MODE. The Executor has finished working. Your job is to validate the output.

## Review Checklist

1. **Read the execution output:**
   - Run `git log --oneline -10` to see recent commits
   - Run `git diff HEAD~5 --stat` to see what changed (adjust count as needed)
   - Read `.forge/memory/progress.md` for the Executor's self-report

2. **Compare against the plan:**
   - Read `.forge/plans/active-plan.md`
   - For each task marked complete in progress.md, verify:
     - Was the acceptance criteria met? Run the commands from `.forge/drift-prevention/acceptance-criteria.md`
     - Were the interface contracts followed? Check `.forge/drift-prevention/interface-contracts.md`
     - Was file ownership respected? Check `.forge/drift-prevention/constraints.md`

3. **Check for drift:**
   - Any new files created that weren't in the plan?
   - Any existing files modified that shouldn't have been?
   - Any architectural patterns that violate constraints?
   - Any new dependencies added without justification?

4. **Update Memory Layer:**
   - If new decisions were made during execution, append them to `.forge/memory/DECISIONS.md`
   - Run `.forge/hooks/create-snapshot.sh` to capture current state
   - If ALL tasks in the plan are complete, move the plan to `.forge/plans/archive/`

5. **Report findings:**
   - List any drift detected with severity (critical / warning / info)
   - For critical drift: generate a correction prompt for the Executor
   - For clean execution: confirm completion and summarize what was built
   - Update progress.md with review results
