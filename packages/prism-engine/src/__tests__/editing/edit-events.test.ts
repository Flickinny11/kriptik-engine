/**
 * Tests for Phase 9: Editing SSE event types.
 *
 * Validates the editing event types are properly defined
 * in the shared interfaces.
 */

import { describe, it, expect } from 'vitest';
import type { PrismEventType, PrismEvent } from '@kriptik/shared-interfaces';

describe('Editing event types', () => {
  it('prism_node_edit_started is a valid PrismEventType', () => {
    const eventType: PrismEventType = 'prism_node_edit_started';
    expect(eventType).toBe('prism_node_edit_started');
  });

  it('prism_node_edit_codegen is a valid PrismEventType', () => {
    const eventType: PrismEventType = 'prism_node_edit_codegen';
    expect(eventType).toBe('prism_node_edit_codegen');
  });

  it('prism_node_edit_verified is a valid PrismEventType', () => {
    const eventType: PrismEventType = 'prism_node_edit_verified';
    expect(eventType).toBe('prism_node_edit_verified');
  });

  it('prism_node_edit_complete is a valid PrismEventType', () => {
    const eventType: PrismEventType = 'prism_node_edit_complete';
    expect(eventType).toBe('prism_node_edit_complete');
  });

  it('prism_node_edit_failed is a valid PrismEventType', () => {
    const eventType: PrismEventType = 'prism_node_edit_failed';
    expect(eventType).toBe('prism_node_edit_failed');
  });

  it('editing phase is valid in PrismEvent', () => {
    const event: PrismEvent = {
      type: 'prism_node_edit_started',
      data: { nodeId: 'test-node' },
      timestamp: new Date().toISOString(),
      phase: 'editing',
      progress: 50,
      nodeId: 'test-node',
    };
    expect(event.phase).toBe('editing');
    expect(event.type).toBe('prism_node_edit_started');
  });
});
