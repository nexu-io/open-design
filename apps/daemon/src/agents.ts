// @ts-nocheck
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';
import { homedir } from 'node:os';
import { detectAcpModels } from './acp.js';
import { parsePiModels } from './pi-rpc.js';

const execFileP = promisify(execFile);

// Capability flags detected at probe time (per agent id). buildArgs consults
// this map so we only pass flags the installed CLI actually advertises in
// `--help`. Falls back to "off" when probing failed or hasn't run yet — that
// keeps the spawn safe across older Claude Code releases that pre-date a
// given flag (e.g. `--include-partial-messages`, added in 1.0.86).
const agentCapabilities = new Map();

// Per-agent model picker.
//
//   - `listModels`         : optional spec for fetching the model list from
//                            the CLI itself ({ args, parse, timeoutMs }).
//                            When defined we run it during agent detection
//                            (best-effort, with a timeout) and use the
//                            result. If the listing fails we fall back to
//                            `fallbackModels` so the UI still has something
//                            to show.
//   - `fallbackModels`     : static hint list. Used as the source of truth
//                            for CLIs that don't expose a listing command
//                            (Claude Code, Codex, Devin for Terminal, Gemini CLI, Qwen Code)
//                            and as the fallback for the others.
//   - `reasoningOptions`   : optional reasoning-effort presets (currently
//                            only Codex exposes this knob).
//   - `buildArgs(prompt, imagePaths, extraAllowedDirs, options, runtimeContext)`
//     returns argv for the child process. `options = { model, reasoning }`
//     carries whatever the user picked in the model menu — agents that don't
//     take a model flag ignore them. `runtimeContext` currently carries
//     runtime execution details like `{ cwd }` for CLIs that need an explicit
//     workspace flag in addition to process cwd.
//
// Every model list is prefixed with a synthetic `'default'` entry meaning
// "let the CLI pick" — the agent runs with no `--model` flag, so the
// user's local CLI config wins.
//
// `extraAllowedDirs` is a list of absolute directories the agent must be
// permitted to read files from (skill seeds, design-system specs) that live
// outside the project cwd. Currently only Claude Code wires this through
// (`--add-dir`); other agents either inherit broader access or run with cwd
// boundaries we can't widen via flags.
//
// `streamFormat` hints to the daemon how to interpret stdout:
//   - 'claude-stream-json' : line-delimited JSON emitted by Claude Code's
//     `--output-format stream-json`. Daemon parses it into typed events
//     (text / thinking / tool_use / tool_result / status) for the UI.
//   - 'acp-json-rpc'       : ACP JSON-RPC over stdio. Daemon drives the
//     initialize/session/new/session/prompt lifecycle and maps updates into
//     typed UI events.
//   - 'plain' (default)    : raw text, forwarded chunk-by-chunk.
//
// Permission posture: the daemon spawns each CLI with cwd pinned to the
// project folder (`.od/projects/<id>/`), and the web app has no terminal
// to surface an interactive approve/deny prompt. So every agent runs with
// its non-interactive/auto-approve switch on — otherwise Write/Edit hangs
// or errors and the model has to hallucinate a permission button the UI
// never shows.
//
// `env` is optional per-agent process environment. Keep it limited to
// documented, non-secret runtime knobs that belong to the adapter contract.

const DEFAULT_MODEL_OPTION = { id: 'default', label: 'Default (CLI config)' };

// Map a user-picked reasoning effort to one the chosen model will accept.
// Codex's CLI accepts `none | minimal | low | medium | high | xhigh`, but
// real models support narrower subsets — gpt-5.2/5.3/5.4/5.5 reject
// `minimal`, gpt-5.1 rejects `xhigh`, gpt-5.1-codex-mini accepts only
// `medium` / `high`.
// An undefined / 'default' modelId is clamped as if it were gpt-5.5,
// since that's codex's current default model. Unknown / future model ids
// pass through unchanged — if the API later rejects, the server error
// is the signal that a new rule belongs here.
function clampCodexReasoning(modelId, effort) {
  if (!effort) return effort;
  const raw = String(modelId ?? '').trim();
  const id = raw.includes('/') ? raw.split('/').pop() : raw;
  const isGpt5LateFamily =
    !id ||
    id === 'default' ||
    id.startsWith('gpt-5.2') ||
    id.startsWith('gpt-5.3') ||
    id.startsWith('gpt-5.4') ||
    id.startsWith('gpt-5.5');
  if (isGpt5LateFamily && effort === 'minimal') return 'low';
  if (id === 'gpt-5.1' && effort === 'xhigh') return 'high';
  if (id === 'gpt-5.1-codex-mini') {
    return effort === 'high' || effort === 'xhigh' ? 'high' : 'medium';
  }
  return effort;
}

// Parse one-id-per-line stdout from `<cli> models` and prepend the synthetic
// default option. Used by opencode / cursor-agent.
function parseLineSeparatedModels(stdout) {
  const ids = String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  // De-dupe while preserving order — some CLIs print near-duplicates.
  const seen = new Set();
  const out = [DEFAULT_MODEL_OPTION];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id });
  }
  return out;
}

