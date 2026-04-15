/**
 * Integration test for BrainService.
 * Uses a temp SQLite db and real Qdrant (requires QDRANT_URL + QDRANT_API_KEY env vars).
 * Uses real HuggingFace embeddings (requires HF_API_KEY env var).
 *
 * Run: npx tsx src/brain/brain-service.test.ts
 */

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainService } from './brain-service.js';
import { createEmbeddingService } from './embeddings.js';
import type { BrainEvent } from '../types/index.js';

// --- Config from env ---
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

if (!QDRANT_URL) {
  console.error('ERROR: QDRANT_URL env var required');
  process.exit(1);
}

// --- Setup ---
const dbPath = join(tmpdir(), `brain_test_${Date.now()}.db`);
const projectId = randomUUID();

const embeddings = createEmbeddingService({
  qdrantUrl: QDRANT_URL,
  qdrantApiKey: QDRANT_API_KEY,
  hfApiKey: HF_API_KEY,
});

const brain = new BrainService({ dbPath, embeddings });

async function cleanup() {
  brain.close();
  if (existsSync(dbPath)) unlinkSync(dbPath);
  // Clean up Qdrant collection
  try {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const qdrant = new QdrantClient({ url: QDRANT_URL!, apiKey: QDRANT_API_KEY });
    await qdrant.deleteCollection(`brain_${projectId.replace(/-/g, '_')}`);
  } catch {
    // collection may not exist, that's fine
  }
}

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

// --- Tests ---

async function testWriteNodes() {
  console.log('\n--- writeNode ---');

  const intent = await brain.writeNode(
    projectId,
    'intent',
    'Build an AI video generator app',
    {
      description: 'User wants a video generation app using Replicate API',
      features: ['video upload', 'AI generation', 'gallery view'],
    },
    'user',
  );
  assert.equal(intent.nodeType, 'intent');
  assert.equal(intent.status, 'active');
  assert.equal(intent.confidence, 1.0);
  assert.ok(intent.id);
  ok('writes intent node');

  const constraint = await brain.writeNode(
    projectId,
    'constraint',
    'Replicate 25MB upload limit',
    {
      api: 'replicate',
      maxFileSize: '25MB',
      affectsUploadComponent: true,
    },
    'specialist-api-probe',
    { confidence: 0.95 },
  );
  assert.equal(constraint.nodeType, 'constraint');
  assert.equal(constraint.confidence, 0.95);
  ok('writes constraint node with confidence');

  const discovery = await brain.writeNode(
    projectId,
    'discovery',
    'Replicate supports webhook callbacks',
    {
      detail: 'Replicate predictions support webhook_completed for async notifications',
      endpoint: 'POST /v1/predictions',
    },
    'specialist-api-probe',
  );
  assert.equal(discovery.nodeType, 'discovery');
  ok('writes discovery node');

  const task = await brain.writeNode(
    projectId,
    'task',
    'Build file upload component with size validation',
    {
      domain: 'ui',
      relatedConstraint: 'Replicate 25MB upload limit',
      priority: 'high',
    },
    'lead',
  );
  assert.equal(task.nodeType, 'task');
  ok('writes task node');

  return { intent, constraint, discovery, task };
}

async function testAddEdges(nodes: Awaited<ReturnType<typeof testWriteNodes>>) {
  console.log('\n--- addEdge ---');

  const edge1 = await brain.addEdge(
    projectId,
    nodes.task.id,
    nodes.intent.id,
    'implements',
    'lead',
  );
  assert.equal(edge1.edgeType, 'implements');
  ok('creates implements edge');

  const edge2 = await brain.addEdge(
    projectId,
    nodes.task.id,
    nodes.constraint.id,
    'requires',
    'lead',
  );
  assert.equal(edge2.edgeType, 'requires');
  ok('creates requires edge');

  // Create a conflict
  const conflictNode = await brain.writeNode(
    projectId,
    'decision',
    'Use client-side file validation',
    { approach: 'Check file size in browser before upload' },
    'specialist-ui',
  );
  const conflictNode2 = await brain.writeNode(
    projectId,
    'decision',
    'Use server-side file validation only',
    { approach: 'Validate file size on the server after upload' },
    'specialist-backend',
  );
  await brain.addEdge(projectId, conflictNode.id, conflictNode2.id, 'conflicts_with', 'lead');
  ok('creates conflicts_with edge');

  return { conflictNode, conflictNode2 };
}

async function testGetNode(nodeId: string) {
  console.log('\n--- getNode ---');

  const node = brain.getNode(nodeId);
  assert.ok(node);
  assert.equal(node.id, nodeId);
  assert.ok(Array.isArray(node.outgoing));
  assert.ok(Array.isArray(node.incoming));
  ok('gets node with edges');
}

