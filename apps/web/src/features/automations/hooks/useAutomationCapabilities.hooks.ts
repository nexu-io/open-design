// Feature-local hook for the automation modal's "@mention" capability data:
// installed plugins and enabled MCP servers, loaded once the modal opens.
import { useEffect, useState } from 'react';
import type { InstalledPluginRecord, McpServerConfig } from '@open-design/contracts';

import type { AutomationCapabilitiesPort } from '../ports';
import { automationCapabilitiesPort } from '../dependencies';

export interface AutomationCapabilitiesController {
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
}

export function useAutomationCapabilities(
  port: AutomationCapabilitiesPort,
  open: boolean,
): AutomationCapabilitiesController {
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    void (async () => {
      const [pluginResult, mcpResult] = await Promise.allSettled([
        port.listPlugins(),
        port.fetchMcpServers(),
      ]);
      if (canceled) return;
      setPlugins(pluginResult.status === 'fulfilled' ? (pluginResult.value ?? []) : []);
      setMcpServers(
        mcpResult.status === 'fulfilled'
          ? (mcpResult.value?.servers ?? []).filter((server) => server.enabled)
          : [],
      );
    })();
    return () => {
      canceled = true;
    };
  }, [open, port]);

  return { plugins, mcpServers };
}

export function useWiredAutomationCapabilities(open: boolean): AutomationCapabilitiesController {
  return useAutomationCapabilities(automationCapabilitiesPort, open);
}
