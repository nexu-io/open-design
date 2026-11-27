import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { readFile as fsReadFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEFAULT_MODEL_OPTION } from './shared.js';
import { agentCapabilities } from '../capabilities.js';
import { getRememberedLiveModels } from '../models.js';
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

// Model selection. Modern `agy` builds (>= 1.1.2; verified on 1.5.18)
// expose both halves of a programmatic model contract:
//
//   - `agy models` prints the account's live catalog as
//     `<slug>\t<Display Label>` rows (e.g.
//     `gemini-4-neon-high\tGemini 4 Neon (High)`), preceded by a
//     `Fetching available models...` progress line. Unauthenticated it
//     exits 1 with `Please sign in to view available models`, which the
//     detection layer treats as "no live list" and falls back below.
//   - `--model <slug>` selects a model for one session. Current builds
//     also accept the display label, but the slug is the canonical form
//     Google's docs use (`--model gemini-4-neon-xhigh`), and an unknown
//     slug fails loudly listing the valid ones instead of the silent
//     `availableModels` cache miss the old settings-only path produced.
//
// So the picker now discovers models live (`listModels` below) and the
// spawn passes the chosen slug via `--model`, gated on the `--help`
// capability probe so a pre-`--model` build never receives an unknown
// flag. Two shapes still route through `settings.json`:
//
//   - 'default'          : leave settings.json untouched and pass no
//                          `--model`, so agy keeps whatever the user
//                          last picked in its own TUI.
//   - label-shaped picks : display labels saved by older OD versions
//                          (or a slug on a build whose `--model` flag
//                          the probe could not confirm). The TUI's
//                          Switch-Model picker writes the label to
//                          settings.json and every headless invocation
//                          re-reads it — verified via the `--log-file`
//                          line `Propagating selected model override to
//                          backend: label="<model>"`. We resolve the
//                          slug to its label and persist that before
//                          spawn, under the serialization lock below.
//
// The fallback list is only a hint for when live discovery cannot run
// (signed out, offline, ancient build). It mirrors the durable rows of
// Google's model table as of 2026-11-26; rows Google marked for
// removal on 2026-11-30 (Gemini 4 Argon, Gemini 3.8 Flash, Claude 4.6,
// GPT-OSS-120b) and Enterprise-only rows (Gemini 3.7/3.6 Flash, 3.1
// Pro) are deliberately absent — live discovery surfaces them for
// accounts that still have them.
const ANTIGRAVITY_FALLBACK_MODELS: RuntimeModelOption[] = [
  DEFAULT_MODEL_OPTION,
  { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)' },
  { id: 'gemini-4-neon-medium', label: 'Gemini 4 Neon (Medium)' },
  { id: 'gemini-4-neon-low', label: 'Gemini 4 Neon (Low)' },
  { id: 'gemini-4-neon-xhigh', label: 'Gemini 4 Neon (XHigh)' },
  { id: 'gemini-4-carbon-high', label: 'Gemini 4 Carbon (High)' },
  { id: 'gemini-4-carbon-medium', label: 'Gemini 4 Carbon (Medium)' },
  { id: 'gemini-4-carbon-low', label: 'Gemini 4 Carbon (Low)' },
  { id: 'gemini-4-hydrogen-high', label: 'Gemini 4 Hydrogen (High)' },
  { id: 'gemini-4-hydrogen-medium', label: 'Gemini 4 Hydrogen (Medium)' },
  { id: 'gemini-4-hydrogen-low', label: 'Gemini 4 Hydrogen (Low)' },
  { id: 'gemini-4-hydrogen-xhigh', label: 'Gemini 4 Hydrogen (XHigh)' },
  { id: 'gemini-pro-orchestrator-neon', label: 'Orchestrator (Neon)' },
  { id: 'gemini-pro-orchestrator', label: 'Orchestrator (Carbon)' },
  { id: 'gemini-pro-orchestrator-argon', label: 'Orchestrator (Argon)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Thinking)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (Thinking)' },
];

