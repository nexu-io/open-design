import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// MiniMax Code ships the `mcode` CLI. `mcode acp` runs an ACP server over
// stdio: `session/new` returns the model list as a `configOptions` entry with
// category "model" (values like `m:minimax:MiniMax-M3:v:thinking`), and the
// session accepts stdio, http and sse MCP servers.
export const minimaxAgentDef = {
  id: 'minimax',
  name: 'MiniMax Code',
  bin: 'mcode',
  versionArgs: ['--version'],
  fallbackModels: [DEFAULT_MODEL_OPTION],
  fetchModels: async (resolvedBin, env) =>
    detectAcpModels({
      bin: resolvedBin,
      args: ['acp'],
      env,
      // mcode boots its agent before answering session/new; a cold start
      // measured about 9 s locally and passed 15 s under the daemon.
      timeoutMs: 45_000,
      defaultModelOption: DEFAULT_MODEL_OPTION,
    }),
  buildArgs: () => ['acp'],
  streamFormat: 'acp-json-rpc',
  mcpDiscovery: 'mature-acp',
  externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
