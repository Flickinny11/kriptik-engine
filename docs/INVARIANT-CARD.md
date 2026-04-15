# INVARIANT-CARD.md — Quick Reference (Tape This to Your Monitor)

```
╔══════════════════════════════════════════════════════════════════╗
║                 PRISM ENGINE — 10 INVARIANTS                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  1. GRAPH = APP         Graph persists at runtime. Not compiled.║
║  2. SELF-CONTAINED      Caption alone → complete implementation ║
║  3. NO CONTAMINATION    DELETE broken code. Regen from spec.    ║
║  4. CONTRACT FIRST      tRPC/Zod BEFORE any code generation     ║
║  5. SSE ONLY            No WebSockets. No polling. No new RT.   ║
║  6. MODAL RUNS IT       No GPU work on Vercel. Ever.            ║
║  7. TEXT IS SOLVED       Sharp+SVG / MSDF / Ideogram tiered     ║
║  8. BIPARTITE DAG       Many-to-many. Reparent-on-navigate.     ║
║  9. IDENTICAL PROMPT     System prompt same for ALL containers   ║
║ 10. ADDITIVE SCHEMA     Never drop. Never rename. Never retype. ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  CONTAMINATION PROTOCOL (the #1 most important rule):           ║
║                                                                  ║
║  Attempt 1: caption + visual + behavior ONLY                    ║
║  Attempt 2: + natural language error description                ║
║  Attempt 3: escalate to Claude Opus 4.6 (full context OK here) ║
║                                                                  ║
║  AT NO POINT: broken code, error messages, stack traces, AST    ║
╠══════════════════════════════════════════════════════════════════╣
║  BEFORE EACH PHASE: re-read PRE-TASK-HOOK.md                   ║
║  AFTER EACH PHASE:  verify PHASE-GATES.md                      ║
║  AFTER EACH FILE:   run tsc --noEmit                            ║
╚══════════════════════════════════════════════════════════════════╝
```
