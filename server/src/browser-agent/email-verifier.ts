/**
 * Email Verifier — integrates with Gmail/email MCP to automatically
 * handle email verification during browser agent signup flows.
 *
 * If the user has their email connected via MCP, KripTik can:
 * 1. Poll for the verification email
 * 2. Extract the verification code or link
 * 3. Feed it back to the browser agent
 *
 * If email MCP is NOT connected, the session transitions to
 * 'waiting-user-input' and the user pastes the code in chat.
 */

import { getMcpClient } from '../mcp/index.js';

// ---------------------------------------------------------------------------
// Verification code extraction patterns
// ---------------------------------------------------------------------------

const CODE_PATTERNS = [
  // 6-digit codes (most common)
  /\b(\d{6})\b/,
  // 4-digit codes
  /\b(\d{4})\b/,
  // Alphanumeric codes
  /verification code[:\s]+([A-Z0-9]{4,8})/i,
  /code[:\s]+([A-Z0-9]{4,8})/i,
  /OTP[:\s]+([A-Z0-9]{4,8})/i,
];

const VERIFICATION_LINK_PATTERNS = [
  /https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|validate)[^\s"'<>]*/i,
  /https?:\/\/[^\s"'<>]+(?:token|code)=[^\s"'<>]*/i,
];

export interface VerificationResult {
  /** Whether verification data was found */
  found: boolean;
  /** Verification code if found */
  code?: string;
  /** Verification link if found */
  link?: string;
  /** The email subject */
  subject?: string;
  /** The email sender */
  from?: string;
}

// ---------------------------------------------------------------------------
// Email MCP integration
// ---------------------------------------------------------------------------

/**
 * Check if the user has email MCP connected (Gmail, Outlook, etc.)
 */
export async function hasEmailMcpConnection(userId: string): Promise<boolean> {
  try {
    const mcpClient = getMcpClient();

    // Check for Gmail MCP connection
    const gmailToken = await mcpClient.getValidToken(userId, 'gmail');
    if (gmailToken) return true;

    // Check for Outlook/Microsoft MCP
    const outlookToken = await mcpClient.getValidToken(userId, 'microsoft-outlook');
    if (outlookToken) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Attempt to find and extract a verification code/link from the user's
 * email inbox using their connected email MCP.
 *
 * Polls for up to maxWaitMs, checking every pollIntervalMs.
 *
 * @param userId - The user's ID
 * @param serviceId - The service we're looking for verification from
 * @param serviceName - Human name for matching (e.g., "RunPod", "Railway")
 * @param maxWaitMs - Maximum time to wait for the email (default 120s)
 * @param pollIntervalMs - How often to check (default 5s)
 */
export async function pollForVerificationEmail(
  userId: string,
  serviceId: string,
  serviceName: string,
  maxWaitMs = 120_000,
  pollIntervalMs = 5_000,
): Promise<VerificationResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const result = await checkForVerificationEmail(userId, serviceName);
      if (result.found) {
        return result;
      }
    } catch {
      // Continue polling on errors
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return { found: false };
}

/**
 * Single check for a verification email from the given service.
 * Uses the email MCP's search/list tools to find recent emails.
 */
async function checkForVerificationEmail(
  userId: string,
  serviceName: string,
): Promise<VerificationResult> {
  // Attempt to use Gmail MCP tools to search for recent verification emails.
  // The actual MCP tool call depends on what tools the email service exposes.
  // Common tools: gmail_search, gmail_get_message, etc.
  //
  // Since MCP tool schemas vary, we use a general approach:
  // 1. Search for emails from the service within the last 5 minutes
  // 2. Extract code/link from the most recent matching email

  try {
    const mcpClient = getMcpClient();
    const token = await mcpClient.getValidToken(userId, 'gmail');
    if (!token) return { found: false };

    // Search Gmail for recent verification emails from this service
    // This would call the Gmail MCP's search tool
    // For now, this uses a fetch-based approach against Gmail API
    const searchQuery = encodeURIComponent(
      `from:${serviceName.toLowerCase().replace(/[^a-z]/g, '')} newer_than:5m (verify OR verification OR confirm OR code OR activate)`
    );

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) return { found: false };

    const data = await response.json();
    if (!data.messages || data.messages.length === 0) return { found: false };

    // Fetch the full message
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=full`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!msgResponse.ok) return { found: false };

    const msg = await msgResponse.json();
    const body = extractEmailBody(msg);
    const headers = msg.payload?.headers || [];
    const subject = headers.find((h: { name: string }) => h.name.toLowerCase() === 'subject')?.value;
    const from = headers.find((h: { name: string }) => h.name.toLowerCase() === 'from')?.value;

    if (!body) return { found: false };

    // Try to extract verification code
    for (const pattern of CODE_PATTERNS) {
      const match = body.match(pattern);
      if (match) {
        return { found: true, code: match[1], subject, from };
      }
    }

    // Try to extract verification link
    for (const pattern of VERIFICATION_LINK_PATTERNS) {
      const match = body.match(pattern);
      if (match) {
        return { found: true, link: match[0], subject, from };
      }
    }

    return { found: false, subject, from };
  } catch {
    return { found: false };
  }
}

/**
 * Extract the plain text body from a Gmail message payload.
 */
function extractEmailBody(message: Record<string, unknown>): string | null {
  const payload = message.payload as Record<string, unknown> | undefined;
  if (!payload) return null;

  // Direct body
  const body = payload.body as { data?: string } | undefined;
  if (body?.data) {
    return Buffer.from(body.data, 'base64url').toString('utf-8');
  }

  // Multipart — look for text/plain or text/html
  const parts = payload.parts as Array<{ mimeType: string; body?: { data?: string }; parts?: unknown[] }> | undefined;
  if (!parts) return null;

  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }
  }

  // Fallback to HTML
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      // Strip HTML tags for code extraction
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return null;
}
