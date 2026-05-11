import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const qwenAgentDef = {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
      { id: 'qwen3-coder-flash', label: 'qwen3-coder-flash' },
    ],
    // Prompt delivered via stdin (`qwen -`) to avoid Windows
    // `spawn ENAMETOOLONG` for large composed prompts. Qwen Code is a
    // Gemini-CLI fork and supports the same `--yolo` non-interactive mode.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['--yolo'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      args.push('-');
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'plain',
} satisfies RuntimeAgentDef;
