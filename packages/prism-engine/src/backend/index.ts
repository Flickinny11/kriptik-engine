/**
 * backend/index.ts — Backend generation pipeline exports.
 *
 * Phase 7: Contract-first code generation, convergence gate, deployment.
 */

// Contract generator (Invariant 4: Contract-First)
export {
  generateTRPCRouterTypes,
  generateZodSchemas,
  generateContractFiles,
  pathToProcedureName,
} from './contract-generator.js';

// Convergence gate (tsc + AJV + route resolution)
export {
  runConvergenceGate,
} from './convergence-gate.js';
export type {
  ConvergenceIssue,
  ConvergenceResult,
  BackendEndpoint,
  BackendResult,
} from './convergence-gate.js';

// Deployment
export {
  buildDeploymentRequest,
  validateDeploymentTarget,
  buildDeploymentManifest,
  getExpectedDeployTime,
} from './deployment.js';
export type {
  DeploymentConfig,
  DeploymentResult,
  DeploymentManifest,
} from './deployment.js';
