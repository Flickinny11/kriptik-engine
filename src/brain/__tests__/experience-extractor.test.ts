/**
 * ExperienceExtractor — Integration Tests
 *
 * Tests that build data is gathered from the Brain, sent to LLM for reflection,
 * and the resulting learnings are written to global memory.
 *
 * Requires: QDRANT_URL, HF_API_KEY, ANTHROPIC_API_KEY env vars.
 * Skips if any are missing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ExperienceExtractor } from '../experience-extractor.js';
import { GlobalMemoryService } from '../global-memory.js';
import { BrainService } from '../brain-service.js';
import { createEmbeddingService } from '../embeddings.js';
import { ProviderRouter } from '../../providers/router.js';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const QDRANT_URL = process.env.QDRANT_URL;
const HF_API_KEY = process.env.HF_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const canRun = QDRANT_URL && ANTHROPIC_API_KEY;
const describeIfReady = canRun ? describe : describe.skip;

describeIfReady('ExperienceExtractor', () => {
  let extractor: ExperienceExtractor;
  let brain: BrainService;
  let globalMemory: GlobalMemoryService;
  const projectId = 'test-extract-' + randomUUID().slice(0, 8);

  beforeAll(async () => {
    const embeddings = createEmbeddingService({
      qdrantUrl: QDRANT_URL!,
      hfApiKey: HF_API_KEY,
    });

    const tmpDir = mkdtempSync(join(tmpdir(), 'kriptik-test-'));
    brain = new BrainService({
      dbPath: join(tmpDir, 'brain.db'),
      embeddings,
    });

    globalMemory = new GlobalMemoryService({
      qdrantUrl: QDRANT_URL!,
      embeddings,
    });
    await globalMemory.initialize();

    const router = new ProviderRouter({
      anthropicApiKey: ANTHROPIC_API_KEY,
    });

    extractor = new ExperienceExtractor({
      brain,
      globalMemory,
      router,
    });
  });

  it('should extract learnings from a seeded brain', async () => {
    // Seed the brain with realistic build data
    await brain.writeNode(projectId, 'intent', 'Build e-commerce checkout', {
      description: 'User wants a complete checkout flow with Stripe',
      successCriteria: 'Users can purchase products and receive confirmation',
    }, 'test-lead');

    await brain.writeNode(projectId, 'discovery', 'Stripe requires webhook verification', {
      description: 'Stripe webhook endpoints must verify signatures using the endpoint secret',
      service: 'stripe',
    }, 'test-specialist');

    await brain.writeNode(projectId, 'error', 'TypeScript error in checkout handler', {
      description: 'Property amount does not exist on type PaymentIntent',
      file: 'src/checkout.ts',
      line: 42,
    }, 'test-specialist');

    await brain.writeNode(projectId, 'resolution', 'Fixed PaymentIntent type usage', {
      description: 'Used amount_received instead of amount property',
      fix: 'Changed to paymentIntent.amount_received',
    }, 'test-specialist');

    await brain.writeNode(projectId, 'artifact', 'Checkout page component', {
      filePath: 'src/components/Checkout.tsx',
      type: 'react-component',
    }, 'test-specialist');

    await brain.writeNode(projectId, 'decision', 'Use Stripe Elements for PCI compliance', {
      reasoning: 'Stripe Elements handles tokenization client-side, avoiding PCI scope',
      alternatives: ['Custom form + API', 'Stripe Checkout hosted page'],
    }, 'test-lead');

    await brain.writeNode(projectId, 'user_directive', 'Add dark mode support', {
      directive: 'Make sure the checkout page supports dark mode',
      type: 'directive',
    }, 'user');

    // Run extraction
    const experiences = await extractor.extractAndStore(projectId);

    // Should have extracted at least 1 learning
    expect(experiences.length).toBeGreaterThan(0);

    // Each learning should have valid structure
    for (const exp of experiences) {
      expect(exp.id).toBeTruthy();
      expect(exp.projectId).toBe(projectId);
      expect(exp.experienceType).toBeTruthy();
      expect(exp.title).toBeTruthy();
      expect(exp.content).toBeTruthy();
      expect(exp.strength).toBeGreaterThan(0);
      expect(exp.strength).toBeLessThanOrEqual(0.9);
    }

    // Verify the experiences are queryable from global memory
    const queryResults = await globalMemory.queryExperience({
      semanticSignal: 'Stripe checkout e-commerce',
      limit: 10,
      minStrength: 0.05,
    });

    // At least one of our extracted experiences should be findable
    const foundOurs = queryResults.some((r) =>
      experiences.some((e) => e.id === r.id),
    );
    expect(foundOurs).toBe(true);
  }, 60000); // 60s timeout for LLM call

  it('should skip extraction for sparse brains', async () => {
    const sparseProjectId = 'test-sparse-' + randomUUID().slice(0, 8);

    // Only 2 nodes — below the threshold
    await brain.writeNode(sparseProjectId, 'intent', 'Build something', {}, 'test');
    await brain.writeNode(sparseProjectId, 'artifact', 'A file', {}, 'test');

    const experiences = await extractor.extractAndStore(sparseProjectId);
    expect(experiences.length).toBe(0);
  });
});
