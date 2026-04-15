/**
 * planning/index.ts — Planning pipeline exports for Prism engine.
 *
 * Phase 5: Intent parsing, needs mapping, plan generation, approval flow.
 */

// Domain knowledge graph (Phase 1)
export { APP_TYPE_DEPENDENCY_TREES, getAppTypeDependencyTree } from './domain-knowledge.js';
export type { AppTypeDependencyTree } from './domain-knowledge.js';

// Needs mapper (Phase 5)
export { mapInferredNeeds } from './needs-mapper.js';

// Intent parser (Phase 5)
export { parseAppIntent, VALID_APP_TYPES, VALID_PLATFORMS } from './intent-parser.js';
export type { ParseResult, ParseSuccess, ParseFailure } from './intent-parser.js';

// Plan validator (Phase 5)
export {
  validatePlan,
  validateBackendContract,
} from './plan-validator.js';
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './plan-validator.js';
