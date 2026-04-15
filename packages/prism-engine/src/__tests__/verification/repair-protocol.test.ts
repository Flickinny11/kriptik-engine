import { describe, it, expect } from 'vitest';
import {
  buildRepairSpec,
  validateRepairInput,
  isContaminated,
} from '../../verification/repair-protocol.js';
import type { GraphNode } from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCleanNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node-1',
    type: 'element',
    elementType: 'button',
    caption:
      'A 200x48px lime green pill button with white text "Get Started", ' +
      'rounded corners (24px radius), background #84cc16. On hover: scale to 1.05x ' +
      'with 200ms ease-out, background brightens to #a3e635. On click: emit navigate ' +
      'event with target hub dashboard.',
    captionVerified: true,
    hubMemberships: ['hub-1'],
    position: { x: 0, y: 0, z: 0, width: 200, height: 48 },
    visualSpec: {
      description: 'Lime green button',
      colors: { primary: '#84cc16', text: '#ffffff' },
      typography: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600 },
      spacing: {},
      borders: { radius: '24px' },
      effects: {},
      animation: null,
      textContent: [],
    },
    behaviorSpec: {
      interactions: [
        { event: 'click', action: 'navigate', targetHubId: 'hub-2' },
      ],
      dataBindings: [],
      stateManagement: null,
      apiCalls: [],
      accessibilityRole: 'button',
      tabIndex: 0,
    },
    code: null,
    codeHash: null,
    verificationScore: null,
    imageUrl: null,
    atlasRegion: null,
    dependencies: [],
    status: 'pending',
    ...overrides,
  };
}

function makeDirtyNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return makeCleanNode({ code: 'function broken() { return null; }', ...overrides });
}

// ---------------------------------------------------------------------------
// buildRepairSpec
// ---------------------------------------------------------------------------

describe('buildRepairSpec', () => {
  it('attempt 1: returns spec with caption + visualSpec + behaviorSpec only', () => {
    const node = makeCleanNode();
    const spec = buildRepairSpec(node, 1);

    expect(spec.nodeId).toBe('node-1');
    expect(spec.caption).toBe(node.caption);
    expect(spec.visualSpec).toEqual(node.visualSpec);
    expect(spec.behaviorSpec).toEqual(node.behaviorSpec);
    expect(spec.attempt).toBe(1);
  });

  it('attempt 1: does NOT include errorDescription', () => {
    const node = makeCleanNode();
    const spec = buildRepairSpec(node, 1);

    expect(spec.errorDescription).toBeUndefined();
  });

  it('attempt 2: includes errorDescription', () => {
    const node = makeCleanNode();
    const desc = 'the button click handler did not emit the navigation event';
    const spec = buildRepairSpec(node, 2, desc);

    expect(spec.errorDescription).toBe(desc);
    expect(spec.attempt).toBe(2);
  });

  it('attempt 2: throws if errorDescription is missing', () => {
    const node = makeCleanNode();

    expect(() => buildRepairSpec(node, 2)).toThrow(/errorDescription/);
  });

  it('attempt 2: throws if errorDescription is contaminated', () => {
    const node = makeCleanNode();
    const contaminated = 'TypeError: undefined is not a function at line 42';

    expect(() => buildRepairSpec(node, 2, contaminated)).toThrow(
      /CONTAMINATION DETECTED/,
    );
  });

  it('attempt 3: throws (must escalate to frontier model)', () => {
    const node = makeCleanNode();

    expect(() => buildRepairSpec(node, 3)).toThrow(/escalate/i);
    expect(() => buildRepairSpec(node, 3)).toThrow(/frontier model/i);
  });

  it('attempt 4: throws (must escalate to frontier model)', () => {
    const node = makeCleanNode();

    expect(() => buildRepairSpec(node, 4)).toThrow(/escalate/i);
  });

  it('spec never contains code field', () => {
    const node = makeCleanNode();
    const spec1 = buildRepairSpec(node, 1);
    expect('code' in spec1).toBe(false);

    const spec2 = buildRepairSpec(
      node,
      2,
      'the hover animation did not trigger on mouse enter',
    );
    expect('code' in spec2).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateRepairInput
// ---------------------------------------------------------------------------

describe('validateRepairInput', () => {
  it('valid for clean node (code is null)', () => {
    const node = makeCleanNode();
    const result = validateRepairInput(node, 1);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when node.code is not null (contamination risk)', () => {
    const node = makeDirtyNode();
    const result = validateRepairInput(node, 1);

    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes('CONTAMINATION'))).toBe(true);
  });

  it('warns when caption is empty', () => {
    const node = makeCleanNode({ caption: '' });
    const result = validateRepairInput(node, 1);

    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes('caption'))).toBe(true);
  });

  it('escalate is true for attempt >= 3', () => {
    const node = makeCleanNode();

    expect(validateRepairInput(node, 3).escalate).toBe(true);
    expect(validateRepairInput(node, 5).escalate).toBe(true);
    expect(validateRepairInput(node, 10).escalate).toBe(true);
  });

  it('escalate is false for attempt < 3', () => {
    const node = makeCleanNode();

    expect(validateRepairInput(node, 0).escalate).toBe(false);
    expect(validateRepairInput(node, 1).escalate).toBe(false);
    expect(validateRepairInput(node, 2).escalate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isContaminated
// ---------------------------------------------------------------------------

describe('isContaminated', () => {
  it('detects stack traces ("at line 42")', () => {
    expect(isContaminated('something failed at line 42')).toBe(true);
  });

  it('detects TypeError', () => {
    expect(isContaminated('TypeError: x is not a function')).toBe(true);
  });

  it('detects SyntaxError', () => {
    expect(isContaminated('SyntaxError: unexpected token')).toBe(true);
  });

  it('detects "undefined is not"', () => {
    expect(isContaminated('undefined is not an object')).toBe(true);
  });

  it('detects "cannot read property"', () => {
    expect(isContaminated('cannot read property of null')).toBe(true);
  });

  it('detects code snippets (function declarations)', () => {
    expect(isContaminated('function foo() {')).toBe(true);
  });

  it('accepts clean natural language description', () => {
    expect(
      isContaminated(
        'the button click handler did not emit the navigation event',
      ),
    ).toBe(false);
  });

  it('accepts clean description about animation', () => {
    expect(
      isContaminated(
        'the hover animation did not trigger on mouse enter',
      ),
    ).toBe(false);
  });
});
