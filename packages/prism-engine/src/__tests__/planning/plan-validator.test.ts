import { describe, it, expect } from 'vitest';
import { validatePlan, validateBackendContract } from '../../planning/plan-validator.js';
import type { PrismGraphPlan, BackendContract } from '../../types.js';

function makeValidPlan(): PrismGraphPlan {
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
            caption: 'A full-width hero section spanning 1440×600px with a deep navy (#0a1628) gradient background transitioning to dark blue (#1a2744). Contains centered heading "Build Apps Faster" in Space Grotesk 48px bold white, subheading "AI-powered development" in Inter 18px regular rgba(255,255,255,0.7). Below the text, a lime green (#84cc16) pill-shaped CTA button 200×48px with text "Get Started" in Inter 16px semibold white. On hover: button scales to 1.05× with 200ms ease-out.',
            position: { x: 0, y: 0, width: 1440, height: 600 },
            textContent: [
              {
                text: 'Build Apps Faster',
                role: 'heading',
                renderMethod: 'sharp-svg',
                typography: { fontFamily: 'Space Grotesk', fontSize: 48, fontWeight: 700, color: '#ffffff' },
                position: { x: 720, y: 200, anchor: 'center' },
              },
            ],
            interactions: [
              { event: 'click', action: 'navigate', targetHubId: 'hub_dashboard' },
            ],
            isShared: false,
          },
        ],
      },
      {
        id: 'hub_dashboard',
        name: 'Dashboard',
        route: '/dashboard',
        description: 'User dashboard',
        layoutTemplate: 'sidebar',
        authRequired: true,
        elements: [
          {
            id: 'elem_sidebar',
            type: 'sidebar',
            caption: 'A vertical navigation sidebar 280px wide, full height, with dark background (#111827). Contains 6 nav items each 48px tall with 16px left padding, Inter 14px medium white text, each with a 20px icon to the left. Active item has lime green (#84cc16) left border 3px wide and slightly brighter text. Hover state: background lightens to rgba(255,255,255,0.05) with 150ms transition.',
            position: { x: 0, y: 0, width: 280, height: 900 },
            textContent: [],
            interactions: [],
            isShared: true,
          },
        ],
      },
    ],
    sharedComponents: [
      {
        id: 'shared_nav',
        name: 'Main Navigation',
        type: 'navbar',
        caption: 'A top navigation bar spanning full width (1440px) × 64px height with semi-transparent dark background rgba(10,22,40,0.95) and bottom border 1px solid rgba(255,255,255,0.1). Logo "Kriptik" in Space Grotesk 20px bold white on the left with 24px padding. Three nav links in Inter 14px medium rgba(255,255,255,0.7) spaced 32px apart on the right. Hover state: text brightens to white with 150ms transition.',
        hubIds: ['hub_home', 'hub_dashboard'],
        overridesPerHub: {},
      },
    ],
    dataModels: [],
    services: [],
    navigationGraph: [
      { sourceHubId: 'hub_home', targetHubId: 'hub_dashboard', trigger: 'cta-click' },
    ],
  };
}

describe('validatePlan', () => {
  it('passes for a valid plan', () => {
    const result = validatePlan(makeValidPlan());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when plan has no hubs', () => {
    const plan = makeValidPlan();
    plan.hubs = [];
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('at least one hub'))).toBe(true);
  });

  it('catches duplicate hub IDs', () => {
    const plan = makeValidPlan();
    plan.hubs[1].id = plan.hubs[0].id; // Duplicate
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('Duplicate hub ID'))).toBe(true);
  });

  it('catches duplicate element IDs within a hub', () => {
    const plan = makeValidPlan();
    plan.hubs[0].elements.push({
      ...plan.hubs[0].elements[0],
      // Same ID as first element
    });
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('Duplicate element ID'))).toBe(true);
  });

  it('catches missing element caption', () => {
    const plan = makeValidPlan();
    plan.hubs[0].elements[0].caption = '';
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('missing caption'))).toBe(true);
  });

  it('warns about short captions', () => {
    const plan = makeValidPlan();
    plan.hubs[0].elements[0].caption = 'A simple button';
    const result = validatePlan(plan);
    expect(result.warnings.some((w) => w.message.includes('Caption too short'))).toBe(true);
  });

  it('catches cross-reference patterns in captions (Invariant 2)', () => {
    const plan = makeValidPlan();
    plan.hubs[0].elements[0].caption =
      'A green button like the one in the hero section, 200px wide';
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('references other elements'))).toBe(true);
  });

  it('catches "see X section" cross-references', () => {
    const plan = makeValidPlan();
    plan.hubs[0].elements[0].caption =
      'A navigation bar with blue theme, see dashboard hub for detailed styling information';
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('references other elements'))).toBe(true);
  });

  it('catches navigation graph referencing non-existent hubs', () => {
    const plan = makeValidPlan();
    plan.navigationGraph.push({
      sourceHubId: 'hub_home',
      targetHubId: 'hub_nonexistent',
      trigger: 'click',
    });
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('hub_nonexistent'))).toBe(true);
  });

  it('catches shared component referencing non-existent hub', () => {
    const plan = makeValidPlan();
    plan.sharedComponents[0].hubIds.push('hub_nonexistent');
    const result = validatePlan(plan);
    expect(result.errors.some((e) => e.message.includes('hub_nonexistent'))).toBe(true);
  });

  it('warns about hubs with no elements', () => {
    const plan = makeValidPlan();
    plan.hubs[0].elements = [];
    const result = validatePlan(plan);
    expect(result.warnings.some((w) => w.message.includes('no elements'))).toBe(true);
  });
});

describe('validateBackendContract', () => {
  const validContract: BackendContract = {
    tRPCRouter: 'export type AppRouter = ...',
    zodSchemas: 'export const userSchema = z.object({...})',
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

  it('passes for a valid contract', () => {
    const result = validateBackendContract(validContract);
    expect(result.valid).toBe(true);
  });

  it('fails when contract is null/undefined', () => {
    const result = validateBackendContract(null as unknown as BackendContract);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Contract-First'))).toBe(true);
  });

  it('warns when tRPCRouter is missing', () => {
    const contract = { ...validContract, tRPCRouter: '' };
    const result = validateBackendContract(contract);
    expect(result.warnings.some((w) => w.message.includes('tRPC router'))).toBe(true);
  });

  it('warns when zodSchemas is missing', () => {
    const contract = { ...validContract, zodSchemas: '' };
    const result = validateBackendContract(contract);
    expect(result.warnings.some((w) => w.message.includes('Zod schemas'))).toBe(true);
  });

  it('warns when no API endpoints', () => {
    const contract = { ...validContract, apiEndpoints: [] };
    const result = validateBackendContract(contract);
    expect(result.warnings.some((w) => w.message.includes('No API endpoints'))).toBe(true);
  });
});
