import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const kiloAgentDef = {
    id: 'kilo',
    name: 'Kilo',
    bin: 'kilo',
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
} satisfies RuntimeAgentDef;
