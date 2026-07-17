import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const clineAgentDef = {
  id: 'cline',
  name: 'Cline CLI',
  bin: 'cline',
  versionArgs: ['--version'],
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
  ],
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'none', label: 'None' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'XHigh' },
  ],
  // Cline CLI reads a headless prompt from stdin when no positional prompt is
  // supplied. Keep stdout plain until OD has a Cline-specific event parser.
  buildArgs: (_prompt, _imagePaths, _extraAllowedDirs = [], options = {}, runtimeContext = {}) => {
    const args = ['--auto-approve', 'true'];
    if (runtimeContext.cwd) {
      args.push('--cwd', runtimeContext.cwd);
    }
    if (options.model && options.model !== 'default') {
      args.push('--model', options.model);
    }
    if (options.reasoning && options.reasoning !== 'default') {
      args.push('--thinking', options.reasoning);
    }
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'plain',
  installUrl: 'https://docs.cline.bot/getting-started/installing-cline',
  docsUrl: 'https://docs.cline.bot/usage/cli-overview',
} satisfies RuntimeAgentDef;
