import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const kimiAgentDef = {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // Chat runs now require `kimi acp`; do not advertise an install that only
    // proves `kimi --version` works.
    requiresModelProbe: true,
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    ],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
