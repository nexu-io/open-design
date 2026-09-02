import path from 'node:path';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const ompAgentDef = {
    id: 'omp',
    name: 'OMP',
    bin: 'omp',
    versionArgs: ['--version'],
    // omp loads user extensions and probes local providers at startup, which
    // can push cold starts past the default version-probe timeout.
    versionProbeTimeoutMs: 15_000,
    // omp does not expose pi's `--list-models` TSV (`omp models` prints a
    // box-drawing table this daemon does not parse), so the picker falls back
    // to these hints. omp fuzzy-matches whatever `--model` value it receives.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5 (anthropic)',
      },
      { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5 (anthropic)' },
      { id: 'openai/gpt-5', label: 'GPT-5 (openai)' },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (google)' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (google)' },
    ],
    // Thinking level presets mapped to omp's --thinking flag. omp accepts a
    // superset of pi's levels, including 'max'.
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'off', label: 'Off' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'XHigh' },
      { id: 'max', label: 'Max' },
    ],
    // omp's RPC mode is wire-compatible with pi's (verified against
    // `omp --mode rpc`: `ready` frame, id-echoed `response` acks for
    // `new_session`/`prompt`, identical agent event vocabulary, and the same
    // extension_ui_request methods the pi-rpc engine auto-resolves), so the
    // shared pi-rpc engine drives the whole conversation over stdio JSON-RPC.
    // No prompt in argv — avoids ENAMETOOLONG and keeps the protocol clean.
    buildArgs: (
      _prompt,
      _imagePaths,
      extraAllowedDirs = [],
      options = {},
      runtimeContext = {},
    ) => {
      const args = ['--mode', 'rpc'];
      if (options.model && options.model !== 'default') {
        // omp --model fuzzy-matches patterns ("opus", "gpt-5.2",
        // "openai/gpt-5.2"), so pass the selected value through as-is.
        args.push('--model', options.model);
      }
      if (options.reasoning && options.reasoning !== 'default') {
        args.push('--thinking', options.reasoning);
      }
      // Unlike pi, omp has a native repeatable --add-dir for extra
      // skill/design-system roots outside the project cwd.
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && path.isAbsolute(d),
      );
      for (const d of dirs) {
        args.push('--add-dir', d);
      }
      // omp defaults sessions to its profile directory; redirect them to the
      // project cwd path the pi-rpc session-capture scan reads so
      // conversational resume works unchanged. omp writes a flat
      // <uuid>.jsonl there (plus a sibling per-session directory for advisor
      // transcripts that the scan's file filter ignores).
      if (runtimeContext.cwd) {
        args.push('--session-dir', path.join(runtimeContext.cwd, '.pi', 'sessions'));
      }
      return args;
    },
    // Prompt is sent via RPC `prompt` command on stdin, not as a CLI arg.
    promptViaStdin: true,
    streamFormat: 'pi-rpc',
    // The RPC `prompt` command supports an `images` field for multimodal
    // input (base64-encoded); omp inherits the same command shape.
    supportsImagePaths: true,
} satisfies RuntimeAgentDef;
