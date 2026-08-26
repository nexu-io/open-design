import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { readFile as fsReadFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEFAULT_MODEL_OPTION, execAgentFile } from './shared.js';
import { agentCapabilities } from '../capabilities.js';
import type { RuntimeAgentDef, RuntimeEnv, RuntimeModelOption } from '../types.js';

const ANTIGRAVITY_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';

// `agy` v1.0.3 still has no `--model` flag (upstream issue #35), but the
// TUI's Switch-Model picker writes the choice to its settings.json, and
// every `agy -p` invocation re-reads that file on startup — verified by
// capturing the `--log-file` line `Propagating selected model override to
// backend: label="<model>"`. So we can route OD's model picker through
// settings.json: when the user picks a concrete model in Settings, the
// daemon writes the label into agy's settings.json right before spawn,
// and the resulting print-mode run uses that model.
//
// Two ids the picker exposes are special:
//   - 'default'         : leave settings.json untouched, so agy keeps
//                         whatever the user last picked in its own TUI.
//                         (Respects user choice when they switch models
//                         from `agy` directly.)
//   - any other id      : the literal display label agy expects (e.g.
//                         "Gemini 3.1 Pro (High)", "Claude Sonnet 4.6
//                         (Thinking)"). We persist it before spawn.
//
// `supportsCustomModel: false` because the label set is a server-side
// enum — a typed id agy doesn't recognise resolves to a silent
// `availableModels` cache miss + empty print-mode output, which surfaces
// to the user as a generic "empty response" error.
//
// `fallbackModels` below is the offline-only floor: agy 1.1.21 does ship a
// programmatic `agy --output-format json models` (the flag has to come
// *before* the subcommand — `agy models --output-format json` only prints
// Usage), so `fetchAntigravityModels` below queries it live and this static
// list is used only when that probe fails (CLI too old, no network, etc).
// Keep it reasonably current anyway so a fresh install with a stale/offline
// agy still gets a workable picker.
const ANTIGRAVITY_SETTINGS_PATH = join(
  homedir(),
  '.gemini',
  'antigravity-cli',
  'settings.json',
);

