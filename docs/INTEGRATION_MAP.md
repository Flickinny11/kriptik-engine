# Integration Map

This document tracks files created and modified for major system integrations.

**See also:**
- [Dependency Management Architecture](./DEPENDENCY_MANAGEMENT_ARCHITECTURE.md) — Full architecture doc for the MCP client, service registry, browser agent fallback, and token storage

---

## Continuous Learning Engine (Component 28)

Files created and modified as part of the Continuous Learning Engine implementation.

## New Files

| File | Phase | Purpose | Imports From | Imported By |
|------|-------|---------|-------------|-------------|
| `src/brain/global-memory.ts` | 1 | Global experience memory (Qdrant multi-vector, convergence scoring) | `@qdrant/js-client-rest`, `embeddings.ts`, `types/index.ts` | `engine.ts`, `experience-extractor.ts`, `experience-retriever.ts`, `experience-reinforcer.ts`, `experience-metrics.ts` |
| `src/brain/experience-extractor.ts` | 2 | Post-build learning extraction via LLM | `brain-service.ts`, `global-memory.ts`, `providers/router.ts`, `types/index.ts` | `engine.ts` |
| `src/brain/experience-retriever.ts` | 3 | Build-start experience retrieval | `brain-service.ts`, `global-memory.ts`, `types/index.ts` | `engine.ts` |
| `src/brain/experience-reinforcer.ts` | 4 | Pathway strengthening/weakening | `brain-service.ts`, `global-memory.ts`, `types/index.ts` | `engine.ts` |
| `src/brain/experience-tracker.ts` | 5 | Agent-experience interaction monitoring | `brain-service.ts`, `types/index.ts` | `engine.ts` |
| `src/brain/experience-metrics.ts` | 6 | Learning engine observability | `global-memory.ts` | `engine.ts` |
| `src/brain/__tests__/global-memory.test.ts` | 1 | Global memory integration tests | `global-memory.ts`, `embeddings.ts` | N/A |
| `src/brain/__tests__/experience-extractor.test.ts` | 2 | Extraction integration tests | `experience-extractor.ts`, `global-memory.ts`, `brain-service.ts` | N/A |
| `src/brain/__tests__/experience-retriever.test.ts` | 3 | Retrieval integration tests | `experience-retriever.ts`, `global-memory.ts`, `brain-service.ts` | N/A |
| `src/brain/__tests__/experience-reinforcer.test.ts` | 4 | Reinforcement integration tests | `experience-reinforcer.ts`, `global-memory.ts`, `brain-service.ts` | N/A |
| `src/brain/__tests__/experience-integration.test.ts` | 5 | Full integration tests (tracker + prompts with native deps) | `experience-tracker.ts`, `brain-service.ts`, prompts | N/A |
| `src/brain/__tests__/experience-prompts.test.ts` | 5 | Pure prompt tests (no native deps) | `specialist.ts`, `lead.ts` | N/A |
| `scripts/session-continuity.sh` | Setup | Ralph Wiggum equivalent for session handoff | N/A (shell) | N/A |
| `vitest.config.ts` | Setup | Vitest test framework configuration | N/A | N/A |

## Modified Files

