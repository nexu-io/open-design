import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const kimchiAgentDef = {
    id: 'kimchi',
    name: 'Kimchi CLI',
    bin: 'kimchi',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['--mode', 'acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // The ACP handshake enumerates whatever providers the user configured
    // (the kimchi-dev gateway, openai-codex, ollama, ...). These hints only
    // surface when detection cannot reach the CLI — e.g. kimchi is not on
    // PATH yet — and double as picker discovery for what becomes available
    // after login.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimchi-dev/glm-5.3', label: 'kimchi-dev/glm-5.3' },
      { id: 'kimchi-dev/kimi-k3', label: 'kimchi-dev/kimi-k3' },
      {
        id: 'kimchi-dev/anthropic/claude-sonnet-5',
        label: 'kimchi-dev/anthropic/claude-sonnet-5',
      },
      { id: 'kimchi-dev/deepseek-v4.1-flash', label: 'kimchi-dev/deepseek-v4.1-flash' },
      { id: 'kimchi-dev/minimax-m3', label: 'kimchi-dev/minimax-m3' },
    ],
    // ACP is selected through the global `--mode` flag (`--mode acp`), not an
    // `acp` subcommand like kimi/devin/hermes. Verified against kimchi 1.1.33.
    buildArgs: () => ['--mode', 'acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
