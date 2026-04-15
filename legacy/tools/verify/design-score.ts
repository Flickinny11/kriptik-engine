/**
 * score_design — AI vision scoring stub (wired later)
 */

import type { ToolDefinition } from '../../agents/runtime.js';

export function createDesignScoreTool(): ToolDefinition {
  return {
    name: 'score_design',
    description: 'Score the visual design quality of a screenshot against design references. Uses AI vision to evaluate layout, typography, spacing, color, and overall polish. (Stub — will connect to vision scoring service.)',
    input_schema: {
      type: 'object',
      properties: {
        screenshot_path: { type: 'string', description: 'Path to the screenshot to evaluate' },
        design_references: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to reference screenshots for comparison',
        },
        criteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific design criteria to evaluate (e.g., "modern", "minimalist", "dark mode")',
        },
      },
      required: ['screenshot_path'],
    },
    execute: async (params) => {
      // Stub — will connect to vision scoring via tools/vision.ts
      return {
        status: 'stub',
        message: 'Design scoring not yet connected. Will use AI vision when available.',
        screenshot: params.screenshot_path,
        references: params.design_references ?? [],
      };
    },
  };
}
