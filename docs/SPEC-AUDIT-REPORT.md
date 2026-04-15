# Prism Engine — Spec Audit Report

**Date:** 2026-04-08  
**Auditor:** Claude Opus 4.6  
**Purpose:** Compare DIFFUSION-ENGINE-SPEC.md and all steering documents against the 5 research documents to identify drift, omissions, and Cortex contamination.

---

## Audit Methodology

Compared every claim and architectural decision in DIFFUSION-ENGINE-SPEC.md against:
1. `Diffusion_App_Building_Stack_-_Rough_Draft_` (primary technical research)
2. `Updated_Diffusion_Stack_W__Knowledge_Graph___Fine-tuning_System` (knowledge graph architecture)
3. `Validating_diffusion_app_building_with_knowledge_graph_` (architectural validation)
4. `Intent-To-Plan_Research` (planning phase research)
5. `Backend_Building_Research___Potential_Stack_` (backend pipeline research)

---

## FINDING 1: Cortex Contamination in Steering Documents (CRITICAL)

**Affected files:** CLAUDE.md, cortex-engine.md, integration-bridge.md, CLAUDE-CODE-BUILD-PROMPT.md

The entire steering system was designed as a *dual-engine* integration — giving equal weight and attention to preserving Cortex behavior. This is backwards for the implementation context. When Claude Code starts implementing Prism, the constant presence of Cortex rules, file ownership tables, and "NEVER touch Cortex" warnings creates attentional drag and ambiguity about what the *actual* task is.

**Specific contamination points:**
- CLAUDE.md line 10-11: "Kriptik has TWO builder engines. Both are first-class citizens" — frames Prism as an addition to Cortex, not the primary implementation target
- CLAUDE.md line 14: References `docs/cortex-spec-v1.1.md` as a co-equal spec — creates ambiguity about which spec governs
- CLAUDE.md lines 75-77: "All 26 Cortex implementation steps remain as specified" — irrelevant to Prism implementation, wastes attention
- cortex-engine.md: An entire file devoted to Cortex freezing rules — this is defensive noise during Prism build
- integration-bridge.md lines 13-14: "Existing Cortex behavior MUST NOT change" as "The Prime Directive" — elevates Cortex preservation above Prism correctness

**Fix:** Rewrite all steering documents with Prism as the singular implementation target. Cortex preservation is a *constraint*, not a directive.

---

## FINDING 2: SAM 3 vs SAM 3.1 Inconsistency (MODERATE)

**Affected files:** DIFFUSION-ENGINE-SPEC.md (multiple sections), prism-engine.md

The validation document (line 95) explicitly states: "SAM 3.1 does not exist — the latest is SAM 3." However, the rough draft research (line 169) describes "SAM 3.1 (released March 27, 2026)" with Object Multiplex. The rough draft is the more recent and detailed research document.

