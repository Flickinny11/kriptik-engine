/**
 * ExperienceTracker — monitors how agents interact with experience nodes.
 *
 * Subscribes to Brain events and tracks when agents read, follow, or diverge
 * from experience nodes. This tracking data feeds into the reinforcement loop
 * so that experiences that are consistently ignored or diverged from can be
 * weakened, while frequently consulted ones are reinforced.
 */

import type { BrainService } from './brain-service.js';
import type { BrainEvent, BrainNode } from '../types/index.js';

interface ExperienceInteraction {
  experienceNodeId: string;
  globalExperienceId: string;
  interactionType: 'consulted' | 'followed' | 'diverged';
  agentSessionId: string;
  timestamp: string;
  context?: string;
}

export interface ExperienceTrackingSummary {
  totalInteractions: number;
  consulted: string[];    // Global experience IDs that were read
  followed: string[];     // Global experience IDs that were explicitly followed
  diverged: string[];     // Global experience IDs that were explicitly diverged from
}

export class ExperienceTracker {
  private interactions: ExperienceInteraction[] = [];
  private experienceNodeIds: Set<string> = new Set();
  private unsubscribe: (() => void) | null = null;

  constructor(private brain: BrainService, private projectId: string) {}

  /**
   * Start tracking experience interactions for this project.
   */
  start(): void {
    // Pre-populate known experience node IDs
    const existingExpNodes = this.brain.getNodesByType(this.projectId, 'experience');
    for (const node of existingExpNodes) {
      this.experienceNodeIds.add(node.id);
    }

    this.unsubscribe = this.brain.subscribe(this.projectId, (event) => {
      this.handleEvent(event);
    });
  }

  /**
   * Stop tracking and return summary.
   */
  stop(): ExperienceTrackingSummary {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return this.getSummary();
  }

  /**
   * Get the current tracking summary.
   */
  getSummary(): ExperienceTrackingSummary {
    const consulted = new Set<string>();
    const followed = new Set<string>();
    const diverged = new Set<string>();

    for (const interaction of this.interactions) {
      switch (interaction.interactionType) {
        case 'consulted':
          consulted.add(interaction.globalExperienceId);
          break;
        case 'followed':
          followed.add(interaction.globalExperienceId);
          break;
        case 'diverged':
          diverged.add(interaction.globalExperienceId);
          break;
      }
    }

    return {
      totalInteractions: this.interactions.length,
      consulted: [...consulted],
      followed: [...followed],
      diverged: [...diverged],
    };
  }

  private handleEvent(event: BrainEvent): void {
    switch (event.type) {
      case 'node:created': {
        const node = event.data as BrainNode;

        // Track new experience nodes being added
        if (node.nodeType === 'experience') {
          this.experienceNodeIds.add(node.id);
          return;
        }

        // Check if a discovery node references experience
        if (node.nodeType === 'discovery' || node.nodeType === 'decision') {
          this.detectExperienceReference(node);
        }
        break;
      }

      case 'activity:logged': {
        const activity = event.data as {
          activityType?: string;
          targetNodeId?: string;
          agentSessionId?: string;
        };

        // Track when agents read experience nodes
        if (
          activity.activityType === 'read' &&
          activity.targetNodeId &&
          this.experienceNodeIds.has(activity.targetNodeId)
        ) {
          const expNode = this.brain.getNode(activity.targetNodeId);
          if (expNode) {
            const content = expNode.content as Record<string, unknown>;
            this.interactions.push({
              experienceNodeId: activity.targetNodeId,
              globalExperienceId: (content.globalExperienceId as string) || '',
              interactionType: 'consulted',
              agentSessionId: activity.agentSessionId || '',
              timestamp: new Date().toISOString(),
            });
          }
        }
        break;
      }
    }
  }

  /**
   * Detect if a node's content references experience (either following or diverging).
   */
  private detectExperienceReference(node: BrainNode): void {
    const title = (node.title || '').toLowerCase();
    const contentStr = JSON.stringify(node.content).toLowerCase();
    const combined = title + ' ' + contentStr;

    // Detect divergence signals
    const divergenceSignals = [
      'contrary to past experience',
      'diverging from experience',
      'instead of the experience suggestion',
      'ignoring past experience',
      'despite past experience',
      'overriding experience',
    ];

    // Detect following signals
    const followSignals = [
      'based on past experience',
      'following past experience',
      'as past experience suggests',
      'confirmed by experience',
      'applying experience',
      'experience recommends',
    ];

    for (const signal of divergenceSignals) {
      if (combined.includes(signal)) {
        // Find which experience is being referenced
        this.recordInteractionFromReference(node, 'diverged');
        return;
      }
    }

    for (const signal of followSignals) {
      if (combined.includes(signal)) {
        this.recordInteractionFromReference(node, 'followed');
        return;
      }
    }
  }

  private recordInteractionFromReference(
    node: BrainNode,
    type: 'followed' | 'diverged',
  ): void {
    // Try to find the experience being referenced via edges or content
    // For now, record against all known experience nodes since we can't
    // determine which specific one is being referenced without more context
    const expNodes = this.brain.getNodesByType(this.projectId, 'experience');
    for (const expNode of expNodes) {
      const content = expNode.content as Record<string, unknown>;
      const globalId = content.globalExperienceId as string;
      if (!globalId) continue;

      // Check if the reference node's content mentions anything from this experience
      const expTitle = (expNode.title || '').toLowerCase();
      const nodeContent = JSON.stringify(node.content).toLowerCase();

      if (nodeContent.includes(expTitle.replace('[past experience] ', '').slice(0, 30))) {
        this.interactions.push({
          experienceNodeId: expNode.id,
          globalExperienceId: globalId,
          interactionType: type,
          agentSessionId: node.createdBy,
          timestamp: new Date().toISOString(),
          context: node.title,
        });
      }
    }
  }
}
