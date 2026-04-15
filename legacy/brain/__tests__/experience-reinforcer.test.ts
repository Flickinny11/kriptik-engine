/**
 * ExperienceReinforcer — Integration Tests
 *
 * Tests pathway strengthening, weakening, and decay cycle.
 *
 * Requires: QDRANT_URL, HF_API_KEY env vars.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ExperienceReinforcer } from '../experience-reinforcer.js';
import { GlobalMemoryService } from '../global-memory.js';
import { BrainService } from '../brain-service.js';
import { createEmbeddingService } from '../embeddings.js';
import type { ExperienceNode, BuildOutcome } from '../../types/index.js';
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
    projectId: 'past-project',
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

describeIfReady('ExperienceReinforcer', () => {
  let reinforcer: ExperienceReinforcer;
  let brain: BrainService;
  let globalMemory: GlobalMemoryService;

  beforeAll(async () => {
    const embeddings = createEmbeddingService({
      qdrantUrl: QDRANT_URL!,
      hfApiKey: HF_API_KEY,
    });

    const tmpDir = mkdtempSync(join(tmpdir(), 'kriptik-reinforcer-'));
    brain = new BrainService({
      dbPath: join(tmpDir, 'brain.db'),
      embeddings,
    });

    globalMemory = new GlobalMemoryService({
      qdrantUrl: QDRANT_URL!,
      embeddings,
    });
    await globalMemory.initialize();

    reinforcer = new ExperienceReinforcer({ brain, globalMemory });
  });

  it('should reinforce experiences used in successful builds', async () => {
    const projectId = 'test-reinforce-success-' + randomUUID().slice(0, 8);

    // Create global experiences
    const exp1 = makeExperience({ strength: 0.5, title: 'Reinforce test 1' });
    const exp2 = makeExperience({ strength: 0.5, title: 'Reinforce test 2' });
    const exp3 = makeExperience({ strength: 0.5, title: 'Unused experience' });
    await Promise.all([
      globalMemory.writeExperience(exp1),
      globalMemory.writeExperience(exp2),
      globalMemory.writeExperience(exp3),
    ]);

    // Simulate that exp1 and exp2 were retrieved for this build (written as brain nodes)
    await brain.writeNode(projectId, 'experience', '[Past Experience] Reinforce test 1', {
      globalExperienceId: exp1.id,
    }, 'experience_retriever');
    await brain.writeNode(projectId, 'experience', '[Past Experience] Reinforce test 2', {
      globalExperienceId: exp2.id,
    }, 'experience_retriever');

    // Also create an intent to enable outcome determination
    await brain.writeNode(projectId, 'intent', 'Build something', {}, 'test');

    // Simulate a successful build outcome
    const outcome: BuildOutcome = {
      projectId,
      success: true,
      verificationScore: 0.9,
      userCorrections: 0,
      errorsEncountered: 2,
      errorsResolved: 2,
      totalTokens: 50000,
      specialistCount: 3,
      buildDurationMs: 120000,
      intentSatisfaction: 0.85,
    };

    await reinforcer.reinforceFromBuild(projectId, outcome);

    // Query both experiences back
    const results = await globalMemory.queryExperience({
      semanticSignal: 'Reinforce test',
      limit: 10,
      minStrength: 0.01,
    });

    const r1 = results.find((r) => r.id === exp1.id);
    const r2 = results.find((r) => r.id === exp2.id);

    // Both should have higher strength than initial 0.5
    if (r1) expect(r1.strength).toBeGreaterThan(0.5);
    if (r2) expect(r2.strength).toBeGreaterThan(0.5);
  });

  it('should weaken experiences used in failed builds', async () => {
    const projectId = 'test-reinforce-fail-' + randomUUID().slice(0, 8);

    const exp = makeExperience({ strength: 0.8, title: 'Weaken on failure test' });
    await globalMemory.writeExperience(exp);

    // Simulate retrieval
    await brain.writeNode(projectId, 'experience', '[Past Experience] Weaken on failure test', {
      globalExperienceId: exp.id,
    }, 'experience_retriever');

    // Simulate a failed build
    const outcome: BuildOutcome = {
      projectId,
      success: false,
      verificationScore: 0.2,
      userCorrections: 5,
      errorsEncountered: 10,
      errorsResolved: 3,
      totalTokens: 80000,
      specialistCount: 4,
      buildDurationMs: 300000,
      intentSatisfaction: 0.2,
    };

    await reinforcer.reinforceFromBuild(projectId, outcome);

    const results = await globalMemory.queryExperience({
      semanticSignal: 'Weaken on failure test',
      limit: 5,
      minStrength: 0.01,
    });

    const found = results.find((r) => r.id === exp.id);
    if (found) expect(found.strength).toBeLessThan(0.8);
  });

  it('should determine build outcome from brain state', async () => {
    const projectId = 'test-outcome-' + randomUUID().slice(0, 8);
    const startTime = Date.now() - 60000;

    // Seed brain with status indicating completion
    await brain.writeNode(projectId, 'intent', 'Build a form', {}, 'lead');
    await brain.writeNode(projectId, 'error', 'TS error', {}, 'specialist');
    await brain.writeNode(projectId, 'resolution', 'Fixed TS error', {}, 'specialist');
    await brain.writeNode(projectId, 'status', 'Build Complete', { summary: 'All done' }, 'lead');

    const outcome = reinforcer.determineBuildOutcome(projectId, startTime);
    expect(outcome.success).toBe(true);
    expect(outcome.errorsEncountered).toBe(1);
    expect(outcome.errorsResolved).toBe(1);
    expect(outcome.buildDurationMs).toBeGreaterThan(0);
  });
});
