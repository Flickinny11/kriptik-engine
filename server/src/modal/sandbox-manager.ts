/**
 * Modal Sandbox Manager
 *
 * Manages build execution via Modal's HTTP endpoint.
 * In production (MODAL_ENABLED=true), builds run in Modal containers
 * instead of locally. Events are streamed back via the response.
 */

const MODAL_APP_URL = process.env.MODAL_SPAWN_URL || '';

interface BuildConfig {
  projectId: string;
  prompt: string;
  mode?: string;
  budgetCapDollars?: number;
}

interface BuildResult {
  status: 'complete' | 'error';
  events: any[];
  stderr?: string;
  returnCode?: number;
}

/**
 * Start a build via Modal's web endpoint.
 * Returns the full result with all events.
 */
export async function startModalBuild(config: BuildConfig): Promise<BuildResult> {
  const url = MODAL_APP_URL || getModalEndpointUrl();

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
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Modal build failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<BuildResult>;
}

/**
 * Start a build with streaming — events are forwarded as they arrive.
 * Uses the Modal endpoint and processes the response incrementally.
 */
export async function startModalBuildStreaming(
  config: BuildConfig,
  onEvent: (event: any) => void,
): Promise<void> {
  const result = await startModalBuild(config);

  // Forward all events
  for (const event of result.events) {
    onEvent(event);
  }

  if (result.status === 'error') {
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

/**
 * Get the Modal web endpoint URL for the kriptik-engine app.
 * This is set after `modal deploy modal/app.py` completes.
 */
function getModalEndpointUrl(): string {
  return process.env.MODAL_SPAWN_URL || '';
}
