#!/usr/bin/env node
/**
 * ForgeLoop Architecture Map MCP Server
 * 
 * Qdrant-backed MCP server that gives Claude Code live, queryable
 * access to the KripTik codebase architecture during execution.
 * 
 * This is the anti-drift weapon — provides fresh architectural context
 * mid-session without consuming context window.
 * 
 * Reuses KripTik's existing embedding pattern (HuggingFace + Qdrant).
 * 
 * Tools: search_architecture, get_interface, check_integration,
 *        query_endpoints, query_dependencies, update_map
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { InferenceClient } from '@huggingface/inference';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// --- Configuration ---
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
const HF_API_KEY = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY || undefined;
const COLLECTION = process.env.QDRANT_COLLECTION || 'kriptik-architecture';
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const VECTOR_SIZE = 384;

// --- Clients ---
const qdrant = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY, checkCompatibility: false });
const hf = new InferenceClient(HF_API_KEY);

// --- Embedding ---
async function embed(text) {
  const truncated = text.slice(0, 500);
  const result = await hf.featureExtraction({ model: EMBEDDING_MODEL, inputs: truncated });
  return result;
}

async function ensureCollection() {
  try {
    await qdrant.getCollection(COLLECTION);
  } catch {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'type', field_schema: 'keyword' });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'filePath', field_schema: 'keyword' });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'module', field_schema: 'keyword' });
    await qdrant.createPayloadIndex(COLLECTION, { field_name: 'name', field_schema: 'keyword' });
  }
}

// --- Code Parser ---
// Extracts structural elements from TypeScript files without heavy AST deps
function parseTypeScriptFile(filePath, content) {
  const elements = [];
  const lines = content.split('\n');
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  const module = relativePath.split(path.sep).slice(0, 2).join('/');

  // Extract interfaces
  const interfaceRegex = /^export\s+(?:default\s+)?interface\s+(\w+)/;
  // Extract types
  const typeRegex = /^export\s+(?:default\s+)?type\s+(\w+)/;
  // Extract classes
  const classRegex = /^export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/;
  // Extract exported functions
  const funcRegex = /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/;
  // Extract const exports (arrow functions, objects)
  const constRegex = /^export\s+const\s+(\w+)/;
  // Extract imports
  const importRegex = /^import\s+.*from\s+['"]([^'"]+)['"]/;

  let currentBlock = null;
  let blockLines = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track multi-line blocks (interfaces, classes, functions)
    if (currentBlock) {
      blockLines.push(line);
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (braceDepth <= 0) {
        elements.push({
          ...currentBlock,
          content: blockLines.join('\n'),
          endLine: i + 1,
          filePath: relativePath,
          module,
        });
        currentBlock = null;
        blockLines = [];
        braceDepth = 0;
      }
      continue;
    }

    // Check for structural elements
    let match;
    if ((match = trimmed.match(interfaceRegex))) {
      currentBlock = { type: 'interface', name: match[1], startLine: i + 1 };
      blockLines = [line];
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceDepth <= 0 && line.includes('{')) {
        elements.push({ ...currentBlock, content: line, endLine: i + 1, filePath: relativePath, module });
        currentBlock = null; blockLines = []; braceDepth = 0;
      }
    } else if ((match = trimmed.match(typeRegex))) {
      // Types can be single-line or multi-line
      if (trimmed.includes(';') || (trimmed.includes('=') && !trimmed.includes('{'))) {
        elements.push({ type: 'type', name: match[1], content: trimmed, startLine: i+1, endLine: i+1, filePath: relativePath, module });
      } else {
        currentBlock = { type: 'type', name: match[1], startLine: i + 1 };
        blockLines = [line];
        braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      }
    } else if ((match = trimmed.match(classRegex))) {
      currentBlock = { type: 'class', name: match[1], startLine: i + 1 };
      blockLines = [line];
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    } else if ((match = trimmed.match(funcRegex))) {
      currentBlock = { type: 'function', name: match[1], startLine: i + 1 };
      blockLines = [line];
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceDepth <= 0 && line.includes('{')) {
        elements.push({ ...currentBlock, content: line, endLine: i+1, filePath: relativePath, module });
        currentBlock = null; blockLines = []; braceDepth = 0;
      }
    } else if ((match = trimmed.match(constRegex))) {
      elements.push({ type: 'export', name: match[1], content: trimmed, startLine: i+1, endLine: i+1, filePath: relativePath, module });
    } else if ((match = trimmed.match(importRegex))) {
      elements.push({ type: 'import', name: match[1], content: trimmed, startLine: i+1, endLine: i+1, filePath: relativePath, module });
    }
  }
  return elements;
}

// --- File Walker ---
function walkTypeScriptFiles(dir, files = []) {
  const skipDirs = ['node_modules', 'dist', '.git', '.forge', '.next', 'coverage', '.ralphex'];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
        walkTypeScriptFiles(fullPath, files);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return files;
}

// --- Indexer ---
async function indexCodebase(changedFiles = null) {
  await ensureCollection();
  const files = changedFiles || walkTypeScriptFiles(PROJECT_ROOT);
  let totalElements = 0;
  let totalFiles = 0;

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const elements = parseTypeScriptFile(filePath, content);

      // Also index the file itself as a summary
      const relativePath = path.relative(PROJECT_ROOT, filePath);
      const fileSummary = `File: ${relativePath}\nExports: ${elements.filter(e => e.type !== 'import').map(e => e.name).join(', ')}\nImports: ${elements.filter(e => e.type === 'import').map(e => e.name).join(', ')}`;

      const fileVector = await embed(fileSummary);
      const fileId = Buffer.from(relativePath).toString('hex').slice(0, 32);
      await qdrant.upsert(COLLECTION, {
        points: [{
          id: fileId,
          vector: fileVector,
          payload: { type: 'file', name: relativePath, filePath: relativePath, module: relativePath.split('/').slice(0,2).join('/'), content: fileSummary, elementCount: elements.length }
        }]
      });

      // Index each structural element
      for (const el of elements) {
        if (el.type === 'import') continue; // Skip imports for vector search (too noisy)
        const description = `${el.type} ${el.name} in ${el.filePath} (lines ${el.startLine}-${el.endLine}):\n${el.content.slice(0, 400)}`;
        const vector = await embed(description);
        const elId = Buffer.from(`${el.filePath}:${el.name}:${el.type}`).toString('hex').slice(0, 32);
        await qdrant.upsert(COLLECTION, {
          points: [{
            id: elId,
            vector,
            payload: {
              type: el.type,
              name: el.name,
              filePath: el.filePath,
              module: el.module,
              startLine: el.startLine,
              endLine: el.endLine,
              content: el.content.slice(0, 2000),
            }
          }]
        });
        totalElements++;
      }
      totalFiles++;
    } catch (e) {
      // Skip files that fail to parse/embed
      console.error(`Skipped ${filePath}: ${e.message}`);
    }
  }
  return { totalFiles, totalElements };
}

// --- Search Helper ---
async function searchArchitecture(query, limit = 5, filter = {}) {
  await ensureCollection();
  const queryVector = await embed(query);
  const qdrantFilter = Object.keys(filter).length > 0
    ? { must: Object.entries(filter).map(([k, v]) => ({ key: k, match: { value: v } })) }
    : undefined;
  const results = await qdrant.search(COLLECTION, {
    vector: queryVector,
    filter: qdrantFilter,
    limit,
    with_payload: true,
  });
  return results.map(r => ({
    score: r.score,
    type: r.payload?.type,
    name: r.payload?.name,
    filePath: r.payload?.filePath,
    module: r.payload?.module,
    content: r.payload?.content,
    startLine: r.payload?.startLine,
    endLine: r.payload?.endLine,
  }));
}

// --- Get Interface by exact name ---
async function getInterfaceByName(name) {
  await ensureCollection();
  // First try exact payload match
  const results = await qdrant.scroll(COLLECTION, {
    filter: { must: [
      { key: 'name', match: { value: name } },
      { key: 'type', match: { value: 'interface' } }
    ]},
    limit: 5,
    with_payload: true,
  });
  if (results.points && results.points.length > 0) {
    return results.points.map(p => ({
      name: p.payload?.name,
      filePath: p.payload?.filePath,
      content: p.payload?.content,
      startLine: p.payload?.startLine,
      endLine: p.payload?.endLine,
    }));
  }
  // Fallback: also check types and classes
  const fallback = await qdrant.scroll(COLLECTION, {
    filter: { must: [{ key: 'name', match: { value: name } }] },
    limit: 5,
    with_payload: true,
  });
  return (fallback.points || []).map(p => ({
    type: p.payload?.type,
    name: p.payload?.name,
    filePath: p.payload?.filePath,
    content: p.payload?.content,
    startLine: p.payload?.startLine,
    endLine: p.payload?.endLine,
  }));
}

// --- Check Integration ---
async function checkIntegration(from, to) {
  // Search for imports/references between the two components
  const query = `${from} imports or uses ${to}`;
  const results = await searchArchitecture(query, 10);
  // Filter to results mentioning both components
  const relevant = results.filter(r => {
    const content = (r.content || '').toLowerCase();
    const name = (r.name || '').toLowerCase();
    return (content.includes(from.toLowerCase()) || name.includes(from.toLowerCase())) &&
           (content.includes(to.toLowerCase()) || name.includes(to.toLowerCase()));
  });
  return {
    connected: relevant.length > 0,
    evidence: relevant.slice(0, 5),
    allResults: results.slice(0, 5),
  };
}

// --- Query Dependencies ---
async function queryDependencies(component) {
  await ensureCollection();
  // Find files that import or reference this component
  const query = `imports ${component} from`;
  const results = await searchArchitecture(query, 15);
  const dependents = results.filter(r =>
    (r.content || '').toLowerCase().includes(component.toLowerCase())
  );
  return {
    component,
    dependedOnBy: dependents.map(d => ({ file: d.filePath, name: d.name, type: d.type })),
    totalReferences: dependents.length,
  };
}

// ============================================================
// MCP SERVER SETUP
// ============================================================

const server = new Server(
  { name: 'forgeloop-architecture-map', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// --- Tool Definitions ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_architecture',
      description: 'Semantic search across codebase structure. Ask natural language questions like "what handles message routing?" or "where is authentication implemented?"',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language query about the codebase' },
          limit: { type: 'number', description: 'Max results (default 5)' },
          type_filter: { type: 'string', description: 'Filter by type: interface, class, function, type, export, file' }
        },
        required: ['query']
      }
    },
    {
      name: 'get_interface',
      description: 'Get the exact current definition of an interface, type, or class by name. Returns the full source code.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exact name of the interface/type/class (e.g., "AgentMessage", "IRouter")' }
        },
        required: ['name']
      }
    },
    {
      name: 'check_integration',
      description: 'Check if two components are connected. Validates that integration points exist between them.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source component name' },
          to: { type: 'string', description: 'Target component name' }
        },
        required: ['from', 'to']
      }
    },
    {
      name: 'query_endpoints',
      description: 'List exports, routes, or API endpoints in a specific module or directory.',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', description: 'Module path or name (e.g., "server/src/routes", "src/brain")' }
        },
        required: ['module']
      }
    },
    {
      name: 'query_dependencies',
      description: 'Find what depends on a given component. Shows which files import or reference it.',
      inputSchema: {
        type: 'object',
        properties: {
          component: { type: 'string', description: 'Component name to check dependents for' }
        },
        required: ['component']
      }
    },
    {
      name: 'update_map',
      description: 'Re-index the codebase architecture map. Use after making changes to keep the map current. Pass changed_files to do incremental update, or omit for full reindex.',
      inputSchema: {
        type: 'object',
        properties: {
          changed_files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific file paths to re-index (relative to project root). Omit for full reindex.'
          }
        }
      }
    }
  ]
}));

// --- Tool Handler ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_architecture': {
        const filter = args.type_filter ? { type: args.type_filter } : {};
        const results = await searchArchitecture(args.query, args.limit || 5, filter);
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
        };
      }

      case 'get_interface': {
        const results = await getInterfaceByName(args.name);
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `No interface/type/class found with name "${args.name}". Try search_architecture for fuzzy search.` }]
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
        };
      }

      case 'check_integration': {
        const result = await checkIntegration(args.from, args.to);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'query_endpoints': {
        const results = await searchArchitecture(
          `exports functions routes endpoints in ${args.module}`,
          15,
          {}
        );
        // Filter to results in the specified module
        const moduleResults = results.filter(r =>
          (r.filePath || '').includes(args.module) || (r.module || '').includes(args.module)
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(moduleResults.length > 0 ? moduleResults : results.slice(0, 10), null, 2) }]
        };
      }

      case 'query_dependencies': {
        const result = await queryDependencies(args.component);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }

      case 'update_map': {
        const files = args.changed_files
          ? args.changed_files.map(f => path.resolve(PROJECT_ROOT, f))
          : null;
        const result = await indexCodebase(files);
        return {
          content: [{ type: 'text', text: `Architecture map updated: ${result.totalFiles} files, ${result.totalElements} elements indexed.` }]
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error in ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// --- Server Startup ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ForgeLoop Architecture Map MCP server running');
  console.error(`Qdrant: ${QDRANT_URL}, Collection: ${COLLECTION}`);
  console.error(`Project root: ${PROJECT_ROOT}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
