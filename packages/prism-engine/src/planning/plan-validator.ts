/**
 * plan-validator.ts — Plan structure and caption validation for Prism planning pipeline.
 *
 * Validates that a generated plan meets structural requirements and that
 * every element caption is SELF-CONTAINED (Invariant 2).
 *
 * "Could an engineer who has never seen the rest of the app implement
 * this node correctly from the caption alone?"
 */

import type {
  PrismGraphPlan,
  HubPlan,
  ElementPlan,
  SharedComponentPlan,
  BackendContract,
} from '../types.js';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  path: string;
  message: string;
  severity: 'warning';
}

/**
 * Minimum caption length considered viable for self-contained implementation.
 * A caption under this length almost certainly lacks sufficient detail.
 */
const MIN_CAPTION_LENGTH = 50;

/**
 * Words that indicate a caption references other elements (Invariant 2 violation).
 */
const CROSS_REFERENCE_PATTERNS = [
  /\blike the one in\b/i,
  /\bsee .+ (section|hub|page|component)\b/i,
  /\bsame as\b/i,
  /\bmatching the\b/i,
  /\brefer to\b/i,
  /\bas described in\b/i,
  /\bsimilar to the .+ (above|below|in)\b/i,
];

/**
 * Validate a complete PrismGraphPlan.
 */
export function validatePlan(plan: PrismGraphPlan): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Must have at least one hub
  if (!plan.hubs || plan.hubs.length === 0) {
    errors.push({
      path: 'graph.hubs',
      message: 'Plan must have at least one hub (page)',
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  // Validate each hub
  const hubIds = new Set<string>();
  for (const hub of plan.hubs) {
    if (hubIds.has(hub.id)) {
      errors.push({
        path: `hubs[${hub.id}]`,
        message: `Duplicate hub ID: ${hub.id}`,
        severity: 'error',
      });
    }
    hubIds.add(hub.id);
    validateHub(hub, errors, warnings);
  }

  // Validate shared components
  if (plan.sharedComponents) {
    for (const shared of plan.sharedComponents) {
      validateSharedComponent(shared, hubIds, errors, warnings);
    }
  }

  // Validate navigation graph
  if (plan.navigationGraph) {
    for (const edge of plan.navigationGraph) {
      if (!hubIds.has(edge.sourceHubId)) {
        errors.push({
          path: `navigationGraph[${edge.sourceHubId}→${edge.targetHubId}]`,
          message: `Navigation source hub ${edge.sourceHubId} not found`,
          severity: 'error',
        });
      }
      if (!hubIds.has(edge.targetHubId)) {
        errors.push({
          path: `navigationGraph[${edge.sourceHubId}→${edge.targetHubId}]`,
          message: `Navigation target hub ${edge.targetHubId} not found`,
          severity: 'error',
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single hub.
 */
function validateHub(
  hub: HubPlan,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (!hub.id) {
    errors.push({ path: 'hub', message: 'Hub missing ID', severity: 'error' });
  }
  if (!hub.name) {
    errors.push({ path: `hubs[${hub.id}]`, message: 'Hub missing name', severity: 'error' });
  }
  if (!hub.route) {
    errors.push({ path: `hubs[${hub.id}]`, message: 'Hub missing route', severity: 'error' });
  }
  if (!hub.elements || hub.elements.length === 0) {
    warnings.push({
      path: `hubs[${hub.id}]`,
      message: 'Hub has no elements',
      severity: 'warning',
    });
  }

  // Validate each element
  const elementIds = new Set<string>();
  for (const elem of hub.elements || []) {
    if (elementIds.has(elem.id)) {
      errors.push({
        path: `hubs[${hub.id}].elements[${elem.id}]`,
        message: `Duplicate element ID: ${elem.id}`,
        severity: 'error',
      });
    }
    elementIds.add(elem.id);
    validateElementCaption(elem, `hubs[${hub.id}].elements[${elem.id}]`, errors, warnings);
  }
}

/**
 * Validate an element's caption for self-containment (Invariant 2).
 */
function validateElementCaption(
  elem: ElementPlan,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (!elem.caption) {
    errors.push({ path, message: 'Element missing caption', severity: 'error' });
    return;
  }

  if (elem.caption.length < MIN_CAPTION_LENGTH) {
    warnings.push({
      path,
      message: `Caption too short (${elem.caption.length} chars, min ${MIN_CAPTION_LENGTH}). ` +
        'Self-contained captions need dimensions, colors, typography, and behavior.',
      severity: 'warning',
    });
  }

  // Check for cross-references to other elements
  for (const pattern of CROSS_REFERENCE_PATTERNS) {
    if (pattern.test(elem.caption)) {
      errors.push({
        path,
        message: `Caption references other elements: "${elem.caption.substring(0, 80)}..." ` +
          'Captions must be self-contained (Invariant 2).',
        severity: 'error',
      });
      break;
    }
  }
}

/**
 * Validate a shared component.
 */
function validateSharedComponent(
  shared: SharedComponentPlan,
  hubIds: Set<string>,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (!shared.id) {
    errors.push({ path: 'sharedComponents', message: 'Shared component missing ID', severity: 'error' });
  }
  if (!shared.caption) {
    errors.push({
      path: `sharedComponents[${shared.id}]`,
      message: 'Shared component missing caption',
      severity: 'error',
    });
  }
  if (!shared.hubIds || shared.hubIds.length === 0) {
    warnings.push({
      path: `sharedComponents[${shared.id}]`,
      message: 'Shared component not assigned to any hubs',
      severity: 'warning',
    });
  }

  // Verify hub references
  for (const hubId of shared.hubIds || []) {
    if (!hubIds.has(hubId)) {
      errors.push({
        path: `sharedComponents[${shared.id}]`,
        message: `References non-existent hub: ${hubId}`,
        severity: 'error',
      });
    }
  }

  // Caption self-containment check
  if (shared.caption && shared.caption.length < MIN_CAPTION_LENGTH) {
    warnings.push({
      path: `sharedComponents[${shared.id}]`,
      message: `Shared component caption too short (${shared.caption.length} chars)`,
      severity: 'warning',
    });
  }
}

/**
 * Validate that a backend contract exists and has required structure.
 * Invariant 4: Contract must be generated DURING planning, BEFORE code gen.
 */
export function validateBackendContract(contract: BackendContract): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!contract) {
    errors.push({
      path: 'backendContract',
      message: 'Backend contract is required (Invariant 4: Contract-First)',
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  if (!contract.tRPCRouter) {
    warnings.push({
      path: 'backendContract.tRPCRouter',
      message: 'No tRPC router definition in contract',
      severity: 'warning',
    });
  }

  if (!contract.zodSchemas) {
    warnings.push({
      path: 'backendContract.zodSchemas',
      message: 'No Zod schemas in contract',
      severity: 'warning',
    });
  }

  if (!contract.apiEndpoints || contract.apiEndpoints.length === 0) {
    warnings.push({
      path: 'backendContract.apiEndpoints',
      message: 'No API endpoints defined in contract',
      severity: 'warning',
    });
  }

  if (!contract.authStrategy) {
    warnings.push({
      path: 'backendContract.authStrategy',
      message: 'No auth strategy defined in contract',
      severity: 'warning',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
