/**
 * Command execution tools: run_command, run_build, run_tests
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from './provider.js';
import { LIMITS } from '../../config/index.js';

export function createCommandTools(sandbox: SandboxProvider): ToolDefinition[] {
  return [
    {
      name: 'run_command',
      description: 'Execute a shell command in the project sandbox. Use for installing dependencies, running scripts, etc. Timeout: 60 seconds.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to run (e.g., "npm install express")' },
          cwd: { type: 'string', description: 'Working directory relative to project root. Default: project root' },
        },
        required: ['command'],
      },
      execute: async (params) => {
        const parts = (params.command as string).split(' ');
        const result = await sandbox.runCommand(parts[0], parts.slice(1), params.cwd as string | undefined);
        return {
          stdout: result.stdout.slice(0, LIMITS.STDOUT_TRUNCATE),
          stderr: result.stderr.slice(0, LIMITS.STDERR_TRUNCATE),
          exitCode: result.exitCode,
        };
      },
    },
    {
      name: 'run_build',
      description: 'Run the project build command (npm run build). Returns build output and any errors.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const result = await sandbox.runCommand('npm', ['run', 'build']);
        return {
          success: result.exitCode === 0,
          stdout: result.stdout.slice(0, LIMITS.STDOUT_TRUNCATE),
          stderr: result.stderr.slice(0, LIMITS.STDERR_TRUNCATE),
          exitCode: result.exitCode,
        };
      },
    },
    {
      name: 'run_tests',
      description: 'Run the project test suite (npm test). Returns test results and any failures.',
      input_schema: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Optional test name filter pattern' },
        },
      },
      execute: async (params) => {
        const args = ['test'];
        if (params.filter) args.push('--', '--grep', params.filter as string);
        const result = await sandbox.runCommand('npm', args);
        return {
          success: result.exitCode === 0,
          stdout: result.stdout.slice(0, LIMITS.TEST_STDOUT_TRUNCATE),
          stderr: result.stderr.slice(0, LIMITS.STDERR_TRUNCATE),
          exitCode: result.exitCode,
        };
      },
    },
  ];
}
