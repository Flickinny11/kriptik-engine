/**
 * Core engine interfaces — the top-level contract between the KripTik application
 * and the Cortex orchestration engine.
 *
 * Spec Section 1.1 — What Cortex Is
 * Spec Section 4.1 — Dependency-Graph-Driven Scheduling
 * Spec Section 10.1 — What "Done" Means
 */

import type { IAgentSession, IGoalAssignment } from "./agents.js";
import type { IDriftSignal } from "./drift.js";
import type { ILivingSpecification } from "./ice.js";
import type { IMergeGateResult } from "./verification.js";

// ---------------------------------------------------------------------------
// Build lifecycle
// ---------------------------------------------------------------------------

/** The possible phases a build passes through. */
export type BuildPhase =
  | "intent"          // ICE 2.0 processing the user prompt
  | "planning"        // Architect producing blueprint + dependency graph
  | "executing"       // Agents working on goals
  | "verifying"       // End-of-build comprehensive UX verification
  | "deploying"       // Deployment to user's configured platform
  | "complete"        // All verification passed, build delivered
  | "failed";         // Unrecoverable failure (should be extremely rare per spec 10.5)

/** Severity levels for build events surfaced to the user. */
export type BuildEventSeverity = "info" | "warning" | "error" | "critical";

/**
 * A discrete event emitted during a build for observability.
 * These flow to the user via AG-UI and are persisted in the Build State Tracker.
 */
export interface IBuildEvent {
  /** Monotonically increasing event ID within this build. */
  readonly id: string;
  readonly timestamp: Date;
  readonly phase: BuildPhase;
  readonly severity: BuildEventSeverity;
  /** Human-readable summary of what happened. */
  readonly message: string;
  /** Optional structured payload for programmatic consumption. */
  readonly payload?: Record<string, unknown>;
}

/**
 * ICortexEngine — the top-level engine interface.
 *
 * This is what the KripTik application calls to start, monitor, and interact
 * with a build. The engine is a black box that accepts a user prompt and
 * produces a deployed, verified application.
 *
 * Spec Section 1.1 — Cortex takes natural language descriptions and produces
 * complete, production-grade software.
 * Spec Section 1.6 — Autonomous Builds of Any Duration.
 * Spec Section 10.5 — Build Completion Guarantee.
 */
export interface ICortexEngine {
  /**
   * Start a new build from a user's natural language prompt.
   * Returns a build session that the caller can use to observe progress,
   * interact during the approval phase, and receive the final result.
   */
  startBuild(prompt: string, options?: IBuildOptions): Promise<IBuildSession>;

  /**
   * Resume a previously paused build (e.g. after user approval at ICE Stage 7).
   */
  resumeBuild(sessionId: string): Promise<IBuildSession>;

  /** Retrieve an existing build session by ID. */
  getBuild(sessionId: string): Promise<IBuildSession | null>;

  /** List all builds, optionally filtered by status. */
  listBuilds(filter?: { phase?: BuildPhase }): Promise<IBuildSession[]>;
}

/** Options passed when starting a build. */
export interface IBuildOptions {
  /** User-adjustable design quality threshold (1-10). Spec Section 7.4. Default: 8. */
  designQualityThreshold?: number;
  /** Pre-authorized credential scopes for autonomous provisioning. Spec Section 6.2. */
  credentialScopes?: string[];
  /** Target deployment platform(s). Spec Section 11.6. */
  deploymentTargets?: string[];
}

/**
 * IBuildSession — a single build's lifecycle.
 *
 * Represents the entire lifecycle from prompt ingestion through deployment.
 * The session is the primary handle the application uses to observe and
 * interact with a running build.
 *
 * Spec Section 4.1 — The Cortex analyzes the full goal set and builds a
 * dependency graph. There are NO "waves".
 * Spec Section 10.5 — The build runs to completion. There is no scenario
 * in which a Cortex build stops partway through.
 */
export interface IBuildSession {
  /** Unique identifier for this build. */
  readonly id: string;
  /** The original user prompt. */
  readonly prompt: string;
  /** Current build phase. */
  readonly phase: BuildPhase;
  /** When the build was created. */
  readonly createdAt: Date;
  /** When the build completed or failed, if applicable. */
  readonly completedAt: Date | null;

  /** The living specification produced by ICE 2.0. Available after intent phase. */
  readonly specification: ILivingSpecification | null;

  /** Active agent sessions. Available during execution phase. */
  getActiveAgents(): Promise<IAgentSession[]>;

  /** All goal assignments for this build. Available after planning phase. */
  getGoals(): Promise<IGoalAssignment[]>;

  /** Stream of build events for real-time observation via AG-UI. */
  getEvents(since?: Date): Promise<IBuildEvent[]>;

  /** Merge gate results for all submissions in this build. */
  getMergeResults(): Promise<IMergeGateResult[]>;

  /** Drift signals detected during this build. */
  getDriftSignals(): Promise<IDriftSignal[]>;

  /**
   * User approval of the ICE Stage 7 plan.
   * Constitutes blanket authorization for all service provisioning. Spec Section 2.2, Stage 7.
   */
  approvePlan(): Promise<void>;

  /** User rejection / revision request at ICE Stage 7. */
  rejectPlan(feedback: string): Promise<void>;

  /** Cancel a running build. */
  cancel(): Promise<void>;
}
