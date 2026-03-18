/**
 * analyze_codebase tool — Codebase structure mapping (for import mode).
 */

import type { ToolDefinition } from '../../agents/runtime.js';

export function createCodebaseTool(): ToolDefinition {
  return {
    name: 'analyze_codebase',
    description: 'Analyze an existing codebase structure. Use list_files and read_file sandbox tools to gather data, then write discovery nodes to the Brain.',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Root directory to analyze. Default: "."' },
      },
    },
    execute: async (params) => {
      const dir = (params.directory as string) ?? '.';
      return {
        instruction: 'Use sandbox tools to gather codebase structure, then write discoveries to Brain:',
        steps: [
          `1. list_files("${dir}", recursive=true) to get file tree`,
          `2. read_file("${dir}/package.json") for dependencies`,
          `3. read_file key config files (tsconfig, next.config, etc.)`,
          '4. Read key source files to understand patterns',
          '5. Write discovery nodes for: frameworks, architecture, dependencies, entry points, data models',
        ],
      };
    },
  };
}
