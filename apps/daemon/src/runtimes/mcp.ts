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
  const wantsMapEnv = def?.acpMcpEnvFormat === 'map';
  const env = wantsMapEnv
    ? { ELECTRON_RUN_AS_NODE: '1' }
    : [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }];
  return [
    {
      name: 'open-design-live-artifacts',
      command,
      args: [...argsPrefix, 'mcp', 'live-artifacts'],
      env,
    },
  ];
}
