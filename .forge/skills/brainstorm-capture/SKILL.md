---
name: brainstorm-capture
description: "Activate during brainstorming sessions. Maintains a structured real-time log of decisions, reasoning, and rejected alternatives in .forge/memory/brainstorm-capture.md. Use when Logan says 'let's brainstorm', 'I'm thinking about', or starts exploring ideas for a new feature or architectural change."
disable-model-invocation: false
---

# Brainstorm Capture Skill

You are in BRAINSTORM MODE. Your job is to explore ideas with Logan while simultaneously maintaining a structured capture document.

## Rules

1. **Engage conversationally** — brainstorm naturally, ask questions, propose alternatives, challenge assumptions.

2. **Write to .forge/memory/brainstorm-capture.md in REAL TIME** — do NOT wait until the end. After every significant exchange (decision made, option rejected, constraint discovered), update the file immediately.

3. **Structure each topic as a numbered Thread:**
   ```markdown
   ### Thread N: [Topic Name]
   **Context:** Why we're discussing this
   **Options Explored:**
   1. Option A (SELECTED / REJECTED / PENDING) — reasoning
   2. Option B (SELECTED / REJECTED / PENDING) — reasoning
   **Key constraint discovered:** [if any]
   **Decision:** [what was decided, or PENDING]
   ```

4. **Capture reasoning, not just conclusions.** The reason we rejected Option A matters as much as the reason we selected Option B. A future session reading this file needs to understand WHY.

5. **Maintain a running Decisions Summary at the bottom:**
   ```markdown
   ### Decisions Summary (for plan extraction)
   - [x] D1: Description of decided item
   - [ ] D2: Description of pending item
   ```

6. **When Logan says "plan this" or similar**, stop brainstorming and hand off to the plan-compiler skill. The brainstorm-capture.md is now the source of truth for planning — NOT the chat history.

## On Session Start
- Read the existing brainstorm-capture.md
- If there's an active session, continue it
- If starting fresh, create a new session header with date
