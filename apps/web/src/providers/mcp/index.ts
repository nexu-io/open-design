// Public barrel for the MCP transport adapters. `/api/mcp/*` is fetched from
// several components (the External MCP panel, the automation modal, the home
// view), so it is a real multi-adapter seam: this folder is its one transport
// home, and the barrel is the only entry other code imports.
export { fetchMcpServers, saveMcpServers } from './servers';
export {
  startMcpOAuth,
  fetchMcpOAuthStatus,
  disconnectMcpOAuth,
  type StartMcpOAuthResult,
} from './oauth';
export {
  subscribeMcpOAuthCallback,
  subscribeMcpOAuthStatusPolling,
  openMcpAuthorizeUrl,
  type McpOAuthCallbackResult,
} from './oauth-bridge';

// Wire types re-exported for convenience so callers migrating off the former
// `state/mcp.ts` module keep importing value + type from one place. The
// authoritative source stays `@open-design/contracts`.
export type {
  McpOAuthStatusResponse,
  McpServerConfig,
  McpServersResponse,
  McpTemplate,
  StartMcpOAuthResponse,
} from '@open-design/contracts';
