#!/usr/bin/env node
/**
 * ForgeLoop Architecture Map — Standalone Reindex CLI
 * 
 * Called directly by hooks without going through MCP protocol.
 * Usage:
 *   node .forge/mcp/reindex-cli.js              # Full reindex
 *   node .forge/mcp/reindex-cli.js --changed     # Only files changed since last commit
 *   node .forge/mcp/reindex-cli.js file1.ts file2.ts  # Specific files
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { InferenceClient } from '@huggingface/inference';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
const HF_API_KEY = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || undefined;
const COLLECTION = process.env.QDRANT_COLLECTION || 'kriptik-architecture';
const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const VECTOR_SIZE = 384;
const PROJECT_ROOT = process.cwd();

const qdrant = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY, checkCompatibility: false });
const hf = new InferenceClient(HF_API_KEY);

async function embed(text) {
  return await hf.featureExtraction({ model: EMBEDDING_MODEL, inputs: text.slice(0, 500) });
}

async function ensureCollection() {
  try { await qdrant.getCollection(COLLECTION); } catch {
    await qdrant.createCollection(COLLECTION, { vectors: { size: VECTOR_SIZE, distance: 'Cosine' } });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'type', field_schema: 'keyword' });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'filePath', field_schema: 'keyword' });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'module', field_schema: 'keyword' });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'name', field_schema: 'keyword' });
  }
}

function walkTypeScriptFiles(dir, files = []) {
  const skip = ['node_modules', 'dist', '.git', '.forge', '.next', 'coverage', '.ralphex'];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !skip.includes(entry.name)) walkTypeScriptFiles(full, files);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
    }
  } catch {}
  return files;
}

function parseFile(filePath, content) {
  const elements = [];
  const lines = content.split('\n');
  const rel = path.relative(PROJECT_ROOT, filePath);
  const mod = rel.split(path.sep).slice(0, 2).join('/');
  const regexes = {
    interface: /^export\s+(?:default\s+)?interface\s+(\w+)/,
    type: /^export\s+(?:default\s+)?type\s+(\w+)/,
    class: /^export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/,
    function: /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/,
    export: /^export\s+const\s+(\w+)/,
  };

  let block = null, blockLines = [], depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim();
    if (block) {
      blockLines.push(line);
      depth += (line.match(/\{/g)||[]).length - (line.match(/\}/g)||[]).length;
      if (depth <= 0) {
        elements.push({ ...block, content: blockLines.join('\n'), endLine: i+1, filePath: rel, module: mod });
        block = null; blockLines = []; depth = 0;
      }
      continue;
    }
    for (const [type, regex] of Object.entries(regexes)) {
      const m = trimmed.match(regex);
      if (m) {
        if (type === 'export' || (type === 'type' && (trimmed.includes(';') || !trimmed.includes('{')))) {
          elements.push({ type, name: m[1], content: trimmed, startLine: i+1, endLine: i+1, filePath: rel, module: mod });
        } else {
          block = { type, name: m[1], startLine: i+1 };
          blockLines = [line];
          depth = (line.match(/\{/g)||[]).length - (line.match(/\}/g)||[]).length;
          if (depth <= 0 && line.includes('{')) {
            elements.push({ ...block, content: line, endLine: i+1, filePath: rel, module: mod });
            block = null; blockLines = []; depth = 0;
          }
        }
        break;
      }
    }
  }
  return elements;
}

async function indexFiles(files) {
  await ensureCollection();
  let totalElements = 0, totalFiles = 0;
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const elements = parseFile(filePath, content);
      const rel = path.relative(PROJECT_ROOT, filePath);
      // Index file summary
      const summary = `File: ${rel}\nExports: ${elements.map(e=>e.name).join(', ')}`;
      const fv = await embed(summary);
      const fid = Buffer.from(rel).toString('hex').slice(0, 32);
      await qdrant.upsert(COLLECTION, { points: [{ id: fid, vector: fv, payload: { type: 'file', name: rel, filePath: rel, module: rel.split('/').slice(0,2).join('/'), content: summary, elementCount: elements.length } }] });
      // Index each element
      for (const el of elements) {
        const desc = `${el.type} ${el.name} in ${el.filePath}:\n${el.content.slice(0,400)}`;
        const v = await embed(desc);
        const eid = Buffer.from(`${el.filePath}:${el.name}:${el.type}`).toString('hex').slice(0,32);
        await qdrant.upsert(COLLECTION, { points: [{ id: eid, vector: v, payload: { type: el.type, name: el.name, filePath: el.filePath, module: el.module, startLine: el.startLine, endLine: el.endLine, content: el.content.slice(0,2000) } }] });
        totalElements++;
      }
      totalFiles++;
      process.stdout.write(`\r  Indexed ${totalFiles} files, ${totalElements} elements...`);
    } catch (e) { console.error(`\n  Skipped ${filePath}: ${e.message}`); }
  }
  console.log(`\n✅ Done: ${totalFiles} files, ${totalElements} elements`);
}

// --- CLI Entry ---
async function main() {
  const args = process.argv.slice(2);
  console.log('ForgeLoop Architecture Map — Reindex');
  console.log(`Qdrant: ${QDRANT_URL} | Collection: ${COLLECTION}`);
  console.log(`Project: ${PROJECT_ROOT}\n`);

  let files;
  if (args.includes('--changed')) {
    // Only files changed since last commit
    const changed = execSync('git diff --name-only HEAD -- "*.ts" "*.tsx" 2>/dev/null || true', { encoding: 'utf-8' })
      .split('\n').filter(f => f.trim() && !f.includes('node_modules'));
    const staged = execSync('git diff --cached --name-only -- "*.ts" "*.tsx" 2>/dev/null || true', { encoding: 'utf-8' })
      .split('\n').filter(f => f.trim() && !f.includes('node_modules'));
    const all = [...new Set([...changed, ...staged])];
    files = all.map(f => path.resolve(PROJECT_ROOT, f)).filter(f => fs.existsSync(f));
    console.log(`Mode: Changed files (${files.length} files)`);
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    // Specific files
    files = args.map(f => path.resolve(PROJECT_ROOT, f)).filter(f => fs.existsSync(f));
    console.log(`Mode: Specific files (${files.length} files)`);
  } else {
    // Full reindex
    files = walkTypeScriptFiles(PROJECT_ROOT);
    console.log(`Mode: Full reindex (${files.length} files)`);
  }

  if (files.length === 0) { console.log('No files to index.'); return; }
  await indexFiles(files);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
