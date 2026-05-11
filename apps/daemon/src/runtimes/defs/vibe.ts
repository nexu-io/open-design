import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const vibeAgentDef = {
    id: 'vibe',
    name: 'Mistral Vibe CLI',
    bin: 'vibe-acp',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: [],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => [],
    streamFormat: 'acp-json-rpc',
} satisfies RuntimeAgentDef;
