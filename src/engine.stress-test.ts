/**
 * Stress test — complex multi-domain app prompt.
 * Logs everything for human review. No pass/fail assertions.
 *
 * Run: npx tsx --env-file=.env src/engine.stress-test.ts
 */

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initEngine } from './index.js';
import type { SSEEvent } from './bridge/sse-emitter.js';

// --- Config ---
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_COST_DOLLARS = 5.0;

// Rough pricing: Opus input $15/M, output $75/M, thinking $15/M
// Conservative estimate: ~$0.05 per API call average
const ESTIMATED_COST_PER_CALL = 0.05;
let estimatedCost = 0;
let apiCallCount = 0;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

if (!ANTHROPIC_API_KEY || !QDRANT_URL) {
  console.error('ERROR: ANTHROPIC_API_KEY and QDRANT_URL required');
  process.exit(1);
}

// --- Setup ---
const projectId = randomUUID();
const tmpBrainDir = mkdtempSync(join(tmpdir(), 'kriptik-stress-brain-'));
const tmpSandboxDir = mkdtempSync(join(tmpdir(), 'kriptik-stress-sandbox-'));
const brainDbPath = join(tmpBrainDir, 'brain.db');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           KRIPTIK ENGINE — STRESS TEST                      ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║ Project:  ${projectId} ║`);
console.log(`║ Brain:    ${brainDbPath}`);
console.log(`║ Sandbox:  ${tmpSandboxDir}`);
console.log(`║ Timeout:  ${TIMEOUT_MS / 1000}s | Max cost: $${MAX_COST_DOLLARS}`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log();

const PROMPT = `Build an AI image generator app. Users can enter a text prompt, select a style preset (photorealistic, anime, oil painting, watercolor), choose an aspect ratio, and generate images using the Replicate API. Users need accounts with email/password auth. They should see a gallery of their previously generated images, be able to download images, share them via public links, and delete them. The app needs a credit system — new users get 10 free credits, each generation costs 1 credit, and users can buy more credits.`;

console.log('PROMPT:', PROMPT);
console.log();

// --- Event tracking ---
const eventLog: Array<{ time: number; type: string; detail: string }> = [];
const startTime = Date.now();

function elapsed(): string {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function log(type: string, detail: string): void {
  const t = elapsed();
  eventLog.push({ time: Date.now() - startTime, type, detail });
  const prefix = {
    'THINK': '🧠',
    'TOOL': '🔧',
    'BRAIN': '📝',
    'FILE': '📄',
    'SPAWN': '🚀',
    'STOP': '🛑',
    'ERROR': '❌',
    'TEXT': '💬',
    'PROGRESS': '📊',
    'COMPLETE': '✅',
    'CONFLICT': '⚠️',
    'QUESTION': '❓',
    'COMPACT': '📦',
    'RESULT': '📋',
  }[type] ?? '•';
  console.log(`[${t}] ${prefix} ${type.padEnd(10)} ${detail}`);
}

// --- Main ---
async function main() {
  const engine = await initEngine({
    projectId,
    mode: 'builder',
    initialContext: PROMPT,
    anthropicApiKey: ANTHROPIC_API_KEY!,
    qdrantUrl: QDRANT_URL!,
    qdrantApiKey: QDRANT_API_KEY,
    hfApiKey: HF_API_KEY,
    brainDbPath,
    sandboxRootDir: tmpSandboxDir,
  });

  log('SPAWN', 'Engine started — Lead Agent launched');

  // --- Track cost via tool calls (each tool call = 1 API round trip) ---
  const unsub = engine.onEvent((event: SSEEvent) => {
    switch (event.type) {
      case 'agent_thinking': {
        const thinking = (event.data.thinking as string) ?? '';
        log('THINK', thinking.slice(0, 200));
        apiCallCount++;
        estimatedCost += ESTIMATED_COST_PER_CALL;
        break;
      }
      case 'agent_tool_call': {
        const tool = event.data.tool as string;
        const input = JSON.stringify(event.data.input).slice(0, 150);
        log('TOOL', `${tool}(${input})`);
        break;
      }
      case 'agent_tool_result': {
        const tool = event.data.tool as string;
        const result = JSON.stringify(event.data.result).slice(0, 150);
        log('RESULT', `${tool} → ${result}`);
        break;
      }
      case 'agent_text': {
        const text = (event.data.text as string) ?? '';
        if (text.trim()) log('TEXT', text.slice(0, 200));
        break;
      }
      case 'agent_file_write': {
        const path = (event.data.input as any)?.path ?? 'unknown';
        log('FILE', `write_file → ${path}`);
        break;
      }
      case 'brain_node_created': {
        const nt = event.data.nodeType as string;
        const title = event.data.title as string;
        log('BRAIN', `[${nt}] ${title}`);
        break;
      }
      case 'brain_conflict_detected': {
        log('CONFLICT', `${event.data.source} ↔ ${event.data.target}`);
        break;
      }
      case 'agent_spawned': {
        log('SPAWN', `${event.data.role} (${event.data.model})`);
        break;
      }
      case 'agent_stopped': {
        log('STOP', `${event.data.sessionId} → ${event.data.status}`);
        break;
      }
      case 'agent_error': {
        log('ERROR', JSON.stringify(event.data).slice(0, 200));
        break;
      }
      case 'build_progress': {
        log('PROGRESS', `${event.data.title}`);
        break;
      }
      case 'build_complete': {
        log('COMPLETE', `${event.data.title}`);
        break;
      }
      case 'user_input_requested': {
        log('QUESTION', `${event.data.question}`);
        break;
      }
      case 'agent_compacted': {
        log('COMPACT', `session ${event.data.sessionId} at ~${event.data.estimatedTokens} tokens`);
        break;
      }
    }
  });

  // --- Wait with cost and timeout monitoring ---
  const deadline = Date.now() + TIMEOUT_MS;

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      const now = Date.now();

      // Cost check
      if (estimatedCost >= MAX_COST_DOLLARS) {
        console.log(`\n⚠️  COST LIMIT reached: ~$${estimatedCost.toFixed(2)} (${apiCallCount} API calls)`);
        clearInterval(check);
        resolve();
        return;
      }

      // Timeout check
      if (now >= deadline) {
        console.log(`\n⏰ TIMEOUT reached: ${TIMEOUT_MS / 1000}s`);
        clearInterval(check);
        resolve();
        return;
      }

      // Check if all agents have stopped
      const active = engine.runtime.getActiveAgents();
      if (active.length === 0) {
        console.log('\n🏁 All agents completed');
        clearInterval(check);
        resolve();
        return;
      }
    }, 3000);
  });

  // --- Terminate and report ---
  unsub();
  console.log('\n--- Terminating engine ---');
  await engine.terminate().catch(() => {});

  // --- Final report ---
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL BRAIN STATE                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Re-open brain for reading (terminate closed it)
  const { BrainService } = await import('./brain/brain-service.js');
  const { createEmbeddingService } = await import('./brain/embeddings.js');
  const readBrain = new BrainService({
    dbPath: brainDbPath,
    embeddings: createEmbeddingService({ qdrantUrl: QDRANT_URL!, qdrantApiKey: QDRANT_API_KEY, hfApiKey: HF_API_KEY }),
  });

  const nodeTypes = ['intent', 'constraint', 'discovery', 'artifact', 'decision', 'task', 'status', 'error', 'resolution', 'user_directive', 'design_reference', 'api_contract'] as const;

  let totalNodes = 0;
  for (const nt of nodeTypes) {
    const nodes = readBrain.getNodesByType(projectId, nt);
    if (nodes.length === 0) continue;
    totalNodes += nodes.length;
    console.log(`\n--- ${nt.toUpperCase()} (${nodes.length}) ---`);
    for (const n of nodes) {
      const status = n.status !== 'active' ? ` [${n.status}]` : '';
      const conf = n.confidence < 1.0 ? ` (conf: ${n.confidence})` : '';
      console.log(`  • ${n.title}${status}${conf}`);
      console.log(`    by: ${n.createdBy}`);
      const contentStr = JSON.stringify(n.content);
      if (contentStr.length <= 300) {
        console.log(`    content: ${contentStr}`);
      } else {
        console.log(`    content: ${contentStr.slice(0, 300)}...`);
      }
    }
  }

  // Conflicts
  const conflicts = readBrain.getConflicts(projectId);
  if (conflicts.length > 0) {
    console.log(`\n--- CONFLICTS (${conflicts.length}) ---`);
    for (const c of conflicts) {
      console.log(`  ⚠️  "${c.source.title}" ↔ "${c.target.title}"`);
    }
  }

  readBrain.close();

  // --- Sandbox file listing ---
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  FILES WRITTEN TO SANDBOX                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  function listDirRecursive(dir: string, prefix: string = ''): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        console.log(`  ${prefix}${entry.name}/`);
        listDirRecursive(fullPath, prefix + '  ');
      } else {
        const size = statSync(fullPath).size;
        console.log(`  ${prefix}${entry.name} (${size} bytes)`);
      }
    }
  }

  listDirRecursive(tmpSandboxDir);

  // --- Summary ---
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Total brain nodes:    ${totalNodes}`);
  console.log(`  Conflicts:            ${conflicts.length}`);
  console.log(`  API calls (est):      ${apiCallCount}`);
  console.log(`  Estimated cost:       ~$${estimatedCost.toFixed(2)}`);
  console.log(`  Total runtime:        ${elapsed()}`);
  console.log(`  Sandbox dir:          ${tmpSandboxDir}`);
  console.log(`  Brain DB:             ${brainDbPath}`);
  console.log();
  console.log('Sandbox directory preserved for inspection. Delete manually when done:');
  console.log(`  rm -rf ${tmpSandboxDir} ${tmpBrainDir}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
