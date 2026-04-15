import { describe, it, expect } from 'vitest';
import {
  constructGraph,
  matchSegmentsToElements,
  computeGraphMetadata,
} from '../../graph/graph-construction.js';
import type { SegmentResult, SegmentMatch } from '../../graph/graph-construction.js';
import type {
  PrismGraphPlan,
  ElementPlan,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeGraphPlan(): PrismGraphPlan {
  return {
    hubs: [{
      id: 'hub_home', name: 'Home', route: '/', description: 'Landing page',
      layoutTemplate: 'single-column', authRequired: false,
      elements: [{
        id: 'elem_hero', type: 'hero-section',
        caption: 'A full-width hero section with heading and CTA button',
        position: { x: 0, y: 0, width: 1440, height: 600 },
        textContent: [], interactions: [{ event: 'click', action: 'navigate', targetHubId: 'hub_dashboard' }],
        isShared: false,
      }, {
        id: 'elem_btn', type: 'button',
        caption: 'A lime green pill button 200x48px with text Get Started',
        position: { x: 620, y: 400, width: 200, height: 48 },
        textContent: [], interactions: [], isShared: false,
      }],
    }, {
      id: 'hub_dashboard', name: 'Dashboard', route: '/dashboard', description: 'User dashboard',
      layoutTemplate: 'sidebar', authRequired: true,
      elements: [{
        id: 'elem_sidebar', type: 'sidebar',
        caption: 'A 280px wide sidebar with navigation items',
        position: { x: 0, y: 0, width: 280, height: 900 },
        textContent: [], interactions: [], isShared: false,
      }],
    }],
    sharedComponents: [{
      id: 'shared_nav', name: 'Navigation', type: 'navbar',
      caption: 'A top navigation bar spanning full width',
      hubIds: ['hub_home', 'hub_dashboard'], overridesPerHub: {},
    }],
    dataModels: [],
    services: [],
    navigationGraph: [{ sourceHubId: 'hub_home', targetHubId: 'hub_dashboard', trigger: 'cta-click' }],
  };
}

// ---------------------------------------------------------------------------
// constructGraph
// ---------------------------------------------------------------------------

describe('constructGraph', () => {
  it('creates graph with correct id structure', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    expect(graph.id).toMatch(/^graph-proj-1-/);
    expect(graph.projectId).toBe('proj-1');
    expect(graph.planId).toBe('plan-1');
    expect(graph.version).toBe(1);
  });

  it('creates all hubs from plan', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    expect(graph.hubs).toHaveLength(2);
    const hubIds = graph.hubs.map((h) => h.id);
    expect(hubIds).toContain('hub_home');
    expect(hubIds).toContain('hub_dashboard');
  });

  it('creates nodes for each element', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    // 2 elements in hub_home + 1 in hub_dashboard + 1 shared component = 4
    expect(graph.nodes.length).toBeGreaterThanOrEqual(4);

    const nodeIds = graph.nodes.map((n) => n.id);
    expect(nodeIds).toContain('elem_hero');
    expect(nodeIds).toContain('elem_btn');
    expect(nodeIds).toContain('elem_sidebar');
    expect(nodeIds).toContain('shared_nav');
  });

  it('sets captionVerified to false and status to pending', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    for (const node of graph.nodes) {
      expect(node.captionVerified).toBe(false);
      expect(node.status).toBe('pending');
    }
  });

  it('creates edges from interactions', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    // elem_hero has an interaction with targetHubId: 'hub_dashboard'
    const navEdgesFromHero = graph.edges.filter(
      (e) => e.source === 'elem_hero' && e.type === 'navigates-to',
    );
    expect(navEdgesFromHero.length).toBeGreaterThanOrEqual(1);
    expect(navEdgesFromHero[0].target).toBe('hub_dashboard');
  });

  it('creates navigation edges from navigation graph', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    // The navigation graph has hub_home -> hub_dashboard
    const navEdges = graph.edges.filter(
      (e) => e.type === 'navigates-to' && e.target === 'hub_dashboard',
    );
    expect(navEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('adds shared components to multiple hubs', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    const sharedNav = graph.nodes.find((n) => n.id === 'shared_nav');
    expect(sharedNav).toBeDefined();
    expect(sharedNav!.hubMemberships).toContain('hub_home');
    expect(sharedNav!.hubMemberships).toContain('hub_dashboard');
  });

  it('shared component appears in both hub nodeIds and sharedNodeIds', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');

    const homeHub = graph.hubs.find((h) => h.id === 'hub_home')!;
    const dashHub = graph.hubs.find((h) => h.id === 'hub_dashboard')!;

    expect(homeHub.nodeIds).toContain('shared_nav');
    expect(homeHub.sharedNodeIds).toContain('shared_nav');
    expect(dashHub.nodeIds).toContain('shared_nav');
    expect(dashHub.sharedNodeIds).toContain('shared_nav');
  });
});

