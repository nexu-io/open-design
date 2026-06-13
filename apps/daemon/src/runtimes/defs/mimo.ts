import { DEFAULT_MODEL_OPTION, parseLineSeparatedModels } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const mimoAgentDef = {
    id: 'mimo',
    name: 'MiMo Code',
    bin: 'mimo',
    versionArgs: ['--version'],
    // `mimo models` prints `provider/model` per line, same shape as
    // OpenCode. 15s matches the listModels budget the rest of the agent
    // defs use.
    listModels: {
      args: ['models'],
      parse: parseLineSeparatedModels,
      timeoutMs: 15_000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'mimo/mimo-auto', label: 'mimo/mimo-auto' },
      { id: 'xiaomi/mimo-v2.5-pro', label: 'xiaomi/mimo-v2.5-pro' },
      { id: 'xiaomi/mimo-v2.5', label: 'xiaomi/mimo-v2.5' },
      { id: 'xiaomi/mimo-v2-pro', label: 'xiaomi/mimo-v2-pro' },
      { id: 'xiaomi/mimo-v2-flash', label: 'xiaomi/mimo-v2-flash' },
    ],
    // Mimo is an OpenCode fork — same `run --format json` stdin-prompt
    // shape and structured JSON event stream.
    //
    // Mimo's internal default model (`mimo/mimo-v2.5-pro`) does not match
    // the real provider prefix (`xiaomi/mimo-v2.5-pro`), so running without
    // `-m` can fail with "Model not found". Always pass an explicit model;
    // when the user picks the synthetic 'default', fall back to
    // `mimo/mimo-auto` (the auto-routing model that always exists).
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = [
        'run',
        '--format',
        'json',
      ];
      const model = options.model && options.model !== 'default'
        ? options.model
        : 'mimo/mimo-auto';
      args.push('-m', model);
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'opencode',
    externalMcpInjection: 'opencode-env-content',
} satisfies RuntimeAgentDef;
