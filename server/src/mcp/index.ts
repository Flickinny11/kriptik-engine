/**
 * MCP Client — Public API
 *
 * Re-exports the MCP client and its types for use by server routes
 * and engine integration.
 */

export { McpClient, getMcpClient } from './client.js';
export { discoverServiceMetadata } from './discovery.js';
export { getOrRegisterClient, clearRegistration } from './registration.js';
export {
  storeMcpTokens,
  getMcpTokens,
  getMcpRegistration,
  updateMcpTokens,
  updateMcpConnectionStatus,
  listMcpConnections,
  deleteMcpConnection,
  hasMcpConnection,
} from './token-store.js';

export type {
  McpConnectionStatus,
  McpConnectionState,
  ProtectedResourceMetadata,
  AuthorizationServerMetadata,
  DynamicClientRegistrationRequest,
  DynamicClientRegistrationResponse,
  McpTokenPayload,
  McpTokenResponse,
  PkceChallenge,
  McpToolInputSchema,
  McpToolPropertySchema,
  McpToolDefinition,
  McpToolsListResponse,
  McpServiceMetadata,
  McpClientRegistration,
  StoredMcpConnection,
  McpToolCache,
  McpOAuthFlowState,
  McpClientConfig,
} from './types.js';

export {
  McpDiscoveryError,
  McpAuthError,
  McpTokenError,
  McpToolError,
} from './types.js';
