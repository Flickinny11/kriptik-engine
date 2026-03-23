/**
 * Session Manager — manages browser agent session lifecycle, progress tracking,
 * and coordination between the browser agent, email verifier, and user.
 *
 * Sessions are stored in-memory for active flows and persisted to the DB
 * on completion. Each session tracks progress messages that stream to the
 * client UI in real-time.
 */

import { v4 as uuid } from 'uuid';
import { getWorkflowTemplate, hasTemplate } from './templates.js';
import { generateSecurePassword, storeBrowserAgentCredentials } from './credential-generator.js';
import { hasEmailMcpConnection, pollForVerificationEmail } from './email-verifier.js';
import { executeBrowserTask } from './browser-use-client.js';
import type {
  BrowserAgentSession,
  BrowserAgentSessionStatus,
  BrowserAgentProgressMessage,
  ExtractedCredentials,
  WorkflowStepType,
} from './types.js';

// ---------------------------------------------------------------------------
// In-memory session store (active sessions only)
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, BrowserAgentSession>();

// Callbacks for progress updates (SSE/polling)
type ProgressCallback = (session: BrowserAgentSession) => void;
const progressCallbacks = new Map<string, Set<ProgressCallback>>();

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Start a new browser agent session for signing up at a non-MCP service.
 */
export async function startSession(
  userId: string,
  serviceId: string,
  userEmail: string,
  userName: string,
  projectId?: string,
): Promise<BrowserAgentSession> {
  if (!hasTemplate(serviceId)) {
    throw new Error(`No workflow template available for service: ${serviceId}`);
  }

  const session: BrowserAgentSession = {
    id: uuid(),
    userId,
    serviceId,
    status: 'pending',
    progressMessages: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  activeSessions.set(session.id, session);

  // Start the signup flow asynchronously
  runSignupFlow(session, userEmail, userName, projectId).catch(err => {
    updateSessionStatus(session.id, 'failed', err instanceof Error ? err.message : 'Unknown error');
  });

  return session;
}

/**
 * Get a session by ID.
 */
export function getSession(sessionId: string): BrowserAgentSession | null {
  return activeSessions.get(sessionId) || null;
}

/**
 * Submit a verification code from the user.
 */
export function submitVerificationCode(
  sessionId: string,
  code: string,
  type: 'email' | 'sms',
): boolean {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'waiting-user-input') {
    return false;
  }

  // Sanitize code to alphanumeric + common separators (spaces, dots, hyphens)
  const sanitized = code.replace(/[^a-zA-Z0-9\-_.\s]/g, '').trim().slice(0, 20);
  if (!sanitized) return false;

  // Store the code in the session for the running flow to pick up
  (session as any)._verificationCode = sanitized;
  (session as any)._verificationType = type;
  addProgressMessage(sessionId, `Received ${type} verification code`, 'enter-verification-code', false);
  return true;
}

/**
 * Cancel a running session.
 */
export function cancelSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
    return false;
  }

  updateSessionStatus(sessionId, 'cancelled');
  return true;
}

/**
 * Register a callback for progress updates on a session.
 */
export function onProgress(sessionId: string, callback: ProgressCallback): () => void {
  if (!progressCallbacks.has(sessionId)) {
    progressCallbacks.set(sessionId, new Set());
  }
  progressCallbacks.get(sessionId)!.add(callback);

  // Return unsubscribe function
  return () => {
    progressCallbacks.get(sessionId)?.delete(callback);
  };
}

/**
 * Clean up a completed/failed/cancelled session from memory.
 */
export function cleanupSession(sessionId: string): void {
  activeSessions.delete(sessionId);
  progressCallbacks.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Internal session updates
// ---------------------------------------------------------------------------

function updateSessionStatus(
  sessionId: string,
  status: BrowserAgentSessionStatus,
  error?: string,
): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  session.status = status;
  session.updatedAt = new Date().toISOString();
  if (error) session.error = error;

  notifyProgress(sessionId);

  // Schedule cleanup for terminal states
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    setTimeout(() => cleanupSession(sessionId), 5 * 60 * 1000);
  }
}

function addProgressMessage(
  sessionId: string,
  message: string,
  stepType: WorkflowStepType,
  completed: boolean,
): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  session.progressMessages.push({
    timestamp: new Date().toISOString(),
    message,
    stepType,
    completed,
  });
  session.updatedAt = new Date().toISOString();

  notifyProgress(sessionId);
}

function markLastStepCompleted(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session || session.progressMessages.length === 0) return;

  session.progressMessages[session.progressMessages.length - 1].completed = true;
  notifyProgress(sessionId);
}

