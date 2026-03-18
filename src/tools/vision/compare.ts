import type { ToolDefinition } from '../../agents/runtime.js';

export function createCompareScreenshotsTool(): ToolDefinition {
  return {
    name: 'compare_screenshots',
    description: 'Compare two screenshots visually. Returns a similarity score and descriptions of differences. (Stub — will connect to vision service.)',
    input_schema: {
      type: 'object',
      properties: {
        current: { type: 'string', description: 'Path to the current screenshot' },
        reference: { type: 'string', description: 'Path to the reference screenshot' },
      },
      required: ['current', 'reference'],
    },
    execute: async (params) => ({
      status: 'stub',
      message: 'Visual comparison not yet connected. Will use vision service when available.',
      current: params.current,
      reference: params.reference,
    }),
  };
}
