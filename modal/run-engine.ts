/**
 * run-engine.ts — Engine runner for Modal sandbox/container
 *
 * Reads JSON config from stdin, initializes the engine, and streams
 * newline-delimited JSON events to stdout. Each line is one EngineEvent.
 *
 * Fixes applied:
 * - Single event listener (no duplicate registration)
 * - Graceful shutdown on SIGTERM/SIGINT (prevents Brain DB corruption)
 * - No duplicate build_complete event (engine emits its own)
 *
 * Usage (inside Modal container):
 *   echo '{"projectId":"abc","prompt":"Build me a todo app",...}' | node --import tsx run-engine.ts
 */

import { initEngine } from './src/index.js';

let engineHandle: any = null;

// Graceful shutdown — ensures Brain DB is closed properly
async function shutdown(signal: string) {
  writeEvent({
    type: 'build_progress',
    data: { message: `Shutting down (${signal})...` },
  });

  if (engineHandle) {
    try {
      await engineHandle.terminate();
    } catch {
      // Best-effort cleanup
    }
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function main() {
  // Read config from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf-8');
  const config = JSON.parse(input);

  const {
    projectId,
    prompt,
    mode = 'builder',
    budgetCapDollars = 5,
    brainDbPath,
    sandboxRootDir,
  } = config;

  if (!projectId || !prompt) {
    console.error('ERROR: projectId and prompt are required');
    process.exit(1);
  }

  writeEvent({
    type: 'build_progress',
    data: { message: 'Engine initializing...', projectId },
  });

  try {
    const handle = await initEngine({
      projectId,
      mode,
      initialContext: prompt,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      qdrantUrl: process.env.QDRANT_URL!,
      qdrantApiKey: process.env.QDRANT_API_KEY,
      hfApiKey: process.env.HF_API_KEY,
      brainDbPath: brainDbPath || `/brains/${projectId}.db`,
      sandboxRootDir: sandboxRootDir || `/sandboxes/${projectId}`,
      budgetCapDollars,
    });

    engineHandle = handle;

    writeEvent({
      type: 'build_progress',
      data: { message: 'Engine started, Lead Agent reasoning...', projectId },
    });

    // Single event listener — streams events AND detects completion
    await new Promise<void>((resolve) => {
      handle.onEvent((event: any) => {
        writeEvent(event);

        if (event.type === 'build_complete' || event.type === 'build_error') {
          resolve();
        }
      });
    });

    // Gracefully close the engine (flushes Brain DB)
    await handle.terminate();
    engineHandle = null;

  } catch (error: any) {
    writeEvent({
      type: 'build_error',
      data: {
        message: error.message || 'Unknown error',
        stack: error.stack,
        projectId,
      },
    });

    // Still try to close engine gracefully
    if (engineHandle) {
      try { await engineHandle.terminate(); } catch { /* best-effort */ }
    }

    process.exit(1);
  }

  process.exit(0);
}

function writeEvent(event: any) {
  process.stdout.write(JSON.stringify(event) + '\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
