/**
 * SandboxProvider interface and local filesystem implementation.
 * This is the abstraction layer that lets the backend be swapped
 * between local fs (for testing) and Modal containers (for production).
 */

import { execFile } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { TIMEOUTS, LIMITS } from '../../config/index.js';

export interface SandboxProvider {
  readonly _rootDir?: string;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  editFile(path: string, search: string, replace: string): Promise<{ matched: boolean }>;
  listFiles(directory: string, recursive: boolean): Promise<string[]>;
  runCommand(command: string, args?: string[], cwd?: string): Promise<CommandResult>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function createLocalSandbox(rootDir: string): SandboxProvider {
  function resolve(path: string): string {
    const resolved = join(rootDir, path);
    if (!resolved.startsWith(rootDir)) {
      throw new Error(`Path traversal blocked: ${path}`);
    }
    return resolved;
  }

  return {
    _rootDir: rootDir,
    async writeFile(path: string, content: string): Promise<void> {
      const fullPath = resolve(path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
    },

    async readFile(path: string): Promise<string> {
      return readFile(resolve(path), 'utf-8');
    },

    async editFile(path: string, search: string, replace: string): Promise<{ matched: boolean }> {
      const fullPath = resolve(path);
      const content = await readFile(fullPath, 'utf-8');
      if (!content.includes(search)) {
        return { matched: false };
      }
      await writeFile(fullPath, content.replace(search, replace), 'utf-8');
      return { matched: true };
    },

    async listFiles(directory: string, recursive: boolean): Promise<string[]> {
      const fullPath = resolve(directory);
      const results: string[] = [];

      async function walk(dir: string, prefix: string): Promise<void> {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            results.push(relativePath + '/');
            if (recursive) await walk(join(dir, entry.name), relativePath);
          } else {
            results.push(relativePath);
          }
        }
      }

      await walk(fullPath, '');
      return results;
    },

    async runCommand(command: string, args: string[] = [], cwd?: string): Promise<CommandResult> {
      const workDir = cwd ? resolve(cwd) : rootDir;
      return new Promise((resolvePromise) => {
        execFile(
          command,
          args,
          {
            cwd: workDir,
            timeout: TIMEOUTS.COMMAND,
            maxBuffer: LIMITS.COMMAND_BUFFER,
            shell: true,
          },
          (error, stdout, stderr) => {
            resolvePromise({
              stdout: stdout?.toString() ?? '',
              stderr: stderr?.toString() ?? '',
              exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
            });
          },
        );
      });
    },
  };
}
