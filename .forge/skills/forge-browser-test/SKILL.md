---
name: forge-browser-test
description: "Visual testing using Claude Code's browser control, computer use, and vision. Starts the dev server, opens the app in a browser, and tests the implementation by actually clicking buttons, navigating, checking auth, and verifying visual output — while simultaneously monitoring runtime logs for errors. Use /forge-browser-test after /forge-verify passes."
disable-model-invocation: true
---

# Forge Browser Test Skill

You are the ForgeLoop BROWSER TESTER. Verification passed on paper. Now prove it works
in the actual running application. You will USE the app like a real user while monitoring
what's happening under the hood.

**You have three jobs running simultaneously:**
1. USE the app via browser (vision + computer use + Claude in Chrome)
2. READ runtime logs for errors, warnings, and silent failures
3. COMPARE what you see against what the plan says should exist

## Pre-Flight

### Step BT1: Environment Setup
1. Check if a dev server is already running: `curl -s http://localhost:3000 > /dev/null && echo "running"`
2. If not running, start it:
   - Read package.json for the dev script name (`npm run dev`, `npm start`, etc.)
   - Start the dev server as a background process
   - Wait for it to be ready (poll until HTTP 200)
   - Log the startup output to `.forge/logs/dev-server.log`

3. Check environment configuration:
   - Does `.env` or `.env.local` exist with the right variables?
   - Are API URLs pointing to localhost dev endpoints (not production)?
   - Is auth configured for local development?
   - **NOTE:** Logan must be logged in for auth-dependent testing.
     If auth is required, navigate to the login page first and WAIT for Logan
     to log in before proceeding with authenticated tests.

### Step BT2: Start Runtime Log Monitor
Spawn a teammate with this prompt:
"Tail the dev server output and watch for:
- Unhandled errors and exceptions
- 500/4xx responses that aren't expected
- Auth failures (401/403) outside of login flows
- Connection refused to any service
- Memory warnings
- Uncaught promise rejections
- CORS errors
- Silent failures: responses that return 200 but with empty body or error payload
Write ALL findings to `.forge/logs/browser-test-runtime.log` with timestamps.
Mark CRITICAL items with [CRITICAL] prefix."

## Testing Protocol

### Step BT3: Visual Smoke Test
Using Claude's browser control and vision:

1. Open the app in the browser: navigate to the dev server URL
2. Take a screenshot — does the page load? Any blank screens, error pages, or broken layouts?
3. Check the browser console for JavaScript errors (use read_console_messages if available)
4. Check the network tab for failed requests

### Step BT4: Plan-Specific Feature Testing
Read `.forge/plans/active-plan.md`. For EACH feature/change the plan implemented:

1. **Navigate** to where the feature should be visible
2. **Take a screenshot** — is the expected UI element present?
3. **Interact** — click the button, fill the form, trigger the action
4. **Observe** — does the expected behavior happen?
5. **Check runtime logs** — did the action trigger the expected backend calls?
   Are there any errors in the teammate's log file?
6. **Screenshot after interaction** — does the state change correctly?

Example for an auth feature:
```
1. Navigate to /login
2. Screenshot — login form visible? Fields present?
3. Click email field, type test credentials
4. Click "Sign In" button
5. Check runtime log — was the auth endpoint called? Did it respond 200?
6. Screenshot — did it redirect to dashboard? Is the user menu showing?
7. Check for silent failures — is the session cookie actually set?
```

### Step BT5: Silent Failure Detection
These are the hardest bugs to catch. The app "works" but something is quietly wrong:

1. **Auth silently expired:** Page loads but shows logged-out state when it should be logged in
2. **API returns 200 with error body:** `{ "error": "..." }` wrapped in a 200 response
3. **Data not persisting:** Create something, refresh, it's gone
4. **SSE not streaming:** UI shows "connecting" but events never arrive
5. **Stale state:** Component shows old data because cache wasn't invalidated
6. **Race condition:** Fast clicks cause duplicate submissions
7. **Missing error feedback:** Action fails but UI shows no error message

For each feature tested, explicitly check:
- Does the action produce the expected backend log entry?
- Does the response contain the expected data (not empty/null)?
- Does refreshing the page preserve the state?
- Does the browser console show any suppressed errors?

### Step BT6: Cross-Reference with Runtime Logs
After each test interaction, read `.forge/logs/browser-test-runtime.log` from the monitor teammate.
Compare what you observed visually with what the runtime logs show:
- Did the backend receive the request?
- Did it process correctly or throw internally?
- Are there any warnings that indicate partial failure?

## Output

Write results to `.forge/logs/browser-test-report.md`:

```markdown
# Browser Test Report — Plan [plan-id]
## Date: [timestamp]
## Dev Server: [URL] (started/already running)

### Smoke Test — [PASS/FAIL]
- Page loads: [yes/no]
- Console errors: [count]
- Failed network requests: [count]
- [screenshots referenced]

### Feature Tests
#### [Feature 1 from plan]
- Navigation: [PASS/FAIL]
- Visual presence: [PASS/FAIL]
- Interaction: [PASS/FAIL]
- Backend response: [PASS/FAIL]
- Runtime errors during test: [none / list]
- Silent failures: [none / list]

#### [Feature 2...]
...

### Silent Failure Scan — [PASS/FAIL]
[findings]

### Runtime Log Summary
- Total errors during testing: [count]
- Critical errors: [count]
- Warnings: [count]

## OVERALL: [PASS / FAIL]
```

**If FAIL:** Do NOT report "done". Write failures to progress.md and trigger `/forge-fix`.
**If PASS:** Report to Logan that the implementation is verified AND browser-tested.

## Environment Notes
- Testing happens on the LOCAL dev server, not production
- This means some things won't work (production auth, external webhooks, real payment flows)
- Focus testing on what CAN work locally: UI rendering, navigation, local API calls, state management
- For production-only features, note them as "SKIP — requires production environment" in the report