| File | Phases | Changes |
|------|--------|---------|
| `src/types/index.ts` | 1 | Added `ExperienceNode`, `ExperienceQuery`, `BuildOutcome` interfaces |
| `src/brain/embeddings.ts` | 1 | Added `generateEmbeddingBatch()` method to interface and implementation |
| `src/brain/schema.ts` | 3 | Added `'experience'` to `NODE_TYPES` array |
| `src/engine.ts` | 1-6 | Imports all new services. Initializes `GlobalMemoryService` in parallel with template seeding. Creates `ExperienceExtractor`, `ExperienceReinforcer`, `ExperienceTracker`, `ExperienceMetrics`. Wires build_complete subscription for async extraction + reinforcement. Wires experience retrieval before `startLead()`. Emits `experience_metrics` SSE events at build start and after reinforcement. |
| `src/bridge/sse-emitter.ts` | 2, 6 | Added `experience_extracted` and `experience_metrics` to `SSEEventType` union. Added cases to `handleEngineEvent()` switch. |
| `src/agents/prompts/lead.ts` | 3 | Added "Experience from Past Builds" section advising the Lead Agent about experience nodes — advisory, not prescriptive. |
| `src/agents/prompts/specialist.ts` | 5 | Added `SpecialistExperience` interface. Updated `buildSpecialistSystemPrompt` to accept optional `relevantExperiences`. Added `formatExperienceSection()` helper. |
| `src/agents/runtime.ts` | 5 | Updated `spawnSpecialist()` to query Brain for experience nodes, filter by domain relevance, and pass top 5 to specialist prompt builder. |
| `src/tools/analyze/intent.ts` | 5 | Updated `execute()` to accept `ctx` (ToolContext), query Brain for experience nodes, and include them as advisory context in the LLM prompt. |
| `src/index.ts` | 1 | Added `GlobalMemoryService` export |
| `CLAUDE.md` | 7 | Added comprehensive Component 28 documentation section |

## Event Flow

```
Engine Start (initEngine)
    │
    ├── GlobalMemoryService.initialize()  ← creates/verifies kriptik_experience collection
    ├── seedTemplateBrain()               ← (in parallel)
    │
    ├── ExperienceMetrics.formatForSSE()  → SSE: experience_metrics
    │
    ├── ExperienceRetriever.retrieveForBuild()
    │       ├── GlobalMemoryService.queryExperience() ← spreading activation
    │       ├── Brain.writeNode(type: 'experience')   ← for each result
    │       └── GlobalMemoryService.incrementActivation()
    │
    ├── ExperienceTracker.start()  ← subscribes to brain events
    │
    ├── runtime.startLead()
    │       └── Agents discover experience nodes via brain_query / brain_get_nodes_by_type
    │
    ├── runtime.spawnSpecialist()
    │       └── Query brain for experience → filter by domain → inject into specialist prompt
    │
    └── On build_complete (brain status node)
            ├── ExperienceExtractor.extractAndStore()
            │       ├── Gather all Brain nodes
            │       ├── LLM reflection (Sonnet) → structured learnings
            │       └── GlobalMemoryService.writeExperience() for each
            │
            ├── SSE: experience_extracted
            │
            ├── ExperienceReinforcer.reinforceFromBuild()
            │       ├── Find used experiences (experience brain nodes → globalExperienceId)
            │       ├── Determine build outcome from brain state
            │       ├── Success → reinforce, Failure → weaken, Mixed → no change
            │       └── Every 10 builds → decay cycle
            │
            └── SSE: experience_metrics (updated)
```

## Environment Variables

No new environment variables required. Uses existing:
- `QDRANT_URL` — Qdrant vector database endpoint
- `QDRANT_API_KEY` — Optional Qdrant auth
- `HF_API_KEY` — HuggingFace API for embeddings
- `ANTHROPIC_API_KEY` — For LLM calls in extraction (uses Sonnet)

## Dependencies

No new npm dependencies. Uses existing:
- `@qdrant/js-client-rest` — Qdrant client (named vectors support in v1.17+)
- `@huggingface/inference` — Embedding generation
- `uuid` — Experience node ID generation
- `vitest` (devDep, new) — Test framework

---

## Dependency Management System

Files created as part of the dependency management system (Tasks 1-11 in `docs/plans/dependency-management.md`).

### New Server Files

