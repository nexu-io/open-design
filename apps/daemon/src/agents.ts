// @ts-nocheck
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';
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
//                            (Claude Code, Codex, Gemini CLI, Qwen Code)
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

const DEFAULT_MODEL_OPTION = { id: 'default', label: 'Default (CLI config)' };

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
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    capabilityFlags: {
      // Flag string -> capability key. After probing `--help`, we set
      // `agentCapabilities[id][key] = true` for each substring that matches.
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
    buildArgs: (prompt, _imagePaths, extraAllowedDirs = [], options = {}) => {
      const caps = agentCapabilities.get('claude') || {};
      const args = [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
      ];
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
    // Prompt delivered via stdin (`codex exec -`) to avoid Windows
    // `spawn ENAMETOOLONG` while keeping Codex on its structured JSON stream.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}, runtimeContext = {}) => {
      const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--full-auto',
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
        // Codex accepts `-c key=value` config overrides; reasoning effort
        // is exposed as `model_reasoning_effort`.
        args.push('-c', `model_reasoning_effort="${options.reasoning}"`);
      }
      args.push('-');
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'codex',
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
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['--output-format', 'stream-json', '--skip-trust', '--yolo'];
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
      { id: 'anthropic/claude-sonnet-4-5', label: 'anthropic/claude-sonnet-4-5' },
      { id: 'openai/gpt-5', label: 'openai/gpt-5' },
      { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
    ],
    // Prompt delivered via stdin (`opencode run -`) to avoid Windows
    // `spawn ENAMETOOLONG` while preserving OpenCode's structured stream.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['run', '--format', 'json', '--dangerously-skip-permissions'];
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
    fetchModels: async (resolvedBin) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp', '--accept-hooks'],
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
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
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
    buildArgs: (_prompt, _imagePaths, _extra, options = {}, runtimeContext = {}) => {
      const args = [];
      args.push('--print', '--output-format', 'stream-json', '--stream-partial-output', '--force', '--trust');
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
    streamFormat: 'copilot-stream-json',
  },
  {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    versionArgs: ['--version'],
    // `pi --list-models` prints a TSV table to stderr (not stdout),
    // so we use a custom fetchModels that reads stderr.
    fetchModels: async (resolvedBin) => {
      try {
        const { stderr } = await execFileP(resolvedBin, ['--list-models'], {
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
      { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (anthropic)' },
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
    buildArgs: (_prompt, _imagePaths, _extra, options = {}, runtimeContext = {}) => {
      const args = ['--mode', 'rpc', '--no-session'];
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
    fetchModels: async (resolvedBin) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
    ],
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
  },
];

export function resolveOnPath(bin) {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  const dirs = (process.env.PATH || '').split(delimiter);
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      if (full && existsSync(full)) return full;
    }
  }
  return null;
}

async function fetchModels(def, resolvedBin) {
  if (typeof def.fetchModels === 'function') {
    try {
      const parsed = await def.fetchModels(resolvedBin);
      if (!parsed || parsed.length === 0) return def.fallbackModels;
      return parsed;
    } catch {
      return def.fallbackModels;
    }
  }
  if (!def.listModels) return def.fallbackModels;
  try {
    const { stdout } = await execFileP(resolvedBin, def.listModels.args, {
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

async function probe(def) {
  const resolved = resolveOnPath(def.bin);
  if (!resolved) {
    return {
      ...stripFns(def),
      models: def.fallbackModels ?? [DEFAULT_MODEL_OPTION],
      available: false,
    };
  }
  let version = null;
  try {
    const { stdout } = await execFileP(resolved, def.versionArgs, { timeout: 3000 });
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
  const models = await fetchModels(def, resolved);
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
  // `fallbackModels` slot here too. `helpArgs` / `capabilityFlags` are
  // probe-only metadata and shouldn't bleed into the API response either.
  const {
    buildArgs,
    listModels,
    fetchModels,
    fallbackModels,
    helpArgs,
    capabilityFlags,
    ...rest
  } = def;
  return rest;
}


export async function detectAgents() {
  const results = await Promise.all(AGENT_DEFS.map(probe));
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

// Resolve the absolute path of an agent's binary on the current PATH.
// Used by the chat handler so spawn() gets the same executable that
// detection reported as available — fixes Windows ENOENT when the bare
// bin name isn't on the child process's PATH (issue #10).
export function resolveAgentBin(id) {
  const def = getAgentDef(id);
  if (!def?.bin) return null;
  return resolveOnPath(def.bin);
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
    new Set(models.map((m) => m && m.id).filter((id) => typeof id === 'string')),
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
