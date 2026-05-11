import path from 'node:path';
import { DEFAULT_MODEL_OPTION, execAgentFile, parsePiModels } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const piAgentDef = {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    versionArgs: ['--version'],
    // `pi --list-models` prints a TSV table to stderr (not stdout),
    // so we use a custom fetchModels that reads stderr.
    fetchModels: async (resolvedBin, env) => {
      try {
        const { stderr } = await execAgentFile(resolvedBin, ['--list-models'], {
          env,
          timeout: 20_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        const parsed = parsePiModels(stderr);
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
      extraAllowedDirs = [],
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
      // pi supports --append-system-prompt for cwd and extra context.
      // For now we rely on the composed prompt containing the cwd hint
      // (same pattern as other agents) rather than using system-prompt flags.
      //
      // extraAllowedDirs carries skill seed and design-system directories
      // that live outside the project cwd. pi doesn't have an --add-dir
      // sandbox flag (it uses OS cwd), so we use --append-system-prompt to
      // hint that these directories exist. The agent can then use its Read
      // tool to access files inside them. Without this, pi runs inside the
      // project cwd and has no way to discover or reach skill/design-system
      // assets that live elsewhere.
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && path.isAbsolute(d),
      );
      for (const d of dirs) {
        args.push('--append-system-prompt', d);
      }
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
