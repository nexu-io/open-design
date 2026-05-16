import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const hermesAgentDef = {
    id: 'hermes',
    name: 'Hermes',
    bin: 'hermes',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp', '--accept-hooks'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'openai-codex:gpt-5.5', label: 'gpt-5.5 (openai-codex:gpt-5.5)' },
      { id: 'openai-codex:gpt-5.4', label: 'gpt-5.4 (openai-codex:gpt-5.4)' },
      {
        id: 'openai-codex:gpt-5.4-mini',
        label: 'gpt-5.4-mini (openai-codex:gpt-5.4-mini)',
      },
    ],
    buildArgs: () => ['acp', '--accept-hooks'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
} satisfies RuntimeAgentDef;
