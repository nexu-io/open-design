import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * MiniMax Code (`mcode`) exposes its structured, non-interactive integration
 * through `mcode acp` — an Agent Client Protocol server over stdio.
 *
 * Verified against https://github.com/MiniMax-AI/minimax-code:
 * - Binary: `mcode` (`mcode --version`, `mcode --help`)
 * - ACP: `mcode acp` (documented alongside `mcode` TUI and `mcode exec`)
 * - Auth: `mcode login` / `mcode login --region global`, or BYOK via
 *   `MCODE_PROVIDER_API_KEY` + `mcode provider add`
 * - Install: official installer into `~/.minimax-code`, or
 *   `npm install -g @minimax-ai/code`
 * - ACP initialize advertises `loadSession: true` and accepts stdio/http/sse
 *   MCP servers. Native `session/load` resume is left off until a live
 *   multi-turn OpenDesign session confirms the daemon's reseed path.
 */
export const minimaxCodeAgentDef = {
  id: 'minimax-code',
  name: 'MiniMax Code',
  bin: 'mcode',
  versionArgs: ['--version'],
  fetchModels: async (resolvedBin, env) =>
    detectAcpModels({
      bin: resolvedBin,
      args: ['acp'],
      env,
      timeoutMs: 15_000,
      defaultModelOption: DEFAULT_MODEL_OPTION,
    }),
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: () => ['acp'],
  streamFormat: 'acp-json-rpc',
  mcpDiscovery: 'mature-acp',
  externalMcpInjection: 'acp-merge',
  supportsCustomModel: false,
  installUrl: 'https://github.com/MiniMax-AI/minimax-code',
  docsUrl: 'https://agent.minimax.io/docs/cli/quick-start',
} satisfies RuntimeAgentDef;
