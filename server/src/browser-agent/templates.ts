/**
 * Workflow Templates — defines signup flows for non-MCP services.
 *
 * Each template describes: the signup URL, form field mappings,
 * verification type, and what credentials to extract post-signup.
 * The browser agent uses these templates + natural language instructions
 * to automate account creation.
 */

import type { WorkflowTemplate } from './types.js';

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const templates: Map<string, WorkflowTemplate> = new Map();

export function getWorkflowTemplate(serviceId: string): WorkflowTemplate | null {
  return templates.get(serviceId) || null;
}

export function getAllTemplates(): WorkflowTemplate[] {
  return Array.from(templates.values());
}

export function hasTemplate(serviceId: string): boolean {
  return templates.has(serviceId);
}

// ---------------------------------------------------------------------------
// fal.ai — AI inference platform
// ---------------------------------------------------------------------------

templates.set('fal-ai', {
  serviceId: 'fal-ai',
  serviceName: 'fal.ai',
  signupUrl: 'https://fal.ai/dashboard/keys',
  formFields: [
    { selector: 'input[type="email"]', value: 'user_email' },
    { selector: 'input[type="password"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Key', locationHint: 'Dashboard > Keys section, click "Create" if none exist' },
  ],
  agentInstructions: `Sign up for fal.ai:
1. Navigate to fal.ai and click "Sign Up" or "Get Started"
2. Use the provided email and password to create an account
3. If asked, select the Free tier
4. After signup, navigate to the Keys section in the dashboard
5. Create a new API key if none exists
6. Extract the API key value`,
  postSignupUrl: 'https://fal.ai/dashboard/keys',
  estimatedSteps: 12,
});

// ---------------------------------------------------------------------------
// Replicate — ML model hosting
// ---------------------------------------------------------------------------

templates.set('replicate', {
  serviceId: 'replicate',
  serviceName: 'Replicate',
  signupUrl: 'https://replicate.com/signin',
  formFields: [
    { selector: 'input[name="email"]', value: 'user_email' },
    { selector: 'input[name="password"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Token', locationHint: 'Account Settings > API tokens page' },
  ],
  agentInstructions: `Sign up for Replicate:
1. Navigate to replicate.com and click "Sign up"
2. Choose email signup (not GitHub OAuth)
3. Enter the provided email and password
4. Complete email verification if required
5. Navigate to Account Settings > API tokens
6. Copy the default API token or create a new one
7. Extract the token value`,
  postSignupUrl: 'https://replicate.com/account/api-tokens',
  estimatedSteps: 10,
});

// ---------------------------------------------------------------------------
// RunPod — GPU cloud
// ---------------------------------------------------------------------------

templates.set('runpod', {
  serviceId: 'runpod',
  serviceName: 'RunPod',
  signupUrl: 'https://www.runpod.io/console/signup',
  formFields: [
    { selector: 'input[name="email"]', value: 'user_email' },
    { selector: 'input[name="password"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Key', locationHint: 'Settings > API Keys in the console' },
  ],
  agentInstructions: `Sign up for RunPod:
1. Navigate to runpod.io and click "Sign Up"
2. Enter the provided email and password
3. Complete email verification
4. Navigate to Settings > API Keys in the console
5. Create a new API key
6. Extract the API key value`,
  postSignupUrl: 'https://www.runpod.io/console/user/settings',
  estimatedSteps: 12,
});

// ---------------------------------------------------------------------------
// Render — Cloud hosting
// ---------------------------------------------------------------------------

templates.set('render', {
  serviceId: 'render',
  serviceName: 'Render',
  signupUrl: 'https://dashboard.render.com/register',
  formFields: [
    { selector: 'input[name="name"]', value: 'user_name' },
    { selector: 'input[name="email"]', value: 'user_email' },
    { selector: 'input[name="password"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Key', locationHint: 'Account Settings > API Keys' },
    { type: 'dashboard-url', label: 'Dashboard', locationHint: 'https://dashboard.render.com' },
  ],
  agentInstructions: `Sign up for Render:
1. Navigate to the Render signup page
2. Choose email signup (not GitHub/GitLab)
3. Fill in name, email, and password
4. Complete email verification
5. Navigate to Account Settings > API Keys
6. Create a new API key
7. Extract the API key value`,
  postSignupUrl: 'https://dashboard.render.com/u/settings#api-keys',
  estimatedSteps: 12,
});

