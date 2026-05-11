import { DEFAULT_MODEL_OPTION, parseLineSeparatedModels } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const opencodeAgentDef = {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode-cli',
    fallbackBins: ['opencode'],
    versionArgs: ['--version'],
    // `opencode models` prints `provider/model` per line.
    listModels: {
      args: ['models'],
      parse: parseLineSeparatedModels,
      timeoutMs: 8000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'anthropic/claude-sonnet-4-5',
      },
      { id: 'openai/gpt-5', label: 'openai/gpt-5' },
      { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
    ],
    // Prompt delivered via stdin (`opencode run -`) to avoid Windows
    // `spawn ENAMETOOLONG` while preserving OpenCode's structured stream.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = [
        'run',
        '--format',
        'json',
        '--dangerously-skip-permissions',
      ];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      args.push('-');
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'opencode',
} satisfies RuntimeAgentDef;