export const AGENT_DEFS = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    // Drop-in forks that ship a CLI argv-compatible with `claude`. Tried in
    // order if `claude` itself isn't on PATH, so users on a single-binary
    // install (e.g. only OpenClaude — https://github.com/Gitlawb/openclaude
    // — issue #235) get auto-detected without writing wrapper scripts.
    fallbackBins: ['openclaude'],
    versionArgs: ['--version'],
    helpArgs: ['-p', '--help'],
    capabilityFlags: {
      // Flag string -> capability key. After probing `--help`, we set
      // `agentCapabilities[id][key] = true` for each substring that matches.
      // `--add-dir` and `--include-partial-messages` live under `claude -p`
      // subcommand, so we probe `claude -p --help` instead of `claude --help`.
      // Fixes issue #430: --add-dir never detected because it wasn't in global help.
      '--include-partial-messages': 'partialMessages',
      '--add-dir': 'addDir',
    },
    // `claude` has no list-models subcommand; the CLI accepts both short
    // aliases (sonnet/opus/haiku) and the full ids, so we ship both as
    // hints. Users who want a non-shipped model can paste it via the
    // Settings dialog's custom-model input.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'sonnet', label: 'Sonnet (alias)' },
      { id: 'opus', label: 'Opus (alias)' },
      { id: 'haiku', label: 'Haiku (alias)' },
      { id: 'claude-opus-4-5', label: 'claude-opus-4-5' },
      { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
      { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
    ],
    // Prompt delivered via stdin to avoid both Linux `spawn E2BIG`
    // (MAX_ARG_STRLEN caps a single argv entry at ~128 KB) and Windows
    // `spawn ENAMETOOLONG` (CreateProcess caps the full command line at
    // ~32 KB direct, ~8 KB via .cmd shim). `claude -p` with no positional
    // prompt reads the prompt from stdin under `--input-format text` (the
    // default), which has no length cap. Mirrors the codex/gemini/opencode/
    // cursor/qwen entries below.
    buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], options = {}) => {
      const caps = agentCapabilities.get('claude') || {};
      const args = ['-p', '--output-format', 'stream-json', '--verbose'];
      // `--include-partial-messages` lands richer streaming events but only
      // exists in newer Claude Code builds. Older installs reject it with
      // "unknown option" and exit 1, killing the chat. Gate on the probe.
      if (caps.partialMessages) {
        args.push('--include-partial-messages');
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      // `--add-dir` is older but still gate it for symmetry — old/forked
      // builds may lack it.
      if (dirs.length > 0 && caps.addDir !== false) {
        args.push('--add-dir', ...dirs);
      }
      args.push('--permission-mode', 'bypassPermissions');
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'claude-stream-json',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    versionArgs: ['--version'],
    // Codex doesn't have a `models` subcommand; ship the most common ids
    // as a hint. Users can supply other ids via the custom-model input.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'gpt-5-codex', label: 'gpt-5-codex' },
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'o3', label: 'o3' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
    ],
    // Prompt is delivered via stdin pipe (gated by `promptViaStdin: true`
    // below) to avoid Windows `spawn ENAMETOOLONG` while keeping Codex on
    // its structured JSON stream. Recent Codex CLI versions reject a bare
    // `-` argv sentinel — passing both the pipe and `-` produces
    // `error: unexpected argument '-' found` and the agent exits with
    // code 2 before any prompt is read (see issue #237). The pipe alone
    // is sufficient for stdin delivery.
    buildArgs: (
      _prompt,
      _imagePaths,
      _extra,
      options = {},
      runtimeContext = {},
    ) => {
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        '-c',
        'sandbox_workspace_write.network_access=true',
      ];
      if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
        args.push('--disable', 'plugins');
      }
      if (runtimeContext.cwd) {
        args.push('-C', runtimeContext.cwd);
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      if (options.reasoning && options.reasoning !== 'default') {
        const effort = clampCodexReasoning(options.model, options.reasoning);
        // Codex accepts `-c key=value` config overrides; reasoning effort
        // is exposed as `model_reasoning_effort`.
        args.push('-c', `model_reasoning_effort="${effort}"`);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'codex',
  },
  {
    id: 'devin',
    name: 'Devin for Terminal',
    bin: 'devin',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: [
          '--permission-mode',
          'dangerous',
          '--respect-workspace-trust',
          'false',
          'acp',
        ],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // Fallback aliases from Devin for Terminal docs
    // (https://cli.devin.ai/docs/models): `adaptive` appears in the config example;
    // `opus`, `sonnet`, `swe`, `codex`, `gemini`, and `gpt` are documented
    // as short model-family names / recommended picks.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'adaptive', label: 'adaptive' },
      { id: 'swe', label: 'swe' },
      { id: 'opus', label: 'opus' },
      { id: 'sonnet', label: 'sonnet' },
      { id: 'codex', label: 'codex' },
      { id: 'gpt', label: 'gpt' },
      { id: 'gemini', label: 'gemini' },
    ],
    buildArgs: () => [
      '--permission-mode',
      'dangerous',
      '--respect-workspace-trust',
      'false',
      'acp',
    ],
    streamFormat: 'acp-json-rpc',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
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
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
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
  },
  {
    id: 'hermes',
    name: 'Hermes',
    bin: 'hermes',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp', '--accept-hooks'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'openai-codex:gpt-5.5', label: 'gpt-5.5 (openai-codex:gpt-5.5)' },
      { id: 'openai-codex:gpt-5.4', label: 'gpt-5.4 (openai-codex:gpt-5.4)' },
      {
        id: 'openai-codex:gpt-5.4-mini',
        label: 'gpt-5.4-mini (openai-codex:gpt-5.4-mini)',
      },
    ],
    buildArgs: () => ['acp', '--accept-hooks'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    ],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
  },
  {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    bin: 'cursor-agent',
    versionArgs: ['--version'],
    // `cursor-agent models` prints account-bound model ids per line. When
    // the user isn't authed it prints "No models available for this
    // account." — that's not a model list, so we detect it and fall back.
    listModels: {
      args: ['models'],
      timeoutMs: 5000,
      parse: (stdout) => {
        const trimmed = String(stdout || '').trim();
        if (!trimmed || /no models available/i.test(trimmed)) return null;
        return parseLineSeparatedModels(trimmed);
      },
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'auto', label: 'auto' },
      { id: 'sonnet-4', label: 'sonnet-4' },
      { id: 'sonnet-4-thinking', label: 'sonnet-4-thinking' },
      { id: 'gpt-5', label: 'gpt-5' },
    ],
    // Cursor Agent does not use `-` as a "read prompt from stdin" sentinel.
    // Passing it makes the CLI treat the dash as the literal user prompt,
    // which then surfaces as "your message only contains '-'". Keep stdin
    // piped for prompt delivery, but do not append a fake prompt arg.
    buildArgs: (
      _prompt,
      _imagePaths,
      _extra,
      options = {},
      runtimeContext = {},
    ) => {
      const args = [];
      args.push(
        '--print',
        '--output-format',
        'stream-json',
        '--stream-partial-output',
        '--force',
        '--trust',
      );
      if (runtimeContext.cwd) {
        args.push('--workspace', runtimeContext.cwd);
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'cursor-agent',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
      { id: 'qwen3-coder-flash', label: 'qwen3-coder-flash' },
    ],
    // Prompt delivered via stdin (`qwen -`) to avoid Windows
    // `spawn ENAMETOOLONG` for large composed prompts. Qwen Code is a
    // Gemini-CLI fork and supports the same `--yolo` non-interactive mode.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['--yolo'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      args.push('-');
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'plain',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    bin: 'copilot',
    versionArgs: ['--version'],
    // The prompt is passed directly as the value of `-p`: `copilot -p
    // "<prompt>" --allow-all-tools --output-format json`. Copilot does NOT
    // treat `-` as a stdin sentinel — it reads it as a literal one-character
    // prompt string — so the previous `-p -` + stdin pattern produced a
    // nonsensical single-dash prompt instead of the composed prompt body.
    //
    // `--allow-all-tools` is required for non-interactive runs: without it
    // the CLI blocks waiting for human approval on every tool call. Unlike
    // Codex (where `exec` is a dedicated headless subcommand with
    // auto-approve baked in) or Claude Code (which inherits its permission
    // policy from the user's settings.json), Copilot's `-p` mode always
    // prompts unless this flag is passed explicitly.
    //
    // `--output-format json` produces JSONL that copilot-stream.js parses
    // into the same typed events as claude-stream.js.
    //
    // `--add-dir` (repeatable, same flag as Claude Code's) widens Copilot's
    // path-level sandbox to skill seeds + design-system specs outside the
    // project cwd.
    //
    // No `models` subcommand; the CLI accepts whatever the user's Copilot
    // subscription exposes. Ship a small evidence-based hint list — the
    // default we observed in the JSON stream and the example from
    // `copilot --help`. Users can paste any other id via Settings.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
    ],
    buildArgs: (prompt, _imagePaths, extraAllowedDirs = [], options = {}) => {
      const args = [
        '-p',
        prompt,
        '--allow-all-tools',
        '--output-format',
        'json',
      ];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      for (const d of dirs) args.push('--add-dir', d);
      return args;
    },
    promptViaStdin: false,
    streamFormat: 'copilot-stream-json',
  },
  {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    versionArgs: ['--version'],
    // `pi --list-models` prints a TSV table to stderr (not stdout),
    // so we use a custom fetchModels that reads stderr.
    fetchModels: async (resolvedBin, env) => {
      try {
        const { stderr } = await execFileP(resolvedBin, ['--list-models'], {
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
      _extra,
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
      return args;
    },
    // Prompt is sent via RPC `prompt` command on stdin, not as a CLI arg.
    promptViaStdin: true,
    streamFormat: 'pi-rpc',
  },
  {
    id: 'kiro',
    name: 'Kiro CLI',
    bin: 'kiro-cli',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
  },
  {
    id: 'kilo',
    name: 'Kilo',
    bin: 'kilo',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
  },
  {
    id: 'vibe',
    name: 'Mistral Vibe CLI',
    bin: 'vibe-acp',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: [],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => [],
    streamFormat: 'acp-json-rpc',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek TUI',
    // The `deepseek` dispatcher owns the `exec` / `--auto` subcommands and
    // delegates to a sibling `deepseek-tui` runtime binary at exec time.
    // Upstream documents both binaries as required (npm and cargo paths
    // install them together), so a host with only `deepseek-tui` on PATH
    // isn't a supported install — and `deepseek-tui` itself doesn't accept
    // the argv shape `buildArgs` produces (`exec --auto <prompt>`). We only
    // probe the dispatcher; advertising availability via a `deepseek-tui`
    // fallback would surface the agent as runnable but make `/api/chat`
    // exit immediately on the first prompt.
    bin: 'deepseek',
    versionArgs: ['--version'],
    // No `models` subcommand that prints a clean id-per-line list; the
    // canonical model ids for DeepSeek V4 are documented in the README,
    // and the CLI accepts arbitrary provider/model strings via `--model`,
    // so users can paste anything else through the custom-model input.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    ],
    // DeepSeek's exec mode requires the prompt as a positional argument
    // (no `-` stdin sentinel; `prompt: String` is a required clap field).
    // `--auto` enables agentic mode with auto-approval — the daemon runs
    // every CLI without a TTY, so the interactive approval prompt would
    // hang the run. Streaming is plain text on stdout (tool calls go to
    // stderr); skipping `--json` keeps deltas streaming live instead of
    // batched into one trailing summary object at end-of-turn.
    buildArgs: (prompt, _imagePaths, _extra, options = {}) => {
      const args = ['exec', '--auto'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      args.push(prompt);
      return args;
    },
    // Guard against prompts that would blow Windows' ~32 KB CreateProcess
    // limit (or Linux MAX_ARG_STRLEN on extreme edges) before spawn. Every
    // other argv-sensitive adapter sets `promptViaStdin: true` to dodge
    // this; DeepSeek's CLI doesn't accept `-` as a stdin sentinel yet, so
    // we have to ship the prompt as argv. The /api/chat spawn path checks
    // this byte budget against the composed prompt and emits an actionable
    // SSE error ("reduce skills/design-system context, or use an adapter
    // with stdin support") instead of letting the spawn fail with a
    // generic ENAMETOOLONG/E2BIG message. 30_000 bytes leaves ~2.7 KB of
    // argv headroom under the Windows command-line limit for `exec
    // --auto --model <id>` and any internal quoting.
    maxPromptArgBytes: 30_000,
    streamFormat: 'plain',
  },
];

function existingDirsUnder(root, segments = []) {
  const dirs = [];
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name, ...segments);
    if (existsSync(full)) dirs.push(full);
  }
  return dirs;
}

const TOOLCHAIN_DIR_CACHE_TTL_MS = 5000;
let cachedToolchainHome = null;
let cachedToolchainDirs = null;
let cachedToolchainDirsAt = 0;

function userToolchainDirs() {
  const homeOverride = process.env.OD_AGENT_HOME;
  const home = homeOverride || homedir();
  const now = Date.now();
  if (
    cachedToolchainHome === home &&
    cachedToolchainDirs &&
    now - cachedToolchainDirsAt < TOOLCHAIN_DIR_CACHE_TTL_MS
  ) {
    return cachedToolchainDirs;
  }
  cachedToolchainHome = home;
  cachedToolchainDirsAt = now;
  cachedToolchainDirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.opencode', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.asdf', 'shims'),
    path.join(home, 'Library', 'pnpm'),
    path.join(home, '.cargo', 'bin'),
    ...(process.platform !== 'win32' && !homeOverride
      ? ['/opt/homebrew/bin', '/usr/local/bin']
      : []),
    ...existingDirsUnder(
      path.join(home, '.local', 'share', 'mise', 'installs', 'node'),
      ['bin'],
    ),
    ...existingDirsUnder(path.join(home, '.nvm', 'versions', 'node'), ['bin']),
    ...existingDirsUnder(
      path.join(home, '.local', 'share', 'fnm', 'node-versions'),
      ['installation', 'bin'],
    ),
  ];
  return cachedToolchainDirs;
}

