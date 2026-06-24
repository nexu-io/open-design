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
    // Kimi's prompt mode requires the full composed prompt as `-p <prompt>`
    // and does not accept a stdin sentinel or prompt-file flag, so the prompt
    // has to travel as a single argv argument. Keep the Windows budget under
    // CreateProcess' ~32 KB ceiling; on POSIX the per-arg ceiling is far higher
    // (Linux MAX_ARG_STRLEN ~128 KB; macOS ARG_MAX ≥ 256 KB), so allow larger
    // composed prompts there (issue: default design router exceeds 100 KB).
    maxPromptArgBytes: 30_000,
    maxPromptArgBytesPosix: 120_000,
    streamFormat: 'json-event-stream',
    eventParser: 'kimi',
} satisfies RuntimeAgentDef;