The spec uses "SAM 3" consistently (correct per the rough draft's primary reference) but the research clearly documents SAM 3.1 as a real release with specific features (Object Multiplex for multi-object tracking). The validation doc's correction appears to have been written before the SAM 3.1 release.

**Fix:** Standardize on SAM 3.1 in the spec. The rough draft research explicitly names it with a release date (March 27, 2026) and specific features.

---

## FINDING 3: Missing Post-Caption Verification Blast (MODERATE)

**Source:** User memory states this was a pipeline refinement Logan introduced: "A post-caption verification blast using a separate world model producing binary pass/fail results."

The spec (Section 9, lines 1310-1316) includes "Post-Segmentation Verification" using a vision model for binary pass/fail, which partially captures this. However, it's scoped only to segmentation verification, not to verifying that generated captions/specs accurately describe the planned elements before code generation begins.

**Fix:** Add an explicit caption verification step between graph construction (Step 9 in pipeline) and code generation (Step 11). The world model verifies that each node's caption is a complete, accurate, self-contained specification. Binary pass/fail.

---

## FINDING 4: Pre-Installing Dependencies Not Fully Specified (MINOR)

**Source:** User memory: "Pre-installing dependencies at plan acceptance time."

The spec mentions this in Section 12 (line 1466-1468): "At plan acceptance time (before any code generation), pre-install all dependencies that the plan specifies." But it's a single sentence with no implementation detail. The Modal container images (Section 5) pre-bake core dependencies, but there's no mechanism for plan-specific dependencies.

**Fix:** Expand the dependency pre-installation specification in the plan approval flow. When the plan is approved, parse all required npm/pip packages from the plan's service and integration specs, and ensure they're available in the code generation containers before dispatching.

---

## FINDING 5: Application Domain Knowledge Graph Underspecified (MODERATE)

**Source:** Intent-To-Plan Research, Section "The inferred needs mapper"

The research describes a comprehensive 4-layer architecture for inferred needs mapping, including a "Labeled Property Graph mapping app_type → required_features → required_components → UI_patterns → infrastructure_needs" covering ~200 common application types.

The spec (Section 8, line 1248) says: "Map appType → feature dependency tree (hardcoded knowledge graph of ~200 app types)" — this is a one-liner for what the research describes as the most novel and hardest subsystem.

**Fix:** The spec should acknowledge this is initially a hardcoded lookup table that will be expanded over time, but provide the initial schema and at least 10-20 app type mappings as deterministic fixtures.

---

## FINDING 6: No Deterministic Checkpoint Hashes (CRITICAL for drift prevention)

The spec has no mechanism for verifying that the implementation matches the spec at each phase gate. There are acceptance criteria (Section 20), but they're English prose, not machine-verifiable. Claude Code can satisfy the spirit while drifting from the letter.

**Fix:** Create deterministic checkpoint files with specific type signatures, function names, file paths, and test assertions that can be mechanically verified.

---

## FINDING 7: Missing Contamination-Aware Repair Detail (MINOR)

The research (rough draft, lines 141-147) describes a three-tier repair protocol with specific strategy at each tier. The spec captures this correctly in Section 12. However, the research also mentions:
- REx (NeurIPS 2024) Thompson Sampling for adaptive repair budget allocation
- TokenRepair for targeted token-level fixes on complex code
- Embedding similarity as a pre-filter before SWE-RM

The spec omits these optimizations. For v1 this is acceptable, but they should be noted as future enhancements.

**Status:** Acceptable for v1. No correction needed.

---

## FINDING 8: Spec Correctly Implements Research (CONFIRMED)

The following architectural decisions in the spec are confirmed as aligned with research:

- ✅ Bipartite DAG topology (from validation research)
- ✅ Reparent-on-navigate for shared nodes (from validation research)
- ✅ Graph-to-tree adapter for PixiJS (from validation research)
- ✅ XState statechart for navigation (from validation research)
- ✅ RadixAttention prefix caching via SGLang (from rough draft)
- ✅ Contamination-aware repair (from rough draft)
- ✅ SWE-RM continuous scoring with thresholds (from rough draft)
- ✅ FLUX.2 Klein for speed, Pro for quality (from rough draft)
- ✅ PixiJS v8 with WebGPU preferred (from rough draft)
- ✅ Text rendering tiered hybrid (from rough draft)
- ✅ GEPA proposer-evaluator for overnight optimization (from KG research)
- ✅ tRPC contract-first parallel generation (from backend research)
- ✅ Pulumi Automation API for IaC (from backend research)
- ✅ Cloudflare Workers for fastest backend deploy (from backend research)
- ✅ Modal as execution fabric (from rough draft)
- ✅ Firecrawl branding format for competitive analysis (from intent-to-plan)
- ✅ Reasoning-first schema pattern (from intent-to-plan)
- ✅ Claude Opus 4.6 for planning (from intent-to-plan)
- ✅ Three-phase lifecycle: generate → runtime → optimize (from KG research)

---

## FINDING 9: No Pre-Task Hooks for Claude Code (CRITICAL for drift prevention)

Claude Code has no mechanism to force spec re-reading before each implementation task. The RALPH loop is described in prose, but Claude Code won't mechanically enforce it. Over a long implementation session, the model will increasingly rely on its in-context understanding rather than re-reading the spec, leading to gradual drift.

**Fix:** Create a pre-task hook document that must be read AND acknowledged at the start of every implementation phase. Include phase-specific invariants and a checklist.

---

## FINDING 10: Build Prompt Lacks Drift Detection Questions (MODERATE)

The CLAUDE-CODE-BUILD-PROMPT.md tells Claude Code what to build and in what order, but doesn't include self-interrogation checkpoints. After each phase, Claude Code should answer specific drift-detection questions:

- "Did I use any types not defined in shared-interfaces?"
- "Did I introduce any new real-time channel other than SSE?"
- "Did I show broken code to a repair model?"
- "Did I put compute-heavy work on the Vercel server?"

**Fix:** Add self-interrogation checkpoints after each phase in the build prompt.

---

## Summary of Required Actions

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | Cortex contamination in steering | CRITICAL | Rewrite all steering docs |
| 2 | SAM 3 vs 3.1 | MODERATE | Standardize on SAM 3.1 |
| 3 | Missing caption verification | MODERATE | Add to pipeline spec |
| 4 | Dependency pre-install underspecified | MINOR | Expand specification |
| 5 | Domain KG underspecified | MODERATE | Add initial schema/fixtures |
| 6 | No deterministic checkpoints | CRITICAL | Create checkpoint files |
| 7 | Missing repair optimizations | MINOR | Note as future work |
| 8 | Core architecture aligned | — | No action (confirmed) |
| 9 | No pre-task hooks | CRITICAL | Create hook system |
| 10 | No drift self-interrogation | MODERATE | Add to build prompt |
