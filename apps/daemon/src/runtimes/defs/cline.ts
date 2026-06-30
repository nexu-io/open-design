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
    // Cline CLI v3.0.34 exposes a headless positional-prompt mode:
    // `cline [prompt] --auto-approve true --cwd <dir>`. It also has `--json`,
    // but OD does not yet have a Cline-specific event parser, so start with
    // plain stdout and avoid pretending tool events are structured.
    buildArgs: (prompt, _imagePaths, _extraAllowedDirs = [], options = {}, runtimeContext = {}) => {
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
      args.push(prompt);
      return args;
    },
    maxPromptArgBytes: 30_000,
    streamFormat: 'plain',
} satisfies RuntimeAgentDef;
