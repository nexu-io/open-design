import { readFile as fsReadFile } from 'node:fs/promises';

import { DEFAULT_MODEL_OPTION } from './shared.js';
import { agentCapabilities } from '../capabilities.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

const ANTIGRAVITY_SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions';

// Headless runs use agy's documented stdin channel (agy >= 1.1.15):
//   agy --input-format stream-json --output-format stream-json
// with the prompt written to stdin as one NDJSON `user` message. The prompt
// must never ride argv: on Windows the composed OD prompt routinely exceeds
// CreateProcess's 32_767-char command line and the spawn dies with
// `ENAMETOOLONG` before agy starts (OPEND-3495). And agy has no other way to
// read stdin — with `-p <text>` it ignores stdin entirely (agy 1.1.1: "no
// longer reading stdin when a prompt is provided via a flag"), while `-p -`
// is the literal prompt "-" (#7161). Every stream-json message runs one turn;
// the daemon hands the frame over as a complete file-backed stdin, so agy
// sees EOF after it and ends the session once the turn finishes.
const ANTIGRAVITY_STREAM_JSON_ARGS = [
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
] as const;

export function encodeAntigravityStdinPrompt(prompt: string): string {
  return `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`;
}

// `agy models` (and `--model`) have existed since 1.1.x. Verified on agy
// 1.5.5: `agy --output-format json models` prints a result envelope whose
// `command.data.models` entries are stable slugs plus display labels, and
// `agy --model <slug> -p /model` honors that slug for the session without
// rewriting `~/.gemini/antigravity-cli/settings.json`. Passing the slug on
// argv is what lets the picker follow the installed CLI instead of a
// snapshot of display names from 2026-05-28.
//
// `default` still means "do not pass --model", so agy keeps the model the
// user last chose in its own TUI. A saved legacy display label such as
// "Gemini 3.1 Pro (High)" is not a slug; ignore it rather than handing agy
// a value it will reject. Free-typed ids stay off (`supportsCustomModel:
// false`) because an unknown slug fails the headless run.
const AGY_MODEL_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isAntigravityModelSlug(model: string | null | undefined): model is string {
  return typeof model === 'string'
    && model !== DEFAULT_MODEL_OPTION.id
    && AGY_MODEL_SLUG_RE.test(model);
}

type AntigravityListedModel = { id: string; label: string };

function listedModel(value: unknown): AntigravityListedModel | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  const label = (value as { label?: unknown }).label;
  if (!isAntigravityModelSlug(typeof id === 'string' ? id : null)) return null;
  const slug = id as string;
  return {
    id: slug,
    label: typeof label === 'string' && label.trim() ? label.trim() : slug,
  };
}

function modelsFromTsv(text: string): AntigravityListedModel[] {
  const out: AntigravityListedModel[] = [];
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const model = listedModel({
      id: line.slice(0, tab).trim(),
      label: line.slice(tab + 1).trim(),
    });
    if (model) out.push(model);
  }
  return out;
}

function modelsFromEnvelope(parsed: unknown): AntigravityListedModel[] | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const models = (parsed as {
    command?: { data?: { models?: unknown } };
  }).command?.data?.models;
  if (!Array.isArray(models)) return null;
  return models
    .map(listedModel)
    .filter((model): model is AntigravityListedModel => model !== null);
}

export function parseAntigravityModels(stdout: string): RuntimeModelOption[] | null {
  const text = String(stdout ?? '').trim();
  if (!text) return null;
  let found: AntigravityListedModel[] = [];
  const jsonStart = text.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart)) as { response?: unknown };
      found = modelsFromEnvelope(parsed) ?? [];
      if (found.length === 0 && typeof parsed.response === 'string') {
        found = modelsFromTsv(parsed.response);
      }
    } catch {
      found = [];
    }
  }
  if (found.length === 0) found = modelsFromTsv(text);
  if (found.length === 0) return null;
  const seen = new Set<string>();
  const options: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  for (const model of found) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    options.push(model);
  }
  return options;
}

