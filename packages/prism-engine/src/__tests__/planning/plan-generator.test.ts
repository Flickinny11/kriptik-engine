import { describe, it, expect } from 'vitest';
import {
  validatePlan,
  validateBackendContract,
  getAppTypeDependencyTree,
  mapInferredNeeds,
  VALID_APP_TYPES,
} from '../../planning/index.js';
import type { PrismGraphPlan, BackendContract, AppIntent } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIntent(overrides: Partial<AppIntent> = {}): AppIntent {
  return {
    description: 'A test app',
    appType: 'landing-page',
    platform: 'web',
    features: [],
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
    confidenceScore: 0.9,
    ambiguities: [],
    reasoning: 'Test reasoning',
    ...overrides,
  };
}

function makeLongCaption(base: string): string {
  return `${base} — a full-width element spanning 1440x600px with dark navy (#0a1628) background, centered heading in Space Grotesk 48px bold white, subheading in Inter 18px regular rgba(255,255,255,0.7). On hover: scale 1.05x with 200ms ease-out.`;
}

function makeValidPlan(overrides: Partial<PrismGraphPlan> = {}): PrismGraphPlan {
  return {
    hubs: [
      {
        id: 'hub_home',
        name: 'Home',
        route: '/',
        description: 'Landing page',
        layoutTemplate: 'single-column',
        authRequired: false,
        elements: [
          {
            id: 'elem_hero',
            type: 'hero-section',
            caption: makeLongCaption('Hero section'),
            position: { x: 0, y: 0, width: 1440, height: 600 },
            textContent: [],
            interactions: [],
            isShared: false,
          },
        ],
      },
    ],
    sharedComponents: [],
    dataModels: [],
    services: [],
    navigationGraph: [],
    ...overrides,
  };
}

