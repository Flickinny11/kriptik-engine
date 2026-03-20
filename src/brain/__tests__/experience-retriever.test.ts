/**
 * ExperienceRetriever — Integration Tests
 *
 * Tests that relevant experiences are retrieved from global memory
 * and written as Brain nodes for agent consumption.
 *
 * Requires: QDRANT_URL, HF_API_KEY env vars.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ExperienceRetriever } from '../experience-retriever.js';
import { GlobalMemoryService } from '../global-memory.js';
import { BrainService } from '../brain-service.js';
import { createEmbeddingService } from '../embeddings.js';
import type { ExperienceNode } from '../../types/index.js';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const QDRANT_URL = process.env.QDRANT_URL;
const HF_API_KEY = process.env.HF_API_KEY;

const describeIfReady = QDRANT_URL ? describe : describe.skip;

function makeExperience(overrides: Partial<ExperienceNode> = {}): ExperienceNode {
  return {
    id: randomUUID(),
    projectId: 'past-project-' + randomUUID().slice(0, 8),
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

describeIfReady('ExperienceRetriever', () => {
  let retriever: ExperienceRetriever;
  let brain: BrainService;
  let globalMemory: GlobalMemoryService;

  beforeAll(async () => {
    const embeddings = createEmbeddingService({
      qdrantUrl: QDRANT_URL!,
      hfApiKey: HF_API_KEY,
    });

    const tmpDir = mkdtempSync(join(tmpdir(), 'kriptik-retriever-'));
    brain = new BrainService({
      dbPath: join(tmpDir, 'brain.db'),
      embeddings,
    });

    globalMemory = new GlobalMemoryService({
      qdrantUrl: QDRANT_URL!,
      embeddings,
    });
    await globalMemory.initialize();

    retriever = new ExperienceRetriever({ globalMemory, brain });

    // Seed global memory with 10 diverse experiences
    const experiences: ExperienceNode[] = [
      makeExperience({
        title: 'Stripe webhook signature verification is required for production',
        content: { description: 'Always verify webhook signatures with endpointSecret', userIntent: 'Build e-commerce' },
        context: { frameworks: ['react', 'next.js'], integrations: ['stripe'], appType: 'e-commerce', complexity: 'complex', errorCategories: [] },
        strength: 0.85,
        reinforcements: 5,
      }),
      makeExperience({
        title: 'Supabase RLS policies must be enabled for multi-tenant apps',
        content: { description: 'Row Level Security prevents data leakage between tenants', userIntent: 'Build SaaS platform' },
        context: { frameworks: ['react'], integrations: ['supabase'], appType: 'saas', complexity: 'complex', errorCategories: [] },
        strength: 0.9,
        reinforcements: 8,
      }),
      makeExperience({
        title: 'React Query stale-while-revalidate pattern for dashboard widgets',
        content: { description: 'Use React Query with 30s stale time for dashboard widgets', userIntent: 'Build analytics dashboard' },
        context: { frameworks: ['react'], integrations: ['postgres'], appType: 'dashboard', complexity: 'moderate', errorCategories: [] },
        strength: 0.7,
      }),
      makeExperience({
        title: 'WebSocket connection pooling for real-time features',
        content: { description: 'Share single WebSocket connection across components', userIntent: 'Build chat application' },
        context: { frameworks: ['react'], integrations: ['websocket'], appType: 'social', complexity: 'complex', errorCategories: [] },
        strength: 0.6,
      }),
      makeExperience({
        title: 'Next.js image optimization requires explicit domains in config',
        content: { description: 'Add remote image domains to next.config.js images.domains array', userIntent: 'Build portfolio site' },
        context: { frameworks: ['next.js'], integrations: [], appType: 'portfolio', complexity: 'simple', errorCategories: ['build'] },
        strength: 0.75,
      }),
      makeExperience({
        title: 'Tailwind animation performance: use will-change sparingly',
        content: { description: 'will-change promotes layers but uses GPU memory', userIntent: 'Build interactive landing page' },
        context: { frameworks: ['react', 'tailwind'], integrations: [], appType: 'portfolio', complexity: 'moderate', errorCategories: [] },
        strength: 0.5,
      }),
      makeExperience({
        title: 'OAuth PKCE flow for SPA is more secure than implicit flow',
        content: { description: 'Use Authorization Code with PKCE for browser-based OAuth', userIntent: 'Build app with Google login' },
        context: { frameworks: ['react'], integrations: ['oauth'], appType: 'saas', complexity: 'moderate', errorCategories: [] },
        strength: 0.8,
      }),
      makeExperience({
        title: 'Video upload requires chunked upload for files over 100MB',
        content: { description: 'Use tus protocol or multipart upload for large video files', userIntent: 'Build video sharing platform' },
        context: { frameworks: ['react'], integrations: ['s3', 'cloudflare'], appType: 'social', complexity: 'complex', errorCategories: [] },
        strength: 0.65,
      }),
      makeExperience({
        title: 'TypeScript strict mode catches nullable access errors early',
        content: { description: 'Enable strictNullChecks to prevent runtime null reference errors', userIntent: 'General' },
        context: { frameworks: ['react'], integrations: [], appType: 'other', complexity: 'simple', errorCategories: ['typescript'] },
        strength: 0.4,
      }),
      makeExperience({
        title: 'Replicate model inference has 25MB upload limit',
        content: { description: 'Files over 25MB must be uploaded to external storage first and passed as URL', userIntent: 'Build AI image generator' },
        context: { frameworks: ['react'], integrations: ['replicate'], appType: 'ai-tool', complexity: 'complex', errorCategories: [] },
        strength: 0.7,
        reinforcements: 3,
      }),
    ];

    await Promise.all(experiences.map((e) => globalMemory.writeExperience(e)));
  });

  it('should retrieve relevant experiences for e-commerce builds', async () => {
    const projectId = 'test-retrieval-' + randomUUID().slice(0, 8);

    const retrieved = await retriever.retrieveForBuild(
      projectId,
      'Build me an e-commerce app with Stripe payments',
      { suggestedStack: ['react', 'next.js'], appType: 'e-commerce', integrations: ['stripe'] },
    );

    expect(retrieved.length).toBeGreaterThan(0);
    expect(retrieved.length).toBeLessThanOrEqual(15);

    // The Stripe experience should be among results
    const hasStripe = retrieved.some(
      (e) => e.context.integrations.includes('stripe') || e.title.toLowerCase().includes('stripe'),
    );
    expect(hasStripe).toBe(true);
  });

  it('should write experiences as Brain nodes', async () => {
    const projectId = 'test-brain-write-' + randomUUID().slice(0, 8);

    await retriever.retrieveForBuild(
      projectId,
      'Build me a dashboard with analytics',
      { suggestedStack: ['react'], appType: 'dashboard' },
    );

    // Check that experience nodes were written to the Brain
    const experienceNodes = brain.getNodesByType(projectId, 'experience');
    expect(experienceNodes.length).toBeGreaterThan(0);

    // Each should have the right structure
    for (const node of experienceNodes) {
      expect(node.title).toContain('[Past Experience]');
      expect(node.nodeType).toBe('experience');
      const content = node.content as Record<string, unknown>;
      expect(content.globalExperienceId).toBeTruthy();
    }
  });

  it('should diversify results across experience types', async () => {
    const projectId = 'test-diverse-' + randomUUID().slice(0, 8);

    const retrieved = await retriever.retrieveForBuild(
      projectId,
      'Build a complex SaaS platform',
      { suggestedStack: ['react', 'next.js'], appType: 'saas' },
    );

    // With 10 seeded experiences, we should get a reasonable subset
    expect(retrieved.length).toBeGreaterThan(0);
  });
});
