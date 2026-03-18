/**
 * run-engine.ts — Engine runner for Modal sandbox/container
 *
 * Reads JSON config from stdin, initializes the engine, and streams
 * newline-delimited JSON events to stdout. Each line is one EngineEvent.
 *
 * Usage (inside Modal container):
 *   echo '{"projectId":"abc","prompt":"Build me a todo app",...}' | node --import tsx run-engine.ts
 */

import { initEngine } from './src/index.js';

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

  // Write a startup event
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

    // Stream events to stdout as newline-delimited JSON
    handle.onEvent((event: any) => {
      writeEvent(event);
    });

    writeEvent({
      type: 'build_progress',
      data: { message: 'Engine started, Lead Agent reasoning...', projectId },
    });

    // Wait for the engine to complete
    // The engine runs until the Lead Agent determines all intents are satisfied
    // or the budget is exhausted
    await new Promise<void>((resolve) => {
      handle.onEvent((event: any) => {
        if (event.type === 'build_complete' || event.type === 'build_error') {
          resolve();
        }
      });
    });

    writeEvent({
      type: 'build_complete',
      data: { message: 'Build finished', projectId },
    });

  } catch (error: any) {
    writeEvent({
      type: 'build_error',
      data: {
        message: error.message || 'Unknown error',
        stack: error.stack,
        projectId,
      },
    });
    process.exit(1);
  }

  process.exit(0);
}

function writeEvent(event: any) {
  // Write as newline-delimited JSON to stdout
  process.stdout.write(JSON.stringify(event) + '\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
