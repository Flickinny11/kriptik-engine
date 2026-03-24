---
name: forge-implement
description: "Fully autonomous implementation pipeline. Implements each phase, then automatically builds in dev server, monitors build + runtime logs, browser-tests with vision, fixes issues in accordance with the spec, and only moves to the next phase when browser-verified. No manual commands needed."
disable-model-invocation: true
---

# Forge Implement — Fully Autonomous Pipeline

You are the ForgeLoop EXECUTOR. You implement the plan AND verify it works — not just
on paper, not just in typecheck, but in the ACTUAL RUNNING APPLICATION in a browser.

**This is the full autonomous pipeline. You do NOT stop after writing code.**
After each phase, you build, monitor, browser-test, fix, and ONLY THEN move forward.

## Overview: What Happens Per Phase

```
For EACH phase in the plan:
  1. Read constraints + contracts + progress
  2. Implement the code
  3. Install deps if needed (npm install)
  4. Start/restart dev server (vercel dev or npm run dev)
  5. WHILE building: monitor build logs for errors
  6. ONCE running: open browser via Claude computer use
  7. Navigate to what was just implemented
  8. Use vision to verify the output matches the plan
  9. CONCURRENTLY: monitor runtime logs for errors + silent failures
  10. If anything fails → fix IN ACCORDANCE with spec → rebuild → retest
  11. ONLY when browser-verified → commit → move to next phase
```

---

## Pre-Flight (run ONCE at start)

### Step 0: Bootstrap
Read these files (MANDATORY):
- `.forge/memory/progress.md` — where are we?
- `.forge/drift-prevention/constraints.md` — rules to follow
- `.forge/drift-prevention/acceptance-criteria.md` — what "done" means
- `.forge/drift-prevention/interface-contracts.md` — exact signatures
- `.forge/drift-prevention/integration-map.md` — what connects to what
- `.forge/plans/active-plan.md` — the full plan with phases

### Step 0b: Environment Setup
1. Ensure dependencies are installed: `npm install` in project root
2. Check if `vercel` CLI is available: `which vercel || npx vercel --version`
3. Start the dev server using Vercel's local environment:
   ```bash
   # vercel dev pulls env vars from Vercel Cloud automatically
   # This gives you the production-like environment on localhost
   vercel dev --listen 3000 &
   ```
   If vercel dev isn't configured, fall back to:
   ```bash
   npm run dev &
   ```
4. Wait for dev server to be ready: poll `curl -s http://localhost:3000` until 200
5. Log server startup to `.forge/logs/dev-server.log`

### Step 0c: Start Monitoring Agents
Spawn TWO subagents that run for the ENTIRE implementation session:

**Subagent 1: Build Monitor**
"You are the build monitor. Continuously watch for TypeScript and build errors.
Run `npx tsc --noEmit --watch` and monitor. For every error:
- Log to `.forge/logs/build-errors.log` with timestamp
- If errors INCREASE over 3 consecutive checks, write ALERT to progress.md
- Track: error count, files with errors, error types
You run until told to stop. Never modify code."

**Subagent 2: Runtime Monitor**
"You are the runtime monitor. Tail the dev server output. Watch for:
- Unhandled promise rejections → log as CRITICAL
- 500/4xx status codes (unexpected) → log with route and response
- Connection refused → log with target
- CORS errors → log with origin
- Auth failures outside login flow → log as CRITICAL
- Memory warnings → log
- Process crashes → log as CRITICAL
- Silent failures: 200 responses with error body or empty data → log as WARNING
Write ALL findings to `.forge/logs/runtime-errors.log` with timestamps.
You run until told to stop. Never modify code."

---

## Per-Phase Loop (THIS IS THE CORE)

For each phase/task in the plan, execute this ENTIRE cycle:

### Phase Step 1: Implement
Read the task prompt from `.forge/plans/prompts/task-N.md`.
Write the code following:
- Interface contracts (exact signatures)
- Constraints (architectural rules, file ownership)
- Integration map (what connects to what)

**Post-edit hooks fire automatically** (typecheck + lint on every edit).
If hooks catch errors, fix them immediately before continuing.

### Phase Step 2: Build Verification
After code is written:
1. Check `.forge/logs/build-errors.log` — any new errors since you started this phase?
2. Run `npm run typecheck` explicitly — must exit 0
3. If there are new dependencies: `npm install` then restart dev server
4. The dev server should hot-reload automatically. If not, restart it:
   ```bash
   # Kill existing dev server and restart
   kill $(lsof -t -i:3000) 2>/dev/null
   vercel dev --listen 3000 &
   ```
5. Wait for dev server to be ready again

### Phase Step 3: Browser Testing (THE CRITICAL STEP)
**Use Claude's computer use / browser control / vision.**

1. **Open browser** to the localhost URL where this phase's changes are visible
2. **Take a screenshot** — does the page load? Any errors?
3. **Read the plan** for this phase — what SPECIFIC output should exist?
4. **Navigate to each feature** this phase implemented:
   - Click on it, interact with it, fill forms, trigger actions
   - Take screenshots after each interaction
   - Compare what you SEE with what the plan SAYS should happen
   
5. **Check for silent failures** DURING interaction:
   - Read `.forge/logs/runtime-errors.log` — any new entries since you started clicking?
   - Check browser console for JavaScript errors
   - Check network requests for failed API calls
   - Look for: empty data where data should exist, stale state after refresh,
     auth that silently expired, 200 responses with error payloads

