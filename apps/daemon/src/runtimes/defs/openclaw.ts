import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const openclawAgentDef = {
    id: 'openclaw',
    name: 'OpenClaw',
    bin: 'openclaw',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      // MiniMax — OpenClaw's default provider
      { id: 'minimax/MiniMax-M2.7', label: 'MiniMax-M2.7 (default)' },
      { id: 'minimax/MiniMax-M4', label: 'MiniMax-M4' },
      // Anthropic via OpenClaw gateway
      { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      // OpenAI via OpenClaw gateway
      { id: 'openai/gpt-5', label: 'GPT-5' },
      { id: 'openai/gpt-4o', label: 'GPT-4o' },
    ],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
