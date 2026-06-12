import { DEFAULT_MODEL_OPTION } from './shared.js';
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
    buildArgs: (prompt, _imagePaths, _extraAllowedDirs = [], options = {}) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    // Kimi's prompt mode requires the full composed prompt as `-p <prompt>`.
    // Keep this under Windows' ~32 KB CreateProcess command-line ceiling so
    // /api/chat can fail fast with AGENT_PROMPT_TOO_LARGE instead of letting
    // spawn surface ENAMETOOLONG / E2BIG.
    maxPromptArgBytes: 30_000,
    streamFormat: 'json-event-stream',
    eventParser: 'kimi',
} satisfies RuntimeAgentDef;
