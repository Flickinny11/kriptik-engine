/**
 * Modal Sandbox Manager
 *
 * Manages build execution via Modal's HTTP endpoint.
 * In production (MODAL_ENABLED=true), builds run in Modal containers.
 *
 * Real-time streaming: Modal app reads stdout line-by-line and POSTs
 * each event to our callback URL. Events are persisted immediately.
 * The full event list is also returned in the response as a fallback.
 */

interface BuildConfig {
  projectId: string;
  prompt: string;
  mode?: string;
  budgetCapDollars?: number;
  callbackUrl?: string;
}

interface BuildResult {
  status: 'complete' | 'error';
  events: any[];
  stderr?: string;
  returnCode?: number;
}

/**
 * Start a build via Modal's web endpoint.
 * If callbackUrl is provided, Modal POSTs each event in real-time.
 * The full response also contains all events as a fallback.
 */
export async function startModalBuild(config: BuildConfig): Promise<BuildResult> {
  const url = getModalEndpointUrl();

  if (!url) {
    throw new Error('Modal endpoint URL not configured. Set MODAL_SPAWN_URL env var.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: config.projectId,
      prompt: config.prompt,
      mode: config.mode || 'builder',
      budgetCapDollars: config.budgetCapDollars || 5,
      callbackUrl: config.callbackUrl,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Modal build failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<BuildResult>;
}

/**
 * Start a build with real-time event forwarding.
 *
 * If a callbackUrl is configured, Modal POSTs each event as it happens.
 * The onEvent handler is called for any events that weren't already
 * received via the callback (fallback for missed events).
 */
export async function startModalBuildStreaming(
  config: BuildConfig,
  onEvent: (event: any) => void,
): Promise<void> {
  const result = await startModalBuild(config);

  // Forward any events from the response that weren't already persisted
  // via the callback URL. This acts as a fallback/catchup mechanism.
  for (const event of result.events) {
    onEvent(event);
  }

  if (result.status === 'error' && result.events.length === 0) {
    onEvent({
      type: 'build_error',
      data: { message: result.stderr || 'Build failed in Modal', projectId: config.projectId },
    });
  }
}

/**
 * Check if Modal is enabled for this environment.
 */
export function isModalEnabled(): boolean {
  return process.env.MODAL_ENABLED === 'true' && !!getModalEndpointUrl();
}

function getModalEndpointUrl(): string {
  return process.env.MODAL_SPAWN_URL || '';
}
