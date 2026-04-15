import { describe, it, expect } from 'vitest';
import {
  parseAppIntent,
  VALID_APP_TYPES,
  VALID_PLATFORMS,
} from '../../planning/intent-parser.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeValidIntent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    description: 'A test landing page app',
    appType: 'landing-page',
    platform: 'web',
    features: [{
      name: 'hero-section',
      description: 'A hero section with CTA',
      priority: 'must-have',
      category: 'frontend',
      inferredFrom: 'user-input',
      acceptanceCriteria: ['hero exists'],
    }],
    visualStyle: {
      colorScheme: 'dark',
      primaryColor: '#0a1628',
      accentColor: '#84cc16',
      typography: { headingFont: 'Space Grotesk', bodyFont: 'Inter', monoFont: 'JetBrains Mono' },
      designLanguage: 'minimal',
      referenceUrls: [],
      extractedTokens: null,
    },
    integrations: [],
    contentStrategy: 'static',
    commercialClassification: 'personal',
    confidenceScore: 0.92,
    ambiguities: [],
    reasoning: 'Test reasoning for validation',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseAppIntent', () => {
  it('passes for valid intent data', () => {
    const result = parseAppIntent(makeValidIntent());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.intent.description).toBe('A test landing page app');
      expect(result.intent.appType).toBe('landing-page');
      expect(result.intent.platform).toBe('web');
    }
  });

  it('fails when raw is not an object', () => {
    for (const bad of [null, 'string', 42, [1, 2]]) {
      const result = parseAppIntent(bad);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    }
  });

  it('fails for missing description', () => {
    const result = parseAppIntent(makeValidIntent({ description: '' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('description'))).toBe(true);
    }
  });

  it('fails for invalid appType', () => {
    const result = parseAppIntent(makeValidIntent({ appType: 'invalid-type' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('appType'))).toBe(true);
    }
  });

  it('fails for invalid platform', () => {
    const result = parseAppIntent(makeValidIntent({ platform: 'ios' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('platform'))).toBe(true);
    }
  });

  it('fails for invalid contentStrategy', () => {
    const result = parseAppIntent(makeValidIntent({ contentStrategy: 'batch' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('contentStrategy'))).toBe(true);
    }
  });

  it('fails for invalid commercialClassification', () => {
    const result = parseAppIntent(makeValidIntent({ commercialClassification: 'government' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('commercialClassification'))).toBe(true);
    }
  });

  it('fails for confidence out of range', () => {
    const tooLow = parseAppIntent(makeValidIntent({ confidenceScore: -0.1 }));
    expect(tooLow.valid).toBe(false);
    if (!tooLow.valid) {
      expect(tooLow.errors.some((e) => e.includes('confidenceScore'))).toBe(true);
    }

    const tooHigh = parseAppIntent(makeValidIntent({ confidenceScore: 1.5 }));
    expect(tooHigh.valid).toBe(false);
    if (!tooHigh.valid) {
      expect(tooHigh.errors.some((e) => e.includes('confidenceScore'))).toBe(true);
    }
  });

  it('fails for missing reasoning', () => {
    const result = parseAppIntent(makeValidIntent({ reasoning: '' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('reasoning'))).toBe(true);
    }
  });

  it('validates feature specs', () => {
    const badPriority = parseAppIntent(makeValidIntent({
      features: [{
        name: 'hero',
        description: 'A hero',
        priority: 'critical',
        category: 'frontend',
        inferredFrom: 'user-input',
        acceptanceCriteria: ['exists'],
      }],
    }));
    expect(badPriority.valid).toBe(false);
    if (!badPriority.valid) {
      expect(badPriority.errors.some((e) => e.includes('priority'))).toBe(true);
    }

    const badCategory = parseAppIntent(makeValidIntent({
      features: [{
        name: 'hero',
        description: 'A hero',
        priority: 'must-have',
        category: 'devops',
        inferredFrom: 'user-input',
        acceptanceCriteria: ['exists'],
      }],
    }));
    expect(badCategory.valid).toBe(false);
    if (!badCategory.valid) {
      expect(badCategory.errors.some((e) => e.includes('category'))).toBe(true);
    }

    const badInferred = parseAppIntent(makeValidIntent({
      features: [{
        name: 'hero',
        description: 'A hero',
        priority: 'must-have',
        category: 'frontend',
        inferredFrom: 'magic',
        acceptanceCriteria: ['exists'],
      }],
    }));
    expect(badInferred.valid).toBe(false);
    if (!badInferred.valid) {
      expect(badInferred.errors.some((e) => e.includes('inferredFrom'))).toBe(true);
    }
  });

  it('validates visual style', () => {
    const noColorScheme = parseAppIntent(makeValidIntent({
      visualStyle: {
        primaryColor: '#000',
        accentColor: '#fff',
        typography: { headingFont: 'Inter', bodyFont: 'Inter', monoFont: 'Mono' },
        designLanguage: 'minimal',
        referenceUrls: [],
        extractedTokens: null,
      },
    }));
    expect(noColorScheme.valid).toBe(false);
    if (!noColorScheme.valid) {
      expect(noColorScheme.errors.some((e) => e.includes('colorScheme'))).toBe(true);
    }

    const noPrimary = parseAppIntent(makeValidIntent({
      visualStyle: {
        colorScheme: 'dark',
        primaryColor: '',
        accentColor: '#fff',
        typography: { headingFont: 'Inter', bodyFont: 'Inter', monoFont: 'Mono' },
        designLanguage: 'minimal',
        referenceUrls: [],
        extractedTokens: null,
      },
    }));
    expect(noPrimary.valid).toBe(false);
    if (!noPrimary.valid) {
      expect(noPrimary.errors.some((e) => e.includes('primaryColor'))).toBe(true);
    }

    const noTypography = parseAppIntent(makeValidIntent({
      visualStyle: {
        colorScheme: 'dark',
        primaryColor: '#000',
        accentColor: '#fff',
        designLanguage: 'minimal',
        referenceUrls: [],
        extractedTokens: null,
      },
    }));
    expect(noTypography.valid).toBe(false);
    if (!noTypography.valid) {
      expect(noTypography.errors.some((e) => e.includes('typography'))).toBe(true);
    }
  });

  it('all 17 app types are valid', () => {
    expect(VALID_APP_TYPES).toHaveLength(17);
    for (const appType of VALID_APP_TYPES) {
      const result = parseAppIntent(makeValidIntent({ appType }));
      expect(result.valid).toBe(true);
    }
  });

  it('collects all errors not just first', () => {
    const result = parseAppIntent({
      description: '',
      appType: 'invalid',
      platform: 'ios',
      features: 'not-array',
      visualStyle: null,
      integrations: 'not-array',
      contentStrategy: 'batch',
      commercialClassification: 'government',
      confidenceScore: 5,
      ambiguities: 'not-array',
      reasoning: '',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Should collect errors for every invalid field, not stop at the first
      expect(result.errors.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('accepts empty features array', () => {
    const result = parseAppIntent(makeValidIntent({ features: [] }));
    expect(result.valid).toBe(true);
  });

  it('accepts empty integrations array', () => {
    const result = parseAppIntent(makeValidIntent({ integrations: [] }));
    expect(result.valid).toBe(true);
  });

  it('exports exactly 3 valid platforms', () => {
    expect(VALID_PLATFORMS).toHaveLength(3);
    expect(VALID_PLATFORMS).toContain('web');
    expect(VALID_PLATFORMS).toContain('mobile-web');
    expect(VALID_PLATFORMS).toContain('desktop');
  });
});
