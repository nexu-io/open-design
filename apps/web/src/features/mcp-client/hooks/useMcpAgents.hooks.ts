// Feature-local hook for the agent-support banner: fetches the installed CLI
// agent list once so the banner can tell the user which agents actually receive
// the configured MCP servers. Transport is injected as the slice port.
import { useEffect, useState } from 'react';
import type { AgentInfo } from '../../../types';
import type { McpAgentsPort } from '../ports';
import { mcpAgentsPort } from '../dependencies';

export function useMcpAgents(port: McpAgentsPort): AgentInfo[] {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await port.fetchAgents();
      if (cancelled) return;
      setAgents(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [port]);

  return agents;
}

/** Wirer: binds the real `/api/agents` provider; swap the port in tests. */
export function useWiredMcpAgents(): AgentInfo[] {
  return useMcpAgents(mcpAgentsPort);
}
