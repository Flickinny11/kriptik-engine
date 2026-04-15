/**
 * intent-parser.ts — Validates raw data against the AppIntent schema.
 *
 * This is the contract boundary between AI model output (from Modal Python
 * workers) and the TypeScript planning pipeline. It does NOT call any AI
 * models — it only validates the shape of data returned from them.
 *
 * Every field is strictly checked. Unknown or malformed data is rejected
 * with descriptive error messages so the caller can surface them to the
 * build event stream.
 */

import type {
  AppIntent,
  AppType,
  FeatureSpec,
  VisualStyleSpec,
  IntegrationSpec,
} from '../types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ParseSuccess {
  valid: true;
  intent: AppIntent;
}

export interface ParseFailure {
  valid: false;
  errors: string[];
}

export type ParseResult = ParseSuccess | ParseFailure;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_APP_TYPES: readonly AppType[] = [
  'landing-page',
  'saas-dashboard',
  'e-commerce',
  'portfolio',
  'blog',
  'social-platform',
  'marketplace',
  'crm',
  'project-management',
  'analytics-dashboard',
  'ai-tool',
  'video-platform',
  'messaging-app',
  'booking-system',
  'documentation',
  'admin-panel',
  'custom',
] as const;

export const VALID_PLATFORMS: readonly string[] = [
  'web',
  'mobile-web',
  'desktop',
] as const;

const VALID_CONTENT_STRATEGIES = ['static', 'dynamic', 'real-time'] as const;

const VALID_COMMERCIAL_CLASSIFICATIONS = ['personal', 'commercial', 'enterprise'] as const;

const VALID_FEATURE_PRIORITIES = ['must-have', 'should-have', 'nice-to-have'] as const;

const VALID_FEATURE_CATEGORIES = ['frontend', 'backend', 'integration', 'infrastructure'] as const;

const VALID_FEATURE_INFERRED_FROM = [
  'user-input',
  'competitive-analysis',
  'domain-knowledge',
  'security',
] as const;

const VALID_COLOR_SCHEMES = ['light', 'dark', 'auto'] as const;

const VALID_DESIGN_LANGUAGES = [
  'minimal',
  'glassmorphism',
  'neobrutalism',
  'material',
  'corporate',
  'playful',
  'editorial',
  'custom',
] as const;

