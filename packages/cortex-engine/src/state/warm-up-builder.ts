/**
 * Warm-Up Sequence Builder — constructs golden window formation sequences
 * for replacement agents during rotation.
 *
 * This is the orchestration component described in spec Section 5.4 that
 * "replicates the golden window formation sequence for the replacement agent."
 * It bridges the RotationProtocol (which captures departing state) with the
 * GoldenWindowBuilder (which constructs the eight-step formation sequence).
 *
 * The warm-up builder adds rotation-specific intelligence on top of the
 * GoldenWindowBuilder:
 * - Integrates the departing agent's captured state into Step 7
 * - Passes the current build state for accurate plan-with-progress (Step 3)
 * - Estimates token cost for the EnhancedThresholdMonitor's cost-benefit calc
 *
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences.
 * Spec Section 5.2 — Golden Window Management.
 * Spec Section 4.2 — Tier 1 Shared Services Layer.
 */

import type {
  IWarmUpSequenceBuilder,
  IWarmUpContext,
  IGoldenWindowSequence,
  IGoldenWindowBuilder,
  IGoldenWindowConfig,
} from "@kriptik/shared-interfaces";

/**
 * Approximate tokens per character for cost estimation.
 * Same 4:1 heuristic used by the DocumentationResolver (Step 8).
 */
const CHARS_PER_TOKEN = 4;

/**
 * Base token overhead for the system prompt and formation sequence
 * scaffolding (step headers, assistant acknowledgments, formatting).
 */
const FORMATION_OVERHEAD_TOKENS = 3_000;

/**
 * Average tokens per experiential trail entry.
 * Trails include task type, decision, reasoning, gotchas, resolution.
 */
const TOKENS_PER_TRAIL = 400;

/**
 * Average tokens per code context file included in Step 5.
 */
const TOKENS_PER_CODE_FILE = 800;

/**
 * Average tokens for the departing agent state (Step 7).
 * Includes modified files, goal progress, peer negotiations, decisions.
 */
const DEPARTING_STATE_TOKENS = 1_500;

/**
 * Average tokens for anti-pattern alerts (Step 8).
 */
const TOKENS_PER_ANTI_PATTERN = 150;

/**
 * WarmUpSequenceBuilder configuration via dependency injection.
 */
export interface WarmUpSequenceBuilderConfig {
  /** The golden window builder from the Architect subsystem. */
  readonly goldenWindowBuilder: IGoldenWindowBuilder;
}

/**
 * WarmUpSequenceBuilder — constructs golden windows for replacement agents.
 *
 * Delegates the actual eight-step formation sequence construction to the
 * GoldenWindowBuilder (from the Architect subsystem, Step 5), but adds
 * rotation-specific context: the departing agent's state and accurate
 * build state for plan-with-progress.
 *
 * This separation keeps the GoldenWindowBuilder focused on generic golden
 * window construction (used for both initial agent launch and rotation),
 * while the WarmUpSequenceBuilder handles rotation-specific preparation.
 */
export class WarmUpSequenceBuilder implements IWarmUpSequenceBuilder {
  private readonly _goldenWindowBuilder: IGoldenWindowBuilder;

  constructor(config: WarmUpSequenceBuilderConfig) {
    this._goldenWindowBuilder = config.goldenWindowBuilder;
  }

  /**
   * Construct the complete golden window formation sequence for a
   * replacement agent during rotation.
   *
   * Spec Section 5.4, Steps 1-3:
   * 1. Capture departing state (already done by RotationProtocol)
   * 2. Construct the golden window formation sequence (this method)
   * 3. Launch the replacement via new API session (orchestrator's job)
   */
  async buildWarmUpSequence(
    context: IWarmUpContext,
  ): Promise<IGoldenWindowSequence> {
    // Construct the IGoldenWindowConfig that the builder expects.
    // The warm-up context contains everything the builder needs,
    // plus the departing agent's state for Step 7 injection.
    const goldenWindowConfig: IGoldenWindowConfig = {
      buildId: context.buildId,
      goal: context.goal,
      role: context.role,
      repoPath: context.repoPath,
      integrationBranch: context.integrationBranch,
      blueprint: context.blueprint,
      livingSpec: context.livingSpec,
      trails: context.trails,
      departingAgentState: context.departedAgentState,
      antiPatternAlerts: context.antiPatternAlerts,
    };

    // Delegate to the GoldenWindowBuilder for the full eight-step sequence.
    // The builder already handles Step 7 (departing agent state) when
    // departingAgentState is present in the config.
    return this._goldenWindowBuilder.build(goldenWindowConfig);
  }

  /**
   * Estimate the token cost of a warm-up sequence before constructing it.
   *
   * Used by the EnhancedThresholdMonitor for cost-benefit rotation decisions
   * (spec Section 5.3). The current implementation uses the fixed 20K estimate;
   * this method provides a more accurate, context-sensitive estimate based on
   * what would actually be included in the warm-up sequence.
   *
   * Estimation breakdown:
   * - Formation overhead (headers, scaffolding, system prompt): ~3K tokens
   * - Project structure: ~2K tokens (varies with project size)
   * - Plan with progress: ~1K tokens
   * - Architectural blueprint section: ~2K tokens
   * - Code files: ~800 tokens each (varies with file size)
   * - Trails: ~400 tokens each
   * - Departing state: ~1.5K tokens
   * - Anti-pattern alerts: ~150 tokens each
   */
  estimateWarmUpCost(context: IWarmUpContext): number {
    let estimate = FORMATION_OVERHEAD_TOKENS;

    // Project structure estimate — based on build state complexity
    const activeGoals = Array.from(context.buildState.goals.values()).filter(
      (g) => g.status !== "blocked",
    ).length;
    estimate += Math.min(activeGoals * 200, 3_000);

    // Plan with progress — scales with total goals
    estimate += Math.min(context.buildState.goals.size * 100, 2_000);

    // Architectural blueprint section — relatively fixed per goal
    estimate += 2_000;

    // Code files — estimated from the goal's scoped write paths and contracts
    const contractCount = context.goal.interfaceContracts.length;
    const scopePathCount = context.goal.scopedWritePaths.length;
    const estimatedCodeFiles = contractCount + Math.min(scopePathCount * 3, 10);
    estimate += estimatedCodeFiles * TOKENS_PER_CODE_FILE;

    // Experiential trails
    estimate += context.trails.length * TOKENS_PER_TRAIL;

    // Departing agent state (always present in rotation)
    estimate += DEPARTING_STATE_TOKENS;

    // Anti-pattern alerts
    estimate += context.antiPatternAlerts.length * TOKENS_PER_ANTI_PATTERN;

    return estimate;
  }
}
