/**
 * ExperienceRetriever — build-start experience recall.
 *
 * When a new build starts, this retrieves relevant experience from
 * global memory and writes it as Brain nodes so agents naturally
 * discover past learnings during their reasoning loops.
 */

import { v4 as uuid } from 'uuid';
import type { BrainService } from './brain-service.js';
import type { GlobalMemoryService } from './global-memory.js';
import type { ExperienceNode } from '../types/index.js';

interface SpeculationResult {
  suggestedStack?: string[];
  appType?: string;
  integrations?: string[];
}

export class ExperienceRetriever {
  private globalMemory: GlobalMemoryService;
  private brain: BrainService;

  constructor(opts: { globalMemory: GlobalMemoryService; brain: BrainService }) {
    this.globalMemory = opts.globalMemory;
    this.brain = opts.brain;
  }

  /**
   * Retrieve relevant experiences for a new build and write them as Brain nodes.
   * Should be called AFTER template seeding, BEFORE the first agent reasoning iteration.
   */
  async retrieveForBuild(
    projectId: string,
    userPrompt: string,
    speculationData?: SpeculationResult,
  ): Promise<ExperienceNode[]> {
    // Decompose build context into search signals
    const domainKeywords = this.extractDomainKeywords(userPrompt, speculationData);
    const abstractIntent = this.abstractifyIntent(userPrompt);

    const experiences = await this.globalMemory.queryExperience({
      semanticSignal: userPrompt,
      domainSignal: domainKeywords,
      intentSignal: abstractIntent,
      outcomeSignal: `successful patterns for ${domainKeywords}`,
      contextFilters: {
        frameworks: speculationData?.suggestedStack,
        integrations: speculationData?.integrations,
        appType: speculationData?.appType,
      },
      limit: 30, // Fetch more than we need for diversification
      minStrength: 0.15,
    });

    if (experiences.length === 0) return [];

    // Diversify: ensure a mix of experience types
    const diversified = this.diversifyResults(experiences, 15);

    // Write each experience as a Brain node and update activation tracking
    for (const exp of diversified) {
      await this.brain.writeNode(
        projectId,
        'experience',
        `[Past Experience] ${exp.title}`,
        {
          experienceType: exp.experienceType,
          description: exp.content,
          strength: exp.strength,
          reinforcements: exp.reinforcements,
          contradictions: exp.contradictions,
          sourceProjectId: exp.projectId,
          globalExperienceId: exp.id,
          frameworks: exp.context.frameworks,
          integrations: exp.context.integrations,
          appType: exp.context.appType,
        },
        'experience_retriever',
        { confidence: exp.strength },
      );

      // Update activation tracking in global memory (non-blocking)
      this.globalMemory.incrementActivation(exp.id).catch(() => {});
    }

    return diversified;
  }

  private extractDomainKeywords(
    prompt: string,
    speculation?: SpeculationResult,
  ): string {
    const parts: string[] = [];

    if (speculation?.suggestedStack?.length) {
      parts.push(...speculation.suggestedStack);
    }
    if (speculation?.appType) {
      parts.push(speculation.appType);
    }
    if (speculation?.integrations?.length) {
      parts.push(...speculation.integrations);
    }

    // Extract common technical keywords from prompt as fallback
    if (parts.length === 0) {
      const keywords = prompt
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => DOMAIN_KEYWORDS.has(w));
      parts.push(...keywords);
    }

    return parts.join(' ') || prompt.slice(0, 100);
  }

  private abstractifyIntent(prompt: string): string {
    // Strip specific details to get the abstract goal
    // "Build me a task manager with Supabase" → "productivity tool for personal task organization"
    // This is a lightweight heuristic — the real abstraction happens via embedding similarity
    return prompt
      .replace(/build\s+me\s+/i, '')
      .replace(/create\s+/i, '')
      .replace(/make\s+/i, '')
      .replace(/\bwith\s+\w+/gi, '')
      .replace(/\busing\s+\w+/gi, '')
      .trim();
  }

  private diversifyResults(
    experiences: ExperienceNode[],
    limit: number,
  ): ExperienceNode[] {
    if (experiences.length <= limit) return experiences;

    // Group by experienceType
    const byType = new Map<string, ExperienceNode[]>();
    for (const exp of experiences) {
      const existing = byType.get(exp.experienceType) || [];
      existing.push(exp);
      byType.set(exp.experienceType, existing);
    }

    // Round-robin across types, taking the highest-scored from each
    const result: ExperienceNode[] = [];
    const typeIterators = new Map<string, number>();
    for (const type of byType.keys()) {
      typeIterators.set(type, 0);
    }

    while (result.length < limit) {
      let added = false;
      for (const [type, exps] of byType) {
        const idx = typeIterators.get(type)!;
        if (idx < exps.length && result.length < limit) {
          result.push(exps[idx]);
          typeIterators.set(type, idx + 1);
          added = true;
        }
      }
      if (!added) break;
    }

    return result;
  }
}

// Common technical terms for lightweight domain extraction
const DOMAIN_KEYWORDS = new Set([
  'react', 'next', 'nextjs', 'vue', 'angular', 'svelte', 'node', 'express',
  'api', 'database', 'auth', 'authentication', 'payment', 'stripe', 'checkout',
  'dashboard', 'analytics', 'chat', 'realtime', 'websocket', 'social', 'blog',
  'ecommerce', 'e-commerce', 'store', 'shop', 'portfolio', 'landing', 'saas',
  'mobile', 'ios', 'android', 'game', 'ai', 'ml', 'machine', 'learning',
  'supabase', 'firebase', 'postgres', 'mongodb', 'redis', 'graphql', 'rest',
  'tailwind', 'css', 'animation', 'three', '3d', 'video', 'audio', 'image',
  'upload', 'file', 'storage', 's3', 'aws', 'vercel', 'netlify', 'docker',
  'oauth', 'sso', 'clerk', 'auth0', 'email', 'notification', 'push',
  'calendar', 'scheduling', 'booking', 'map', 'geolocation', 'search',
]);
