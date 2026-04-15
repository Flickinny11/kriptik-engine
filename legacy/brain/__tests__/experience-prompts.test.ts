/**
 * Experience Prompt Tests — pure function tests, no native deps.
 */

import { describe, it, expect } from 'vitest';
import { buildSpecialistSystemPrompt } from '../../agents/prompts/specialist.js';
import { buildLeadSystemPrompt } from '../../agents/prompts/lead.js';

describe('Experience Integration — Prompt Construction', () => {
  it('should include experience section in specialist prompt when experiences provided', () => {
    const prompt = buildSpecialistSystemPrompt({
      projectId: 'test-project',
      role: 'payment-specialist',
      domainDescription: 'Handle Stripe integration and checkout flow',
      relevantExperiences: [
        {
          title: 'Stripe webhook verification required',
          content: { description: 'Always verify Stripe webhook signatures' },
          strength: 0.85,
          experienceType: 'integration_insight',
        },
        {
          title: 'PCI compliance with Stripe Elements',
          content: { description: 'Use Stripe Elements for automatic PCI compliance' },
          strength: 0.7,
          experienceType: 'design_decision',
        },
      ],
    });

    expect(prompt).toContain('Relevant Experience from Past Builds');
    expect(prompt).toContain('Stripe webhook verification');
    expect(prompt).toContain('PCI compliance');
    expect(prompt).toContain('advisory');
    expect(prompt).toContain('0.85');
  });

  it('should NOT include experience section when no experiences provided', () => {
    const prompt = buildSpecialistSystemPrompt({
      projectId: 'test-project',
      role: 'ui-specialist',
      domainDescription: 'Build the frontend UI',
    });

    expect(prompt).not.toContain('Relevant Experience from Past Builds');
  });

  it('should mention experience nodes in Lead Agent prompt', () => {
    const prompt = buildLeadSystemPrompt({
      projectId: 'test-project',
      mode: 'builder',
      initialContext: 'Build me an app',
    });

    expect(prompt).toContain('experience');
    expect(prompt).toContain('advisory');
    expect(prompt).toContain('strength');
    expect(prompt).not.toContain('always follow experience');
  });
});
