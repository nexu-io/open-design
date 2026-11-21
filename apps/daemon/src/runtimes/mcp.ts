import type { RuntimeAgentDef } from './types.js';

type McpOptions = {
  enabled?: boolean;
  command?: string;
  argsPrefix?: string[];
  // Run-scoped daemon context (OD_DAEMON_URL, OD_TOOL_TOKEN). Carried on the
  // descriptor because the agent may launch the server from a process that
  // does not inherit the agent's own environment (e.g. Hermes' gateway).
  env?: Record<string, string>;
};

export function buildLiveArtifactsMcpServersForAgent(
  def: RuntimeAgentDef,
  { enabled = true, command = 'od', argsPrefix = [], env: runEnv = {} }: McpOptions = {},
) {
  if (!enabled || def?.mcpDiscovery !== 'mature-acp') return [];
  const envMap: Record<string, string> = { ...runEnv, ELECTRON_RUN_AS_NODE: '1' };
  const env = def?.acpMcpEnvFormat === 'map'
    ? envMap
    : Object.entries(envMap).map(([name, value]) => ({ name, value }));
  return [
    {
      name: 'open-design-live-artifacts',
      command,
      args: [...argsPrefix, 'mcp', 'live-artifacts'],
      env,
    },
  ];
}