function resolvePathDirs() {
  const seen = new Set();
  const dirs = [
    ...(process.env.PATH || '').split(delimiter),
    // GUI launchers (macOS .app bundles, Linux .desktop files) often start
    // with a minimal PATH. Include common user-level CLI install locations
    // so agent detection matches the user's shell-installed tools,
    // especially Node version managers.
    ...userToolchainDirs(),
  ];
  return dirs.filter((dir) => {
    if (!dir || seen.has(dir)) return false;
    seen.add(dir);
    return true;
  });
}

export function resolveOnPath(bin) {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  const dirs = resolvePathDirs();
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      if (full && existsSync(full)) return full;
    }
  }
  return null;
}

// Resolve the first available binary for an agent definition. Tries
// `def.bin` first, then walks `def.fallbackBins` in order. Used for
// agents whose forks ship under a different binary name but speak the
// exact same CLI (Claude Code → OpenClaude, issue #235). Returns null
// when no candidate is on PATH.
export function resolveAgentExecutable(def) {
  if (!def?.bin) return null;
  const candidates = [
    def.bin,
    ...(Array.isArray(def.fallbackBins) ? def.fallbackBins : []),
  ];
  for (const bin of candidates) {
    const resolved = resolveOnPath(bin);
    if (resolved) return resolved;
  }
  return null;
}

