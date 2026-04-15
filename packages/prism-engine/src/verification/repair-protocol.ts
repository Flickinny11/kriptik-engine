/**
 * repair-protocol.ts — Contamination-aware repair protocol (INVARIANT 3).
 *
 * This is the most security-critical module in the verification pipeline.
 * When code generation fails SWE-RM verification, the failed code must be
 * DELETED before any repair attempt. The repair model must NEVER see the
 * broken code, error messages, stack traces, or AST fragments.
 *
 * Validated by:
 * - NeurIPS 2023: >50% pass rate drop when models see broken code
 * - IEEE TSE 2025: 44.44% of bugs identical to pre-fix version
 *
 * Spec reference: Section 12 — Contamination-Aware Repair Protocol
 */

import type { GraphNode, NodeVisualSpec, NodeBehaviorSpec } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Clean repair specification — contains ONLY spec-level information. */
export interface RepairSpec {
  nodeId: string;
  caption: string;
  visualSpec: NodeVisualSpec;
  behaviorSpec: NodeBehaviorSpec;
  attempt: number;
  /** Natural language error description. Present only on attempt 2. */
  errorDescription?: string;
}

/** Result of validating repair inputs for contamination. */
export interface RepairInputValidation {
  valid: boolean;
  warnings: string[];
  escalate: boolean;
}

// ---------------------------------------------------------------------------
// Contamination detection patterns
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate contamination — raw error output, stack traces,
 * or code snippets that should NEVER appear in a repair error description.
 */
const CONTAMINATION_PATTERNS: readonly RegExp[] = [
  // Stack trace indicators
  /at line \d+/i,
  /at .+:\d+:\d+/,                      // "at module.js:12:5"
  /^\s+at\s+/m,                          // "  at Object.<anonymous>"

  // Error type prefixes
  /\bError:/,
  /\bTypeError:/,
  /\bSyntaxError:/,
  /\bReferenceError:/,
  /\bRangeError:/,
  /\bURIError:/,
  /\bEvalError:/,

  // Stack trace keywords
  /stack\s*trace/i,
  /\btraceback\b/i,

  // Runtime error phrases
  /undefined is not/i,
  /cannot read propert/i,
  /is not a function/i,
  /is not defined/i,
  /unexpected token/i,
  /unexpected end of/i,

  // Code-like patterns: semicolons, curly braces, arrows in sequence
  /[{;]\s*\n\s*[{;]/,                    // consecutive brace/semicolon lines
  /=>\s*\{/,                             // arrow function bodies
  /function\s+\w+\s*\(/,                 // function declarations

  // Line number references
  /\bline\s+\d+\b/i,
  /\bcol(?:umn)?\s+\d+\b/i,

  // Import/require statements (code leaking into description)
  /\bimport\s+.+from\s+['"]/,
  /\brequire\s*\(\s*['"]/,
];

// ---------------------------------------------------------------------------
// Contamination check
// ---------------------------------------------------------------------------

/**
 * Checks if a string contains contamination patterns — stack traces,
 * error messages, code snippets, or line number references.
 *
 * Used to validate that error descriptions provided for attempt 2 are
 * natural language summaries, NOT raw error output. Passing raw error
 * output to the repair model causes >50% pass rate drop (NeurIPS 2023).
 */
export function isContaminated(input: string): boolean {
  for (const pattern of CONTAMINATION_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * Validates that repair inputs are clean and ready for the repair protocol.
 *
 * Checks:
 * - node.code should be null (code must be deleted before repair)
 * - attempt < 3 (attempts 3+ must be escalated to frontier model)
 * - caption is present and non-empty
 */
export function validateRepairInput(
  node: GraphNode,
  attempt: number,
): RepairInputValidation {
  const warnings: string[] = [];
  let valid = true;
  const escalate = attempt >= 3;

  // Code must be deleted before calling repair
  if (node.code != null) {
    warnings.push(
      'CONTAMINATION RISK: node.code is not null. ' +
      'Code must be deleted before calling repair to prevent contamination.',
    );
    valid = false;
  }

  // Caption must exist
  if (!node.caption || node.caption.trim().length === 0) {
    warnings.push('Node caption is empty. Cannot generate repair spec without a caption.');
    valid = false;
  }

  // Escalation required at attempt 3+
  if (escalate) {
    warnings.push(
      `Attempt ${attempt} requires escalation to frontier model (Claude Opus 4.6). ` +
      'Do not use the standard repair protocol.',
    );
  }

  return { valid, warnings, escalate };
}

// ---------------------------------------------------------------------------
// Repair spec construction
// ---------------------------------------------------------------------------

/**
 * Builds a clean repair specification for code regeneration.
 *
 * CRITICAL: The caller MUST delete node.code before calling this function.
 * This function validates that invariant but the deletion is the caller's
 * responsibility.
 *
 * Attempt routing:
 * - attempt 1: caption + visualSpec + behaviorSpec ONLY
 * - attempt 2: adds natural language errorDescription (validated for contamination)
 * - attempt >= 3: throws — must be escalated to frontier model
 *
 * @throws Error if attempt >= 3 (must escalate)
 * @throws Error if attempt === 2 and errorDescription is missing
 * @throws Error if errorDescription contains contamination patterns
 */
export function buildRepairSpec(
  node: GraphNode,
  attempt: number,
  errorDescription?: string,
): RepairSpec {
  // Attempt 3+ must be escalated — not handled by this protocol
  if (attempt >= 3) {
    throw new Error(
      `Attempt ${attempt} exceeds repair protocol limit. ` +
      'Escalate to frontier model (Claude Opus 4.6) with full context.',
    );
  }

  // Attempt 2 requires a natural language error description
  if (attempt === 2 && !errorDescription) {
    throw new Error(
      'Attempt 2 requires an errorDescription parameter. ' +
      'Provide a natural language summary of what went wrong — ' +
      'NOT the raw error message or stack trace.',
    );
  }

  // Validate errorDescription is not contaminated
  if (errorDescription && isContaminated(errorDescription)) {
    throw new Error(
      'CONTAMINATION DETECTED in errorDescription. ' +
      'The error description contains stack traces, error messages, or code snippets. ' +
      'Provide a natural language summary instead (e.g., ' +
      '"the button click handler did not emit the navigation event").',
    );
  }

  // Build the clean spec — only spec-level information, never code
  const spec: RepairSpec = {
    nodeId: node.id,
    caption: node.caption,
    visualSpec: node.visualSpec,
    behaviorSpec: node.behaviorSpec,
    attempt,
  };

  // Only include errorDescription on attempt 2
  if (attempt === 2 && errorDescription) {
    spec.errorDescription = errorDescription;
  }

  return spec;
}
