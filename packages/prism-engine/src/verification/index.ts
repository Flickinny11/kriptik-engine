/**
 * verification/index.ts — Verification and repair pipeline exports.
 *
 * SWE-RM score threshold routing and contamination-aware repair protocol.
 * The actual ML scoring runs on Modal (Python). These modules define the
 * threshold routing and repair spec construction on the TypeScript side.
 */

export {
  SCORE_PASS,
  SCORE_BORDERLINE,
  routeVerificationScore,
  aggregateVerificationResults,
  shouldEscalate,
} from './scoring.js';
export type {
  VerificationAction,
  NodeVerificationResult,
  VerificationSummary,
} from './scoring.js';

export {
  buildRepairSpec,
  validateRepairInput,
  isContaminated,
} from './repair-protocol.js';
export type {
  RepairSpec,
  RepairInputValidation,
} from './repair-protocol.js';
