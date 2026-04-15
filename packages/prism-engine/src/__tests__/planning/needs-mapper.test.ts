import { describe, it, expect } from 'vitest';
import { mapInferredNeeds } from '../../planning/needs-mapper.js';
import type { AppIntent } from '../../types.js';

function makeIntent(overrides: Partial<AppIntent> = {}): AppIntent {
  return {
    description: 'A test app',
    appType: 'landing-page',
    platform: 'web',
    features: [],
    visualStyle: {
      colorScheme: 'light',
      primaryColor: '#000000',
      accentColor: '#0066ff',
      typography: { headingFont: 'Inter', bodyFont: 'Inter', monoFont: 'JetBrains Mono' },
      designLanguage: 'minimal',
      referenceUrls: [],
      extractedTokens: null,
    },
    integrations: [],
    contentStrategy: 'static',
    commercialClassification: 'personal',
    confidenceScore: 0.9,
    ambiguities: [],
    reasoning: 'Test reasoning',
    ...overrides,
  };
}

describe('mapInferredNeeds', () => {
  it('returns domain-knowledge needs for landing-page', () => {
    const intent = makeIntent({ appType: 'landing-page' });
    const needs = mapInferredNeeds(intent);

    // Landing page should have first-order deps from domain knowledge
    const needNames = needs.map((n) => n.name);
    expect(needNames).toContain('hero-section');
    expect(needNames).toContain('navigation');
    expect(needNames).toContain('footer');
    expect(needNames).toContain('cta-section');
  });

  it('includes second-order deps triggered by first-order deps', () => {
    const intent = makeIntent({ appType: 'landing-page' });
    const needs = mapInferredNeeds(intent);

    const needNames = needs.map((n) => n.name);
    // form-validation is triggered by cta-section
    expect(needNames).toContain('form-validation');
    // mobile-nav is triggered by navigation
    expect(needNames).toContain('mobile-nav');
  });

  it('deduplicates against user-specified features', () => {
    const intent = makeIntent({
      appType: 'landing-page',
      features: [
        {
          name: 'hero-section',
          description: 'User specified hero',
          priority: 'must-have',
          category: 'frontend',
          inferredFrom: 'user-input',
          acceptanceCriteria: ['hero exists'],
        },
      ],
    });
    const needs = mapInferredNeeds(intent);

    // hero-section should NOT appear since user already specified it
    const needNames = needs.map((n) => n.name);
    expect(needNames).not.toContain('hero-section');
    // But other deps should still be present
    expect(needNames).toContain('navigation');
  });

  it('adds security needs for commercial apps', () => {
    const intent = makeIntent({ commercialClassification: 'commercial' });
    const needs = mapInferredNeeds(intent);

    const securityNeeds = needs.filter((n) => n.source === 'security');
    expect(securityNeeds.length).toBeGreaterThan(0);

    const secNames = securityNeeds.map((n) => n.name);
    expect(secNames).toContain('Input validation');
    expect(secNames).toContain('CSRF protection');
    expect(secNames).toContain('XSS prevention');
    expect(secNames).toContain('Rate limiting');
  });

  it('does not add security needs for personal apps', () => {
    const intent = makeIntent({ commercialClassification: 'personal' });
    const needs = mapInferredNeeds(intent);

    const securityNeeds = needs.filter((n) => n.source === 'security');
    expect(securityNeeds.length).toBe(0);
  });

  it('adds UX best-practice needs', () => {
    const intent = makeIntent();
    const needs = mapInferredNeeds(intent);

    const uxNeeds = needs.filter((n) => n.source === 'ux-best-practice');
    expect(uxNeeds.length).toBeGreaterThan(0);

    const uxNames = uxNeeds.map((n) => n.name);
    expect(uxNames).toContain('Loading states');
    expect(uxNames).toContain('Error handling UI');
    expect(uxNames).toContain('Responsive layout');
  });

  it('handles saas-dashboard app type', () => {
    const intent = makeIntent({ appType: 'saas-dashboard' });
    const needs = mapInferredNeeds(intent);

    const needNames = needs.map((n) => n.name);
    expect(needNames).toContain('sidebar-navigation');
    expect(needNames).toContain('metrics-overview');
    expect(needNames).toContain('data-table');
  });

  it('handles e-commerce app type', () => {
    const intent = makeIntent({ appType: 'e-commerce' });
    const needs = mapInferredNeeds(intent);

    const needNames = needs.map((n) => n.name);
    expect(needNames).toContain('product-grid');
    expect(needNames).toContain('shopping-cart');
    expect(needNames).toContain('checkout-flow');
  });

  it('handles custom app type gracefully', () => {
    const intent = makeIntent({ appType: 'custom' });
    const needs = mapInferredNeeds(intent);

    // Should still have UX needs
    const uxNeeds = needs.filter((n) => n.source === 'ux-best-practice');
    expect(uxNeeds.length).toBeGreaterThan(0);
    // But no domain-specific needs
    const domainNeeds = needs.filter((n) => n.source === 'domain-knowledge');
    expect(domainNeeds.length).toBe(0);
  });

  it('all needs have valid features array', () => {
    const intent = makeIntent({ appType: 'saas-dashboard', commercialClassification: 'enterprise' });
    const needs = mapInferredNeeds(intent);

    for (const need of needs) {
      expect(need.features).toBeDefined();
      expect(need.features.length).toBeGreaterThan(0);
      for (const feature of need.features) {
        expect(feature.name).toBeTruthy();
        expect(['must-have', 'should-have', 'nice-to-have']).toContain(feature.priority);
        expect(['frontend', 'backend', 'integration', 'infrastructure']).toContain(feature.category);
        expect(['user-input', 'competitive-analysis', 'domain-knowledge', 'security']).toContain(feature.inferredFrom);
        expect(feature.acceptanceCriteria.length).toBeGreaterThan(0);
      }
    }
  });
});
