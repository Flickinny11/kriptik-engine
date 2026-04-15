/**
 * Orchestrator module — Phase A Step 3.
 *
 * Exports the dependency graph and Cortex Orchestrator that tie
 * the agent harness (Step 1) and build repository (Step 2) together
 * into the core build loop.
 */

export { DependencyGraph } from "./dependency-graph.js";
export { CortexOrchestrator } from "./cortex-orchestrator.js";

// Phase E, Step 23 — Competitive Generation for Critical Paths
export { CriticalPathIdentifier } from "./critical-path-identifier.js";
export { ImplementationComparator } from "./implementation-comparator.js";
export type { ImplementationComparatorDeps } from "./implementation-comparator.js";
export { TournamentSelector } from "./tournament-selector.js";
export { CompetitiveGenerationCoordinator } from "./competitive-generation-coordinator.js";
