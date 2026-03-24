---
description: "Browser testing — starts dev server, uses Claude vision + computer use to test the actual app, clicks buttons, checks auth, monitors runtime logs simultaneously, detects silent failures"
disable-model-invocation: true
---

Read the skill definition at `.forge/skills/forge-browser-test/SKILL.md` and follow its instructions exactly.

## Three concurrent jobs:
1. **USE the app** — navigate, click, fill forms, test every feature from the plan
2. **READ runtime logs** — spawn a teammate monitoring dev server output for errors
3. **COMPARE** — what you see in the browser vs what the plan says should exist

## Protocol:
1. Start dev server if not running
2. Logan must log in if auth is required (wait for him)
3. Smoke test — page loads, no console errors, no failed requests
4. Feature-by-feature testing against the plan
5. Silent failure scan — auth expiry, empty responses, stale state, race conditions
6. Cross-reference visual results with runtime logs

Write results to `.forge/logs/browser-test-report.md`.
If FAIL: trigger `/forge-fix`. If PASS: report done to Logan.

NOTE: Testing on local dev server. Production-only features (external webhooks, real payments)
should be marked "SKIP — requires production" in the report.
