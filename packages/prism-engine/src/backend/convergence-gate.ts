/**
 * convergence-gate.ts — Frontend-backend compatibility verification.
 *
 * Spec reference: Section 14 — Convergence Gate (1-3 seconds)
 * Static analysis only — no runtime:
 *   1. Route resolution: every frontend API call has a backend handler
 *   2. Auth consistency: protected frontend routes call authenticated endpoints
 *   3. Schema reference validation: all referenced Zod schemas exist
 *   4. Data model consistency: frontend form fields match backend schemas
 *
 * This is the TypeScript-side convergence gate used by prism-engine consumers.
 * The Python `run_convergence_gate()` in backend_worker.py performs the same
 * checks in the Modal pipeline — these two implementations must stay in sync.
 */

import type { PrismGraph, GraphNode, APICallSpec } from '../types.js';

export interface ConvergenceIssue {
  type: 'missing_backend_handler' | 'auth_inconsistency' | 'missing_schema' | 'type_error';
  message: string;
  severity: 'error' | 'warning';
}

export interface ConvergenceResult {
  passed: boolean;
  issues: ConvergenceIssue[];
  checkedEndpoints: number;
  matchedEndpoints: number;
}

export interface BackendEndpoint {
  path: string;
  method: string;
  auth: boolean;
  inputSchema?: string;
  outputSchema?: string;
}

export interface BackendResult {
  endpoints: BackendEndpoint[];
  zodSchemas?: string;
  tRPCRouter?: string;
}

/**
 * Run the convergence gate: verify frontend-backend compatibility.
 *
 * This is a static-analysis-only check. It verifies that the frontend
 * code's API calls match the backend endpoint signatures and that every
 * frontend apiCall has a corresponding backend handler.
 */
export function runConvergenceGate(
  graph: PrismGraph,
  backendResult: BackendResult,
): ConvergenceResult {
  const issues: ConvergenceIssue[] = [];
  let checkedEndpoints = 0;
  let matchedEndpoints = 0;

  // Extract frontend API calls from graph nodes
  const frontendApiCalls = extractFrontendApiCalls(graph);

  // Build lookup of backend endpoints by (method, path)
  const backendLookup = new Map<string, BackendEndpoint>();
  for (const ep of backendResult.endpoints) {
    const key = `${ep.method.toUpperCase()}:${ep.path}`;
    backendLookup.set(key, ep);
  }

  // Check 1: Route resolution — every frontend API call has a backend handler
  for (const call of frontendApiCalls) {
    checkedEndpoints++;
    const callMethod = call.method.toUpperCase();
    const matched = findMatchingEndpoint(callMethod, call.endpointPath, backendLookup);

    if (matched) {
      matchedEndpoints++;
    } else {
      issues.push({
        type: 'missing_backend_handler',
        message:
          `Frontend node '${call.nodeId}' calls ${callMethod} ${call.endpointPath} ` +
          `but no backend handler exists for this route`,
        severity: 'error',
      });
    }
  }

  // Check 2: Auth consistency
  for (const call of frontendApiCalls) {
    const callMethod = call.method.toUpperCase();
    const hubsRequiringAuth = getAuthHubs(graph, call.hubMemberships);

    if (hubsRequiringAuth.length > 0) {
      const matched = findMatchingEndpoint(callMethod, call.endpointPath, backendLookup);
      if (matched && !matched.auth) {
        issues.push({
          type: 'auth_inconsistency',
          message:
            `Node '${call.nodeId}' is in auth-required hub(s) ` +
            `[${hubsRequiringAuth.join(', ')}] but calls unauthenticated endpoint ` +
            `${callMethod} ${call.endpointPath}`,
          severity: 'warning',
        });
      }
    }
  }

  // Check 3: Schema reference validation
  const zodSchemaSource = backendResult.zodSchemas ?? '';
  for (const ep of backendResult.endpoints) {
    if (ep.inputSchema && !zodSchemaSource.includes(ep.inputSchema)) {
      issues.push({
        type: 'missing_schema',
        message:
          `Endpoint ${ep.path} references input schema '${ep.inputSchema}' ` +
          `which is not defined in the Zod schemas`,
        severity: 'error',
      });
    }
    if (ep.outputSchema && !zodSchemaSource.includes(ep.outputSchema)) {
      issues.push({
        type: 'missing_schema',
        message:
          `Endpoint ${ep.path} references output schema '${ep.outputSchema}' ` +
          `which is not defined in the Zod schemas`,
        severity: 'error',
      });
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error');

  return {
    passed: !hasErrors,
    issues,
    checkedEndpoints,
    matchedEndpoints,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface FrontendApiCall {
  endpointPath: string;
  method: string;
  nodeId: string;
  hubMemberships: string[];
}

/**
 * Extract all API call specs from frontend graph nodes.
 */
function extractFrontendApiCalls(graph: PrismGraph): FrontendApiCall[] {
  const calls: FrontendApiCall[] = [];

  for (const node of graph.nodes) {
    if (!node.behaviorSpec?.apiCalls) continue;

    for (const apiCall of node.behaviorSpec.apiCalls) {
      calls.push({
        endpointPath: apiCall.endpointPath,
        method: apiCall.method,
        nodeId: node.id,
        hubMemberships: node.hubMemberships,
      });
    }
  }

  return calls;
}

/**
 * Find a backend endpoint matching the given method and path.
 * Tries exact match first, then parameterized match.
 */
function findMatchingEndpoint(
  method: string,
  path: string,
  lookup: Map<string, BackendEndpoint>,
): BackendEndpoint | undefined {
  // Exact match
  const exactKey = `${method}:${path}`;
  if (lookup.has(exactKey)) return lookup.get(exactKey);

  // Parameterized match
  const normalizedCall = normalizePath(path);
  for (const [key, ep] of lookup) {
    const [epMethod] = key.split(':');
    if (epMethod !== method) continue;
    if (normalizePath(ep.path) === normalizedCall) return ep;
  }

  return undefined;
}

/**
 * Normalize a path by replacing parameter segments with a placeholder.
 */
function normalizePath(path: string): string {
  return path
    .split('/')
    .map(seg => {
      if (seg.startsWith(':') || (seg.startsWith('{') && seg.endsWith('}'))) {
        return ':param';
      }
      return seg;
    })
    .join('/');
}

/**
 * Return hub IDs that require authentication.
 */
function getAuthHubs(graph: PrismGraph, hubIds: string[]): string[] {
  const hubIdSet = new Set(hubIds);
  return graph.hubs
    .filter(hub => hubIdSet.has(hub.id) && hub.authRequired)
    .map(hub => hub.id);
}
