import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const geminiAgentDef = {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      // Gemini 3 (May 2026): top-tier reasoning + fast frontier-class.
      // Both currently ship as previews via the Gemini CLI. Issue #981.
      { id: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
      { id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      // Cheapest 2.5 multimodal variant; useful for high-volume / low-latency work.
      { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
    ],
    // Gemini reads from stdin when `-p` is omitted and stdin is a pipe.
    // Passing the full composed prompt as a CLI arg causes ENAMETOOLONG on
    // Windows (CreateProcess limit ~32 KB) for any non-trivial prompt.
    // `--yolo` skips interactive approval prompts in the no-TTY web UI.
    // Workspace trust is provided via `GEMINI_CLI_TRUST_WORKSPACE` below
    // instead of `--skip-trust`; several Gemini CLI builds hide or reject the
    // flag even though they accept the documented environment variable.
    env: { GEMINI_CLI_TRUST_WORKSPACE: 'true' },
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['--output-format', 'stream-json', '--yolo'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'gemini',
} satisfies RuntimeAgentDef;