// Display labels the pre-`agy models` picker persisted as model ids,
// mapped to the slug the same row carries today. Lets a saved pick
// from an older OD version keep routing to the same model instead of
// being dropped to the CLI default at validation time.
const ANTIGRAVITY_LEGACY_LABEL_SLUGS: Record<string, string> = {
  'Gemini 3.1 Pro (High)': 'gemini-3.1-pro-high',
  'Gemini 3.1 Pro (Low)': 'gemini-3.1-pro-low',
  'Gemini 3.5 Flash (High)': 'gemini-3.5-flash-high',
  'Gemini 3.5 Flash (Medium)': 'gemini-3.5-flash-medium',
  'Gemini 3.5 Flash (Low)': 'gemini-3.5-flash-low',
  'Claude Sonnet 4.6 (Thinking)': 'claude-sonnet-4-6',
  'Claude Opus 4.6 (Thinking)': 'claude-opus-4-6-thinking',
  'GPT-OSS 120B (Medium)': 'gpt-oss-120b-medium',
};

const ANTIGRAVITY_MODEL_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// `agy models` rows are `<slug>` + tab (or alignment spaces) + label.
// Slugs are lowercase and hyphenated; requiring that shape keeps prose
// lines (`Fetching available models...`, sign-in errors) from parsing
// as models when a future build prints them on stdout with exit 0.
const ANTIGRAVITY_MODEL_ROW =
  /^([a-z0-9][a-z0-9._-]*-[a-z0-9._-]*)(?:\t|\s{2,}|\s+)(\S.*)$/;

/**
 * Parse `agy models` stdout into picker options. Returns null when no
 * usable row is present so detection falls back to the static hint
 * instead of surfacing an empty picker.
 */
export function parseAntigravityModels(
  stdout: string,
): RuntimeModelOption[] | null {
  const models: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const rawLine of String(stdout || '').split('\n')) {
    const match = rawLine.trim().match(ANTIGRAVITY_MODEL_ROW);
    if (!match) continue;
    const id = match[1]!;
    const label = match[2]!.trim();
    if (!label || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label });
  }
  return models.length > 1 ? models : null;
}

function antigravityLabelForSlug(slug: string): string | null {
  const live = getRememberedLiveModels('antigravity').find(
    (model) => model.id === slug,
  );
  if (live) return live.label;
  const fallback = ANTIGRAVITY_FALLBACK_MODELS.find(
    (model) => model.id === slug,
  );
  if (fallback) return fallback.label;
  for (const [label, legacySlug] of Object.entries(
    ANTIGRAVITY_LEGACY_LABEL_SLUGS,
  )) {
    if (legacySlug === slug) return label;
  }
  return null;
}

/**
 * Resolve a picker value (slug, legacy display label, or a label from
 * the live catalog) to the `agy --model` slug. Returns null for
 * 'default'/empty and for label-shaped values no catalog maps.
 */
export function resolveAntigravityModelSlug(
  model: string | null | undefined,
): string | null {
  if (typeof model !== 'string') return null;
  const trimmed = model.trim();
  if (!trimmed || trimmed === DEFAULT_MODEL_OPTION.id) return null;
  if (ANTIGRAVITY_MODEL_SLUG.test(trimmed)) return trimmed;
  const legacy = ANTIGRAVITY_LEGACY_LABEL_SLUGS[trimmed];
  if (legacy) return legacy;
  const live = getRememberedLiveModels('antigravity').find(
    (entry) => entry.label === trimmed,
  );
  return live?.id ?? null;
}

/**
 * The settings.json label a spawn for `model` must write (and the
 * spawn pipeline must serialize + wait on), or null when the spawn
 * selects its model another way: 'default' (leave agy's own choice
 * alone) or a slug on a build whose `--model` flag the capability
 * probe confirmed (per-process argv needs no shared-file lock).
 * A slug with no known label on an unconfirmed build also returns
 * null: writing an unrecognised value into settings.json resolves to
 * a silent upstream cache miss, so the run keeps agy's default
 * instead of pretending the pick applied.
 */
