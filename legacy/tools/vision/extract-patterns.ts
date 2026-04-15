import type { ToolDefinition } from '../../agents/runtime.js';

export function createExtractUIPatternsTool(): ToolDefinition {
  return {
    name: 'extract_ui_patterns',
    description: 'Extract UI components, layout structure, color palette, and typography from a screenshot. (Stub — will connect to vision service.)',
    input_schema: {
      type: 'object',
      properties: {
        screenshot_path: { type: 'string', description: 'Path to the screenshot to analyze' },
      },
      required: ['screenshot_path'],
    },
    execute: async (params) => ({
      status: 'stub',
      message: 'UI pattern extraction not yet connected. Will use vision service when available.',
      screenshot: params.screenshot_path,
    }),
  };
}
