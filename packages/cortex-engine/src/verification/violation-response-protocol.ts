/**
 * Violation response protocol — orchestrates the seven-step firing sequence
 * for non-compliant agents and coordinates replacement deployment.
 *
 * The seven steps from Spec Section 9.2:
 * 1. Trail extraction — extract valuable data from the fired agent
 * 2. Branch archival — move fired agent's branch to non-readable archive
 * 3. Peer contamination assessment — flag accepted interface proposals
 * 4. Infrastructure state update — update all tracking systems
 * 5. Replacement config — build positive-only briefing for replacement
 * 6. Peer notification — notify peers of reassignment
 * 7. Resume — return everything the orchestrator needs to launch replacement
 *
 * Like the RotationProtocol, this does NOT launch the replacement agent.
 * The orchestrator constructs the golden window and calls AgentHarness.launch().
 *
 * Spec Section 9.0 — The Absolute Rule: No Retry Limit, No Abandonment
 * Spec Section 9.2 — The Firing Protocol
 */

import { randomUUID } from "node:crypto";
import type {
  IViolationResponseProtocol,
  IViolationRecord,
  IFiringResult,
  IPeerContaminationAssessment,
  IContaminatedInterface,
  IReplacementConfig,
  EscalationLevel,
  IAgentHarness,
  IStateCaptureProvider,
  IDepartingAgentState,
  IReplacementAgentBuilder,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * External dependencies injected into the protocol.
 *
 * The protocol coordinates multiple subsystems but doesn't own them.
 * Each dependency is a narrow interface matching what the protocol
 * actually needs — not the full subsystem.
 */
export interface ViolationResponseDeps {
  /** Agent harness for session lifecycle (terminate fired agent). */
  readonly harness: IAgentHarness;
  /** State capture for extracting departing agent's state. */
  readonly stateCapture: IStateCaptureProvider;
  /** Replacement agent builder for positive-only briefing generation. */
  readonly replacementBuilder: IReplacementAgentBuilder;
  /** Provider for querying peer graph and interface proposals. */
  readonly peerGraphProvider: IPeerGraphProvider;
  /** Provider for branch archival operations. */
  readonly branchArchiver: IBranchArchiver;
  /** Provider for querying existing trails for re-ranking. */
  readonly trailProvider: ITrailProvider;
}

/**
 * Provider for querying the peer communication graph.
 * Used during Step 3 (peer contamination assessment) and Step 6 (peer notification).
 */
export interface IPeerGraphProvider {
  /** Get peer agent IDs for an agent. */
  getPeerIds(agentId: string): readonly string[];
  /** Get interface proposals accepted from an agent. */
  getAcceptedProposals(agentId: string): readonly IAcceptedProposal[];
  /** Get peer agents that have built against a specific interface. */
  getDependentPeers(interfacePath: string): readonly string[];
}

/** An accepted interface proposal from an agent. */
export interface IAcceptedProposal {
  readonly interfacePath: string;
  readonly proposedByAgentId: string;
  readonly acceptedByPeerIds: readonly string[];
}

/**
 * Provider for archiving a fired agent's branch.
 * Spec Section 9.2, Step 2 — "the fired agent's branch moves to a
 * non-readable archive. Invisible to all active agents."
 */
export interface IBranchArchiver {
  /** Archive a branch, making it invisible to active agents. Returns the archive name. */
  archiveBranch(branchName: string, agentId: string): Promise<string>;
  /** Get the last clean merge commit SHA for a branch. */
  getLastCleanMergePoint(branchName: string, targetBranch: string): Promise<string>;
}

/**
 * Provider for querying existing experiential trails.
 * Used during Step 5 (replacement config — trail re-ranking).
 */
export interface ITrailProvider {
  /** Get existing trails relevant to a goal type. */
  getTrailsForGoal(goalId: string): Promise<readonly string[]>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * ViolationResponseProtocol — executes the seven-step firing sequence.
 *
 * Coordinates across multiple subsystems (harness, state capture, peer graph,
 * branch archival, trail system) without owning any of them. Dependencies
 * are injected at construction.
 */
export class ViolationResponseProtocol implements IViolationResponseProtocol {
  private readonly _deps: ViolationResponseDeps;
  private readonly _firingsByBuild = new Map<string, IFiringResult[]>();
  private readonly _firingsByGoal = new Map<string, IFiringResult[]>();

  constructor(deps: ViolationResponseDeps) {
    this._deps = deps;
  }

  async executeFiring(
    violationRecord: IViolationRecord,
  ): Promise<IFiringResult> {
    const firingId = randomUUID();
    const { agentId, goalId, buildId } = violationRecord;

    // Step 1: Trail Extraction — capture the fired agent's state BEFORE
    // termination so providers can query its conversation history and
    // ESAA events. This data feeds the anti-pattern library, monitoring
    // system training data, and ICE improvement pipeline.
    // Spec Section 9.2, Step 1
    const capturedState = await this._deps.stateCapture.captureState(
      agentId,
      buildId,
    );

    // Step 2: Branch Archival — move the fired agent's branch to a
    // non-readable archive. Invisible to all active agents to prevent
    // pattern contamination. Previously merged clean work remains on
    // integration.
    // Spec Section 9.2, Step 2
    const session = this._deps.harness.getSession(agentId);
    const branchName = session
      ? `agent/${agentId}`
      : `agent/${agentId}`;
    const archivedBranch = await this._deps.branchArchiver.archiveBranch(
      branchName,
      agentId,
    );

    // Step 3: Peer Contamination Assessment — every accepted interface
    // proposal from the fired agent is flagged as pending_re_evaluation.
    // Spec Section 9.2, Step 3
    const peerContamination = this.assessPeerContamination(agentId);

    // Step 4: Infrastructure State Update — terminate the fired agent's
    // session via the harness. This updates Build State Tracker, peer
    // communication graph, and monitoring system.
    // Spec Section 9.2, Step 4
    await this._deps.harness.rotate(
      agentId,
      `Fired: ${violationRecord.description}`,
    );

    // Step 5: Replacement Deployment Config — build a positive-only
    // briefing for the replacement agent. No mention of the previous
    // agent. No description of the wrong approach.
    // Spec Section 9.2, Step 5
    const lastCleanMergePoint =
      await this._deps.branchArchiver.getLastCleanMergePoint(
        branchName,
        "integration",
      );
    const existingTrails = await this._deps.trailProvider.getTrailsForGoal(
      goalId,
    );

    // Build the partial firing result (without replacementConfig) for
    // the replacement builder
    const partialResult: Omit<IFiringResult, "replacementConfig"> = {
      firingId,
      firedAgentId: agentId,
      goalId,
      buildId,
      violationRecord,
      capturedState,
      archivedBranch,
      peerContamination,
      notifiedPeerIds: peerContamination.affectedPeerIds,
      firedAt: new Date(),
    };

    const replacementConfig = this._deps.replacementBuilder.buildReplacementConfig(
      partialResult,
      existingTrails,
    );

    // Step 6: Peer Notification — all peers in the fired agent's graph
    // receive notification of the reassignment and which interfaces are
    // under re-evaluation.
    // Spec Section 9.2, Step 6
    // (Notification is recorded in the result; the orchestrator delivers
    // the actual messages via graph-mesh since the protocol doesn't own
    // the communication channel.)
    const notifiedPeerIds = this._deps.peerGraphProvider.getPeerIds(agentId);

    // Step 7: Resume — return everything the orchestrator needs to
    // launch the replacement.
    // Spec Section 9.2, Step 7
    const result: IFiringResult = {
      firingId,
      firedAgentId: agentId,
      goalId,
      buildId,
      violationRecord,
      capturedState,
      archivedBranch,
      peerContamination,
      replacementConfig,
      notifiedPeerIds,
      firedAt: new Date(),
    };

    this.storeFiring(result);
    return result;
  }

  determineResponse(violationRecord: IViolationRecord): EscalationLevel {
    // The violation record already has the escalation level computed by
    // the ViolationDetector. The protocol respects that classification.
    //
    // This method exists so the orchestrator can ask "what should I do
    // with this violation?" without needing to know the classification
    // logic — it just calls determineResponse() and acts accordingly.
    return violationRecord.escalationLevel;
  }

  getFiringHistory(buildId: string): readonly IFiringResult[] {
    return this._firingsByBuild.get(buildId) ?? [];
  }

  getGoalFiringHistory(goalId: string): readonly IFiringResult[] {
    return this._firingsByGoal.get(goalId) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Peer contamination assessment (Step 3)
  // ---------------------------------------------------------------------------

  /**
   * Assess whether the fired agent's interface proposals have contaminated
   * peer agents.
   *
   * Spec Section 9.2, Step 3 — "every accepted interface proposal from the
   * fired agent is flagged as pending_re_evaluation. If a peer has already
   * built against a contaminated interface, the Cortex holds that peer's
   * merge attempts until the replacement confirms or revises."
   */
  private assessPeerContamination(
    firedAgentId: string,
  ): IPeerContaminationAssessment {
    const proposals =
      this._deps.peerGraphProvider.getAcceptedProposals(firedAgentId);

    const contaminatedInterfaces: IContaminatedInterface[] = proposals.map(
      (proposal) => {
        const dependentPeerIds =
          this._deps.peerGraphProvider.getDependentPeers(
            proposal.interfacePath,
          );
        return {
          interfacePath: proposal.interfacePath,
          dependentPeerIds,
          status: "pending_re_evaluation" as const,
        };
      },
    );

    const affectedPeerIds = [
      ...new Set(
        contaminatedInterfaces.flatMap((ci) => ci.dependentPeerIds),
      ),
    ];

    return {
      firedAgentId,
      contaminatedInterfaces,
      affectedPeerIds,
      hasContamination: contaminatedInterfaces.length > 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  private storeFiring(result: IFiringResult): void {
    const buildList = this._firingsByBuild.get(result.buildId) ?? [];
    buildList.push(result);
    this._firingsByBuild.set(result.buildId, buildList);

    const goalList = this._firingsByGoal.get(result.goalId) ?? [];
    goalList.push(result);
    this._firingsByGoal.set(result.goalId, goalList);
  }
}
