/**
 * Barrel — assembles all analyze tools into a single array.
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { ProviderRouter } from '../../providers/router.js';
import { createIntentTool } from './intent.js';
import { createCompetitorsTool } from './competitors.js';
import { createApiProbeTool } from './api-probe.js';
import { createComponentsTool } from './components.js';
import { createWebSearchTool } from './web-search.js';
import { createCodebaseTool } from './codebase.js';

export function createAnalyzeTools(opts: { router?: ProviderRouter }): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createWebSearchTool(),
    createCodebaseTool(),
  ];

  // Tools that need an LLM provider
  if (opts.router) {
    tools.push(
      createIntentTool(opts.router),
      createCompetitorsTool(opts.router),
      createApiProbeTool(opts.router),
      createComponentsTool(opts.router),
    );
  }

  return tools;
}