| File | Task | Purpose |
|------|------|---------|
| `server/src/mcp/client.ts` | 1 | Universal MCP OAuth 2.1 + PKCE connector |
| `server/src/mcp/discovery.ts` | 1 | RFC 9728 + RFC 8414 metadata discovery |
| `server/src/mcp/registration.ts` | 1 | RFC 7591 Dynamic Client Registration |
| `server/src/mcp/token-store.ts` | 1 | Encrypted per-user per-service token storage |
| `server/src/mcp/types.ts` | 1 | MCP TypeScript type definitions |
| `server/src/mcp/index.ts` | 1 | MCP module public API |
| `server/src/services/registry.ts` | 2 | 38 service catalog entries |
| `server/src/services/registry-types.ts` | 2 | Registry TypeScript types |
| `server/src/services/categories.ts` | 2 | 13 category definitions |
| `server/src/services/custom-servers.ts` | 2 | Custom MCP server support |
| `server/src/services/index.ts` | 2 | Services module public API |
| `server/src/browser-agent/session-manager.ts` | 4 | Browser agent session lifecycle |
| `server/src/browser-agent/templates.ts` | 4 | Workflow templates for 8 non-MCP services |
| `server/src/browser-agent/browser-use-client.ts` | 4 | Browser Use Cloud API + local simulation |
| `server/src/browser-agent/credential-generator.ts` | 4 | Password gen + vault storage |
| `server/src/browser-agent/email-verifier.ts` | 4 | Gmail MCP verification + manual fallback |
| `server/src/browser-agent/types.ts` | 4 | Browser agent TypeScript types |
| `server/src/browser-agent/index.ts` | 4 | Browser agent module public API |
| `server/src/routes/services.ts` | 8, 9 | Service catalog + instance CRUD API routes |
| `server/src/routes/mcp.ts` | 9 | MCP OAuth flow + tools + health API routes |

### New Client Files

| File | Task | Purpose |
|------|------|---------|
| `client/src/components/dependencies/ConnectButton.tsx` | 3 | 6-state connect button (MCP + fallback) |
| `client/src/components/dependencies/ConnectionStatusIndicator.tsx` | 3 | Branded logo + animated status dot |
| `client/src/components/dependencies/FallbackApprovalDialog.tsx` | 3, 4 | Browser agent approval + progress |
| `client/src/components/dependencies/TierSelector.tsx` | 3 | Post-connection subscription picker |
| `client/src/components/dependencies/EmailMcpBanner.tsx` | 5 | Dashboard email MCP setup banner |
| `client/src/components/dependencies/index.ts` | 3 | Dependencies module public API |
| `client/src/pages/DependenciesPage.tsx` | 6 | Main catalog — My Dependencies / Browse All |
| `client/src/pages/DependencyDashboard.tsx` | 7 | Individual service management dashboard |
| `client/src/pages/ProjectDependenciesPage.tsx` | 8 | Per-project dependency view |
| `client/src/hooks/useDependencyConnect.ts` | 3, 4, 9 | OAuth popup + fallback connection hook |
| `client/src/store/useDependencyStore.ts` | 9 | Global Zustand dependency state |

### Modified Files

| File | Tasks | Changes |
|------|-------|---------|
| `server/src/schema.ts` | 1, 8 | Added `mcp_connections`, `mcp_tool_caches`, `mcp_oauth_states`, `project_service_instances` tables |
| `client/src/App.tsx` | 5, 7, 8 | Added routes: `/dependencies`, `/dependencies/:serviceId`, `/projects/:projectId/dependencies` |
| `client/src/components/builder/QuestionTile.tsx` | 3, 9 | Dual-mode: MCP ConnectButton for registry matches, legacy OAuth fallback |
| `client/src/lib/api-client.ts` | 6, 8, 9 | Added dependency API methods: getServices, getMcpConnections, createServiceInstance, etc. |
| `client/src/components/ui/BrandIcon.tsx` | 10 | Added 13 custom brand SVGs for services missing from simple-icons |
| `client/src/index.css` | 10 | Added global focus-visible indicator (KripTik orange outline) |
| `CLAUDE.md` | 1-11 | Added dependency system documentation for each task + structured reference section |

### Database Tables Added

| Table | Purpose |
|-------|---------|
| `mcp_connections` | Encrypted OAuth tokens per user per service |
| `mcp_tool_caches` | MCP tools/list cache (24hr TTL) |
| `mcp_oauth_states` | Temporary CSRF state during OAuth |
| `project_service_instances` | Project-to-service associations |

### Dependencies Added

| Package | Side | Purpose |
|---------|------|---------|
| `simple-icons` | Client | Branded service logos (25/38 covered) |
| `uuid` | Server | Used for connection/instance IDs (already existed) |
