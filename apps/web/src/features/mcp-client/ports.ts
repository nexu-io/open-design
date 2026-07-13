// The MCP client slice's dependency on the outside world, expressed as
// interfaces it owns. The slice depends on these ports, never on `providers/`
// directly; a concrete adapter is bound to each in `dependencies.ts`. Tests
// supply hand-written fakes — no global `fetch` mocking, no module-path mocks.
import type {
  McpOAuthStatusResponse,
  McpServersResponse,
} from '@open-design/contracts';
import type { AgentInfo } from '../../types';
import type { McpOAuthCallbackResult, McpOAuthStartResult } from './types';

/** Transport the server list/save cluster needs. */
export interface McpServersPort {
  /** Load saved servers + built-in templates in one round-trip. `null` on a
   * daemon error. */
  fetchMcpServers(): Promise<McpServersResponse | null>;
  /** Replace the whole server list. Returns the re-hydrated list, or `null`. */
  saveMcpServers(servers: McpServersResponse['servers']): Promise<McpServersResponse | null>;
}

/** Transport the agent-support banner needs. */
export interface McpAgentsPort {
  fetchAgents(): Promise<AgentInfo[]>;
}

/**
 * Everything the per-server OAuth control needs: the status/start/disconnect
 * transport plus the three browser side-effects (popup-callback subscription,
 * mid-authorization status poll, opening the authorize tab). The side-effects
 * are provider bridges, so the hook that consumes this port stays DOM-free.
 */
export interface McpOAuthPort {
  fetchStatus(serverId: string): Promise<McpOAuthStatusResponse | null>;
  start(serverId: string): Promise<McpOAuthStartResult>;
  disconnect(serverId: string): Promise<boolean>;
  /** Subscribe to the OAuth callback page's completion signal. Returns unsubscribe. */
  subscribeCallback(
    serverId: string,
    onResult: (result: McpOAuthCallbackResult) => void,
  ): () => void;
  /** Start the mid-authorization status poll timer. Returns unsubscribe. */
  subscribeStatusPolling(onTick: () => void): () => void;
  /** Best-effort open of the provider's authorize page in a new tab. */
  openAuthorizeUrl(url: string): void;
}
