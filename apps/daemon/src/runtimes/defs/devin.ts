import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const devinAgentDef = {
    id: 'devin',
    name: 'Devin for Terminal',
    bin: 'devin',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: [
          '--permission-mode',
          'dangerous',
          '--respect-workspace-trust',
          'false',
          'acp',
        ],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // Fallback aliases from Devin for Terminal docs
    // (https://cli.devin.ai/docs/models): `adaptive` appears in the config example;
    // `opus`, `sonnet`, `swe`, `codex`, `gemini`, and `gpt` are documented
    // as short model-family names / recommended picks.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'adaptive', label: 'adaptive' },
      { id: 'swe', label: 'swe' },
      { id: 'opus', label: 'opus' },
      { id: 'sonnet', label: 'sonnet' },
      { id: 'codex', label: 'codex' },
      { id: 'gpt', label: 'gpt' },
      { id: 'gemini', label: 'gemini' },
    ],
    buildArgs: () => [
      '--permission-mode',
      'dangerous',
      '--respect-workspace-trust',
      'false',
      'acp',
    ],
    streamFormat: 'acp-json-rpc',
} satisfies RuntimeAgentDef;