const VALID_CREDENTIAL_STATUSES = ['connected', 'pending', 'missing'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Sub-validators
// ---------------------------------------------------------------------------

function validateFeatureSpec(
  raw: unknown,
  index: number,
  errors: string[],
): raw is FeatureSpec {
  const prefix = `features[${index}]`;

  if (!isRecord(raw)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  let valid = true;

  if (!isNonEmptyString(raw.name)) {
    errors.push(`${prefix}.name: must be a non-empty string`);
    valid = false;
  }
  if (!isNonEmptyString(raw.description)) {
    errors.push(`${prefix}.description: must be a non-empty string`);
    valid = false;
  }
  if (!isOneOf(raw.priority, VALID_FEATURE_PRIORITIES)) {
    errors.push(
      `${prefix}.priority: must be one of ${VALID_FEATURE_PRIORITIES.join(', ')}`,
    );
    valid = false;
  }
  if (!isOneOf(raw.category, VALID_FEATURE_CATEGORIES)) {
    errors.push(
      `${prefix}.category: must be one of ${VALID_FEATURE_CATEGORIES.join(', ')}`,
    );
    valid = false;
  }
  if (!isOneOf(raw.inferredFrom, VALID_FEATURE_INFERRED_FROM)) {
    errors.push(
      `${prefix}.inferredFrom: must be one of ${VALID_FEATURE_INFERRED_FROM.join(', ')}`,
    );
    valid = false;
  }
  if (!Array.isArray(raw.acceptanceCriteria)) {
    errors.push(`${prefix}.acceptanceCriteria: must be an array`);
    valid = false;
  } else {
    for (let i = 0; i < raw.acceptanceCriteria.length; i++) {
      if (!isNonEmptyString(raw.acceptanceCriteria[i])) {
        errors.push(
          `${prefix}.acceptanceCriteria[${i}]: must be a non-empty string`,
        );
        valid = false;
      }
    }
  }

  return valid;
}

function validateVisualStyle(
  raw: unknown,
  errors: string[],
): raw is VisualStyleSpec {
  const prefix = 'visualStyle';

  if (!isRecord(raw)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  let valid = true;

  if (!isOneOf(raw.colorScheme, VALID_COLOR_SCHEMES)) {
    errors.push(
      `${prefix}.colorScheme: must be one of ${VALID_COLOR_SCHEMES.join(', ')}`,
    );
    valid = false;
  }
  if (!isNonEmptyString(raw.primaryColor)) {
    errors.push(`${prefix}.primaryColor: must be a non-empty string`);
    valid = false;
  }
  if (!isNonEmptyString(raw.accentColor)) {
    errors.push(`${prefix}.accentColor: must be a non-empty string`);
    valid = false;
  }

  // Typography sub-object
  if (!isRecord(raw.typography)) {
    errors.push(`${prefix}.typography: must be an object`);
    valid = false;
  } else {
    if (!isNonEmptyString(raw.typography.headingFont)) {
      errors.push(`${prefix}.typography.headingFont: must be a non-empty string`);
      valid = false;
    }
    if (!isNonEmptyString(raw.typography.bodyFont)) {
      errors.push(`${prefix}.typography.bodyFont: must be a non-empty string`);
      valid = false;
    }
    if (!isNonEmptyString(raw.typography.monoFont)) {
      errors.push(`${prefix}.typography.monoFont: must be a non-empty string`);
      valid = false;
    }
  }

  if (!isOneOf(raw.designLanguage, VALID_DESIGN_LANGUAGES)) {
    errors.push(
      `${prefix}.designLanguage: must be one of ${VALID_DESIGN_LANGUAGES.join(', ')}`,
    );
    valid = false;
  }

  // referenceUrls — optional but must be an array of strings if present
  if (raw.referenceUrls !== undefined && raw.referenceUrls !== null) {
    if (!Array.isArray(raw.referenceUrls)) {
      errors.push(`${prefix}.referenceUrls: must be an array of strings`);
      valid = false;
    } else {
      for (let i = 0; i < raw.referenceUrls.length; i++) {
        if (typeof raw.referenceUrls[i] !== 'string') {
          errors.push(`${prefix}.referenceUrls[${i}]: must be a string`);
          valid = false;
        }
      }
    }
  }

  // extractedTokens — nullable, validated loosely (it's a complex optional)
  if (
    raw.extractedTokens !== undefined &&
    raw.extractedTokens !== null &&
    !isRecord(raw.extractedTokens)
  ) {
    errors.push(`${prefix}.extractedTokens: must be an object or null`);
    valid = false;
  }

  return valid;
}

function validateIntegrationSpec(
  raw: unknown,
  index: number,
  errors: string[],
): raw is IntegrationSpec {
  const prefix = `integrations[${index}]`;

  if (!isRecord(raw)) {
    errors.push(`${prefix}: must be an object`);
    return false;
  }

  let valid = true;

  if (!isNonEmptyString(raw.serviceId)) {
    errors.push(`${prefix}.serviceId: must be a non-empty string`);
    valid = false;
  }
  if (!isNonEmptyString(raw.purpose)) {
    errors.push(`${prefix}.purpose: must be a non-empty string`);
    valid = false;
  }
  if (!Array.isArray(raw.requiredScopes)) {
    errors.push(`${prefix}.requiredScopes: must be an array`);
    valid = false;
  } else {
    for (let i = 0; i < raw.requiredScopes.length; i++) {
      if (typeof raw.requiredScopes[i] !== 'string') {
        errors.push(`${prefix}.requiredScopes[${i}]: must be a string`);
        valid = false;
      }
    }
  }
  if (!isOneOf(raw.credentialStatus, VALID_CREDENTIAL_STATUSES)) {
    errors.push(
      `${prefix}.credentialStatus: must be one of ${VALID_CREDENTIAL_STATUSES.join(', ')}`,
    );
    valid = false;
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Validate raw data against the AppIntent schema.
 *
 * Returns a discriminated union: `{ valid: true, intent }` on success,
 * `{ valid: false, errors }` on failure. Collects ALL validation errors
 * rather than failing on the first one, so the caller gets a complete
 * picture of what needs fixing.
 */
export function parseAppIntent(raw: unknown): ParseResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { valid: false, errors: ['AppIntent must be a non-null object'] };
  }

  // description
  if (!isNonEmptyString(raw.description)) {
    errors.push('description: must be a non-empty string');
  }

  // appType
  if (!isOneOf(raw.appType, VALID_APP_TYPES)) {
    errors.push(
      `appType: must be one of ${VALID_APP_TYPES.join(', ')}`,
    );
  }

  // platform
  if (!isOneOf(raw.platform, VALID_PLATFORMS)) {
    errors.push(
      `platform: must be one of ${VALID_PLATFORMS.join(', ')}`,
    );
  }

  // features
  if (!Array.isArray(raw.features)) {
    errors.push('features: must be an array');
  } else {
    for (let i = 0; i < raw.features.length; i++) {
      validateFeatureSpec(raw.features[i], i, errors);
    }
  }

  // visualStyle
  validateVisualStyle(raw.visualStyle, errors);

  // integrations
  if (!Array.isArray(raw.integrations)) {
    errors.push('integrations: must be an array');
  } else {
    for (let i = 0; i < raw.integrations.length; i++) {
      validateIntegrationSpec(raw.integrations[i], i, errors);
    }
  }

  // contentStrategy
  if (!isOneOf(raw.contentStrategy, VALID_CONTENT_STRATEGIES)) {
    errors.push(
      `contentStrategy: must be one of ${VALID_CONTENT_STRATEGIES.join(', ')}`,
    );
  }

  // commercialClassification
  if (!isOneOf(raw.commercialClassification, VALID_COMMERCIAL_CLASSIFICATIONS)) {
    errors.push(
      `commercialClassification: must be one of ${VALID_COMMERCIAL_CLASSIFICATIONS.join(', ')}`,
    );
  }

  // confidenceScore
  if (typeof raw.confidenceScore !== 'number') {
    errors.push('confidenceScore: must be a number');
  } else if (raw.confidenceScore < 0 || raw.confidenceScore > 1) {
    errors.push('confidenceScore: must be between 0 and 1');
  } else if (!Number.isFinite(raw.confidenceScore)) {
    errors.push('confidenceScore: must be a finite number');
  }

  // ambiguities
  if (!Array.isArray(raw.ambiguities)) {
    errors.push('ambiguities: must be an array');
  } else {
    for (let i = 0; i < raw.ambiguities.length; i++) {
      if (typeof raw.ambiguities[i] !== 'string') {
        errors.push(`ambiguities[${i}]: must be a string`);
      }
    }
  }

  // reasoning
  if (!isNonEmptyString(raw.reasoning)) {
    errors.push('reasoning: must be a non-empty string');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // All checks passed — safe to cast. The sub-validators have confirmed
  // every field matches the expected shape.
  return { valid: true, intent: raw as unknown as AppIntent };
}
