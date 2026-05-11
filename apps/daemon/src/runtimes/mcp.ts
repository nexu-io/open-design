import type { RuntimeAgentDef } from './types.js';

type McpOptions = {
  enabled?: boolean;
  command?: string;
  argsPrefix?: string[];
};

export function buildLiveArtifactsMcpServersForAgent(
  def: RuntimeAgentDef,
  { enabled = true, command = 'od', argsPrefix = [] }: McpOptions = {},
) {
  if (!enabled || def?.mcpDiscovery !== 'mature-acp') return [];
  return [
    {
      name: 'open-design-live-artifacts',
      command,
      args: [...argsPrefix, 'mcp', 'live-artifacts'],
      env: [],
    },
  ];
}
