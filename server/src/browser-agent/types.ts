/**
 * Browser Agent Types — data structures for the browser-agent fallback system.
 *
 * When a service doesn't have an MCP server, KripTik uses Browser Use
 * (open source browser automation) to create accounts on behalf of users.
 * These types define the workflow templates, session state, and progress tracking.
 */

// ---------------------------------------------------------------------------
// Workflow template — defines how to sign up for a specific service
// ---------------------------------------------------------------------------

/** Verification method the service uses after signup */
export type VerificationType = 'email' | 'sms' | 'email-and-sms' | 'none';

/** Current step in the signup workflow */
export type WorkflowStepType =
  | 'navigate'
  | 'fill-form'
  | 'submit'
  | 'wait-verification'
  | 'enter-verification-code'
  | 'extract-credentials'
  | 'complete';

export interface FormFieldMapping {
  /** CSS selector or field identifier */
  selector: string;
  /** What to fill: 'user_name' | 'user_email' | 'generated_password' | 'user_first_name' | 'user_last_name' */
  value: 'user_name' | 'user_email' | 'generated_password' | 'user_first_name' | 'user_last_name';
  /** Optional: action type (click, type, select) — defaults to 'type' */
  action?: 'type' | 'click' | 'select';
}

export interface CredentialExtraction {
  /** What credential to extract */
  type: 'api-key' | 'secret-key' | 'project-id' | 'dashboard-url';
  /** Human label for the credential */
  label: string;
  /** Hint for the browser agent on where to find it */
  locationHint: string;
}

export interface WorkflowTemplate {
  /** Service ID matching the service registry */
  serviceId: string;
  /** Display name of the service */
  serviceName: string;
  /** URL to navigate to for signup */
  signupUrl: string;
  /** Form field mappings for the signup page */
  formFields: FormFieldMapping[];
  /** What verification the service requires */
  verificationType: VerificationType;
  /** What credentials to extract after successful signup */
  credentialExtractions: CredentialExtraction[];
  /** Natural language instructions for the browser agent */
  agentInstructions: string;
  /** Post-signup URL where API keys/dashboard can be found */
  postSignupUrl?: string;
  /** Expected number of steps (for progress estimation) */
  estimatedSteps: number;
}

// ---------------------------------------------------------------------------
// Session state — tracks a running browser agent session
// ---------------------------------------------------------------------------

export type BrowserAgentSessionStatus =
  | 'pending'
  | 'running'
  | 'waiting-verification'
  | 'waiting-user-input'
  | 'extracting-credentials'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BrowserAgentProgressMessage {
  /** Timestamp */
  timestamp: string;
  /** Human-readable progress message */
  message: string;
  /** Step type for UI rendering */
  stepType: WorkflowStepType;
  /** Whether this step completed successfully */
  completed: boolean;
}

export interface BrowserAgentSession {
  /** Unique session ID */
  id: string;
  /** User ID */
  userId: string;
  /** Service being signed up for */
  serviceId: string;
  /** Current status */
  status: BrowserAgentSessionStatus;
  /** Progress messages for the UI */
  progressMessages: BrowserAgentProgressMessage[];
  /** If waiting for user input, what kind */
  waitingFor?: 'email-code' | 'sms-code' | 'captcha' | 'manual-action';
  /** Extracted credentials (populated on success) */
  extractedCredentials?: ExtractedCredentials;
  /** Error message if failed */
  error?: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Maximum allowed retries */
  maxRetries: number;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

export interface ExtractedCredentials {
  /** Generated password for the account */
  password: string;
  /** API key if extracted */
  apiKey?: string;
  /** Secret key if extracted */
  secretKey?: string;
  /** Project/org ID at the service */
  projectId?: string;
  /** Dashboard URL */
  dashboardUrl?: string;
  /** Email used for signup */
  email: string;
  /** Any additional credential data */
  extra?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Browser Use client interface — abstraction for the actual browser automation
// ---------------------------------------------------------------------------

export interface BrowserUseTask {
  /** Natural language task description for the agent */
  task: string;
  /** Starting URL */
  url: string;
  /** Maximum steps before aborting */
  maxSteps: number;
  /** Callback for step progress */
  onStep?: (step: BrowserUseStepResult) => void;
}

export interface BrowserUseStepResult {
  /** Step number */
  stepNumber: number;
  /** What the agent did */
  action: string;
  /** Result of the action */
  result: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Screenshot URL if available */
  screenshotUrl?: string;
}

export interface BrowserUseResult {
  /** Whether the task completed successfully */
  success: boolean;
  /** Final extracted data */
  extractedData: Record<string, string>;
  /** Total steps taken */
  totalSteps: number;
  /** Error message if failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

export interface StartFallbackRequest {
  /** User's email for signup */
  userEmail: string;
  /** User's display name */
  userName: string;
  /** Optional: project ID to associate */
  projectId?: string;
}

export interface StartFallbackResponse {
  /** Session ID for tracking progress */
  sessionId: string;
  /** Initial status */
  status: BrowserAgentSessionStatus;
}

export interface SessionStatusResponse {
  /** Session ID */
  sessionId: string;
  /** Current status */
  status: BrowserAgentSessionStatus;
  /** Progress messages */
  progressMessages: BrowserAgentProgressMessage[];
  /** What user input is needed, if any */
  waitingFor?: string;
  /** Error info if failed */
  error?: string;
}

export interface SubmitVerificationRequest {
  /** The verification code */
  code: string;
  /** Type of verification */
  type: 'email' | 'sms';
}
