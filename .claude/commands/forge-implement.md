---
description: "Fully autonomous: implement → build in dev server → monitor logs → browser-test with vision → fix in accordance with spec → retest → next phase. Repeats per phase. No manual commands needed."
disable-model-invocation: true
---

Read `.forge/skills/forge-implement/SKILL.md` and follow its instructions exactly.

This is the FULL autonomous pipeline. It does NOT just write code.

For EACH phase in the plan, it automatically:
1. Implements the code (with constraints, hooks, memory)
2. Installs deps, builds in dev server (vercel dev / npm run dev)
3. Spawns monitoring agents for build logs + runtime logs
4. Opens browser via Claude computer use / vision
5. Navigates to what was just implemented, interacts, screenshots
6. Cross-references visual output with runtime logs
7. Detects silent failures (200 with error body, stale state, auth expiry)
8. If ANYTHING fails → fixes IN ACCORDANCE with spec/plan/constraints → retests
9. ONLY when browser-verified → commits → moves to next phase

After ALL phases: runs full deep verification + full browser walkthrough.
Implementation is ONLY done when typed "PLAN VERIFIED AND BROWSER-TESTED" in progress.md.

Auth note: Wait for Logan to log in. Do not enter credentials.
Env note: Use `vercel dev` for production-like localhost environment.
