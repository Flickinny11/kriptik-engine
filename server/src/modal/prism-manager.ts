/**
 * Prism Modal Manager
 *
 * Manages Prism pipeline dispatch to Modal.
 * Modal executes, Vercel routes (Invariant 6).
 *
 * Prism builds are fire-and-forget: the server dispatches to Modal,
 * Modal streams events back via the callback URL to POST /api/events/callback/:projectId.
 * SSE only (Invariant 5).
 */

export interface PrismBuildConfig {
  projectId: string;
  userId: string;
  planId: string;
  plan: unknown; // PrismGraphPlan JSON from prism_plans.graphPlan
  callbackUrl: string;
  credentials: Record<string, unknown>;
  r2Config: R2Config;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

/**
 * Dispatch a Prism build to Modal.
 * Fire-and-forget: Modal streams events via callbackUrl.
 */
export async function startPrismBuild(config: PrismBuildConfig): Promise<void> {
  const url = getPrismEndpointUrl();

  if (!url) {
    throw new Error(
      'Prism Modal endpoint not configured. Set MODAL_PRISM_SPAWN_URL env var.',
    );
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: config.projectId,
      userId: config.userId,
      planId: config.planId,
      plan: config.plan,
      callbackUrl: config.callbackUrl,
      r2Config: config.r2Config,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prism Modal dispatch failed (${response.status}): ${text}`);
  }
}

/**
 * Check if the Prism engine is enabled for this environment.
 */
export function isPrismEnabled(): boolean {
  return process.env.MODAL_PRISM_ENABLED === 'true' && !!getPrismEndpointUrl();
}

/**
 * Get R2 configuration from environment variables.
 */
export function getR2Config(): R2Config {
  return {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'kriptik-prism-assets',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  };
}

/**
 * Configuration for dispatching a planning-only request to Modal.
 */
export interface PrismPlanConfig {
  planId: string;
  projectId: string;
  prompt: string;
  callbackUrl: string;
  planCallbackUrl: string;
  appContext?: Record<string, unknown>;
  previousPlan?: unknown;
  feedback?: string;
}

/**
 * Dispatch a planning-only request to Modal.
 * Used for the interactive flow: prompt -> plan -> approve.
 * Fire-and-forget: Modal posts plan back via planCallbackUrl.
 */
export async function dispatchPrismPlan(config: PrismPlanConfig): Promise<void> {
  const url = getPrismPlanUrl();

  if (!url) {
    throw new Error(
      'Prism Modal plan endpoint not configured. Set MODAL_PRISM_PLAN_URL env var.',
    );
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prism Modal plan dispatch failed (${response.status}): ${text}`);
  }
}

/**
 * Configuration for a single-node edit dispatch to Modal.
 */
export interface PrismNodeEditConfig {
  projectId: string;
  graphId: string;
  nodeId: string;
  graphVersion: number;
  changes: {
    caption?: string;
    visualSpec?: Record<string, unknown>;
    behaviorSpec?: Record<string, unknown>;
  };
  callbackUrl: string;
  r2Config: R2Config;
}

/**
 * Dispatch a single-node edit to Modal.
 * Fire-and-forget: Modal regenerates ONLY the edited node's code,
 * swaps the module file, increments graph version, and sends
 * hot-reload + SSE events.
 *
 * Invariant: neighbor nodes are NOT regenerated. Atlas is NOT repacked.
 * Graph edges preserved unless changes explicitly alter relationships.
 */
export async function dispatchPrismNodeEdit(config: PrismNodeEditConfig): Promise<void> {
  const url = getPrismEditUrl();

  if (!url) {
    throw new Error(
      'Prism Modal edit endpoint not configured. Set MODAL_PRISM_EDIT_URL env var.',
    );
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prism Modal edit dispatch failed (${response.status}): ${text}`);
  }
}

function getPrismEndpointUrl(): string {
  return process.env.MODAL_PRISM_SPAWN_URL || '';
}

function getPrismPlanUrl(): string {
  return process.env.MODAL_PRISM_PLAN_URL || '';
}

function getPrismEditUrl(): string {
  return process.env.MODAL_PRISM_EDIT_URL || '';
}
