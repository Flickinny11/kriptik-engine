# ForgeLoop Decision Log

## D-001: Adopt ForgeLoop Build System
**Date:** 2026-03-24
**Context:** KripTik needs a structured pipeline for Claude Code-driven development that prevents drift, maintains memory across sessions, and produces production-grade code for a ~200k LOC codebase.
**Decision:** Build ForgeLoop — a Supervisor/Executor pipeline with memory harness, plan compiler, and drift prevention.
**Reasoning:** Research across current (March 2026) best practices shows that the Supervisor/Executor split with persistent documents, hooks for deterministic enforcement, and spec-driven development produces the most reliable results for complex, long-running AI-assisted projects. No single existing tool covers the full brainstorm-to-production pipeline. ForgeLoop integrates the best patterns into a unified system.
**Consequences:** Upfront investment in building the system. Patterns directly reusable for KripTik's internal build engine.

## D-002: Place ForgeLoop in .forge/ Directory
**Date:** 2026-03-24
**Context:** Need a home for all ForgeLoop artifacts that doesn't conflict with existing project structure.
**Decision:** Use `.forge/` at project root with subdirectories for memory, plans, drift-prevention, skills, hooks, logs, and mcp.
**Reasoning:** Keeps ForgeLoop clearly separated from KripTik source code. The `.` prefix follows convention for tooling directories (.claude, .git, etc.). Easy to .gitignore selectively (e.g., logs).


## D-003: Restructure CLAUDE.md — ForgeLoop to Top, Old Engine Deprecated
**Date:** 2026-03-24
**Context:** The 627-line CLAUDE.md was dominated by old single-agent engine instructions including "UNTOUCHABLE" language and 11 prohibitions that would steer future sessions toward the deprecated architecture.
**Decision:** Move ForgeLoop section to the top of CLAUDE.md. Wrap old engine section in deprecation notice. Clearly mark which src/ components stay vs. get replaced. Condense from 627 to 288 lines.
**Reasoning:** Instructions at the top of CLAUDE.md survive context degradation better. The old prohibitions would actively fight ForgeLoop's purpose. The server, client, design system, and dependency management sections remain accurate and useful.
**Consequences:** Claude Code sessions will now prioritize ForgeLoop protocol. Old engine-specific guidance is visible but clearly marked as deprecated.

## D-004: Convert check-mechanical.sh to Advisory Mode
**Date:** 2026-03-24
**Context:** The script blocked commits containing patterns like orchestration classes, task lists, and agent role definitions — patterns the new engine will legitimately need.
**Decision:** Change from blocking (exit 1) to advisory (exit 0). Keep three genuinely bad patterns as warnings. Allow SKIP_MECHANICAL_CHECK=true to suppress entirely.
**Reasoning:** Completely removing the script loses institutional knowledge about anti-patterns. Advisory mode preserves awareness without blocking valid new engine work.

## D-005: Relax Engine Protection in check-modularity.sh
**Date:** 2026-03-24
**Context:** The script required [engine] tag in commit messages to modify src/ files, enforcing the "UNTOUCHABLE" rule.
**Decision:** Remove the [engine] tag requirement. Show advisory notice when src/ files are modified. Keep cross-layer import checks (still valid).
**Reasoning:** src/ will be substantially modified during engine replacement. Blocking commits to src/ defeats the purpose of ForgeLoop. Cross-layer imports remain genuinely harmful regardless of architecture.


## D-006: Strict Forge/KripTik Product Boundary
**Date:** 2026-03-24
**Context:** Logan identified that the Architecture Map MCP was using a collection name (kriptik-architecture) that could be confused with KripTik's product Qdrant collections. If ForgeLoop's dev data contaminated product collections, users building apps with KripTik would get KripTik's own source code architecture in their queries instead of their app's structure.
**Decision:** Rename ForgeLoop's collection to `forgeloop_dev_codebase`. Add explicit separation documentation to CLAUDE.md, architecture-server.js, and FORGELOOP-SPEC.md. ForgeLoop NEVER imports from `src/brain/`. ForgeLoop NEVER writes to product collections. ForgeLoop NEVER ships to users.
**Reasoning:** ForgeLoop wraps Claude Code which cannot be resold. It is a development tool only. KripTik's Brain/Qdrant is product infrastructure for user app building. These must never be entangled. Even the pattern reuse (HuggingFace embeddings + Qdrant) is reimplemented independently in .forge/mcp/ rather than imported from src/brain/.
**Consequences:** ForgeLoop operates in a completely isolated Qdrant namespace. Any future MCP tools for ForgeLoop must use `forgeloop_` prefix for collections.
