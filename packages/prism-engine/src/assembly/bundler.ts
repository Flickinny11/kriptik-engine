/**
 * bundler.ts -- Bundle structure validation and manifest generation.
 *
 * The actual file assembly runs in Modal Python (modal/prism/assembly_worker.py).
 * This module defines the expected bundle structure and validates completeness.
 *
 * Enforces:
 * - RED LINE 6: Per-node modules (nodes/{nodeId}.js), NOT monolithic bundles
 * - INVARIANT 1: graph.json IS the runtime representation (the graph IS the app)
 *
 * Bundle structure (from spec Section 13):
 *
 *   bundle/
 *     index.html              -- Entry point
 *     app.js                  -- PixiJS v8 setup + initialization
 *     graph.json              -- Serialized knowledge graph (runtime representation)
 *     nodes/
 *       {nodeId}.js           -- Per-node code module (one file per node)
 *     atlases/
 *       atlas-{index}.png     -- Texture atlas images
 *     fonts/
 *       {font}.fnt            -- MSDF font atlas files
 *     shared/
 *       manager.js            -- Hub manager (navigation, shared nodes)
 *       adapter.js            -- Graph-to-tree adapter for PixiJS
 *       animations.js         -- Shared animation utilities
 *       state.js              -- Application state management
 */

import type { PrismGraph, GraphNode } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BundleValidation {
  valid: boolean;
  missingFiles: string[];
  warnings: string[];
}

export interface BundleManifest {
  requiredFiles: string[];
  nodeFiles: string[];
  atlasFiles: string[];
  totalExpectedFiles: number;
  estimatedSizeBytes: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Files that must exist in every Prism bundle regardless of content.
 * These form the skeleton that the PixiJS runtime needs to boot.
 */
export const REQUIRED_BUNDLE_FILES: readonly string[] = [
  'index.html',
  'app.js',
  'graph.json',
  'shared/manager.js',
  'shared/adapter.js',
  'shared/animations.js',
  'shared/state.js',
] as const;

// ---------------------------------------------------------------------------
// Size estimation constants (bytes)
// ---------------------------------------------------------------------------

/** Base bundle overhead: index.html + app.js + graph.json + shared/*.js */
const BASE_SIZE_BYTES = 50 * 1024; // 50 KB
/** Estimated size per node module */
const PER_NODE_SIZE_BYTES = 2 * 1024; // 2 KB
/** Estimated size per texture atlas (2048x2048 PNG) */
const PER_ATLAS_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a bundle contains all required files for a given graph.
 *
 * Checks:
 * 1. All REQUIRED_BUNDLE_FILES are present
 * 2. Every verified node has a corresponding nodes/{nodeId}.js file
 * 3. At least one atlas file exists when the graph has nodes with atlas regions
 * 4. graph.json is in the file list (also covered by REQUIRED_BUNDLE_FILES)
 */
export function validateBundleStructure(
  files: string[],
  graph: PrismGraph,
): BundleValidation {
  const fileSet = new Set(files);
  const missingFiles: string[] = [];
  const warnings: string[] = [];

  // 1. Check all required base files
  for (const required of REQUIRED_BUNDLE_FILES) {
    if (!fileSet.has(required)) {
      missingFiles.push(required);
    }
  }

  // 2. Check per-node module files for verified nodes
  const verifiedNodes = graph.nodes.filter(
    (node: GraphNode) => node.status === 'verified',
  );
  for (const node of verifiedNodes) {
    const nodeFile = `nodes/${node.id}.js`;
    if (!fileSet.has(nodeFile)) {
      missingFiles.push(nodeFile);
    }
  }

  // Warn about non-verified nodes that are present
  const nonVerifiedWithCode = graph.nodes.filter(
    (node: GraphNode) =>
      node.status !== 'verified' && node.status !== 'pending',
  );
  for (const node of nonVerifiedWithCode) {
    const nodeFile = `nodes/${node.id}.js`;
    if (fileSet.has(nodeFile)) {
      warnings.push(
        `Node ${node.id} has a bundle file but status is '${node.status}', not 'verified'`,
      );
    }
  }

  // 3. Check atlas files when nodes reference atlas regions
  const nodesWithAtlas = graph.nodes.filter(
    (node: GraphNode) => node.atlasRegion !== null,
  );
  if (nodesWithAtlas.length > 0) {
    const hasAtlasFile = files.some((f) => f.startsWith('atlases/atlas-'));
    if (!hasAtlasFile) {
      missingFiles.push('atlases/atlas-0.png');
      warnings.push(
        `Graph has ${nodesWithAtlas.length} nodes with atlas regions but no atlas files in bundle`,
      );
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * Creates a manifest describing what the bundle should contain for a given graph.
 *
 * This is used by the Modal assembly worker to know what files to produce,
 * and by the server to verify the upload is complete before marking the build
 * as successful.
 */
export function buildBundleManifest(
  graph: PrismGraph,
  atlasCount: number,
): BundleManifest {
  const requiredFiles = [...REQUIRED_BUNDLE_FILES];

  const nodeFiles = graph.nodes
    .filter((node: GraphNode) => node.status === 'verified')
    .map((node: GraphNode) => `nodes/${node.id}.js`);

  const atlasFiles: string[] = [];
  for (let i = 0; i < atlasCount; i++) {
    atlasFiles.push(`atlases/atlas-${i}.png`);
  }

  const totalExpectedFiles =
    requiredFiles.length + nodeFiles.length + atlasFiles.length;

  const estimatedSizeBytes =
    BASE_SIZE_BYTES +
    PER_NODE_SIZE_BYTES * nodeFiles.length +
    PER_ATLAS_SIZE_BYTES * atlasCount;

  return {
    requiredFiles,
    nodeFiles,
    atlasFiles,
    totalExpectedFiles,
    estimatedSizeBytes,
  };
}

// ---------------------------------------------------------------------------
// Graph JSON validation
// ---------------------------------------------------------------------------

/**
 * Validates that a parsed JSON value has the shape required by PrismGraph.
 *
 * Checks for the presence and correct types of top-level fields:
 * id, planId, projectId, version, nodes[], edges[], hubs[], metadata{}.
 *
 * This is a structural check only -- it does not validate the full depth
 * of every nested object. Deep validation is the responsibility of the
 * graph construction phase (Phase 10).
 */
export function validateGraphJson(graphJson: unknown): boolean {
  if (graphJson === null || typeof graphJson !== 'object') {
    return false;
  }

  const obj = graphJson as Record<string, unknown>;

  // Required string fields
  if (typeof obj['id'] !== 'string') return false;
  if (typeof obj['planId'] !== 'string') return false;
  if (typeof obj['projectId'] !== 'string') return false;

  // Version must be a number
  if (typeof obj['version'] !== 'number') return false;

  // Arrays
  if (!Array.isArray(obj['nodes'])) return false;
  if (!Array.isArray(obj['edges'])) return false;
  if (!Array.isArray(obj['hubs'])) return false;

  // Metadata must be an object
  if (obj['metadata'] === null || typeof obj['metadata'] !== 'object') {
    return false;
  }
  if (Array.isArray(obj['metadata'])) return false;

  return true;
}
