import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const mimoAgentDef = {
    id: 'mimo',
    name: 'MiMo Code',
    bin: 'mimo',
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
      { id: 'xiaomi/mimo-v2.5-pro', label: 'mimo-v2.5-pro (Xiaomi · default)' },
      { id: 'xiaomi/mimo-v2.5', label: 'mimo-v2.5 (Xiaomi)' },
      { id: 'xiaomi/mimo-v2-pro', label: 'mimo-v2-pro (Xiaomi)' },
      { id: 'xiaomi/mimo-v2-flash', label: 'mimo-v2-flash (Xiaomi · fast)' },
      { id: 'xiaomi/mimo-v2-omni', label: 'mimo-v2-omni (Xiaomi · multimodal)' },
      { id: 'xiaomi/mimo-v2.5-pro-ultraspeed', label: 'mimo-v2.5-pro-ultraspeed (Xiaomi · speed)' },
    ],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