export function resolveAntigravitySettingsLabel(
  model: string | null | undefined,
): string | null {
  if (typeof model !== 'string') return null;
  const trimmed = model.trim();
  if (!trimmed || trimmed === DEFAULT_MODEL_OPTION.id) return null;
  const slug = resolveAntigravityModelSlug(trimmed);
  if (!slug) return trimmed;
  if (agentCapabilities.get('antigravity')?.modelFlag) return null;
  return antigravityLabelForSlug(slug);
}

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
// process-global, so two OD runs that both route their model through
// settings.json (see resolveAntigravitySettingsLabel) can race: run A
// writes model A, spawn A starts, run B writes model B before A's agy
// has read settings.json — A then executes on model B. The daemon
// serialises those spawns through this chain: each acquire awaits the
// previous release, and each release fires only after the spawned agy
// actually emits `Propagating selected model override to backend:
// label="<X>"` in its `--log-file` (which is the upstream signal that
// settings.json was read). Spawns that select via `--model` argv skip
// the chain entirely — argv is per-process, nothing shared to race.
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
    '--model': 'modelFlag',
  },
  // `agy models` prints the signed-in account's live catalog
  // (`<slug>\t<label>` rows) and does a network fetch to build it, so
  // allow the same 15s budget the other network-backed listings use.
  // Signed out it exits 1, detection falls back to the static hint.
  listModels: {
    args: ['models'],
    parse: parseAntigravityModels,
    timeoutMs: 15_000,
  },
  fallbackModels: ANTIGRAVITY_FALLBACK_MODELS,
  // Saved picks from the pre-slug picker are display labels; map them
  // to slugs before shared validation so chat and connection tests
  // keep the selection instead of rejecting it for its spaces.
  normalizeModelId: (modelId: string) =>
    resolveAntigravityModelSlug(modelId) ?? modelId.trim(),
  // We deliberately do NOT opt into `resumesSessionViaCli` / agy's `-c`
  // resume flag on follow-up turns. Tested both shapes; `-c` activates
  // agy's internal agentic loop (multi-step model retries, tool calls,
  // fallback-to-cached-response on tool errors) which can't be steered
  // from OD's system-prompt OVERRIDE — even with the strongest wording
  // we got an identical byte-for-byte form re-emission on turn 2 when
  // turn 1's tool-call retry path returned the cached form response.
  //
  // Instead we treat agy as a stateless adapter like qwen /
  // deepseek: every spawn gets the full OD-rendered transcript via
  // `buildDaemonTranscript`, and that transcript's prior assistant
  // turns are sanitized to strip `<question-form>` markup + form-schema
  // JSON fences (see `sanitizePriorAssistantTurnForTranscript` in
  // apps/web/src/providers/daemon.ts).
  buildArgs: (
    _prompt,
    _imagePaths,
    _extra = [],
    options = {},
    runtimeContext = {},
  ) => {
    const settingsLabel = resolveAntigravitySettingsLabel(options.model);
    if (settingsLabel) {
      writeAntigravityModelSelection(
        settingsLabel,
        runtimeContext.antigravitySettingsPath,
      );
    }
    const args: string[] = [];
    // Always opt into `--log-file` when the daemon supplied a path: the
    // settings.json lock in server.ts waits for agy to log the model
    // override there, and the connection test folds its tail into auth /
    // quota classification.
    //
    // Flag order is load-bearing on agy: put `--log-file` first so
    // diagnostics (model override / auth / quota) land in the log.
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    // Per-session model selection. Only when the settings.json path
    // above did not claim the pick and the capability probe confirmed
    // this build accepts `--model` — passing it to a build without the
    // flag is a hard unknown-option exit, while omitting it on the
    // settings path would double-select.
    const modelSlug = settingsLabel
      ? null
      : resolveAntigravityModelSlug(options.model);
    if (modelSlug && agentCapabilities.get('antigravity')?.modelFlag) {
      args.push('--model', modelSlug);
    }
    // Daemon-managed headless runs have no interactive approval channel.
    if (agentCapabilities.get('antigravity')?.skipPermissions) {
      args.push(ANTIGRAVITY_SKIP_PERMISSIONS_FLAG);
    }
    args.push(...ANTIGRAVITY_STREAM_JSON_ARGS);
    return args;
  },
  promptViaStdin: true,
  encodeStdinPrompt: encodeAntigravityStdinPrompt,
  streamFormat: 'json-event-stream',
  eventParser: 'antigravity',
  installUrl: 'https://antigravity.google/cli',
  docsUrl: 'https://antigravity.google/docs/cli-overview',
} satisfies RuntimeAgentDef;
