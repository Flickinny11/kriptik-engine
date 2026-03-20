/**
 * Global Memory Service — Integration Tests
 *
 * These tests verify the complete lifecycle of the global experience memory:
 * - Collection creation (idempotent)
 * - Writing experience nodes with multi-dimensional embeddings
 * - Querying with spreading activation / convergence scoring
 * - Reinforcement and weakening
 * - Batch embedding
 *
 * Requires a running Qdrant instance. Set QDRANT_URL env var.
 * Skips automatically if Qdrant is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GlobalMemoryService } from '../global-memory.js';
import { createEmbeddingService } from '../embeddings.js';
import type { ExperienceNode } from '../../types/index.js';
import { randomUUID } from 'node:crypto';

const QDRANT_URL = process.env.QDRANT_URL;
const HF_API_KEY = process.env.HF_API_KEY;

// Skip if no Qdrant available
const describeWithQdrant = QDRANT_URL ? describe : describe.skip;

function makeExperience(overrides: Partial<ExperienceNode> = {}): ExperienceNode {
  return {
    id: randomUUID(),
    projectId: 'test-project-' + randomUUID().slice(0, 8),
    buildTimestamp: new Date().toISOString(),
    experienceType: 'pattern_success',
    title: 'Test experience',
    content: { description: 'A test learning' },
    context: {
      frameworks: ['react'],
      integrations: [],
      appType: 'web-app',
      complexity: 'moderate',
      errorCategories: [],
    },
    strength: 0.5,
    activationCount: 0,
    lastActivated: '',
    reinforcements: 0,
    contradictions: 0,
    sourceNodes: [],
    ...overrides,
  };
}

describeWithQdrant('GlobalMemoryService', () => {
  let service: GlobalMemoryService;
  const testIds: string[] = [];

  beforeAll(async () => {
    const embeddings = createEmbeddingService({
      qdrantUrl: QDRANT_URL!,
      hfApiKey: HF_API_KEY,
    });

    service = new GlobalMemoryService({
      qdrantUrl: QDRANT_URL!,
      embeddings,
    });

    await service.initialize();
  });

  afterAll(async () => {
    // Clean up test data — delete each test point individually
    // (We can't drop the collection because other tests or real data may be in it)
    // In a real cleanup, we'd use the Qdrant client directly
  });

  it('should initialize idempotently', async () => {
    // Second call should not throw
    await service.initialize();
  });

  it('should write and retrieve a single experience', async () => {
    const exp = makeExperience({
      title: 'Stripe integration requires webhook signature verification',
      content: {
        description: 'When integrating Stripe, always set up webhook endpoint verification using the signing secret',
        userIntent: 'Build e-commerce checkout with Stripe payments',
      },
      context: {
        frameworks: ['react', 'next.js'],
        integrations: ['stripe'],
        appType: 'e-commerce',
        complexity: 'complex',
        errorCategories: [],
      },
      strength: 0.7,
    });
    testIds.push(exp.id);

    await service.writeExperience(exp);

    // Query with semantic signal that should match
    const results = await service.queryExperience({
      semanticSignal: 'Stripe webhook integration payment processing',
      limit: 5,
      minStrength: 0.1,
    });

    expect(results.length).toBeGreaterThan(0);
    const found = results.find((r) => r.id === exp.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe(exp.title);
  });

  it('should score multi-dimensional convergence higher', async () => {
    // Write 3 diverse experiences
    const ecommerceStripe = makeExperience({
      title: 'React e-commerce with Stripe needs PCI compliance handling',
      content: {
        description: 'Stripe Elements handles PCI compliance automatically',
        userIntent: 'Build online store',
      },
      context: {
        frameworks: ['react'],
        integrations: ['stripe'],
        appType: 'e-commerce',
        complexity: 'complex',
        errorCategories: [],
      },
      strength: 0.8,
    });

    const chatApp = makeExperience({
      title: 'WebSocket reconnection strategy for real-time chat',
      content: {
        description: 'Exponential backoff with jitter for WebSocket reconnect',
        userIntent: 'Build real-time chat application',
      },
      context: {
        frameworks: ['react', 'socket.io'],
        integrations: ['websocket'],
        appType: 'social',
        complexity: 'complex',
        errorCategories: [],
      },
      strength: 0.6,
    });

    const dashboardApp = makeExperience({
      title: 'Dashboard data fetching with React Query',
      content: {
        description: 'Use React Query for server state with stale-while-revalidate',
        userIntent: 'Build analytics dashboard',
      },
      context: {
        frameworks: ['react'],
        integrations: ['postgres'],
        appType: 'dashboard',
        complexity: 'moderate',
        errorCategories: [],
      },
      strength: 0.5,
    });

    testIds.push(ecommerceStripe.id, chatApp.id, dashboardApp.id);
    await Promise.all([
      service.writeExperience(ecommerceStripe),
      service.writeExperience(chatApp),
      service.writeExperience(dashboardApp),
    ]);

    // Query with signals that strongly match the e-commerce Stripe experience
    const results = await service.queryExperience({
      semanticSignal: 'Stripe payment integration for online store',
      domainSignal: 'react stripe e-commerce',
      intentSignal: 'Build an online store with payments',
      outcomeSignal: 'successful patterns for e-commerce',
      limit: 10,
      minStrength: 0.1,
    });

    expect(results.length).toBeGreaterThan(0);

    // The e-commerce Stripe experience should rank highest due to multi-dimensional convergence
    const topResult = results[0];
    expect(topResult.context.integrations).toContain('stripe');
  });

  it('should reinforce experience and increase strength', async () => {
    const exp = makeExperience({
      title: 'Reinforcement test experience',
      strength: 0.5,
    });
    testIds.push(exp.id);
    await service.writeExperience(exp);

    await service.reinforceExperience(exp.id);

    // Query to get the updated experience
    const results = await service.queryExperience({
      semanticSignal: 'Reinforcement test experience',
      limit: 5,
      minStrength: 0.1,
    });

    const found = results.find((r) => r.id === exp.id);
    expect(found).toBeDefined();
    expect(found!.strength).toBeGreaterThan(0.5);
    expect(found!.reinforcements).toBe(1);
  });

  it('should weaken experience and decrease strength', async () => {
    const exp = makeExperience({
      title: 'Weakening test experience',
      strength: 0.8,
    });
    testIds.push(exp.id);
    await service.writeExperience(exp);

    await service.weakenExperience(exp.id);

    const results = await service.queryExperience({
      semanticSignal: 'Weakening test experience',
      limit: 5,
      minStrength: 0.01,
    });

    const found = results.find((r) => r.id === exp.id);
    expect(found).toBeDefined();
    expect(found!.strength).toBeLessThan(0.8);
    expect(found!.contradictions).toBe(1);
  });

  it('should never weaken below 0.01', async () => {
    const exp = makeExperience({
      title: 'Floor test experience',
      strength: 0.02,
    });
    testIds.push(exp.id);
    await service.writeExperience(exp);

    // Weaken multiple times
    await service.weakenExperience(exp.id);
    await service.weakenExperience(exp.id);
    await service.weakenExperience(exp.id);

    const results = await service.queryExperience({
      semanticSignal: 'Floor test experience',
      limit: 5,
      minStrength: 0.001,
    });

    const found = results.find((r) => r.id === exp.id);
    expect(found).toBeDefined();
    expect(found!.strength).toBeGreaterThanOrEqual(0.01);
  });

  it('should increment activation count', async () => {
    const exp = makeExperience({
      title: 'Activation tracking test',
    });
    testIds.push(exp.id);
    await service.writeExperience(exp);

    await service.incrementActivation(exp.id);
    await service.incrementActivation(exp.id);

    const results = await service.queryExperience({
      semanticSignal: 'Activation tracking test',
      limit: 5,
      minStrength: 0.1,
    });

    const found = results.find((r) => r.id === exp.id);
    expect(found).toBeDefined();
    expect(found!.activationCount).toBe(2);
  });

  it('should return stats about global memory', async () => {
    const stats = await service.getExperienceStats();
    expect(stats.totalExperiences).toBeGreaterThan(0);
    expect(typeof stats.averageStrength).toBe('number');
    expect(typeof stats.byType).toBe('object');
    expect(Array.isArray(stats.topActivated)).toBe(true);
  });

  it('should get and update metadata', async () => {
    const meta = await service.getMetadata();
    expect(typeof meta.buildCount).toBe('number');
    expect(typeof meta.lastDecayCycle).toBe('number');

    const newCount = await service.incrementBuildCount();
    expect(newCount).toBe(meta.buildCount + 1);
  });
});