export function writeAntigravityModelSelection(
  label: string,
  settingsPath: string = ANTIGRAVITY_SETTINGS_PATH,
): void {
  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt JSON — fall through and rewrite the file from scratch so
      // the next spawn starts from a known-good state.
    }
  }
  existing.model = label;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`);
}

// Per-process serialization for write-settings → spawn → agy-reads
// cycles on antigravity. `~/.gemini/antigravity-cli/settings.json` is
// process-global, so two OD runs that both pick concrete (non-default)
// models can race: run A writes model A, spawn A starts, run B writes
// model B before A's agy has read settings.json — A then executes on
// model B. The daemon serialises non-default antigravity spawns
// through this chain: each acquire awaits the previous release, and
// each release fires only after the spawned agy actually emits
// `Propagating selected model override to backend: label="<X>"` in
// its `--log-file` (which is the upstream signal that settings.json
// has been read).
let antigravityLockChain: Promise<void> = Promise.resolve();

export async function acquireAntigravityModelLock(): Promise<() => void> {
  const previous = antigravityLockChain;
  let release: () => void = () => {};
  antigravityLockChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}

// Visible for tests. Resets the module-level lock chain so a test that
// installed a hanging acquirer can release it without leaking state to
// subsequent test cases. Production code never calls this.
export function _resetAntigravityModelLockForTests(): void {
  antigravityLockChain = Promise.resolve();
}

export interface WaitForAgyModelOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  // Override for tests; production reads the daemon-owned log file path.
  readFile?: (path: string) => Promise<string>;
  // Override `Date.now` for tests; production uses the wall clock.
  now?: () => number;
  // Stops polling when fired. Production wires this to `child.once('exit')`
  // so the watcher cancels as soon as agy exits — the lock release is
  // then driven by the exit handler rather than the helper's return
  // value, eliminating the slow-startup race the looper review at
  // 263fd2fe7 flagged: if a cold agy takes >timeoutMs to read its
  // settings.json, we'd otherwise return false, the caller would
  // release the lock, and a concurrent run B could rewrite
  // settings.json before A's agy actually read it.
  abortSignal?: AbortSignal;
}

// Polls agy's `--log-file` for the line
//   `Propagating selected model override to backend: label="<expectedModel>"`
// which `model_config_manager.go` emits once agy has finished reading
// `~/.gemini/antigravity-cli/settings.json` and sent the model
// override to the upstream backend. Returns true on observed signal,
// false on timeout OR abort. Never throws — a missing log file is
// treated as "not yet seen" so the polling loop keeps retrying until
// either the deadline or the abort signal fires.
//
// IMPORTANT: callers MUST NOT use a `false` return as a "go ahead and
// release the settings.json lock" signal — false means "I gave up
// polling," not "agy definitely didn't read this." Release the lock
// only on (a) a `true` return, OR (b) child exit. See server.ts for
// the wiring.
export async function waitForAgyToReadModel(
  logFilePath: string,
  expectedModel: string,
  options: WaitForAgyModelOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const readFile =
    options.readFile ?? ((path: string) => fsReadFile(path, 'utf8'));
  const now = options.now ?? Date.now;
  const abortSignal = options.abortSignal;
  if (abortSignal?.aborted) return false;
  const escaped = expectedModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `Propagating selected model override to backend: label="${escaped}"`,
  );
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (abortSignal?.aborted) return false;
    try {
      const content = await readFile(logFilePath);
      if (pattern.test(content)) return true;
    } catch {
      // Log file may not have appeared yet; keep polling.
    }
    if (now() >= deadline) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, pollIntervalMs);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  return false;
}

// Parses the single-line JSON envelope from `agy --output-format json
// models` (verified against agy 1.1.21):
//   { command: { data: { models: [{ id, label }, ...] } }, response: "..." }
// The top-level `response` field is a tab-separated string meant for a human
// reading the CLI directly — more brittle to parse and unused here.
//
// agy's own `id` in that array is an internal slug (e.g.
// "gemini-3-pro-high"); `writeAntigravityModelSelection` above persists the
// display `label` instead, because that's what `settings.json` +
// `waitForAgyToReadModel`'s log grep both expect. So — matching this file's
// existing id-equals-label `fallbackModels` convention — every parsed
// entry's `id` here is set to its `label`, discarding agy's slug entirely;
// nothing downstream reads it.
// Exported for tests; not part of `RuntimeAgentDef`.
export function parseAntigravityModelsJson(stdout: string): RuntimeModelOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const models = (parsed as { command?: { data?: { models?: unknown } } })
    ?.command?.data?.models;
  if (!Array.isArray(models)) return null;
  const out: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  for (const entry of models) {
    const label = (entry as { label?: unknown } | null)?.label;
    if (typeof label !== 'string' || label.length === 0) continue;
    out.push({ id: label, label });
  }
  return out.length > 1 ? out : null;
}

// `agy models` — like some of agy's other non-interactive subcommands —
// does not print or exit until stdin reaches EOF. Verified with an
// execFile-shaped piped, non-tty stdin (the same shape `execAgentFile`
// spawns with, and the shape any daemon integration using
// child_process.execFile/spawn gets by default): held open, the process
// idles past any `timeout` — execFile's `timeout` option only *signals* the
// child, and the promise settles on the child actually exiting, which never
// happens here on its own. Closed immediately after spawn, the same command
// answers in 6-21s (cold start includes a Google login / quota-refresh
// round trip). This is why model discovery is a `fetchModels` — imperative,
// gets a handle on the spawned child — rather than a declarative
// `listModels: { args, parse }` entry: a declarative entry spawns through
// this same `execAgentFile` path with no hook to close stdin first, and
// would hang identically.
// Exported for tests; referenced through `antigravityAgentDef.fetchModels`
// in production.
export async function fetchAntigravityModels(
  resolvedBin: string,
  env: RuntimeEnv,
): Promise<RuntimeModelOption[] | null> {
  const pending = execAgentFile(
    resolvedBin,
    ['--output-format', 'json', 'models'],
    { env, timeout: 30_000 },
  );
  pending.child?.stdin?.end();
  const { stdout } = await pending;
  return parseAntigravityModelsJson(String(stdout));
}

