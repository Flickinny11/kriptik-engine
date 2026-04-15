/**
 * State management module — Phase B, Step 10.
 *
 * Build State Manager and Warm-Up Sequence Builder.
 * Tier 1 shared service for tracking build-wide agent state,
 * goal progress, and constructing rotation warm-up sequences.
 *
 * Spec Section 4.2 — Tier 1 Shared Services Layer.
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences.
 */

// Phase B, Step 10 — Build State Manager
export { BuildStateManager } from "./build-state-manager.js";
export type { BuildStateEventHandler } from "./build-state-manager.js";

// Phase B, Step 10 — Warm-Up Sequence Builder
export { WarmUpSequenceBuilder } from "./warm-up-builder.js";
export type { WarmUpSequenceBuilderConfig } from "./warm-up-builder.js";
