/**
 * needs-mapper.ts — Inferred needs mapping for the Prism planning pipeline.
 *
 * Maps an AppIntent to a list of InferredNeeds by:
 * 1. Looking up first-order and second-order deps from the domain knowledge graph
 * 2. Adding security requirements for commercial/enterprise apps
 * 3. Adding UX best-practice needs
 * 4. Deduplicating against user-specified features
 *
 * Uses the TypeScript domain-knowledge.ts directly (no API calls needed).
 */

import type {
  AppIntent,
  AppType,
  InferredNeed,
  FeatureSpec,
} from '../types.js';
import { getAppTypeDependencyTree, type AppTypeDependencyTree } from './domain-knowledge.js';

/**
 * Security requirements inferred for commercial/enterprise apps.
 * Matches spec Section 8 requirements.
 */
const SECURITY_REQUIREMENTS: { name: string; description: string }[] = [
  { name: 'Input validation', description: 'Validate and sanitize all user input' },
  { name: 'CSRF protection', description: 'Cross-site request forgery prevention tokens' },
  { name: 'XSS prevention', description: 'Output encoding and Content Security Policy' },
  { name: 'Rate limiting', description: 'Request rate limiting on API endpoints' },
];

/**
 * UX best-practice needs added to all app types.
 */
const UX_BEST_PRACTICES: { name: string; description: string }[] = [
  { name: 'Loading states', description: 'Skeleton screens and loading indicators for async operations' },
  { name: 'Error handling UI', description: 'User-friendly error messages and recovery flows' },
  { name: 'Responsive layout', description: 'Mobile-friendly responsive design' },
];

/**
 * Map an AppIntent to inferred needs using the domain knowledge graph.
 *
 * Steps:
 * 1. Look up the app type's dependency tree
 * 2. Expand first-order and second-order dependencies into feature specs
 * 3. Add security requirements for commercial/enterprise
 * 4. Add UX best-practice needs
 * 5. Deduplicate against user-specified features
 */
export function mapInferredNeeds(intent: AppIntent): InferredNeed[] {
  const userFeatureNames = new Set(
    intent.features.map((f) => f.name.toLowerCase()),
  );

  const needs: InferredNeed[] = [];

  // Domain knowledge expansion
  const depTree = getAppTypeDependencyTree(intent.appType);
  if (depTree) {
    needs.push(...expandDependencyTree(depTree, userFeatureNames));
  }

  // Security requirements for commercial/enterprise apps
  if (intent.commercialClassification === 'commercial' || intent.commercialClassification === 'enterprise') {
    needs.push(...inferSecurityNeeds(userFeatureNames));
  }

  // UX best practices for all apps
  needs.push(...inferUxNeeds(userFeatureNames));

  return needs;
}

/**
 * Expand a dependency tree into InferredNeeds.
 * First-order deps become must-have/should-have features.
 * Second-order deps are triggered by their parent first-order deps.
 */
function expandDependencyTree(
  tree: AppTypeDependencyTree,
  userFeatures: Set<string>,
): InferredNeed[] {
  const needs: InferredNeed[] = [];

  // First-order dependencies
  for (const dep of tree.firstOrderDeps) {
    if (userFeatures.has(dep.name.toLowerCase())) continue;

    const features: FeatureSpec[] = [{
      name: dep.name,
      description: `Standard ${tree.appType} requirement: ${dep.name}`,
      priority: dep.required ? 'must-have' : 'should-have',
      category: 'frontend',
      inferredFrom: 'domain-knowledge',
      acceptanceCriteria: [
        `${dep.name} is functional and accessible`,
        `UI patterns used: ${dep.uiPatterns.join(', ')}`,
      ],
    }];

    needs.push({
      name: dep.name,
      description: `Standard ${tree.appType} requirement: ${dep.name}`,
      source: 'domain-knowledge',
      priority: dep.required ? 'must-have' : 'should-have',
      features,
    });
  }

  // Second-order dependencies (triggered by first-order deps)
  for (const dep of tree.secondOrderDeps) {
    if (userFeatures.has(dep.name.toLowerCase())) continue;

    // Only include if the triggering first-order dep is present
    const triggerPresent = tree.firstOrderDeps.some(
      (fo) => fo.name === dep.triggeredBy,
    );
    if (!triggerPresent) continue;

    const features: FeatureSpec[] = [{
      name: dep.name,
      description: `Triggered by ${dep.triggeredBy}: ${dep.name}`,
      priority: 'should-have',
      category: 'frontend',
      inferredFrom: 'domain-knowledge',
      acceptanceCriteria: [
        `${dep.name} supports ${dep.triggeredBy}`,
        `UI patterns used: ${dep.uiPatterns.join(', ')}`,
      ],
    }];

    needs.push({
      name: dep.name,
      description: `Triggered by ${dep.triggeredBy}: ${dep.name}`,
      source: 'domain-knowledge',
      priority: 'should-have',
      features,
    });
  }

  return needs;
}

/**
 * Infer security needs for commercial/enterprise apps.
 */
function inferSecurityNeeds(userFeatures: Set<string>): InferredNeed[] {
  return SECURITY_REQUIREMENTS
    .filter((sec) => !userFeatures.has(sec.name.toLowerCase()))
    .map((sec) => ({
      name: sec.name,
      description: sec.description,
      source: 'security' as const,
      priority: 'must-have' as const,
      features: [{
        name: sec.name,
        description: `Security requirement: ${sec.description}`,
        priority: 'must-have' as const,
        category: 'infrastructure' as const,
        inferredFrom: 'security' as const,
        acceptanceCriteria: [`${sec.name} is implemented and tested`],
      }],
    }));
}

/**
 * Infer UX best-practice needs.
 */
function inferUxNeeds(userFeatures: Set<string>): InferredNeed[] {
  return UX_BEST_PRACTICES
    .filter((ux) => !userFeatures.has(ux.name.toLowerCase()))
    .map((ux) => ({
      name: ux.name,
      description: ux.description,
      source: 'ux-best-practice' as const,
      priority: 'should-have' as const,
      features: [{
        name: ux.name,
        description: ux.description,
        priority: 'should-have' as const,
        category: 'frontend' as const,
        inferredFrom: 'domain-knowledge' as const,
        acceptanceCriteria: [`${ux.name} is implemented`],
      }],
    }));
}
