/**
 * Dev server management tools: start_dev_server, stop_dev_server
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from './provider.js';
import { TIMEOUTS } from '../../config/index.js';

// Process tracking keyed by sandbox rootDir
const devServers = new Map<string, { process: ChildProcess; port: number; url: string }>();

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export function createDevServerTools(sandbox: SandboxProvider): ToolDefinition[] {
  return [
    {
      name: 'start_dev_server',
      description: 'Start the development server for the project. Returns the URL when the server is ready. Must be called before take_screenshot.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to start the server (default: "npm run dev")' },
          port: { type: 'number', description: 'Port to run on (default: 3000)' },
        },
      },
      execute: async (params) => {
        const port = (params.port as number) ?? 3000;
        const cmd = (params.command as string) ?? 'npm run dev';
        const rootDir = sandbox._rootDir ?? '.';

        const existing = devServers.get(rootDir);
        if (existing) {
          return { url: existing.url, port: existing.port, alreadyRunning: true };
        }

        const parts = cmd.split(' ');
        const child = spawn(parts[0], parts.slice(1), {
          cwd: rootDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          env: { ...process.env, PORT: String(port) },
          detached: true,
        });

        const url = `http://localhost:${port}`;
        devServers.set(rootDir, { process: child, port, url });
        child.unref();

        const ready = await waitForServer(url, TIMEOUTS.DEV_SERVER_READY);
        if (!ready) {
          try { child.kill('SIGTERM'); } catch {}
          devServers.delete(rootDir);
          return { error: `Dev server failed to start within ${TIMEOUTS.DEV_SERVER_READY / 1000}s on port ${port}` };
        }

        return { url, port, pid: child.pid };
      },
    },
    {
      name: 'stop_dev_server',
      description: 'Stop the development server for the project.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const rootDir = sandbox._rootDir ?? '.';
        const server = devServers.get(rootDir);
        if (!server) {
          return { stopped: false, message: 'No dev server running' };
        }

        try { server.process.kill('SIGTERM'); } catch {}
        await new Promise((r) => setTimeout(r, 2000));
        try { server.process.kill('SIGKILL'); } catch {}

        devServers.delete(rootDir);
        return { stopped: true };
      },
    },
  ];
}
