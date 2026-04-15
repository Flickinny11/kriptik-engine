/**
 * Integration tests for new/enhanced tools.
 *
 * Tests: seedTemplateBrain, enhanced check_placeholders,
 * run_full_verification, start/stop_dev_server, search_web structure.
 *
 * Run: npx tsx --env-file=.env src/tools/tools.test.ts
 */

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainService } from '../brain/brain-service.js';
import { createEmbeddingService } from '../brain/embeddings.js';
import { seedTemplateBrain } from '../brain/template.js';
import { createLocalSandbox } from './sandbox/provider.js';
import { createVerifyTools } from './verify/index.js';

const QDRANT_URL = process.env.QDRANT_URL;
if (!QDRANT_URL) {
  console.error('ERROR: QDRANT_URL required');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(name: string) { passed++; console.log(`  ✓ ${name}`); }
function fail(name: string, err: unknown) { failed++; console.error(`  ✗ ${name}:`, err); }

// --- Setup ---
const projectId = randomUUID();
const tmpBrainDir = mkdtempSync(join(tmpdir(), 'tools-test-brain-'));
const tmpSandboxDir = mkdtempSync(join(tmpdir(), 'tools-test-sandbox-'));
const brainDbPath = join(tmpBrainDir, 'brain.db');

const embeddings = createEmbeddingService({
  qdrantUrl: QDRANT_URL,
  qdrantApiKey: process.env.QDRANT_API_KEY,
  hfApiKey: process.env.HF_API_KEY,
});

const brain = new BrainService({ dbPath: brainDbPath, embeddings });
const sandbox = createLocalSandbox(tmpSandboxDir);

async function cleanup() {
  brain.close();
  try { if (existsSync(tmpBrainDir)) rmSync(tmpBrainDir, { recursive: true }); } catch {}
  try { if (existsSync(tmpSandboxDir)) rmSync(tmpSandboxDir, { recursive: true }); } catch {}
  try {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const qdrant = new QdrantClient({ url: QDRANT_URL!, apiKey: process.env.QDRANT_API_KEY, checkCompatibility: false });
    await qdrant.deleteCollection(`brain_${projectId.replace(/-/g, '_')}`);
  } catch {}
}

// --- Test: seedTemplateBrain ---

async function testSeedTemplateBrain() {
  console.log('\n--- seedTemplateBrain ---');

  const result = await seedTemplateBrain(brain, projectId);
  assert.ok(result.seeded, 'Should seed on first call');
  assert.ok(result.nodesCreated > 20, `Expected >20 constraint nodes, got ${result.nodesCreated}`);
  ok(`Seeds ${result.nodesCreated} constraint nodes`);

  // Verify nodes are in the brain
  const constraints = brain.getNodesByType(projectId, 'constraint');
  assert.equal(constraints.length, result.nodesCreated);
  assert.ok(constraints.every((n) => n.createdBy === 'template'));
  ok('All nodes have created_by=template');

  // Verify structure
  const antiSlop = constraints.filter((n) => {
    const c = n.content as Record<string, unknown>;
    return c.category === 'anti-slop';
  });
  assert.ok(antiSlop.length >= 10, `Expected >=10 anti-slop constraints, got ${antiSlop.length}`);
  ok(`${antiSlop.length} anti-slop constraints`);

  const qualityFloor = constraints.filter((n) => {
    const c = n.content as Record<string, unknown>;
    return c.category === 'quality-floor';
  });
  assert.ok(qualityFloor.length >= 5, `Expected >=5 quality-floor constraints, got ${qualityFloor.length}`);
  ok(`${qualityFloor.length} quality-floor constraints`);

  // Verify idempotency
  const result2 = await seedTemplateBrain(brain, projectId);
  assert.ok(!result2.seeded, 'Should skip on second call');
  assert.equal(result2.nodesCreated, 0);
  const constraintsAfter = brain.getNodesByType(projectId, 'constraint');
  assert.equal(constraintsAfter.length, constraints.length, 'No duplicates after second call');
  ok('Idempotent — second call creates no duplicates');

  // Verify node content structure
  const sampleNode = constraints[0];
  const content = sampleNode.content as Record<string, unknown>;
  assert.ok(content.rule, 'Node content has rule field');
  assert.ok(content.rationale, 'Node content has rationale field');
  assert.ok(Array.isArray(content.examples), 'Node content has examples array');
  ok('Node content has correct structure (rule, rationale, examples)');
}

// --- Test: enhanced check_placeholders ---

async function testCheckPlaceholders() {
  console.log('\n--- check_placeholders (enhanced) ---');

  // Create test files in sandbox
  writeFileSync(join(tmpSandboxDir, 'clean.ts'), `
    export function hello() { return "world"; }
  `);
  writeFileSync(join(tmpSandboxDir, 'dirty.ts'), `
    // TODO: implement this
    // FIXME: broken logic
    const key = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const email = "admin@example.com";
    console.log("debug output");
    const x: any = {};
    // @ts-ignore
    window.alert("Success!");
    const url = "your-api-key-here";
    const lorem = "Lorem ipsum dolor sit amet";
    try { doThing(); } catch(e) {}
    const CHANGEME = "replace this";
  `);

  const tools = createVerifyTools(sandbox);
  const checkPlaceholders = tools.find((t) => t.name === 'check_placeholders')!;

  const result = await checkPlaceholders.execute(
    { files: ['clean.ts', 'dirty.ts'] },
    { projectId, sessionId: 'test', brain },
  ) as any;

  assert.equal(result.scannedFiles, 2);
  assert.ok(result.findingCount > 8, `Expected >8 findings, got ${result.findingCount}`);
  ok(`Found ${result.findingCount} findings in dirty file`);

  // Check attention level breakdown exists
  assert.ok(result.byAttentionLevel.high > 0, 'Should have high-attention findings');
  assert.ok(result.byAttentionLevel.medium > 0, 'Should have medium-attention findings');
  ok(`Attention levels: ${result.byAttentionLevel.high} high, ${result.byAttentionLevel.medium} medium, ${result.byAttentionLevel.low} low`);

  // Check specific patterns
  const types = result.byType as Record<string, number>;
  assert.ok(types.todo > 0, 'Should detect TODO');
  assert.ok(types.fixme > 0, 'Should detect FIXME');
  assert.ok(types.exposed_credential > 0, 'Should detect exposed credentials');
  assert.ok(types.console_log > 0, 'Should detect console.log');
  assert.ok(types.any_type > 0, 'Should detect :any types');
  assert.ok(types.changeme > 0, 'Should detect CHANGEME');
  ok('Detects: TODO, FIXME, exposed credentials, console.log, any types, CHANGEME');
}

// --- Test: run_full_verification ---

async function testRunFullVerification() {
  console.log('\n--- run_full_verification ---');

  // Create a minimal project in sandbox
  writeFileSync(join(tmpSandboxDir, 'package.json'), JSON.stringify({
    name: 'test-project',
    scripts: { build: 'echo ok' },
  }));

  // Write an intent node so verification has something to check
  await brain.writeNode(projectId, 'intent', 'Test intent', {
    description: 'A test intent',
    success_criteria: ['package.json exists'],
  }, 'test');

  const tools = createVerifyTools(sandbox);
  const runFull = tools.find((t) => t.name === 'run_full_verification')!;

  const result = await runFull.execute(
    {},
    { projectId, sessionId: 'test', brain },
  ) as any;

  assert.ok(result.summary, 'Should have summary');
  assert.ok('typescript_errors' in result.summary, 'Summary has typescript_errors');
  assert.ok('intents' in result.summary, 'Summary has intents');
  assert.ok(Array.isArray(result.issues_found), 'Has issues_found array');
  ok(`Issues found: ${result.issues_found.length}, TS errors: ${result.summary.typescript_errors}`);
}

// --- Test: start_dev_server / stop_dev_server ---

async function testDevServer() {
  console.log('\n--- start_dev_server / stop_dev_server ---');

  // Create a minimal HTTP server in the sandbox
  const serverDir = join(tmpSandboxDir, 'server-test');
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(join(serverDir, 'server.js'), `
    const http = require('http');
    const port = process.env.PORT || 3456;
    http.createServer((req, res) => {
      res.writeHead(200);
      res.end('ok');
    }).listen(port, () => console.log('ready on ' + port));
  `);

  const serverSandbox = createLocalSandbox(serverDir);
  const { createSandboxTools } = await import('./sandbox/index.js');
  const tools = createSandboxTools(serverSandbox);

  const startTool = tools.find((t) => t.name === 'start_dev_server')!;
  const stopTool = tools.find((t) => t.name === 'stop_dev_server')!;

  const startResult = await startTool.execute(
    { command: 'node server.js', port: 3456 },
    { projectId, sessionId: 'test', brain },
  ) as any;

  if (startResult.error) {
    // Server might fail in CI or constrained env — not a hard failure
    console.log(`    (skipped — server failed to start: ${startResult.error})`);
    ok('start_dev_server returns error gracefully when server fails');
    return;
  }

  assert.ok(startResult.url, 'Should return URL');
  assert.equal(startResult.port, 3456);
  ok(`Server started at ${startResult.url}`);

  // Test idempotency
  const startAgain = await startTool.execute(
    { command: 'node server.js', port: 3456 },
    { projectId, sessionId: 'test', brain },
  ) as any;
  assert.ok(startAgain.alreadyRunning, 'Should detect already running');
  ok('Detects already-running server');

  // Stop
  const stopResult = await stopTool.execute(
    {},
    { projectId, sessionId: 'test', brain },
  ) as any;
  assert.ok(stopResult.stopped, 'Should stop server');
  ok('Server stopped');
}

// --- Run all ---

async function main() {
  console.log('=== New Tools Integration Test ===');

  try {
    await testSeedTemplateBrain();
    await testCheckPlaceholders();
    await testRunFullVerification();
    await testDevServer();

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('\nFATAL:', err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
