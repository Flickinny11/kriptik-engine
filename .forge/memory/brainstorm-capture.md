# Brainstorm Capture

> This file is written in real-time during brainstorming sessions with the Supervisor.
> It captures decisions, reasoning, rejected alternatives, and key constraints.
> When planning, the Supervisor reads THIS file — not the degraded chat history.

---

## Active Session: ForgeLoop UI Concept
## Date: 2026-03-24
## Participants: Logan + Supervisor (claude.ai)

### Thread 1: ForgeLoop Desktop App (Original Concept)
**Context:** ForgeLoop currently runs via Claude Code in Cursor's terminal. Logan wants a dedicated UI.
**Options Explored:**
1. Keep using Cursor + Claude Code terminal (REJECTED — no brainstorm text selection, no custom UX, no review dashboard)
2. Electron/Tauri desktop app with Monaco editor (CONSIDERED — full local control, but tied to one machine)
3. Web app deployed to Vercel (SELECTED — see Thread 2)
**Why #1 rejected:** Can't highlight/select text from brainstorm conversations with context. No way to visualize the ForgeLoop pipeline. No review dashboard. Cursor's AI pane is Cursor's, not ForgeLoop's.
**Why #2 considered:** Full control, works offline, can integrate Claude Code CLI as child process, Monaco editor gives VS Code-like file editing. But tied to Logan's Mac.
**Key constraint:** Claude Code cannot be resold. ForgeLoop is Logan's personal dev tool only. This is fine — the UI is not a product for others.

### Thread 2: ForgeLoop as a Web App (Vercel Deployment)
**Context:** Logan realized a webapp would let him work from anywhere — login, select a repo, build with ForgeLoop. Already has GitHub integration via Claude Code.
**Options Explored:**
1. Local-only Electron app (REJECTED — tied to one machine)
2. Web app on Vercel, personal use only (SELECTED)
**Why #2 selected:**
- Login from anywhere (phone, laptop, different machine)
- Select any GitHub repo to work with
- See live UI as builds happen
- Already has GH integration since Claude Code has it
- Easy deploy options (Vercel one-click)
- Could add live preview of the app being built
- Separation is natural — ForgeLoop webapp is the dev tool, KripTik webapp is the product
**Key insight from Logan:** "Basically, if Claude Code had a FULL app builder experience, it would be ForgeLoop."

**Architecture (preliminary):**
- Next.js on Vercel (same stack Logan already knows from KripTik)
- Auth: simple personal auth (not multi-user, just Logan)
- GitHub OAuth for repo selection
- Claude Code running on a remote environment (Modal? or Logan's Mac via tunnel?)
- Monaco editor for file editing
- Chat pane = ForgeLoop Supervisor (brainstorm + plan + review)
- Browser pane = live preview of app being built
- Terminal pane = Claude Code output (usually hidden, ForgeLoop manages it)

### Thread 3: The Killer Feature — Text Selection with Context
**Context:** The single biggest UX gap in all existing tools. When brainstorming for 2 hours, Logan wants to highlight specific text and say "plan this" — and have the full reasoning context come with it.
**How it works in the webapp:**
- Chat pane renders the brainstorm conversation
- Logan highlights text segments (multiple selections possible)
- Right-click → "Add to Plan" or a floating action button
- The webapp captures: the selected text + the corresponding brainstorm-capture.md thread + the surrounding context from the structured document
- When Logan says "plan it," the Supervisor reads the STRUCTURED CAPTURE (not the degraded chat), synthesizes selected threads, generates plan.md
- This is impossible in a terminal. Impossible in claude.ai. Natural in a custom webapp.
**Key constraint discovered:** The brainstorm-capture.md must be written in real-time during the conversation for this to work. If the capture is delayed, the reasoning context won't be there when text is selected.

### Thread 4: Remote Execution Challenge
**Context:** Claude Code runs as a CLI. If ForgeLoop is a webapp on Vercel, where does Claude Code actually run?
**Options Explored:**
1. On Logan's Mac, exposed via tunnel (ngrok/cloudflare) — simple but Mac must be on
2. On a cloud VM (Modal, Fly.io, Railway) — always available but needs Claude Code installed
3. Hybrid: webapp is the UI, connects to wherever Claude Code is running via WebSocket
**Status:** PENDING — needs more research on how to run Claude Code headless in a cloud environment
**Key constraint:** Claude Code needs filesystem access to the repo. If the repo is on GitHub, Claude Code needs to clone it into whatever environment it's running in.

### Thread 5: Portability — Use ForgeLoop on Any Project
**Context:** Logan wants ForgeLoop to work on ANY project, not just KripTik.
**How it works:**
- Open ForgeLoop webapp → select a GitHub repo (or local directory if running locally)
- ForgeLoop checks if .forge/ exists in the repo
- If not: installs the full ForgeLoop infrastructure (.forge/ directory, hooks, skills, commands)
- If yes: reads existing progress.md and resumes where it left off
- The ForgeLoop UI is project-agnostic. The .forge/ directory is project-specific.
**Key insight:** This makes ForgeLoop a personal AI development platform, not just a KripTik tool.

### Thread 6: Easy Deploy Options
**Context:** Logan mentioned wanting to quickly add deploy options to the ForgeLoop UI.
**Ideas:**
- One-click deploy to Vercel (already have the integration)
- One-click deploy to Railway, Fly.io
- Preview deployments for each plan/task
- The ForgeLoop UI shows deployment status alongside build progress
**Status:** PENDING — nice to have, not critical for v1

### Decisions Summary (for plan extraction)
- [x] D1: ForgeLoop UI will be a web app, not a desktop app — accessible from anywhere
- [x] D2: Deploy to Vercel as a separate project (NOT inside KripTik's codebase)
- [x] D3: The killer feature is text selection with reasoning context from brainstorm-capture.md
- [x] D4: ForgeLoop is project-agnostic — select any repo, install .forge/ if needed
- [ ] D5: (PENDING) Where does Claude Code run? Local Mac via tunnel vs. cloud VM vs. hybrid
- [ ] D6: (PENDING) Auth model — just Logan, or potentially other solo founders later?
- [x] D7: Build the UI AFTER validating ForgeLoop workflow in Cursor first (1-2 weeks)
- [ ] D8: (PENDING) Easy deploy options (Vercel one-click, etc.) — nice to have for v1

### Open Questions for Next Brainstorm
1. Can Claude Code run headless on a cloud VM? What's the auth model?
2. Should the ForgeLoop webapp have its OWN .forge/ for building itself? (meta!)
3. What's the minimum viable UI — just the chat pane + file tree, or full Monaco + browser + terminal?
4. Could this eventually be a product for other non-coding founders? (Logan's call, separate discussion)
