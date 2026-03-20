/**
 * ExperienceReinforcer — pathway strengthening and weakening.
 *
 * After a build completes and experience extraction runs, this evaluates
 * which past experiences were used in this build and adjusts their strength
 * based on the build outcome. Successful builds strengthen used experiences,
 * failed builds weaken them. Periodic decay prevents stale experiences
 * from cluttering the memory.
 */

import type { BrainService } from './brain-service.js';
import type { GlobalMemoryService } from './global-memory.js';
import type { BuildOutcome, BrainNode } from '../types/index.js';

const DECAY_INTERVAL = 10; // Run decay every N builds

export class ExperienceReinforcer {
  private brain: BrainService;
  private globalMemory: GlobalMemoryService;

  constructor(opts: { brain: BrainService; globalMemory: GlobalMemoryService }) {
    this.brain = opts.brain;
    this.globalMemory = opts.globalMemory;
  }

  /**
   * Evaluate a completed build and reinforce or weaken the experiences that were used.
   */
  async reinforceFromBuild(projectId: string, outcome: BuildOutcome): Promise<void> {
    // Find which global experiences were used in this build
    const experienceNodes = this.brain.getNodesByType(projectId, 'experience');
    const usedExperienceIds = this.extractGlobalExperienceIds(experienceNodes);

    if (usedExperienceIds.length > 0) {
      if (outcome.success && outcome.intentSatisfaction > 0.7) {
        // Successful build — reinforce all used experiences
        for (const id of usedExperienceIds) {
          await this.reinforce(id);
        }
      } else if (!outcome.success || outcome.intentSatisfaction < 0.4) {
        // Failed build — weaken all used experiences
        for (const id of usedExperienceIds) {
          await this.weaken(id);
        }
      }
      // Mixed outcome (success but many corrections, or near-success)
      // → leave strength unchanged, still count as activated
      for (const id of usedExperienceIds) {
        await this.globalMemory.incrementActivation(id).catch(() => {});
      }
    }

    // Check if decay cycle is due
    const buildCount = await this.globalMemory.incrementBuildCount();
    if (buildCount % DECAY_INTERVAL === 0) {
      try {
        await this.globalMemory.runDecayCycle();
      } catch (err) {
        console.error('[experience-reinforcer] Decay cycle failed:', err);
      }
    }
  }

  /**
   * Determine build outcome from Brain state.
   */
  determineBuildOutcome(projectId: string, buildStartTime: number): BuildOutcome {
    const intents = this.brain.getNodesByType(projectId, 'intent');
    const errors = this.brain.getNodesByType(projectId, 'error');
    const resolutions = this.brain.getNodesByType(projectId, 'resolution');
    const userDirectives = this.brain.getNodesByType(projectId, 'user_directive');
    const statusNodes = this.brain.getNodesByType(projectId, 'status');

    // Determine success from status nodes
    const completeNode = statusNodes.find(
      (n) => n.title.toLowerCase().includes('complete'),
    );
    const success = !!completeNode;

    // Calculate intent satisfaction from completed intents
    const completedIntents = intents.filter((n) => n.status === 'completed');
    const intentSatisfaction =
      intents.length > 0 ? completedIntents.length / intents.length : 0;

    // Count errors and resolutions
    const errorsEncountered = errors.length;
    const errorsResolved = resolutions.length;

    // Count user corrections
    const userCorrections = userDirectives.filter(
      (n) => {
        const content = n.content as Record<string, unknown>;
        return content.type === 'directive';
      },
    ).length;

    // Estimate verification score
    const verificationScore = success ? Math.max(0.5, intentSatisfaction) : intentSatisfaction * 0.5;

    const buildDurationMs = Date.now() - buildStartTime;

    return {
      projectId,
      success,
      verificationScore,
      userCorrections,
      errorsEncountered,
      errorsResolved,
      totalTokens: 0, // Will be filled by runtime if available
      specialistCount: 0, // Will be filled by runtime if available
      buildDurationMs,
      intentSatisfaction,
    };
  }

  private async reinforce(experienceId: string): Promise<void> {
    try {
      await this.globalMemory.reinforceExperience(experienceId);
    } catch (err) {
      console.error(`[experience-reinforcer] Failed to reinforce ${experienceId}:`, err);
    }
  }

  private async weaken(experienceId: string): Promise<void> {
    try {
      await this.globalMemory.weakenExperience(experienceId);
    } catch (err) {
      console.error(`[experience-reinforcer] Failed to weaken ${experienceId}:`, err);
    }
  }

  private extractGlobalExperienceIds(experienceNodes: BrainNode[]): string[] {
    const ids: string[] = [];
    for (const node of experienceNodes) {
      const content = node.content as Record<string, unknown>;
      if (typeof content.globalExperienceId === 'string') {
        ids.push(content.globalExperienceId);
      }
    }
    return ids;
  }
}
