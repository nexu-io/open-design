import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const kimiAgentDef = {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    ],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
    // 0.37.0 replaced the stdio branch of Kimi's `session/new` MCP handler with
    // a throw ("does not declare a runtime identity"), and no entry shape
    // restores it — the code that built stdio servers is gone. Verified against
    // the published tarballs: 0.35.0/0.36.1 accept, 0.37.0/0.37.1/0.37.2/0.38.0
    // reject. Above this version the session sends only http/sse MCP servers.
    acpStdioMcpRemovedInVersion: '0.37.0',
} satisfies RuntimeAgentDef;
