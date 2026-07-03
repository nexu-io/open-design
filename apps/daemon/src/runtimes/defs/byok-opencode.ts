import { opencodeByokModelId } from '../byok-opencode.js';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const byokOpenCodeAgentDef = {
  id: 'byok-opencode',
  name: 'BYOK OpenCode',
  bin: 'opencode-cli',
  fallbackBins: ['opencode'],
  versionArgs: ['--version'],
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
    const args = ['run', '--format', 'json'];
    const model = opencodeByokModelId(options.model);
    if (model) args.push('-m', model);
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'json-event-stream',
  eventParser: 'opencode',
  externalMcpInjection: 'opencode-env-content',
  supportsCustomModel: true,
} satisfies RuntimeAgentDef;
