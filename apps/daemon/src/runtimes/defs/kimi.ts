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
    buildArgs: (prompt, _imagePaths, _extraAllowedDirs, options = {}) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    streamFormat: 'json-event-stream',
    eventParser: 'kimi',
    // Direct `kimi -p ... --output-format stream-json` mode does not expose
    // the ACP `mcpServers` launch descriptor. Leave runtime MCP fields unset
    // so UI/server capability gates do not advertise per-run MCP injection.
    maxPromptArgBytes: 30_000,
} satisfies RuntimeAgentDef;
