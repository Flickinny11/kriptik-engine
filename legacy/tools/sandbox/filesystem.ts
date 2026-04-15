/**
 * File operation tools: write_file, read_file, edit_file, list_files
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from './provider.js';
import { LIMITS } from '../../config/index.js';

export function createFilesystemTools(sandbox: SandboxProvider): ToolDefinition[] {
  return [
    {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from project root' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
      execute: async (params) => {
        await sandbox.writeFile(params.path as string, params.content as string);
        return { written: params.path };
      },
    },
    {
      name: 'read_file',
      description: 'Read the contents of a file.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from project root' },
        },
        required: ['path'],
      },
      execute: async (params) => {
        try {
          const content = await sandbox.readFile(params.path as string);
          return { path: params.path, content };
        } catch {
          return { error: `File not found: ${params.path}` };
        }
      },
    },
    {
      name: 'edit_file',
      description: 'Find and replace a string in a file. The search string must match exactly (including whitespace). Use this for targeted edits instead of rewriting entire files.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from project root' },
          search: { type: 'string', description: 'Exact string to find in the file' },
          replace: { type: 'string', description: 'String to replace it with' },
        },
        required: ['path', 'search', 'replace'],
      },
      execute: async (params) => {
        const result = await sandbox.editFile(
          params.path as string,
          params.search as string,
          params.replace as string,
        );
        if (!result.matched) {
          return { error: 'Search string not found in file. Check exact whitespace and content.' };
        }
        return { edited: params.path };
      },
    },
    {
      name: 'list_files',
      description: 'List files and directories. Skips node_modules and .git automatically.',
      input_schema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Relative directory path. Use "." for project root.' },
          recursive: { type: 'boolean', description: 'Whether to list recursively. Default: false' },
        },
        required: ['directory'],
      },
      execute: async (params) => {
        const files = await sandbox.listFiles(
          params.directory as string,
          (params.recursive as boolean) ?? false,
        );
        return { directory: params.directory, files };
      },
    },
  ];
}