async function testGetNodesByType() {
  console.log('\n--- getNodesByType ---');

  const intents = brain.getNodesByType(projectId, 'intent');
  assert.equal(intents.length, 1);
  assert.equal(intents[0].title, 'Build an AI video generator app');
  ok('gets nodes by type');

  const active = brain.getNodesByType(projectId, 'intent', 'active');
  assert.equal(active.length, 1);
  ok('filters by status');
}

async function testSemanticQuery() {
  console.log('\n--- query (semantic) ---');

  // Small delay to ensure Qdrant has indexed
  await new Promise((r) => setTimeout(r, 1000));

  const results = await brain.query(projectId, 'file upload size limit');
  assert.ok(results.length > 0, 'Should return at least one result');

  // The constraint about 25MB upload limit should be highly relevant
  const titles = results.map((r) => r.node.title);
  console.log('    Query: "file upload size limit"');
  console.log('    Results:', titles.join(', '));
  assert.ok(
    results.some(
      (r) =>
        r.node.title.includes('25MB') || r.node.title.includes('upload'),
    ),
    'Should find upload-related nodes',
  );
  ok('semantic query returns relevant results');

  // Query with type filter
  const constraintResults = await brain.query(
    projectId,
    'API limitations',
    { nodeTypes: ['constraint'] },
  );
  assert.ok(constraintResults.every((r) => r.node.nodeType === 'constraint'));
  ok('semantic query filters by node type');
}

async function testGetRelated(taskId: string) {
  console.log('\n--- getRelated ---');

  const related = brain.getRelated(taskId);
  assert.ok(related.length >= 2, `Expected at least 2 related nodes, got ${related.length}`);
  ok('traverses graph from node');

  const implementsOnly = brain.getRelated(taskId, ['implements']);
  assert.ok(implementsOnly.length >= 1);
  ok('filters by edge type');
}

async function testGetConflicts() {
  console.log('\n--- getConflicts ---');

  const conflicts = brain.getConflicts(projectId);
  assert.ok(conflicts.length >= 1);
  assert.equal(conflicts[0].edge.edgeType, 'conflicts_with');
  ok('finds conflict edges');
}

async function testInvalidateNode(nodeId: string) {
  console.log('\n--- invalidateNode ---');

  const invalidated = await brain.invalidateNode(
    nodeId,
    'Superseded by combined client+server validation approach',
    'lead',
  );
  assert.equal(invalidated.status, 'invalidated');
  ok('invalidates node');

  // Check that a resolution node was created
  const resolutions = brain.getNodesByType(projectId, 'resolution');
  assert.ok(resolutions.length >= 1);
  ok('creates resolution node on invalidation');
}

async function testSubscribe() {
  console.log('\n--- subscribe ---');

  const events: BrainEvent[] = [];
  const unsub = brain.subscribe(projectId, (event) => events.push(event));

  await brain.writeNode(
    projectId,
    'status',
    'Build progress: 45%',
    { percent: 45, phase: 'core_features' },
    'lead',
  );

  assert.ok(events.length > 0, 'Should have received events');
  assert.ok(events.some((e) => e.type === 'node:created'));
  ok('receives events via subscribe');

  unsub();

  // After unsubscribe, no more events
  const countBefore = events.length;
  await brain.writeNode(
    projectId,
    'status',
    'Build progress: 50%',
    { percent: 50 },
    'lead',
  );
  assert.equal(events.length, countBefore, 'Should not receive events after unsubscribe');
  ok('unsubscribe stops events');
}

async function testUpdateNode() {
  console.log('\n--- updateNode ---');

  const node = await brain.writeNode(
    projectId,
    'task',
    'Original title',
    { description: 'original' },
    'lead',
  );

  const updated = await brain.updateNode(node.id, {
    title: 'Updated title',
    content: { description: 'updated content' },
    confidence: 0.8,
  });

  assert.equal(updated.title, 'Updated title');
  assert.equal(updated.confidence, 0.8);
  ok('updates node fields');
}

// --- Run all tests ---

async function main() {
  console.log('=== BrainService Integration Test ===');
  console.log(`DB: ${dbPath}`);
  console.log(`Project: ${projectId}`);
  console.log(`Qdrant: ${QDRANT_URL}`);

  try {
    const nodes = await testWriteNodes();
    const conflicts = await testAddEdges(nodes);
    await testGetNode(nodes.task.id);
    await testGetNodesByType();
    await testSemanticQuery();
    await testGetRelated(nodes.task.id);
    await testGetConflicts();
    await testInvalidateNode(conflicts.conflictNode2.id);
    await testSubscribe();
    await testUpdateNode();

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
