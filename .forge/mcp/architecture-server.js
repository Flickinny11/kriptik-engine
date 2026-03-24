/**
 * ForgeLoop Architecture Map MCP Server
 * ======================================
 * 
 * SCAFFOLD — This file defines the structure and tool interfaces.
 * The actual implementation should be built via ForgeLoop Sprint 3.
 * 
 * Run: node .forge/mcp/architecture-server.js
 * Or register in .claude/settings.local.json as an MCP server.
 * 
 * Tools:
 * - search_architecture(query, limit?) — Semantic search across codebase
 * - get_interface(name) — Returns exact interface definition from source
 * - check_integration(from, to) — Validates integration points exist
 * - query_endpoints(module) — Lists API endpoints in a module
 * - query_dependencies(component) — What depends on this component
 * - update_map() — Re-indexes changed files in Qdrant
 * 
 * Architecture:
 * 1. On first run / update_map: walks the codebase, extracts structure
 *    (interfaces, exports, imports, function signatures, class definitions)
 * 2. Generates embeddings via HuggingFace sentence-transformers
 *    (KripTik already has this in src/brain/embeddings.ts — reuse it)
 * 3. Stores vectors in Qdrant collection "kriptik-architecture"
 * 4. On query: embeds the query, searches Qdrant, returns relevant code context
 * 
 * Dependencies needed: @modelcontextprotocol/sdk, @qdrant/js-client-rest
 * Can reuse: src/brain/embeddings.ts for HuggingFace embedding generation
 * 
 * THIS IS A BUILD TARGET FOR FORGELOOP SPRINT 3.
 * Do not implement manually — use /forge-brainstorm to design, then /forge-compile + /forge-implement.
 */

// TODO: Sprint 3 — Implement via ForgeLoop
console.log('ForgeLoop Architecture Map MCP — scaffold only. Build via Sprint 3.');
process.exit(1);