async function fetchModels(def, resolvedBin, env) {
  if (typeof def.fetchModels === 'function') {
    try {
      const parsed = await def.fetchModels(resolvedBin, env);
      if (!parsed || parsed.length === 0) return def.fallbackModels;
      return parsed;
    } catch {
      return def.fallbackModels;
    }
  }
  if (!def.listModels) return def.fallbackModels;
  try {
    const { stdout } = await execFileP(resolvedBin, def.listModels.args, {
      env,
      timeout: def.listModels.timeoutMs ?? 5000,
      // Models lists from popular CLIs (e.g. opencode) easily exceed the
      // default 1MB buffer once you include every openrouter model. Bump
      // it so we don't truncate the listing.
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = def.listModels.parse(stdout);
    // Empty / null parse result means the CLI didn't actually return a
    // usable list (e.g. cursor-agent's "No models available"); fall back
    // to the static hint so the picker isn't stuck on Default-only.
    if (!parsed || parsed.length === 0) return def.fallbackModels;
    return parsed;
  } catch {
    return def.fallbackModels;
  }
}

async function probe(def, configuredEnv = {}) {
  const resolved = resolveAgentExecutable(def);
  if (!resolved) {
    return {
      ...stripFns(def),
      models: def.fallbackModels ?? [DEFAULT_MODEL_OPTION],
      available: false,
    };
  }
  const probeEnv = spawnEnvForAgent(
    def.id,
    {
      ...process.env,
      ...(def.env || {}),
    },
    configuredEnv,
  );
  let version = null;
  try {
    const { stdout } = await execFileP(resolved, def.versionArgs, {
      env: probeEnv,
      timeout: 3000,
    });
    version = stdout.trim().split('\n')[0];
  } catch {
    // binary exists but --version failed; still mark available
  }
  // Probe `--help` once per agent and record which flags the installed CLI
  // advertises. Cached on `agentCapabilities` for buildArgs to consult.
  if (def.helpArgs && def.capabilityFlags) {
    const caps = {};
    try {
      const { stdout } = await execFileP(resolved, def.helpArgs, {
        env: probeEnv,
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024,
      });
      for (const [flag, key] of Object.entries(def.capabilityFlags)) {
        caps[key] = stdout.includes(flag);
      }
    } catch {
      // If --help fails, leave caps empty — buildArgs falls back to the safe
      // baseline (no optional flags).
    }
    agentCapabilities.set(def.id, caps);
  }
  const models = await fetchModels(def, resolved, probeEnv);
  return {
    ...stripFns(def),
    models,
    available: true,
    path: resolved,
    version,
  };
}

function stripFns(def) {
  // Drop the buildArgs / listModels closures but keep declarative metadata
  // (reasoningOptions, streamFormat, name, bin, etc.). `models` is
  // populated separately by `fetchModels`, so we strip the static
  // `fallbackModels` slot here too. `helpArgs` / `capabilityFlags` /
  // `fallbackBins` / `maxPromptArgBytes` / `env` are probe-or-spawn-only
  // metadata and shouldn't bleed into the API response either.
  const {
    buildArgs,
    listModels,
    fetchModels,
    fallbackModels,
    helpArgs,
    capabilityFlags,
    fallbackBins,
    maxPromptArgBytes,
    env,
    ...rest
  } = def;
  return rest;
}

export async function detectAgents(configuredEnvByAgent = {}) {
  const results = await Promise.all(
    AGENT_DEFS.map((def) => probe(def, configuredEnvByAgent?.[def.id] ?? {})),
  );
  // Refresh the validation cache from whatever we just surfaced to the UI
  // so /api/chat can accept any model the user could have just picked,
  // including ones that only showed up after a CLI re-auth.
  for (const agent of results) {
    rememberLiveModels(agent.id, agent.models);
  }
  return results;
}

export function getAgentDef(id) {
  return AGENT_DEFS.find((a) => a.id === id) || null;
}

export function buildLiveArtifactsMcpServersForAgent(def, { enabled = true, command = 'od', argsPrefix = [] } = {}) {
  if (!enabled || def?.mcpDiscovery !== 'mature-acp') return [];
  return [
    {
      name: 'open-design-live-artifacts',
      command,
      args: [...argsPrefix, 'mcp', 'live-artifacts'],
      env: [],
    },
  ];
}

// Adapters that ship the prompt as a positional argv arg (no stdin
// sentinel upstream) declare a `maxPromptArgBytes` budget so the daemon
// can fail fast with an actionable, adapter-named error before `spawn`
// surfaces a generic ENAMETOOLONG / E2BIG (Linux MAX_ARG_STRLEN) or
// CreateProcess command-line-too-long (Windows ~32 KB) failure. Returns
// null when the prompt fits (or the adapter has no budget — i.e. uses
// stdin), and a structured error payload otherwise. Pure so it's
// directly unit-testable for both the oversized and short-prompt paths
// without spinning up the HTTP server or a real spawn.
export function checkPromptArgvBudget(def, composed) {
  if (!def || typeof def.maxPromptArgBytes !== 'number') return null;
  const bytes = Buffer.byteLength(
    typeof composed === 'string' ? composed : '',
    'utf8',
  );
  if (bytes <= def.maxPromptArgBytes) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${def.name} requires the prompt as a command-line argument and this run's composed prompt exceeds the safe size (${bytes} > ${def.maxPromptArgBytes} bytes). ` +
      'Reduce the selected skills/design-system context, shorten the conversation, or pick an adapter with stdin support.',
    bytes,
    limit: def.maxPromptArgBytes,
  };
}

// Mirror of packages/platform's `quoteWindowsCommandArg`, kept local so
// `checkWindowsCmdShimCommandLineBudget` can run on macOS/Linux against
// a fake `.cmd` path in tests without forking on `process.platform`.
// Must stay byte-for-byte identical to the platform copy — the helper's
// whole point is to compute the exact `cmd.exe /d /s /c "<inner>"` line
// the spawn path will produce on Windows. The `%` → `"^%"` substitution
// neutralizes cmd.exe's percent-expansion for prompts that ride argv
// (DeepSeek TUI today): `%name%` pairs would otherwise be expanded from
// the daemon environment before the child reads them, leaking secrets
// like `%DEEPSEEK_API_KEY%` whenever the prompt mentions an env-var name.
function quoteForWindowsCmdShim(value) {
  const str = String(value ?? '');
  if (!/[\s"&<>|^%]/.test(str)) return str;
  const escaped = str.replace(/"/g, '""').replace(/%/g, '"^%"');
  return `"${escaped}"`;
}

// Mirror of libuv's `quote_cmd_arg` (process-stdio.c), the exact rule
// Node uses on Windows when it composes a CreateProcess command line for
// a direct executable spawn (not a `.cmd` / `.bat` shim, which goes
// through `quoteForWindowsCmdShim` above). Each embedded `"` becomes
// `\"`, every backslash that ends up adjacent to a quote (or to the
// closing wrap quote) gets doubled, and an arg with whitespace or a
// quote is wrapped in outer `"..."`. Kept local so the budget check
// works on macOS/Linux test hosts against a fake `C:\…\foo.exe` path.
function quoteForWindowsDirectExe(value) {
  const str = String(value ?? '');
  // libuv emits a literal `""` for an empty argv entry so it survives
  // CommandLineToArgvW round-tripping; mirror that.
  if (str.length === 0) return '""';
  // Fast path: no whitespace and no quote — pass through unchanged. This
  // matches libuv's `wcspbrk(source, L" \t\"")` early return.
  if (!/[\s"]/.test(str)) return str;
  // No quote, no backslash: simple wrap, no per-char escaping needed.
  if (!/[\\"]/.test(str)) return `"${str}"`;
  // Slow path: walk the string, counting consecutive backslashes so we
  // can double them whenever they precede a `"` or the closing wrap
  // quote. Following the documented Windows convention:
  //   - 2n  backslashes + `"`  →  emit `\\` × 2n  + `\"`
  //   - 2n+1 backslashes + `"` →  emit `\\` × (2n+1) + `\"`
  //   - n backslashes not before `"`  →  emit `\\` × n unchanged
  //   - trailing backslashes (before the closing wrap quote)  →  doubled
  let result = '"';
  let backslashes = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') {
      backslashes++;
    } else if (ch === '"') {
      result += '\\'.repeat(2 * backslashes + 1) + '"';
      backslashes = 0;
    } else {
      result += '\\'.repeat(backslashes) + ch;
      backslashes = 0;
    }
  }
  result += '\\'.repeat(2 * backslashes) + '"';
  return result;
}

// Windows' CreateProcess caps `lpCommandLine` at 32_767 chars. Going
// through a `.cmd` / `.bat` shim adds a `cmd.exe /d /s /c "<inner>"`
// wrapper, and `quoteForWindowsCmdShim` doubles every embedded `"` plus
// wraps any whitespace/special-char arg in outer quotes — so a prompt
// well under `maxPromptArgBytes` can still expand past the kernel cap
// once it's run through the shim. Leave headroom for any per-CLI flag
// the adapter might tack on at exec time and for cmd.exe's own framing.
const WINDOWS_CREATE_PROCESS_LIMIT = 32_767;
const WINDOWS_CREATE_PROCESS_HEADROOM = 256;

// Post-buildArgs guard for argv-bound adapters whose binary resolves to
// a Windows `.cmd` / `.bat` shim. Computes the exact command line shape
// `createCommandInvocation` (in packages/platform) hands to `spawn` —
// `cmd.exe /d /s /c "<quoted command + quoted args>"` — and refuses the
// run when that line would exceed the CreateProcess limit (less a small
// headroom). Returns the same `AGENT_PROMPT_TOO_LARGE` shape as
// `checkPromptArgvBudget` so the SSE error path in `/api/chat` doesn't
// have to special-case it.
//
// No-op when:
//   - the adapter doesn't declare `maxPromptArgBytes` (stdin adapters
//     never go through this path);
//   - the resolved binary isn't a `.cmd` / `.bat` (POSIX hosts and
//     direct `.exe` resolutions on Windows skip the cmd.exe wrap);
//   - the assembled line fits comfortably under the kernel cap.
//
// Pure: takes `resolvedBin` explicitly so a test on macOS can pass a
// fake `C:\\…\\deepseek.cmd` path and exercise the same math the daemon
// would run on Windows.
export function checkWindowsCmdShimCommandLineBudget(def, resolvedBin, args) {
  if (!def || typeof def.maxPromptArgBytes !== 'number') return null;
  if (typeof resolvedBin !== 'string' || !/\.(bat|cmd)$/i.test(resolvedBin))
    return null;
  const argList = Array.isArray(args) ? args : [];
  const inner = [resolvedBin, ...argList].map(quoteForWindowsCmdShim).join(' ');
  // `cmd.exe /d /s /c "<inner>"` — same shape as buildCmdShimInvocation
  // in packages/platform; the leading 'cmd.exe ' + '/d /s /c ' framing
  // plus the two outer quote chars rounds out the full command line.
  const commandLineLength = 'cmd.exe /d /s /c '.length + inner.length + 2;
  const safeLimit =
    WINDOWS_CREATE_PROCESS_LIMIT - WINDOWS_CREATE_PROCESS_HEADROOM;
  if (commandLineLength <= safeLimit) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${def.name} on Windows runs through a .cmd shim and this run's prompt would expand past the CreateProcess command-line limit ` +
      `after cmd.exe quote-doubling (${commandLineLength} > ${safeLimit} chars). ` +
      'Reduce quote-heavy content in the selected skills/design-system context, shorten the conversation, or pick an adapter with stdin support.',
    commandLineLength,
    limit: safeLimit,
  };
}

// Heuristic: does `resolvedBin` look like a Windows path? Used by the
// direct-exe guard so a test on a POSIX host can drive a fake
// `C:\…\foo.exe` path through the same math the daemon would run on
// Windows, while still skipping POSIX-shaped paths (which never go
// through CreateProcess).
function looksLikeWindowsPath(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  // Drive-letter (`C:\…`, `C:/…`) or UNC (`\\server\share\…`).
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

// Companion to `checkWindowsCmdShimCommandLineBudget` for argv-bound
// adapters whose binary resolves directly to a Windows executable
// (a cargo-installed `deepseek.exe`, a hand-built release, or any other
// non-shim install path). `createCommandInvocation` does *not* wrap the
// call in `cmd.exe /d /s /c "<inner>"` for those — but Node/libuv still
// composes a CreateProcess `lpCommandLine` by walking each argv entry
// through `quote_cmd_arg`, which doubles backslashes adjacent to quotes
// and escapes every embedded `"` as `\"`. A quote-heavy prompt that fits
// under the raw `maxPromptArgBytes` budget can therefore still expand
// past the kernel's 32_767-char `lpCommandLine` cap on a direct `.exe`
// spawn, surfacing as a generic `spawn ENAMETOOLONG` instead of the
// adapter-named `AGENT_PROMPT_TOO_LARGE` the budget guard exists to
// emit. Returns the same error shape as the cmd-shim guard so the SSE
// error path in `/api/chat` doesn't have to special-case it.
//
// No-op when:
//   - the adapter doesn't declare `maxPromptArgBytes` (stdin adapters
//     never go through this path);
//   - the resolved binary is a `.cmd` / `.bat` shim — that's handled by
//     `checkWindowsCmdShimCommandLineBudget` so we don't double-emit;
//   - the resolved binary is a POSIX path on a POSIX host (no
//     CreateProcess in play);
//   - the assembled command line fits under the safe limit.
//
// Pure: takes `resolvedBin` and `args` explicitly so a test on macOS can
// pass a fake `C:\…\deepseek.exe` and exercise the same math the daemon
// would run on Windows. The libuv quoting math lives in
// `quoteForWindowsDirectExe` above.
export function checkWindowsDirectExeCommandLineBudget(def, resolvedBin, args) {
  if (!def || typeof def.maxPromptArgBytes !== 'number') return null;
  if (typeof resolvedBin !== 'string' || resolvedBin.length === 0) return null;
  // The cmd-shim guard owns `.bat` / `.cmd`; skip those here so a single
  // oversized prompt doesn't trip both guards.
  if (/\.(bat|cmd)$/i.test(resolvedBin)) return null;
  // Only fire when the spawn would actually go through Windows'
  // CreateProcess. On POSIX hosts, `execvp` accepts each argv entry as a
  // separate buffer — there's no command-line concatenation step that
  // could expand past a kernel cap, so we have nothing to guard.
  if (process.platform !== 'win32' && !looksLikeWindowsPath(resolvedBin))
    return null;
  const argList = Array.isArray(args) ? args : [];
  // `[command, ...args].map(quote).join(' ')` is the exact shape libuv
  // builds before handing it to CreateProcess.
  const commandLineLength = [resolvedBin, ...argList]
    .map(quoteForWindowsDirectExe)
    .join(' ').length;
  const safeLimit =
    WINDOWS_CREATE_PROCESS_LIMIT - WINDOWS_CREATE_PROCESS_HEADROOM;
  if (commandLineLength <= safeLimit) return null;
  return {
    code: 'AGENT_PROMPT_TOO_LARGE',
    message:
      `${def.name} on Windows builds a CreateProcess command line and this run's prompt would expand past the limit ` +
      `after libuv quote-escaping (${commandLineLength} > ${safeLimit} chars). ` +
      'Reduce quote-heavy content in the selected skills/design-system context, shorten the conversation, or pick an adapter with stdin support.',
    commandLineLength,
    limit: safeLimit,
  };
}

// Resolve the absolute path of an agent's binary on the current PATH.
// Used by the chat handler so spawn() gets the same executable that
// detection reported as available — fixes Windows ENOENT when the bare
// bin name isn't on the child process's PATH (issue #10).
export function resolveAgentBin(id) {
  const def = getAgentDef(id);
  if (!def?.bin) return null;
  return resolveAgentExecutable(def);
}

// Build the env passed to spawn() for a given agent adapter.
//
// The claude adapter strips ANTHROPIC_API_KEY so Claude Code's own auth
// resolution (claude login / Pro/Max plan) wins instead of silently
// falling back to API-key billing whenever the daemon happened to be
// launched from a shell that exported the key for SDK or scripting use.
// See issue #398.
//
// However, when ANTHROPIC_BASE_URL is set the user is intentionally
// routing Claude Code to a custom endpoint (e.g. a Kimi/Moonshot proxy).
// In that case claude login is meaningless, so preserve the API key so
// the child can authenticate against the custom base URL.
//
// Windows env-var names are case-insensitive at the kernel level
// (`GetEnvironmentVariable`), but spreading `process.env` into a plain
// object loses Node's case-insensitive accessor — `Anthropic_Api_Key`
// would survive a literal `delete env.ANTHROPIC_API_KEY` and still reach
// the child. Iterate keys and compare case-insensitively to close that.
export function spawnEnvForAgent(agentId, baseEnv, configuredEnv = {}) {
  const env = { ...baseEnv, ...expandConfiguredEnv(configuredEnv) };
  if (agentId !== 'claude') return env;
  const hasCustomBaseUrl = Object.keys(env).some(
    (k) =>
      k.toUpperCase() === 'ANTHROPIC_BASE_URL' &&
      typeof env[k] === 'string' &&
      env[k].trim() !== '',
  );
  if (hasCustomBaseUrl) return env;
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'ANTHROPIC_API_KEY') delete env[key];
  }
  return env;
}

function expandConfiguredEnv(configuredEnv) {
  const out = {};
  if (!configuredEnv || typeof configuredEnv !== 'object') return out;
  for (const [key, value] of Object.entries(configuredEnv)) {
    if (typeof value !== 'string') continue;
    out[key] = expandHomePath(value);
  }
  return out;
}

function expandHomePath(value) {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

// Daemon's /api/chat needs to validate the user's model pick against the
// list we last surfaced to the UI. We keep a per-agent cache of the most
// recent live list (refreshed every detectAgents() call) and additionally
// trust any value present in the static fallback. A model that's neither
// gets rejected so a stale or hostile value can't smuggle arbitrary flags.
const liveModelCache = new Map();

export function rememberLiveModels(agentId, models) {
  if (!Array.isArray(models)) return;
  liveModelCache.set(
    agentId,
    new Set(
      models.map((m) => m && m.id).filter((id) => typeof id === 'string'),
    ),
  );
}

export function isKnownModel(def, modelId) {
  if (!modelId) return false;
  const live = liveModelCache.get(def.id);
  if (live && live.has(modelId)) return true;
  if (Array.isArray(def.fallbackModels)) {
    return def.fallbackModels.some((m) => m.id === modelId);
  }
  return false;
}

// Permit user-typed model ids that didn't appear in either the live
// listing or the static fallback (e.g. the user is on a brand-new model
// the CLI's `models` command hasn't surfaced yet). The CLI gets the value
// as a child-process arg — not a shell string — so injection isn't a
// concern, but we still reject anything that could be misread as a flag
// by a downstream CLI or that contains whitespace / control chars.
export function sanitizeCustomModel(id) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(trimmed)) return null;
  return trimmed;
}
