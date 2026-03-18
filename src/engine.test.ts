/**
 * Full integration test for the KripTik Engine.
 *
 * Runs a real engine loop with a simple prompt. Makes real Claude API calls.
 * Requires: ANTHROPIC_API_KEY, QDRANT_URL, QDRANT_API_KEY, HF_API_KEY in env.
 *
 * Run: npx tsx --env-file=.env src/engine.test.ts
 */

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initEngine } from './index.js';
import type { SSEEvent } from './bridge/sse-emitter.js';

// --- Env check ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY required');
  process.exit(1);
}
if (!QDRANT_URL) {
  console.error('ERROR: QDRANT_URL required');
  process.exit(1);
}

// --- Setup ---
const projectId = randomUUID();
const tmpBrainDir = mkdtempSync(join(tmpdir(), 'kriptik-brain-'));
const tmpSandboxDir = mkdtempSync(join(tmpdir(), 'kriptik-sandbox-'));
const brainDbPath = join(tmpBrainDir, 'brain.db');

const events: SSEEvent[] = [];
let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, err: unknown) {
  failed++;
  console.error(`  ✗ ${name}:`, err);
}

// --- Timeout helper ---
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// --- Main test ---
async function main() {
  console.log('=== KripTik Engine Integration Test ===');
  console.log(`Project: ${projectId}`);
  console.log(`Brain DB: ${brainDbPath}`);
  console.log(`Sandbox: ${tmpSandboxDir}`);
  console.log();

  let engine: Awaited<ReturnType<typeof initEngine>> | null = null;

  try {
    // --- Start the engine ---
    console.log('--- Starting engine ---');

    engine = await initEngine({
      projectId,
      mode: 'builder',
      initialContext: 'Build a simple todo app with local storage. It should have: add todos, mark complete, delete todos, persist to localStorage. Use vanilla HTML/CSS/JS — no frameworks.',
      anthropicApiKey: ANTHROPIC_API_KEY!,
      qdrantUrl: QDRANT_URL!,
      qdrantApiKey: QDRANT_API_KEY,
      hfApiKey: HF_API_KEY,
      brainDbPath,
      sandboxRootDir: tmpSandboxDir,
    });

    // Collect SSE events
    const unsub = engine.onEvent((event) => {
      events.push(event);
      // Log interesting events
      if (event.type === 'agent_thinking') {
        console.log(`    [thinking] ${(event.data.thinking as string).slice(0, 80)}...`);
      } else if (event.type === 'agent_tool_call') {
        console.log(`    [tool] ${event.data.tool}(${JSON.stringify(event.data.input).slice(0, 100)})`);
      } else if (event.type === 'brain_node_created') {
        console.log(`    [brain] ${event.data.nodeType}: ${event.data.title}`);
      } else if (event.type === 'agent_file_write') {
        console.log(`    [file] write_file(${(event.data.input as any)?.path})`);
      } else if (event.type === 'agent_spawned') {
        console.log(`    [spawn] ${event.data.role} (${event.data.model})`);
      } else if (event.type === 'agent_error') {
        console.log(`    [error] ${JSON.stringify(event.data).slice(0, 120)}`);
      }
    });

    ok('Engine started');

    // --- Wait for the Lead Agent to do its work ---
    // The Lead will: extract intent, reason about team, spawn specialists.
    // We give it a generous timeout since it's making real API calls.
    console.log('\n--- Waiting for Lead Agent to work (up to 3 minutes) ---');

    await withTimeout(
      waitForCondition(() => {
        // Check if the Lead has created intent nodes
        const intents = engine!.brain.getNodesByType(projectId, 'intent');
        return intents.length > 0;
      }, 1000),
      180_000,
      'Lead Agent creating intent nodes',
    );

    const intents = engine.brain.getNodesByType(projectId, 'intent');
    assert.ok(intents.length > 0, 'Lead should create at least one intent node');
    console.log(`\n  Found ${intents.length} intent node(s):`);
    for (const intent of intents) {
      console.log(`    - ${intent.title}`);
    }
    ok('Lead Agent created intent nodes');

    // --- Check for specialist spawning ---
    console.log('\n--- Checking for specialist agents (up to 2 more minutes) ---');

    await withTimeout(
      waitForCondition(() => {
        const agents = engine!.runtime.getActiveAgents();
        return agents.length > 1; // Lead + at least one specialist
      }, 2000),
      120_000,
      'Specialist agents spawning',
    );

    const agents = engine.runtime.getActiveAgents();
    console.log(`\n  Active agents: ${agents.length}`);
    for (const agent of agents) {
      console.log(`    - ${agent.role} (${agent.model})`);
    }
    assert.ok(agents.length > 1, 'Should have Lead + at least one specialist');
    ok('Lead spawned specialist agent(s)');

    // --- Wait for some files to be written ---
    console.log('\n--- Waiting for file writes (up to 3 more minutes) ---');

    await withTimeout(
      waitForCondition(() => {
        return events.some((e) => e.type === 'agent_file_write');
      }, 2000),
      180_000,
      'File write events',
    );

    const fileWrites = events.filter((e) => e.type === 'agent_file_write');
    console.log(`\n  File writes: ${fileWrites.length}`);
    for (const fw of fileWrites.slice(0, 10)) {
      console.log(`    - ${(fw.data.input as any)?.path}`);
    }
    assert.ok(fileWrites.length > 0, 'Specialists should write files');
    ok('Specialist wrote files via sandbox');

    // --- Check Brain has discovery nodes ---
    console.log('\n--- Checking Brain for discoveries ---');

    const discoveries = engine.brain.getNodesByType(projectId, 'discovery');
    const decisions = engine.brain.getNodesByType(projectId, 'decision');
    const tasks = engine.brain.getNodesByType(projectId, 'task');

    console.log(`  Discoveries: ${discoveries.length}`);
    console.log(`  Decisions: ${decisions.length}`);
    console.log(`  Tasks: ${tasks.length}`);

    for (const d of discoveries.slice(0, 5)) {
      console.log(`    [discovery] ${d.title}`);
    }
    for (const d of decisions.slice(0, 5)) {
      console.log(`    [decision] ${d.title}`);
    }

    // It's possible the agent wrote discoveries or decisions — either counts
    const brainWrites = discoveries.length + decisions.length + tasks.length;
    assert.ok(brainWrites > 0, 'Agents should write knowledge to the Brain');
    ok('Brain contains agent-written knowledge nodes');

    // --- SSE events sanity check ---
    console.log(`\n--- SSE Event Summary ---`);
    const eventTypes = events.reduce(
      (acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; },
      {} as Record<string, number>,
    );
    for (const [type, count] of Object.entries(eventTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
    assert.ok(events.length > 5, 'Should have received multiple SSE events');
    ok('SSE events streaming correctly');

    // --- Terminate ---
    console.log('\n--- Terminating engine ---');
    unsub();
    await engine.terminate();
    engine = null;
    ok('Engine terminated cleanly');

  } catch (err) {
    fail('Integration test', err);
    console.error('\nFull error:', err);
  } finally {
    // Cleanup
    if (engine) {
      try { await engine.terminate(); } catch {}
    }
    try {
      if (existsSync(tmpBrainDir)) rmSync(tmpBrainDir, { recursive: true });
      if (existsSync(tmpSandboxDir)) rmSync(tmpSandboxDir, { recursive: true });
    } catch {}

    // Cleanup Qdrant collection
    try {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      const qdrant = new QdrantClient({ url: QDRANT_URL!, apiKey: QDRANT_API_KEY, checkCompatibility: false });
      await qdrant.deleteCollection(`brain_${projectId.replace(/-/g, '_')}`);
    } catch {}
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

// --- Helpers ---

function waitForCondition(check: () => boolean, pollMs: number): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval);
        resolve();
      }
    }, pollMs);
  });
}

main();
