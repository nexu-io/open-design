import { DEFAULT_MODEL_OPTION } from './shared.js';
import { loadQwenSettingsModels } from '../qwen-settings.js';
import type { RuntimeAgentDef } from '../types.js';

// Static safety net only. Qwen Code has no `--list-models`, so the live list
// comes from the CLI's own `~/.qwen/settings.json` via `fetchModels` below;
// these are used when that file is absent or unreadable.
const QWEN_FALLBACK_MODELS = [
  DEFAULT_MODEL_OPTION,
  { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
  { id: 'qwen3-coder-flash', label: 'qwen3-coder-flash' },
];

export const qwenAgentDef = {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    fallbackModels: QWEN_FALLBACK_MODELS,
    // Surface the models the user already configured in Qwen Code itself,
    // instead of pinning the picker to the two hardcoded coder ids.
    fetchModels: async (_resolvedBin, env) => loadQwenSettingsModels(env, QWEN_FALLBACK_MODELS),
    // Prompt delivered via stdin (gated by `promptViaStdin: true`) to avoid Windows
    // `spawn ENAMETOOLONG` for large composed prompts. Qwen Code is a
    // Gemini-CLI fork and supports the same `--yolo` non-interactive mode.
    // Qwen Code reads from piped stdin when no positional prompt is supplied.
    // Current Qwen treats/rejects a bare `-` rather than needing it as a stdin sentinel.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['--yolo'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
   
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'plain',
} satisfies RuntimeAgentDef;