// ---------------------------------------------------------------------------
// matchSegmentsToElements
// ---------------------------------------------------------------------------

describe('matchSegmentsToElements', () => {
  it('returns matches sorted by score descending', () => {
    const segments: SegmentResult[] = [
      { id: 'seg-1', bbox: [0, 0, 1440, 600], label: 'hero', confidence: 0.9 },
      { id: 'seg-2', bbox: [620, 400, 200, 48], label: 'button', confidence: 0.95 },
    ];
    const elements: ElementPlan[] = [
      {
        id: 'elem_hero', type: 'hero-section',
        caption: 'Hero section',
        position: { x: 0, y: 0, width: 1440, height: 600 },
        textContent: [], interactions: [], isShared: false,
      },
      {
        id: 'elem_btn', type: 'button',
        caption: 'Button',
        position: { x: 620, y: 400, width: 200, height: 48 },
        textContent: [], interactions: [], isShared: false,
      },
    ];

    const matches = matchSegmentsToElements(segments, elements);

    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Verify descending order
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
  });

  it('computes IoU correctly for overlapping bboxes', () => {
    // Segment overlaps 50% with element: segment [0,0,100,100], element [50,0,100,100]
    // Intersection: [50,0,50,100] = 5000
    // Union: 10000 + 10000 - 5000 = 15000
    // IoU = 5000/15000 = 1/3
    const segments: SegmentResult[] = [
      { id: 'seg-1', bbox: [0, 0, 100, 100], label: 'box', confidence: 0.9 },
    ];
    const elements: ElementPlan[] = [
      {
        id: 'elem-a', type: 'button',
        caption: 'Overlapping element',
        position: { x: 50, y: 0, width: 100, height: 100 },
        textContent: [], interactions: [], isShared: false,
      },
    ];

    const matches = matchSegmentsToElements(segments, elements);
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBeCloseTo(1 / 3, 5);
  });

  it('returns empty for non-overlapping segments', () => {
    const segments: SegmentResult[] = [
      { id: 'seg-1', bbox: [0, 0, 50, 50], label: 'box', confidence: 0.9 },
    ];
    const elements: ElementPlan[] = [
      {
        id: 'elem-a', type: 'button',
        caption: 'Far away element',
        position: { x: 500, y: 500, width: 100, height: 100 },
        textContent: [], interactions: [], isShared: false,
      },
    ];

    const matches = matchSegmentsToElements(segments, elements);
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeGraphMetadata
// ---------------------------------------------------------------------------

describe('computeGraphMetadata', () => {
  it('counts nodes, edges, hubs correctly', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');
    const metadata = computeGraphMetadata(graph);

    expect(metadata.totalNodes).toBe(graph.nodes.length);
    expect(metadata.totalEdges).toBe(graph.edges.length);
    expect(metadata.totalHubs).toBe(graph.hubs.length);
  });

  it('counts shared nodes', () => {
    const plan = makeGraphPlan();
    const graph = constructGraph(plan, 'proj-1', 'plan-1');
    const metadata = computeGraphMetadata(graph);

    // shared_nav is in both hubs, so totalSharedNodes >= 1
    expect(metadata.totalSharedNodes).toBeGreaterThanOrEqual(1);
  });
});