// Last catalog recorded from `agy 1.5.5 --output-format json models` on
// 2026-11-12. Used only when the live `models` probe fails. Ids are slugs,
// which `--model` accepts; labels are what the picker shows.
const ANTIGRAVITY_FALLBACK_MODELS: RuntimeModelOption[] = [
  DEFAULT_MODEL_OPTION,
  { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)' },
  { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)' },
  { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)' },
  { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
  { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
  { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
  { id: 'claude-opus-5-5-low', label: 'Claude Opus 5.5 (Low)' },
  { id: 'claude-opus-5-5-medium', label: 'Claude Opus 5.5 (Medium)' },
  { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
  { id: 'claude-sonnet-5-5-low', label: 'Claude Sonnet 5.5 (Low)' },
  { id: 'claude-sonnet-5-5-medium', label: 'Claude Sonnet 5.5 (Medium)' },
  { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
  { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
];

// Historical serializer for the old settings.json model write. The daemon
// no longer takes this lock: a concrete model now goes out as `--model` and
// does not touch the process-global settings file. The helpers stay so the
// race they used to close remains covered if a settings write is reintroduced.
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

export const antigravityAgentDef = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  versionArgs: ['--version'],
  helpArgs: ['--help'],
  capabilityFlags: {
    [ANTIGRAVITY_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
  },
  listModels: {
    args: ['--output-format', 'json', 'models'],
    timeoutMs: 20_000,
    parse: parseAntigravityModels,
  },
  fallbackModels: ANTIGRAVITY_FALLBACK_MODELS,
  supportsCustomModel: false,
  // Follow-up turns resume agy's own conversation with `--conversation <id>`.
  // Verified on agy 1.5.6 with the same stream-json stdin this adapter uses:
  // a second process sent only the new user sentence, recalled the first
  // turn, and reported `cache_read_tokens` (27133 of 31475) instead of
  // rereading the whole prefix. A brand-new process with an identical prompt
  // stays at `cache_read_tokens: 0`, so the id is what makes the cache hit.
  //
  // Do not use `-c` / `--continue`. That flag starts agy's tool-retry loop
  // and can replay a cached `<question-form>` that the system prompt cannot
  // override. `--conversation` on a text follow-up did not replay the form.
  // The id comes from the stream `init` frame (`capturesSessionIdFromStream`).
  // A missing id makes agy warn `conversation "…" not found` and silently
  // start a new one; that warning is a resume failure so the daemon reseeds
  // the full transcript instead of talking to an empty session.
  buildArgs: (
    _prompt,
    _imagePaths,
    _extra = [],
    options = {},
    runtimeContext = {},
  ) => {
    const args: string[] = [];
    // Always opt into `--log-file` when the daemon supplied a path: the
    // model lock in server.ts waits for agy to log the settings.json model
    // override there, and the connection test folds its tail into auth /
    // quota classification.
    //
    // Flag order is load-bearing on agy: put `--log-file` first so
    // diagnostics (model override / auth / quota) land in the log.
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    // Daemon-managed headless runs have no interactive approval channel.
    if (agentCapabilities.get('antigravity')?.skipPermissions) {
      args.push(ANTIGRAVITY_SKIP_PERMISSIONS_FLAG);
    }
    if (isAntigravityModelSlug(options.model)) {
      args.push('--model', options.model);
    }
    if (
      typeof runtimeContext.resumeSessionId === 'string'
      && runtimeContext.resumeSessionId.length > 0
    ) {
      args.push('--conversation', runtimeContext.resumeSessionId);
    }
    args.push(...ANTIGRAVITY_STREAM_JSON_ARGS);
    return args;
  },
  promptViaStdin: true,
  encodeStdinPrompt: encodeAntigravityStdinPrompt,
  streamFormat: 'json-event-stream',
  eventParser: 'antigravity',
  resumesSessionViaCli: true,
  capturesSessionIdFromStream: true,
  installUrl: 'https://antigravity.google/cli',
  docsUrl: 'https://antigravity.google/docs/cli-overview',
} satisfies RuntimeAgentDef;
