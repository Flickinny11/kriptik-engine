/**
 * codegen-dispatch.ts — Manages parallel code generation dispatch specs.
 *
 * Mirrors the dispatch and validation logic from modal/prism/codegen_worker.py.
 * The actual SGLang inference runs in Python on GPU; this module handles
 * batch construction and structural validation on the server side.
 *
 * INVARIANT 9: Every DispatchSpec uses the identical CODEGEN_SYSTEM_PROMPT.
 * INVARIANT 3: Validation is structural only -- contamination-aware repair
 * is handled by the orchestrator, never here.
 *
 * Spec reference: docs/DIFFUSION-ENGINE-SPEC.md Section 11
 */

import type { PrismGraph } from '../types.js';
import {
  CODEGEN_SYSTEM_PROMPT,
  buildNodeSpec,
  buildUserMessage,
} from './prompt-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A dispatch specification for a single node's code generation task.
 * Sent to the Modal codegen worker pool for parallel execution.
 */
export interface DispatchSpec {
  nodeId: string;
  systemPrompt: string;
  userMessage: string;
}

/**
 * Result of structural code validation. This is a fast pre-check before
 * the code is sent to the SWE-RM verification model for full semantic
 * validation.
 */
export interface CodeValidation {
  valid: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Validation patterns — mirrored from codegen_worker.py
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate DOM manipulation (forbidden in PixiJS modules).
 * These match the _DOM_PATTERNS list in the Python worker.
 */
const DOM_PATTERNS: RegExp[] = [
  /\bdocument\s*\.\s*createElement\b/,
  /\bdocument\s*\.\s*getElementById\b/,
  /\bdocument\s*\.\s*querySelector\b/,
  /\binnerHTML\b/,
  /\bouterHTML\b/,
  /\btextContent\b/,
  /\bappendChild\b/,
  /\bremoveChild\b/,
  /\bdocument\s*\.\s*body\b/,
  /\bdocument\s*\.\s*head\b/,
  /\bwindow\s*\.\s*document\b/,
];

/**
 * Pattern for async/await in the render path.
 * Matches the _ASYNC_PATTERN in the Python worker.
 */
const ASYNC_PATTERN = /\basync\s+function\b|\bawait\s+/;

/**
 * Pattern for import statements (modules should be self-contained).
 * Matches the _IMPORT_PATTERN in the Python worker.
 */
const IMPORT_PATTERN = /^\s*import\s+/m;

/**
 * Pattern to verify createNode function export exists.
 * Matches the _CREATE_NODE_PATTERN in the Python worker.
 */
const CREATE_NODE_PATTERN =
  /(?:export\s+(?:default\s+)?function\s+createNode|(?:module\.)?exports\s*(?:\.\s*createNode)?\s*=|export\s+\{[^}]*\bcreateNode\b[^}]*\})/;

/**
 * Pattern to verify Container usage (PixiJS base class).
 * Matches the _CONTAINER_PATTERN in the Python worker.
 */
const CONTAINER_PATTERN = /\bContainer\b/;

// ---------------------------------------------------------------------------
// Dispatch batch construction
// ---------------------------------------------------------------------------

/**
 * Create a DispatchSpec for every node in the graph that needs code generation.
 *
 * Only nodes with status 'pending' or 'caption_verified' are included.
 * Each DispatchSpec contains the identical system prompt (Invariant 9) and
 * a per-node user message built from the node's spec.
 */
export function buildDispatchBatch(graph: PrismGraph): DispatchSpec[] {
  const specs: DispatchSpec[] = [];

  for (const node of graph.nodes) {
    if (node.status !== 'pending' && node.status !== 'caption_verified') {
      continue;
    }

    const nodeSpec = buildNodeSpec(node, graph);
    const userMessage = buildUserMessage(nodeSpec);

    specs.push({
      nodeId: node.id,
      systemPrompt: CODEGEN_SYSTEM_PROMPT,
      userMessage,
    });
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Code validation
// ---------------------------------------------------------------------------

/**
 * Basic structural validation of generated JavaScript code.
 *
 * Checks:
 * 1. Non-empty code output
 * 2. Contains 'createNode' function export
 * 3. Contains 'Container' usage (PixiJS base class)
 * 4. No DOM manipulation (document.createElement, innerHTML, etc.)
 * 5. No async/await in render path
 * 6. No import statements (self-contained module)
 *
 * This is a fast pre-check before the code is sent to the SWE-RM
 * verification model for full semantic validation. It catches obvious
 * structural issues without running any code.
 *
 * Patterns are mirrored from codegen_worker.py to ensure consistent
 * validation between the TypeScript dispatch layer and the Python worker.
 */
export function validateGeneratedCode(code: string): CodeValidation {
  const issues: string[] = [];

  // Check 1: Non-empty
  if (!code || !code.trim()) {
    return { valid: false, issues: ['Empty code output'] };
  }

  // Check 2: createNode function export
  if (!CREATE_NODE_PATTERN.test(code)) {
    issues.push(
      'Missing createNode function export. ' +
        'Expected: export function createNode(config: NodeConfig): Container',
    );
  }

  // Check 3: Container usage
  if (!CONTAINER_PATTERN.test(code)) {
    issues.push(
      'No Container usage found. ' +
        'PixiJS v8 Container is required as the return type.',
    );
  }

  // Check 4: No DOM manipulation
  for (const pattern of DOM_PATTERNS) {
    const match = pattern.exec(code);
    if (match) {
      issues.push(
        `DOM manipulation detected: '${match[0]}'. ` +
          'Use PixiJS v8 API only -- no direct DOM access.',
      );
      break; // Report only the first DOM violation
    }
  }

  // Check 5: No async/await in render path
  const asyncMatch = ASYNC_PATTERN.exec(code);
  if (asyncMatch) {
    issues.push(
      `Async/await detected: '${asyncMatch[0].trim()}'. ` +
        'Code must be synchronous in the render path.',
    );
  }

  // Check 6: No import statements (self-contained module)
  const importMatch = IMPORT_PATTERN.exec(code);
  if (importMatch) {
    issues.push(
      'Import statement detected. ' +
        'Modules must be self-contained -- dependencies are injected via config.',
    );
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Response extraction
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences from a model response if present.
 *
 * The system prompt instructs models to output only code with no markdown
 * fences, but models sometimes include them anyway. This function handles
 * both cases gracefully.
 *
 * Mirrors _extract_code_from_response() in codegen_worker.py, but only
 * the fence-stripping portion -- the Python function also handles multiple
 * SGLang response formats, which is not needed on the TypeScript side.
 */
export function extractCodeFromResponse(response: string): string {
  let text = response.trim();

  if (text.startsWith('```')) {
    // Remove opening fence (with optional language tag like ```javascript)
    const firstNewline = text.indexOf('\n');
    if (firstNewline !== -1) {
      text = text.slice(firstNewline + 1);
    }
    // Remove closing fence
    if (text.trimEnd().endsWith('```')) {
      text = text.trimEnd().slice(0, -3).trimEnd();
    }
  }

  return text.trim();
}
