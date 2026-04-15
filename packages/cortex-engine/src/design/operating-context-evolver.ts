/**
 * OperatingContextEvolver — implements spec Section 6.5's self-modifying
 * operating instructions.
 *
 * The baked-in operating context evolves based on measured outcomes:
 * - Instructions with low compliance AND low impact → removal candidates
 * - Instructions frequently violated with high impact → stronger framing
 * - Revisions are A/B tested across 10 builds before adoption
 *
 * This is NOT weight updates to the underlying model. It's context
 * evolution — the system's operational documents improve over time
 * based on measured outcomes.
 *
 * Spec Section 6.5 — "Self-Modifying Operating Instructions."
 */

import type {
  IOperatingInstruction,
  IInstructionCompliance,
  IInstructionRevisionProposal,
  InstructionRevisionType,
  IOperatingContextEvolver,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Internal accumulators
// ---------------------------------------------------------------------------

interface ComplianceAccumulator {
  instructionId: string;
  followed: number;
  violated: number;
  /** Evaluator scores when followed. */
  followedScores: number[];
  /** Evaluator scores when violated. */
  violatedScores: number[];
}

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Number of evaluation builds before a revision proposal is finalized. */
const EVALUATION_BUILD_COUNT = 10;

/** Minimum compliance rate before an instruction is a removal candidate. */
const LOW_COMPLIANCE_THRESHOLD = 0.3;

/** Minimum score impact to consider an instruction high-impact. */
const HIGH_IMPACT_THRESHOLD = 0.05;

/** Compliance threshold below which strengthening is proposed. */
const STRENGTHEN_COMPLIANCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class OperatingContextEvolver implements IOperatingContextEvolver {
  private instructions: Map<string, IOperatingInstruction> = new Map();
  private compliance: Map<string, ComplianceAccumulator> = new Map();
  private proposals: Map<string, IInstructionRevisionProposal> = new Map();

  initialize(instructions: readonly IOperatingInstruction[]): void {
    this.instructions.clear();
    for (const inst of instructions) {
      this.instructions.set(inst.id, inst);
    }
  }

  recordCompliance(
    instructionId: string,
    followed: boolean,
    evaluatorScore: number,
  ): void {
    let acc = this.compliance.get(instructionId);
    if (!acc) {
      acc = {
        instructionId,
        followed: 0,
        violated: 0,
        followedScores: [],
        violatedScores: [],
      };
      this.compliance.set(instructionId, acc);
    }

    if (followed) {
      acc.followed++;
      acc.followedScores.push(evaluatorScore);
    } else {
      acc.violated++;
      acc.violatedScores.push(evaluatorScore);
    }
  }

  recordEvaluationBuild(
    instructionId: string,
    evaluatorScore: number,
    usedRevision: boolean,
  ): void {
    const proposal = this.proposals.get(instructionId);
    if (!proposal) return;

    if (usedRevision) {
      const updatedEval = [...proposal.evaluationScores, evaluatorScore];
      const remaining = Math.max(
        0,
        proposal.evaluationBuildsRemaining - 1,
      );
      this.proposals.set(instructionId, {
        ...proposal,
        evaluationScores: updatedEval,
        evaluationBuildsRemaining: remaining,
      });
    } else {
      const updatedControl = [...proposal.controlScores, evaluatorScore];
      this.proposals.set(instructionId, {
        ...proposal,
        controlScores: updatedControl,
      });
    }
  }

  proposeRevisions(
    minBuilds: number = 100,
  ): readonly IInstructionRevisionProposal[] {
    const proposed: IInstructionRevisionProposal[] = [];

    for (const [id, acc] of this.compliance) {
      const total = acc.followed + acc.violated;
      if (total < minBuilds) continue;

      // Skip if there's already an active proposal for this instruction
      if (this.proposals.has(id)) continue;

      const complianceRate = acc.followed / total;
      const impact = this.computeImpact(acc);
      const instruction = this.instructions.get(id);
      if (!instruction) continue;

      let proposal: IInstructionRevisionProposal | null = null;

      if (complianceRate < LOW_COMPLIANCE_THRESHOLD && Math.abs(impact) < HIGH_IMPACT_THRESHOLD) {
        // Low compliance + low impact → remove
        proposal = this.createProposal(instruction, "removal", impact);
      } else if (
        complianceRate < STRENGTHEN_COMPLIANCE_THRESHOLD &&
        impact > HIGH_IMPACT_THRESHOLD
      ) {
        // Low compliance + high impact → strengthen
        proposal = this.createProposal(
          instruction,
          "strengthening",
          impact,
        );
      } else if (
        complianceRate > 0.7 &&
        impact > HIGH_IMPACT_THRESHOLD * 2
      ) {
        // High compliance + notable impact → refine for even higher compliance
        proposal = this.createProposal(instruction, "refinement", impact);
      }

      if (proposal) {
        proposed.push(proposal);
        this.proposals.set(id, proposal);
      }
    }

    return proposed;
  }

  finalizeEvaluations(): readonly string[] {
    const adopted: string[] = [];

    for (const [id, proposal] of this.proposals) {
      if (proposal.evaluationBuildsRemaining > 0) continue;
      if (proposal.evaluationScores.length < EVALUATION_BUILD_COUNT) continue;

      const evalAvg = this.average(proposal.evaluationScores);
      const controlAvg =
        proposal.controlScores.length > 0
          ? this.average(proposal.controlScores)
          : evalAvg; // No control data = treat as neutral

      if (evalAvg >= controlAvg) {
        // Adopt the revision
        const instruction = this.instructions.get(id);
        if (instruction) {
          if (proposal.type === "removal") {
            this.instructions.delete(id);
          } else {
            this.instructions.set(id, {
              ...instruction,
              text: proposal.proposedText,
              isRevised: true,
              originalText:
                instruction.originalText ?? instruction.text,
              revision: instruction.revision + 1,
              lastRevisedAt: new Date(),
            });
          }
          adopted.push(id);
        }
      }

      // Remove the proposal regardless of outcome
      this.proposals.delete(id);
    }

    return adopted;
  }

  getInstructions(): readonly IOperatingInstruction[] {
    return Array.from(this.instructions.values());
  }

  getComplianceData(): readonly IInstructionCompliance[] {
    return Array.from(this.compliance.entries()).map(([id, acc]) => {
      const total = acc.followed + acc.violated;
      return {
        instructionId: id,
        totalApplicable: total,
        followedCount: acc.followed,
        violatedCount: acc.violated,
        complianceRate: total > 0 ? acc.followed / total : 0,
        impactWhenViolated: this.computeImpact(acc),
      };
    });
  }

  getActiveProposals(): readonly IInstructionRevisionProposal[] {
    return Array.from(this.proposals.values());
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private computeImpact(acc: ComplianceAccumulator): number {
    if (acc.followedScores.length === 0 || acc.violatedScores.length === 0) {
      return 0;
    }
    return (
      this.average(acc.followedScores) - this.average(acc.violatedScores)
    );
  }

  private average(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private createProposal(
    instruction: IOperatingInstruction,
    type: InstructionRevisionType,
    impact: number,
  ): IInstructionRevisionProposal {
    let proposedText: string;
    let reason: string;

    switch (type) {
      case "removal":
        proposedText = "";
        reason = `Instruction has low compliance and negligible impact (${impact.toFixed(3)}). Removing to reduce cognitive load.`;
        break;
      case "strengthening":
        proposedText = `CRITICAL: ${instruction.text} Violating this instruction degrades build quality by ${Math.abs(impact * 100).toFixed(1)}%.`;
        reason = `Instruction has low compliance but high impact (${impact.toFixed(3)}). Strengthening framing.`;
        break;
      case "refinement":
        proposedText = instruction.text;
        reason = `Instruction has high compliance and notable impact (${impact.toFixed(3)}). Candidate for tightening.`;
        break;
      case "addition":
        proposedText = instruction.text;
        reason = "New instruction derived from learned patterns.";
        break;
    }

    return {
      instructionId: instruction.id,
      proposedText,
      reason,
      type,
      evaluationBuildsRemaining: EVALUATION_BUILD_COUNT,
      evaluationScores: [],
      controlScores: [],
      proposedAt: new Date(),
    };
  }
}
