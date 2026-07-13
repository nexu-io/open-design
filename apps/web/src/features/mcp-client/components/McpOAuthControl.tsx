// Wired OAuth control: binds the per-server OAuth hook to its presentational
// view. Thin by design — the state machine lives in `useMcpOAuth`, the markup
// in `McpOAuthControlView`, so each is tested in isolation.
import { useWiredMcpOAuth } from '../hooks/useMcpOAuth.hooks';
import { McpOAuthControlView } from './McpOAuthControlView';

export function McpOAuthControl({ serverId }: { serverId: string }) {
  const controller = useWiredMcpOAuth(serverId);
  return <McpOAuthControlView {...controller} />;
}
