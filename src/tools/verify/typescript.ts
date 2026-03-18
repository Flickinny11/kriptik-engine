/**
 * verify_errors — TypeScript compilation check
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';

export function createTypescriptTool(sandbox: SandboxProvider): ToolDefinition {
  return {
    name: 'verify_errors',
    description: 'Run TypeScript compilation check on the project. Returns any type errors, syntax errors, or compilation issues. Use this after writing or editing TypeScript files.',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to check. If empty, checks the entire project.',
        },
      },
    },
    execute: async (params) => {
      const files = params.files as string[] | undefined;
      const args = ['tsc', '--noEmit', '--pretty'];
      if (files?.length) args.push(...files);

      const result = await sandbox.runCommand('npx', args);

      if (result.exitCode === 0) {
        return { success: true, errorCount: 0, errors: [] };
      }

      const errorLines = result.stdout.split('\n').filter((l) => l.includes('error TS'));
      const errors = errorLines.map((line) => {
        const match = line.match(/^(.+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
        if (match) {
          return {
            file: match[1],
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            code: match[4],
            message: match[5],
          };
        }
        return { raw: line };
      });

      return {
        success: false,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
        fullOutput: result.stdout.slice(0, 3000),
      };
    },
  };
}