// ---------------------------------------------------------------------------
// Railway — App hosting
// ---------------------------------------------------------------------------

templates.set('railway', {
  serviceId: 'railway',
  serviceName: 'Railway',
  signupUrl: 'https://railway.app/login',
  formFields: [
    { selector: 'input[type="email"]', value: 'user_email' },
    { selector: 'input[type="password"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Token', locationHint: 'Account Settings > Tokens' },
    { type: 'dashboard-url', label: 'Dashboard', locationHint: 'https://railway.app/dashboard' },
  ],
  agentInstructions: `Sign up for Railway:
1. Navigate to railway.app and click "Sign Up"
2. Choose email signup
3. Enter the provided email and password
4. Complete email verification
5. Navigate to Account Settings > Tokens
6. Create a new API token
7. Extract the token value`,
  postSignupUrl: 'https://railway.app/account/tokens',
  estimatedSteps: 11,
});

// ---------------------------------------------------------------------------
// Fly.io — Global app platform
// ---------------------------------------------------------------------------

templates.set('fly-io', {
  serviceId: 'fly-io',
  serviceName: 'Fly.io',
  signupUrl: 'https://fly.io/app/sign-up',
  formFields: [
    { selector: 'input[name="user[name]"]', value: 'user_name' },
    { selector: 'input[name="user[email]"]', value: 'user_email' },
    { selector: 'input[name="user[password]"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Token', locationHint: 'Account Settings > Access Tokens' },
    { type: 'dashboard-url', label: 'Dashboard', locationHint: 'https://fly.io/dashboard' },
  ],
  agentInstructions: `Sign up for Fly.io:
1. Navigate to fly.io signup page
2. Fill in name, email, and password
3. Accept terms of service
4. Complete email verification
5. Navigate to Account > Access Tokens
6. Create a new personal access token
7. Extract the token value`,
  postSignupUrl: 'https://fly.io/user/personal_access_tokens',
  estimatedSteps: 12,
});

// ---------------------------------------------------------------------------
// DigitalOcean — Cloud infrastructure
// ---------------------------------------------------------------------------

templates.set('digitalocean', {
  serviceId: 'digitalocean',
  serviceName: 'DigitalOcean',
  signupUrl: 'https://cloud.digitalocean.com/registrations/new',
  formFields: [
    { selector: 'input[name="user[email]"]', value: 'user_email' },
    { selector: 'input[name="user[password]"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'Personal Access Token', locationHint: 'API > Tokens section in the control panel' },
  ],
  agentInstructions: `Sign up for DigitalOcean:
1. Navigate to the DigitalOcean signup page
2. Choose email signup
3. Enter email and password
4. Complete email verification
5. Skip payment method if possible (or note it requires one)
6. Navigate to API > Tokens in the control panel
7. Generate a new personal access token
8. Extract the token value`,
  postSignupUrl: 'https://cloud.digitalocean.com/account/api/tokens',
  estimatedSteps: 14,
});

// ---------------------------------------------------------------------------
// Heroku — PaaS
// ---------------------------------------------------------------------------

templates.set('heroku', {
  serviceId: 'heroku',
  serviceName: 'Heroku',
  signupUrl: 'https://signup.heroku.com/',
  formFields: [
    { selector: 'input[name="first_name"]', value: 'user_first_name' },
    { selector: 'input[name="last_name"]', value: 'user_last_name' },
    { selector: 'input[name="email"]', value: 'user_email' },
    { selector: 'input[name="password"]', value: 'generated_password' },
  ],
  verificationType: 'email',
  credentialExtractions: [
    { type: 'api-key', label: 'API Key', locationHint: 'Account Settings > API Key section, click Reveal' },
  ],
  agentInstructions: `Sign up for Heroku:
1. Navigate to Heroku signup page
2. Fill in first name, last name, email, and password
3. Select a role and country if asked
4. Complete email verification
5. Set up account (may need to accept terms)
6. Navigate to Account Settings
7. Find the API Key section and reveal/copy the key
8. Extract the API key value`,
  postSignupUrl: 'https://dashboard.heroku.com/account',
  estimatedSteps: 14,
});