export const antigravityAgentDef = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  versionArgs: ['--version'],
  helpArgs: ['--help'],
  capabilityFlags: {
    [ANTIGRAVITY_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
  },
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'Gemini 3.7 Flash (High)', label: 'Gemini 3.7 Flash (High)' },
    { id: 'Gemini 3.7 Flash (Medium)', label: 'Gemini 3.7 Flash (Medium)' },
    { id: 'Gemini 3.7 Flash (Low)', label: 'Gemini 3.7 Flash (Low)' },
    { id: 'Gemini 3.6 Flash (High)', label: 'Gemini 3.6 Flash (High)' },
    { id: 'Gemini 3.6 Flash (Medium)', label: 'Gemini 3.6 Flash (Medium)' },
    { id: 'Gemini 3.6 Flash (Low)', label: 'Gemini 3.6 Flash (Low)' },
    { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)' },
    { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash (Medium)' },
    { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash (Low)' },
    { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro (High)' },
    { id: 'Gemini 3.1 Pro (Low)', label: 'Gemini 3.1 Pro (Low)' },
    {
      id: 'Claude Sonnet 4.6 (Thinking)',
      label: 'Claude Sonnet 4.6 (Thinking)',
    },
    { id: 'Claude Opus 4.6 (Thinking)', label: 'Claude Opus 4.6 (Thinking)' },
    { id: 'GPT-OSS 120B (Medium)', label: 'GPT-OSS 120B (Medium)' },
  ],
  fetchModels: fetchAntigravityModels,
  supportsCustomModel: false,
  // We deliberately do NOT opt into `resumesSessionViaCli` / agy's `-c`
  // resume flag on follow-up turns. Tested both shapes; `-c` activates
  // agy's internal agentic loop (multi-step model retries, tool calls,
  // fallback-to-cached-response on tool errors) which can't be steered
  // from OD's system-prompt OVERRIDE — even with the strongest wording
  // we got an identical byte-for-byte form re-emission on turn 2 when
  // turn 1's tool-call retry path returned the cached form response.
  //
  // Instead we treat agy as a stateless plain adapter like qwen /
  // deepseek: every spawn gets the full OD-rendered transcript via
  // `buildDaemonTranscript`, and that transcript's prior assistant
  // turns are sanitized to strip `<question-form>` markup + form-schema
  // JSON fences (see `sanitizePriorAssistantTurnForTranscript` in
  // apps/web/src/providers/daemon.ts). The stronger OVERRIDE block
  // composed in server.ts gives a second line of defense for weak
  // plain-stream models like Gemini 3.5 Flash.
  buildArgs: (
    prompt,
    _imagePaths,
    _extra = [],
    options = {},
    runtimeContext = {},
  ) => {
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      writeAntigravityModelSelection(
        options.model,
        runtimeContext.antigravitySettingsPath,
      );
    }
    // Print mode via `-p <prompt>`. Older OD used `agy -p -` and wrote the
    // prompt on stdin, but current agy (reproduced on 1.1.13) treats `-`
    // as the literal prompt string and ignores stdin — the model only
    // ever sees a single dash (#7161). Passing the real prompt as the
    // `-p` argument matches the verified working CLI form
    // (`agy -p "say hello"`).
    const args: string[] = [];
    // Always opt into `--log-file` when the daemon supplied a path so
    // it can post-exit grep for the actual upstream failure shape
    // (auth missing vs quota reached vs upstream error) — without it
    // the chat surfaces a generic "empty response" because print mode
    // never echoes those errors on stdout. See server.ts empty-output
    // guard for the consumer.
    //
    // Flag order is load-bearing on agy: put `--log-file` before `-p`
    // so diagnostics (model override / auth / quota) land in the log.
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    // Daemon-managed print-mode runs have no interactive approval channel.
    if (agentCapabilities.get('antigravity')?.skipPermissions) {
      args.push(ANTIGRAVITY_SKIP_PERMISSIONS_FLAG);
    }
    args.push('-p', prompt);
    return args;
  },
  promptViaStdin: false,
  streamFormat: 'plain',
  installUrl: 'https://antigravity.google/cli',
  docsUrl: 'https://antigravity.google/docs/cli-overview',
} satisfies RuntimeAgentDef;
