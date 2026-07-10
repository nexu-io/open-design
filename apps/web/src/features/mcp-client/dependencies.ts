// Composition root for the MCP client slice: binds concrete transport adapters
// to the slice's ports. This is the ONE feature file allowed to import
// `providers/` — everything else depends on a port, so swapping an adapter (or
// a fake in tests) touches only this file.
import {
  fetchMcpServers,
  saveMcpServers,
  startMcpOAuth,
  fetchMcpOAuthStatus,
  disconnectMcpOAuth,
  subscribeMcpOAuthCallback,
  subscribeMcpOAuthStatusPolling,
  openMcpAuthorizeUrl,
} from '../../providers/mcp';
import { fetchAgents } from '../../providers/registry';
import type { McpAgentsPort, McpOAuthPort, McpServersPort } from './ports';

/** Default binding: the real `/api/mcp/servers` transport. */
export const mcpServersPort: McpServersPort = {
  fetchMcpServers,
  saveMcpServers,
};

/** Default binding: the shared `/api/agents` transport (support banner only). */
export const mcpAgentsPort: McpAgentsPort = {
  fetchAgents: () => fetchAgents(),
};

/**
 * Default binding for the OAuth cluster: the `/api/mcp/oauth/*` transport plus
 * the browser side-effect bridges (callback subscription, status poll, and the
 * authorize-tab opener).
 */
export const mcpOAuthPort: McpOAuthPort = {
  fetchStatus: fetchMcpOAuthStatus,
  start: startMcpOAuth,
  disconnect: disconnectMcpOAuth,
  subscribeCallback: subscribeMcpOAuthCallback,
  subscribeStatusPolling: subscribeMcpOAuthStatusPolling,
  openAuthorizeUrl: openMcpAuthorizeUrl,
};