function makeValidContract(): BackendContract {
  return {
    tRPCRouter: 'export type AppRouter = typeof appRouter;',
    zodSchemas: 'export const userSchema = z.object({ id: z.string() });',
    dataModels: [
      {
        name: 'User',
        fields: [{ name: 'id', type: 'string', required: true, unique: true }],
        relations: [],
        indexes: [['id']],
      },
    ],
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/users',
        description: 'List users',
        auth: true,
        inputSchema: 'ListUsersInput',
        outputSchema: 'ListUsersOutput',
        implementation: 'generated',
      },
    ],
    authStrategy: {
      type: 'session',
      providers: ['email'],
      sessionDuration: 86400,
      refreshStrategy: 'sliding',
    },
    deploymentTargets: ['cloudflare-workers'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plan generation pipeline integration', () => {
  it('generates valid dependency trees for all 17 app types', () => {
    // 4 extra entries in the tree map (authentication-flow, settings-page,
    // onboarding-flow, error-pages) use appType 'custom' and are looked up
    // by their own keys, not by the AppType union. So only the 16 non-custom
    // AppType values have direct entries; 'custom' maps to nothing.
    for (const appType of VALID_APP_TYPES) {
      const tree = getAppTypeDependencyTree(appType);
      if (appType === 'custom') {
        // 'custom' has no predefined dependency tree
        expect(tree).toBeUndefined();
        continue;
      }
      expect(tree).toBeDefined();
      expect(tree!.firstOrderDeps.length).toBeGreaterThan(0);
      expect(tree!.appType).toBe(appType);
    }
  });

  it('domain knowledge feeds into plan validation', () => {
    const tree = getAppTypeDependencyTree('landing-page');
    expect(tree).toBeDefined();

    // Build a plan whose hubs contain elements derived from the domain tree
    const elements = tree!.firstOrderDeps.map((dep, i) => ({
      id: `elem_${i}`,
      type: dep.uiPatterns[0],
      caption: makeLongCaption(`${dep.name} element`),
      position: { x: 0, y: i * 100, width: 1440, height: 100 },
      textContent: [],
      interactions: [],
      isShared: false,
    }));

    const plan = makeValidPlan({
      hubs: [{
        id: 'hub_home',
        name: 'Home',
        route: '/',
        description: 'Landing page built from domain knowledge',
        layoutTemplate: 'single-column',
        authRequired: false,
        elements,
      }],
    });

    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('plan validation catches duplicate hub IDs from generated plans', () => {
    const plan = makeValidPlan({
      hubs: [
        {
          id: 'hub_dup',
          name: 'Page A',
          route: '/a',
          description: 'First page',
          layoutTemplate: 'single-column',
          authRequired: false,
          elements: [{
            id: 'elem_a',
            type: 'button',
            caption: makeLongCaption('Button A'),
            position: { x: 0, y: 0, width: 200, height: 48 },
            textContent: [],
            interactions: [],
            isShared: false,
          }],
        },
        {
          id: 'hub_dup',
          name: 'Page B',
          route: '/b',
          description: 'Second page with duplicate ID',
          layoutTemplate: 'single-column',
          authRequired: false,
          elements: [{
            id: 'elem_b',
            type: 'button',
            caption: makeLongCaption('Button B'),
            position: { x: 0, y: 0, width: 200, height: 48 },
            textContent: [],
            interactions: [],
            isShared: false,
          }],
        },
      ],
    });

    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('Duplicate hub ID'))).toBe(true);
  });

  it('plan validation catches missing captions in generated plans', () => {
    const plan = makeValidPlan({
      hubs: [{
        id: 'hub_test',
        name: 'Test',
        route: '/test',
        description: 'Page with captionless element',
        layoutTemplate: 'single-column',
        authRequired: false,
        elements: [{
          id: 'elem_no_caption',
          type: 'button',
          caption: '',
          position: { x: 0, y: 0, width: 200, height: 48 },
          textContent: [],
          interactions: [],
          isShared: false,
        }],
      }],
    });

    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('missing caption'))).toBe(true);
  });

  it('plan validation catches cross-references in captions', () => {
    const plan = makeValidPlan({
      hubs: [{
        id: 'hub_test',
        name: 'Test',
        route: '/test',
        description: 'Page with cross-referencing caption',
        layoutTemplate: 'single-column',
        authRequired: false,
        elements: [{
          id: 'elem_crossref',
          type: 'button',
          caption: 'A green button like the one in hero section, matching the primary CTA dimensions and styling cues from the homepage header area.',
          position: { x: 0, y: 0, width: 200, height: 48 },
          textContent: [],
          interactions: [],
          isShared: false,
        }],
      }],
    });

    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('references other elements'))).toBe(true);
  });

  it('backend contract validation works with generated contracts', () => {
    const contract = makeValidContract();
    const result = validateBackendContract(contract);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Removing tRPCRouter should produce a warning, not an error
    const noRouter = { ...contract, tRPCRouter: '' };
    const routerResult = validateBackendContract(noRouter);
    expect(routerResult.valid).toBe(true);
    expect(routerResult.warnings.some((w) => w.message.includes('tRPC router'))).toBe(true);

    // Null contract should fail
    const nullResult = validateBackendContract(null as unknown as BackendContract);
    expect(nullResult.valid).toBe(false);
    expect(nullResult.errors.some((e) => e.message.includes('Contract-First'))).toBe(true);
  });

  it('full pipeline: needs -> plan -> validate', () => {
    // Step 1: Start with an intent
    const intent = makeIntent({
      appType: 'saas-dashboard',
      commercialClassification: 'commercial',
    });

    // Step 2: Map inferred needs from domain knowledge
    const needs = mapInferredNeeds(intent);
    expect(needs.length).toBeGreaterThan(0);

    // Verify domain-knowledge needs were inferred
    const domainNeeds = needs.filter((n) => n.source === 'domain-knowledge');
    expect(domainNeeds.length).toBeGreaterThan(0);

    // Verify security needs were inferred for commercial app
    const securityNeeds = needs.filter((n) => n.source === 'security');
    expect(securityNeeds.length).toBeGreaterThan(0);

    // Step 3: Build a plan from the inferred needs
    const elements = domainNeeds.slice(0, 5).map((need, i) => ({
      id: `elem_${need.name.replace(/\s+/g, '_')}`,
      type: 'card' as const,
      caption: makeLongCaption(`${need.name}: ${need.description}`),
      position: { x: 0, y: i * 120, width: 1440, height: 100 },
      textContent: [],
      interactions: [],
      isShared: false,
    }));

    const plan: PrismGraphPlan = {
      hubs: [{
        id: 'hub_dashboard',
        name: 'Dashboard',
        route: '/dashboard',
        description: 'SaaS dashboard built from inferred needs',
        layoutTemplate: 'sidebar',
        authRequired: true,
        elements,
      }],
      sharedComponents: [],
      dataModels: [],
      services: [],
      navigationGraph: [],
    };

    // Step 4: Validate the plan
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
