/**
 * Browser Agent — public API for the browser-agent fallback system.
 *
 * Used by non-MCP services that require automated account signup.
 */

// Types
export type {
  BrowserAgentSession,
  BrowserAgentSessionStatus,
  BrowserAgentProgressMessage,
  ExtractedCredentials,
  WorkflowTemplate,
  WorkflowStepType,
  VerificationType,
  StartFallbackRequest,
  StartFallbackResponse,
  SessionStatusResponse,
  SubmitVerificationRequest,
} from './types.js';

// Session management
export {
  startSession,
  getSession,
  submitVerificationCode,
  cancelSession,
  onProgress,
  cleanupSession,
} from './session-manager.js';

// Templates
export {
  getWorkflowTemplate,
  getAllTemplates,
  hasTemplate,
} from './templates.js';

// Credential generation
export {
  generateSecurePassword,
  storeBrowserAgentCredentials,
} from './credential-generator.js';

// Email verification
export {
  hasEmailMcpConnection,
  pollForVerificationEmail,
} from './email-verifier.js';
