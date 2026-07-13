// Compact two-line banner showing which installed CLI agents receive the user's
// external MCP servers at spawn time and which do not. The truth source is the
// daemon `/api/agents` payload; the partitioning is the pure
// `partitionMcpAgentSupport` rule, so this component just renders names.
//
// Replaces the previous silent-failure UX from issue #2142: users configuring
// servers under OpenCode / Codex / Gemini never learned the daemon never
// forwarded them to the agent process.
import type { AgentInfo } from '../../../types';
import { useT } from '../../../i18n';
import { partitionMcpAgentSupport } from '../rules';

/** ACP adapters (Hermes / Kimi / Kilo / Kiro / Vibe / Devin) accept stdio MCP
 * servers only — `buildAcpMcpServers()` in `apps/daemon/src/mcp-config.ts`
 * filters to `transport === 'stdio'` because the ACP `mcpServers` descriptor has
 * no slot for HTTP / SSE entries. Tag those runtimes inline so the banner does
 * not silently claim full forwarding for HTTP MCP servers. */
function renderNames(list: AgentInfo[]): string {
  return list
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) =>
      a.externalMcpInjection === 'acp-merge' ? `${a.name} (stdio only)` : a.name,
    )
    .join(' · ');
}

export function McpAgentSupportBanner({ agents }: { agents: AgentInfo[] }) {
  const t = useT();
  // Empty payload = either still loading or daemon unreachable. Either way,
  // render nothing — the error banner already covers the "daemon unreachable"
  // path and we don't want to flash an empty hint during the initial fetch.
  if (agents.length === 0) return null;
  const { supported, unsupported, hasAcpSupported } = partitionMcpAgentSupport(agents);
  if (supported.length === 0 && unsupported.length === 0) return null;
  return (
    <div className="mcp-agent-support">
      {supported.length > 0 ? (
        <p className="hint mcp-agent-support-line">
          <strong>{t('mcpClient.forwardedToLabel')}</strong> {renderNames(supported)}.
          {hasAcpSupported ? <> {t('mcpClient.forwardedAcpNote')}</> : null}
        </p>
      ) : null}
      {unsupported.length > 0 ? (
        <p className="hint mcp-agent-support-line mcp-agent-support-unsupported">
          <strong>{t('mcpClient.notForwardedToLabel')}</strong> {renderNames(unsupported)}. {t('mcpClient.notForwardedNote')}
        </p>
      ) : null}
    </div>
  );
}
