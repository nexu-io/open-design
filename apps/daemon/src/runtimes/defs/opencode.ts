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
    // Prompt delivered via stdin (`opencode run` with no message argv) to
    // avoid Windows `spawn ENAMETOOLONG` while preserving OpenCode's
    // structured stream. A literal `-` is parsed as a positional message by
    // OpenCode 1.14.x and can surface as "Session not found".
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = [
        'run',
        '--format',
        'json',
      ];
      if (options.model && options.model !== 'default') {
        args.push('-m', options.model);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'opencode',
    // OpenCode reads MCP servers from its layered config (global ~/.config
    // /opencode/opencode.json + project opencode.json + OPENCODE_CONFIG
    // + OPENCODE_CONFIG_CONTENT). The env-var form lets the daemon hand
    // user-configured external MCP servers to a single `opencode run`
    // invocation without polluting the user's saved config files. See
    // <https://opencode.ai/docs/config> and issue #2142.
    externalMcpInjection: 'opencode-env-content',
} satisfies RuntimeAgentDef;