function notifyProgress(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const callbacks = progressCallbacks.get(sessionId);
  if (callbacks) {
    for (const cb of callbacks) {
      try {
        cb(session);
      } catch {
        // Ignore callback errors
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Core signup flow
// ---------------------------------------------------------------------------

async function runSignupFlow(
  session: BrowserAgentSession,
  userEmail: string,
  userName: string,
  projectId?: string,
): Promise<void> {
  const template = getWorkflowTemplate(session.serviceId);
  if (!template) {
    updateSessionStatus(session.id, 'failed', 'No workflow template found');
    return;
  }

  // Check if session was cancelled
  const isCancelled = () => {
    const current = activeSessions.get(session.id);
    return !current || current.status === 'cancelled';
  };

  try {
    updateSessionStatus(session.id, 'running');
    const password = generateSecurePassword();

    // Step 1: Navigate and fill signup form
    addProgressMessage(session.id, `Opening ${template.serviceName} signup page...`, 'navigate', false);

    if (isCancelled()) return;

    // Build the task description for Browser Use
    const taskDescription = buildTaskDescription(template, userEmail, userName, password);

    // Execute the browser automation task
    const result = await executeBrowserTask({
      task: taskDescription,
      url: template.signupUrl,
      maxSteps: template.estimatedSteps + 5,
      onStep: (step) => {
        if (isCancelled()) return;
        // Map Browser Use steps to progress messages
        const progressMsg = interpretStepForProgress(step.action, template.serviceName);
        if (progressMsg) {
          markLastStepCompleted(session.id);
          addProgressMessage(session.id, progressMsg, 'fill-form', false);
        }
      },
    });

    if (isCancelled()) return;

    // Step 2: Handle verification if needed
    if (template.verificationType !== 'none') {
      markLastStepCompleted(session.id);
      addProgressMessage(session.id, 'Checking for email verification...', 'wait-verification', false);

      const hasEmail = await hasEmailMcpConnection(session.userId);

      if (hasEmail && (template.verificationType === 'email' || template.verificationType === 'email-and-sms')) {
        // Auto-verify via email MCP
        addProgressMessage(session.id, 'Scanning inbox for verification email...', 'wait-verification', false);

        const verifyResult = await pollForVerificationEmail(
          session.userId,
          session.serviceId,
          template.serviceName,
          60_000,  // 60 second timeout for email
          3_000,   // Check every 3 seconds
        );

        if (verifyResult.found && (verifyResult.code || verifyResult.link)) {
          markLastStepCompleted(session.id);
          addProgressMessage(
            session.id,
            verifyResult.code
              ? 'Found verification code, entering it now...'
              : 'Found verification link, clicking it now...',
            'enter-verification-code',
            false,
          );

          // Feed the code/link back to the browser agent
          if (verifyResult.code) {
            await executeBrowserTask({
              task: `Enter the verification code "${verifyResult.code}" in the verification input field and submit`,
              url: template.signupUrl,
              maxSteps: 5,
            });
          } else if (verifyResult.link) {
            await executeBrowserTask({
              task: `Navigate to this verification link: ${verifyResult.link}`,
              url: verifyResult.link,
              maxSteps: 3,
            });
          }
        } else {
          // Email MCP didn't find the code, fall through to user input
          await requestUserVerification(session, template.verificationType);
          if (isCancelled()) return;
        }
      } else {
        // No email MCP, ask user for code
        await requestUserVerification(session, template.verificationType);
        if (isCancelled()) return;
      }

      // Handle SMS verification if needed
      if (template.verificationType === 'email-and-sms' || template.verificationType === 'sms') {
        await requestUserVerification(session, 'sms');
        if (isCancelled()) return;
      }
    }

    markLastStepCompleted(session.id);

    // Step 3: Extract credentials
    addProgressMessage(session.id, `Extracting API credentials from ${template.serviceName}...`, 'extract-credentials', false);
    updateSessionStatus(session.id, 'extracting-credentials');

    if (template.postSignupUrl) {
      const extractResult = await executeBrowserTask({
        task: buildCredentialExtractionTask(template),
        url: template.postSignupUrl,
        maxSteps: 10,
      });

      const extractedCredentials: ExtractedCredentials = {
        password,
        email: userEmail,
        apiKey: extractResult.extractedData.apiKey || extractResult.extractedData.api_key,
        secretKey: extractResult.extractedData.secretKey || extractResult.extractedData.secret_key,
        projectId: extractResult.extractedData.projectId || extractResult.extractedData.project_id,
        dashboardUrl: template.postSignupUrl,
      };

      session.extractedCredentials = extractedCredentials;

      // Store credentials in vault
      if (projectId) {
        await storeBrowserAgentCredentials(
          session.userId,
          projectId,
          session.serviceId,
          extractedCredentials,
        );
      }
    } else {
      session.extractedCredentials = {
        password,
        email: userEmail,
        dashboardUrl: template.signupUrl,
      };
    }

    markLastStepCompleted(session.id);
    addProgressMessage(session.id, `Account created at ${template.serviceName}!`, 'complete', true);
    updateSessionStatus(session.id, 'completed');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Signup flow failed';

    // Check if we can retry
    if (session.retryCount < session.maxRetries) {
      session.retryCount++;
      addProgressMessage(
        session.id,
        `Encountered an issue, retrying (attempt ${session.retryCount + 1})...`,
        'navigate',
        false,
      );
      await runSignupFlow(session, userEmail, userName, projectId);
    } else {
      addProgressMessage(session.id, `Failed: ${errorMessage}`, 'complete', false);
      updateSessionStatus(session.id, 'failed', errorMessage);
    }
  }
}

// ---------------------------------------------------------------------------
// User verification request
// ---------------------------------------------------------------------------

async function requestUserVerification(
  session: BrowserAgentSession,
  type: 'email' | 'sms' | 'email-and-sms',
): Promise<void> {
  const waitType = type === 'sms' ? 'sms-code' : 'email-code';
  session.waitingFor = waitType;
  updateSessionStatus(session.id, 'waiting-user-input');

  const message = type === 'sms'
    ? 'Please paste the SMS verification code you received'
    : 'Please check your email and paste the verification code';

  addProgressMessage(session.id, message, 'wait-verification', false);

  // Wait for user to submit code (timeout after 5 minutes)
  const code = await waitForUserCode(session.id, 300_000);

  if (!code) {
    throw new Error('Verification timed out — no code received');
  }

  markLastStepCompleted(session.id);
  addProgressMessage(session.id, 'Entering verification code...', 'enter-verification-code', false);

  // Feed the code to the browser agent
  await executeBrowserTask({
    task: `Enter the verification code "${code}" in the verification input field and submit it`,
    url: '',  // Continue in current page context
    maxSteps: 5,
  });

  session.waitingFor = undefined;
}

function waitForUserCode(sessionId: string, timeoutMs: number): Promise<string | null> {
  return new Promise(resolve => {
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      const session = activeSessions.get(sessionId);

      if (!session || session.status === 'cancelled') {
        clearInterval(checkInterval);
        resolve(null);
        return;
      }

      const code = (session as any)._verificationCode;
      if (code) {
        delete (session as any)._verificationCode;
        delete (session as any)._verificationType;
        clearInterval(checkInterval);
        resolve(code);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 1000);
  });
}

// ---------------------------------------------------------------------------
// Task description builders
// ---------------------------------------------------------------------------

function buildTaskDescription(
  template: ReturnType<typeof getWorkflowTemplate> & {},
  email: string,
  name: string,
  password: string,
): string {
  const nameParts = name.split(' ');
  const firstName = nameParts[0] || name;
  const lastName = nameParts.slice(1).join(' ') || '';

  return `${template.agentInstructions}

Use these credentials:
- Email: ${email}
- Password: ${password}
- Name: ${name}
- First Name: ${firstName}
- Last Name: ${lastName}

Important:
- Choose email signup if given the option (not GitHub, Google, or other OAuth)
- Accept any terms of service or privacy policy checkboxes
- Skip optional fields unless they are required
- If the signup form has a CAPTCHA that cannot be solved, report it as an error
- Do NOT enter any payment information`;
}

function buildCredentialExtractionTask(
  template: ReturnType<typeof getWorkflowTemplate> & {},
): string {
  const extractions = template.credentialExtractions
    .map(e => `- ${e.label}: ${e.locationHint}`)
    .join('\n');

  return `Extract the following credentials from ${template.serviceName}:
${extractions}

Instructions:
1. Navigate to the appropriate settings/dashboard page
2. Find each credential listed above
3. If an API key needs to be created, create one with a descriptive name like "KripTik"
4. Copy the full key/token values
5. Return the extracted values in the final result`;
}

function interpretStepForProgress(action: string, serviceName: string): string | null {
  const lower = action.toLowerCase();

  if (lower.includes('navigate') || lower.includes('goto') || lower.includes('open')) {
    return `Navigating to ${serviceName}...`;
  }
  if (lower.includes('click') && (lower.includes('sign') || lower.includes('register') || lower.includes('create'))) {
    return 'Starting account creation...';
  }
  if (lower.includes('type') || lower.includes('fill') || lower.includes('input')) {
    return 'Filling in signup details...';
  }
  if ((lower.includes('submit') || lower.includes('click')) && lower.includes('button')) {
    return 'Submitting signup form...';
  }
  if (lower.includes('verify') || lower.includes('confirm') || lower.includes('email')) {
    return 'Handling verification...';
  }
  if (lower.includes('key') || lower.includes('token') || lower.includes('credential')) {
    return 'Extracting credentials...';
  }

  return null;
}
