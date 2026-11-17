import { DEFAULT_MODEL_OPTION, execAgentFile, parsePiModels } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const piAgentDef = {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    versionArgs: ['--version'],
    // On Windows, pi cold-starts in ~5s solo and 11–15s+ under parallel agent
    // detection load (Windows Defender scans its 593-file node_modules tree on
    // every spawn). The default 3s version-probe timeout is too tight; raise it
    // so detection doesn't silently abort before reaching fetchModels.
    versionProbeTimeoutMs: 15_000,
    // `pi --list-models` prints its TSV table to stdout.
    fetchModels: async (resolvedBin, env) => {
      try {
        const { stdout } = await execAgentFile(resolvedBin, ['--list-models'], {
          env,
          timeout: 60_000, // Windows: 20s exceeded under parallel detection load
          maxBuffer: 8 * 1024 * 1024,
        });
        const parsed = parsePiModels(stdout);
        if (!parsed || parsed.length === 0) return null;
        return parsed;
      } catch {
        return null;
      }
    },
    // Fallback models — the most commonly used providers/models when
    // `pi --list-models` fails or times out.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5 (anthropic)',
      },
      { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5 (anthropic)' },
      { id: 'openai/gpt-5', label: 'GPT-5 (openai)' },
      { id: 'openai/o4-mini', label: 'o4-mini (openai)' },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (google)' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (google)' },
    ],
    // Thinking level presets mapped to pi's --thinking flag.
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'off', label: 'Off' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'XHigh' },
    ],
    // pi's RPC mode drives the entire conversation over stdio JSON-RPC.
    // The daemon sends a `prompt` command and pi streams back typed events.
    // No prompt in argv — avoids ENAMETOOLONG and keeps the protocol clean.
    buildArgs: (
      _prompt,
      _imagePaths,
      _extraAllowedDirs = [],
      options = {},
      runtimeContext = {},
    ) => {
      const args = ['--mode', 'rpc'];
      if (options.model && options.model !== 'default') {
        // pi --model accepts patterns ("sonnet", "anthropic/claude-sonnet-4-5",
        // "openai/gpt-5:high") so we pass the value through as-is.
        args.push('--model', options.model);
      }
      if (options.reasoning && options.reasoning !== 'default') {
        args.push('--thinking', options.reasoning);
      }
      // Pi has no directory-authorization flag. Resource paths are supplied
      // in the composed RPC prompt; --append-system-prompt expects text or a
      // file, so passing resource directories there causes EISDIR warnings.
      return args;
    },
    // Prompt is sent via RPC `prompt` command on stdin, not as a CLI arg.
    promptViaStdin: true,
    streamFormat: 'pi-rpc',
    // pi's RPC `prompt` command supports an `images` field for multimodal
    // input (base64-encoded). The daemon attaches image paths to the
    // session so attachPiRpcSession can read and forward them.
    supportsImagePaths: true,
} satisfies RuntimeAgentDef;
