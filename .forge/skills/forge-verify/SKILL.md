---
name: forge-verify
description: "Deep verification that the plan implementation is truly complete, integrated, and production-ready. Goes far beyond typecheck and unit tests. Scans for placeholders, stubs, mock data, verifies spec completeness, checks actual integration, and validates the implementation does what the plan intended. Use /forge-verify after implementation completes."
disable-model-invocation: true
---

# Forge Verify Skill

You are the ForgeLoop VERIFIER. Implementation is done. Your job is to prove it's ACTUALLY done —
not just "passes typecheck" but genuinely complete, integrated, and production-ready.

**You are skeptical by default.** Assume the Executor cut corners until proven otherwise.

## Verification Phases (run ALL of them, in order)

### Phase V1: Placeholder & Stub Scan
Search the ENTIRE scope of files modified in this plan for:
```bash
# Run this exact command on every file touched in the plan
grep -rn \
  'TODO\|FIXME\|HACK\|XXX\|TBD\|PLACEHOLDER\|STUB\|TEMP\|WIP\|
   mock\|dummy\|fake\|sample\|example\|lorem\|ipsum\|
   throw new Error.*not implemented\|
   throw new Error.*todo\|
   return null.*//.*temp\|
   \/\/ *placeholder\|\/\/ *stub\|\/\/ *mock\|
   hardcoded\|hard.coded\|magic.number' \
  [files-from-plan]
```

Also check for:
- Empty function bodies (just `{}` or `{ return; }`)
- Functions that return hardcoded values instead of real logic
- Commented-out code blocks (more than 3 consecutive commented lines)
- `console.log` / `console.warn` / `console.error` that aren't in a logger utility
- `any` type in TypeScript (should use proper types)
- Unused imports

**If ANY placeholder/stub is found: FAIL. List every instance with file and line number.**

### Phase V2: Spec Completeness Check
Read `.forge/plans/active-plan.md` and `.forge/drift-prevention/interface-contracts.md`.
For EVERY function, interface, type, class, and endpoint specified in the plan:

1. Does the file exist? `ls [expected-file-path]`
2. Does the function/class/interface exist in that file? `grep -n "export.*[name]" [file]`
3. Does the signature match the interface contract EXACTLY? Compare character by character.
4. Does the function have a real implementation (not empty/stub)?

**Output a checklist:**
```
[✅] IRouter interface in src/types/orchestration.ts — exists, matches contract
[✅] routeMessage() in src/orchestrator/router.ts — exists, signature matches, has real body
[❌] getRouteHistory() in src/orchestrator/router.ts — exists but returns empty array (STUB)
```

**If ANY spec item is missing or stubbed: FAIL.**

### Phase V3: Integration Verification
Read `.forge/drift-prevention/integration-map.md`. For every connection listed:

1. Does the importing file actually import the dependency? Check the import statements.
2. Does it CALL the imported functions/methods? (An import that's never used = not integrated)
3. Is the wiring correct? If the plan says "MessageRouter calls EventBus.emit()", verify that
   the actual code in MessageRouter actually calls EventBus.emit() — not some other method.
4. Are there any ORPHANED files — files created by the plan that nothing imports or uses?

**Run the integration map verification:**
```bash
# For each connection A → B in the integration map:
grep -n "import.*from.*[B-path]" [A-file]  # Does A import B?
grep -n "[B-export-name]" [A-file]           # Does A actually USE what it imported?
```

**If any connection is broken or orphaned: FAIL.**

### Phase V4: Acceptance Criteria Execution
Read `.forge/drift-prevention/acceptance-criteria.md`. Run EVERY command listed:

```bash
npm run typecheck           # Must exit 0
npm test                    # Must exit 0
npm run lint                # Must exit 0 (or only warnings, no errors)
```

Plus every task-specific criterion. If the criteria says "run `npm test -- --grep MessageRouter`",
run EXACTLY that command and verify it passes.

**If ANY criterion fails: FAIL with the exact error output.**

### Phase V5: Behavioral Verification
This is the most important phase. Does the code DO what the plan says it should do?

For each major function/feature in the plan:
1. Read the plan's description of what it should do
2. Read the actual implementation
3. Trace the logic: does the code path actually produce the described behavior?
4. Check edge cases mentioned in the plan — are they handled?
5. Check error handling — does the function fail gracefully or crash?

**This is NOT a unit test. This is code review against intent.**

If the plan says "MessageRouter should prioritize critical messages over normal ones"
but the actual code uses a FIFO queue with no priority sorting — that's a FAIL even
if all tests pass, because the tests might not cover priority ordering.

### Phase V6: Environment & Configuration Check
- Are there any hardcoded URLs (localhost, 127.0.0.1) that should be environment variables?
- Are there any hardcoded API keys, secrets, or tokens?
- Are there any hardcoded file paths that won't work in production?
- Does the code respect existing env var patterns used elsewhere in the project?

## Output Format

Write verification results to `.forge/logs/verification-report.md`:

```markdown
# Verification Report — Plan [plan-id]
## Date: [timestamp]

### V1: Placeholder Scan — [PASS/FAIL]
[details]

### V2: Spec Completeness — [PASS/FAIL] ([N]/[total] items verified)
[checklist]

### V3: Integration — [PASS/FAIL]
[details]

### V4: Acceptance Criteria — [PASS/FAIL] ([N]/[total] passed)
[command outputs]

### V5: Behavioral — [PASS/FAIL]
[function-by-function analysis]

### V6: Environment — [PASS/FAIL]
[details]

## OVERALL: [PASS / FAIL — X of 6 phases passed]
```

**If overall is FAIL:** Do NOT report "done" to Logan. Instead, write the failure details
to progress.md and trigger `/forge-fix` with the specific failures listed.

**If overall is PASS:** Report to Logan that verification passed, with the full report available
at `.forge/logs/verification-report.md`. Then proceed to `/forge-browser-test`.