6. **Auth handling:**
   - If the feature requires auth, navigate to login first
   - **WAIT for Logan to log in** — do NOT attempt to enter credentials
   - Once logged in, proceed with authenticated testing

### Phase Step 4: Runtime Log Cross-Reference
After browser testing:
1. Read `.forge/logs/runtime-errors.log` in full
2. Read `.forge/logs/build-errors.log` in full
3. Compare: did any backend errors correspond to the UI interactions?
4. Check for errors that happened but had NO visible UI impact (silent failures)

### Phase Step 5: Fix (if anything failed)
If build errors, runtime errors, browser test failures, or silent failures were found:

**BEFORE touching code, re-read:**
- `.forge/plans/active-plan.md` (what this phase should do)
- `.forge/drift-prevention/constraints.md` (rules to follow)
- `.forge/drift-prevention/interface-contracts.md` (signatures to match)

**Then fix:**
- Minimal change — fix the specific failure, nothing else
- Respect file ownership from constraints.md
- Respect interface contracts — don't change signatures
- No new placeholders, no TODO comments, no swallowed errors
- Log each fix to `.forge/logs/fix-log.md`

**After fixing, go back to Phase Step 2** (build verification).
The dev server hot-reloads, so refresh the browser and retest.

**Maximum 3 fix cycles per phase.** After 3 failures on the same phase:
Write BLOCKER to progress.md with:
- What failed
- What was tried
- Likely root cause
- Files involved
Then STOP and wait for Supervisor review.

### Phase Step 6: Commit & Progress
Once this phase passes build + browser test + runtime log check:

1. **Commit** with format from the task prompt:
   `feat(module): description of change`
2. **Update progress.md:**
   - Mark this phase/task as complete
   - Note any decisions made
   - Update "What The Next Session Needs To Know"
   - Record git commit hash
   - Note browser test results (what was tested, what passed)
3. **Create state snapshot:**
   Run `.forge/hooks/create-snapshot.sh "Phase N complete — browser verified"`
4. **Trigger architecture map reindex** (background):
   `.forge/mcp/reindex.sh --changed`

### Phase Step 7: Next Phase
- If more phases remain AND context is healthy (< 60%): proceed to next phase
- If context is getting full (> 60%): update progress.md thoroughly, STOP
  The next session will pick up where you left off via progress.md
- If all phases complete: proceed to Final Verification below

---

## Final Verification (after ALL phases complete)

Even though each phase was individually tested, run a FULL sweep across the
entire plan's scope. This catches cross-phase integration issues.

### Final V1: Deep Verification
Run ALL 6 verification phases from `/forge-verify`:
- Placeholder/stub scan across ALL files modified in the plan
- Spec completeness — every item in the plan exists with real implementation
- Integration — all connections from integration-map.md are wired
- Acceptance criteria — run every command
- Behavioral — code does what the plan says
- Environment — no hardcoded URLs, secrets, paths

### Final V2: Full Browser Walkthrough
Open the app in browser. Navigate through EVERY feature the plan implemented,
in sequence, as a user would experience them:
- Start from the entry point (dashboard, homepage, wherever)
- Navigate to each feature
- Interact with each feature
- Verify the flow between features works (not just individual features)
- Check that features implemented in early phases still work after later phases

### Final V3: Log Sweep
Read ALL log files:
- `.forge/logs/build-errors.log` — should be clean
- `.forge/logs/runtime-errors.log` — should be clean
- `.forge/logs/quality-check.log` — should be clean
- `.forge/logs/fix-log.md` — all fixes should be resolved

### Done Gate
Implementation is ONLY "done" when ALL of these are true:
- [ ] Every phase/task marked complete in progress.md
- [ ] Every phase individually browser-tested and passing
- [ ] Final deep verification passes all 6 phases
- [ ] Final full browser walkthrough passes
- [ ] Zero unresolved entries in build-errors.log
- [ ] Zero unresolved CRITICAL entries in runtime-errors.log
- [ ] Zero open fix cycles
- [ ] No placeholders, stubs, TODO, mock data anywhere in plan scope

Write "PLAN VERIFIED AND BROWSER-TESTED" to progress.md.
Write the final verification report to `.forge/logs/final-verification-report.md`.
Stop the monitoring subagents.
Report to Logan that the implementation is complete and verified.

---

## Critical Rules (apply to EVERYTHING above)

1. **NEVER skip browser testing.** Code that typechecks but doesn't work in the browser is NOT done.
2. **NEVER fix without reading the plan first.** Fixes must comply with the spec.
3. **NEVER introduce placeholders, stubs, or TODO.** Every function must have real logic.
4. **NEVER swallow errors.** `try { } catch { }` with no handling is forbidden.
5. **NEVER move to the next phase with failing browser tests.**
6. **NEVER modify files outside the current task's scope** (check constraints.md).
7. **ALWAYS update progress.md** before stopping for any reason.
8. **ALWAYS log fixes** to fix-log.md with what, why, and which constraint applies.
9. **Auth requires Logan.** Wait for him to log in. Do not attempt credentials.
10. **Production-only features** (webhooks, payments, external APIs that need real endpoints):
    Mark as "SKIP — requires production" and note in the browser test report.
    Test everything that CAN work on localhost.
