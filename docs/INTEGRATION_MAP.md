# Integration Map — Continuous Learning Engine (Component 28)

This document tracks all files created and modified as part of the Continuous Learning Engine implementation.

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
