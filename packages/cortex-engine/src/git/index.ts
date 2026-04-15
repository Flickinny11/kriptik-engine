/**
 * Git subsystem — branch isolation, scope enforcement, and merge gate.
 *
 * Spec Section 4.2 — Tier 2: Shared Repository Layer
 * Spec Section 4.3 — The Merge Gate
 */

export { BranchManager } from "./branch-manager.js";
export type { BranchManagerOptions } from "./branch-manager.js";

export { checkScope } from "./scope-enforcer.js";

export { MergeGate } from "./merge-gate.js";
export type { MergeGateOptions } from "./merge-gate.js";

export { BuildRepository } from "./build-repository.js";
export type { BuildRepositoryOptions } from "./build-repository.js";
