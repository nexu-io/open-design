// Pre-flight auth detection + failure classification for the codex-cli image
// provider (see the `Provider: codex-cli` block in media.ts).
//
// The built-in `image_gen` tool is a ChatGPT-hosted tool: it only works when
// the local Codex CLI is signed in with a genuine ChatGPT plan (OAuth tokens)
// AND routes through OpenAI's default model provider. An API key, a
// programmatic credential, or a third-party `model_provider` override cannot
// reach it. Rather than spawn a full `codex exec` turn and let the user wait
// ~minutes only to get a vague "no image" error, we read the same files the
// Codex CLI reads (`$CODEX_HOME/auth.json` + `config.toml`) and fail fast with
// a precise, actionable message.
//
// Schema ground truth: openai/codex `codex-rs/login/src/auth/storage.rs`
// (AuthDotJson) + `codex-rs/app-server-protocol/src/protocol/common.rs`
// (AuthMode, `#[serde(rename_all = "lowercase")]` → "apikey"/"chatgpt", plus
// "agentIdentity"/"personalAccessToken"/… for programmatic modes). `auth_mode`
// is optional in the file, so token/key presence is the robust signal and the
// field is only a corroborating hint — this mirrors codex's own
// `resolved_mode()` (OAuth tokens win, then OPENAI_API_KEY).
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type CodexImageAuthReason =
  | 'not-signed-in'
  | 'api-key'
  | 'programmatic'
  | 'third-party-provider';

export type CodexImageAuthVerdict =
  | { ok: true }
  | { ok: false; reason: CodexImageAuthReason; detail?: string };

/** Resolve CODEX_HOME exactly as the Codex CLI does: $CODEX_HOME or ~/.codex. */
export function resolveCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.CODEX_HOME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), '.codex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nestedString(obj: unknown, keys: string[]): string {
  let cur: unknown = obj;
  for (const key of keys) {
    if (!isRecord(cur)) return '';
    cur = cur[key];
  }
  return typeof cur === 'string' && cur.trim() ? cur.trim() : '';
}

/**
 * The first top-level `model_provider = "..."` assignment in a config.toml.
 *
 * TOML top-level keys must precede any `[table]` header, so we scan until the
 * first header and stop. We deliberately do NOT resolve `profile`-scoped
 * overrides (`[profiles.x] model_provider = …`): that's a rare, advanced
 * config, and resolving it correctly needs a real TOML parser we don't ship.
 * A profile-scoped third-party provider therefore slips past this check and is
 * caught later by the runtime "image_gen unavailable" path — documented here
 * so the gap is visible rather than silent.
 */
export function topLevelModelProvider(configToml: string | null): string {
  if (!configToml) return '';
  for (const rawLine of configToml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) break; // entered a table; top-level region ended
    const match = /^model_provider\s*=\s*["']([^"']+)["']/.exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

/**
 * Pure classifier: given parsed auth.json and raw config.toml text, decide
 * whether the local Codex CLI can drive the built-in image_gen tool.
 */
export function classifyCodexImageAuth(
  authJson: unknown,
  configToml: string | null,
): CodexImageAuthVerdict {
  const auth = isRecord(authJson) ? authJson : null;
  const accessToken = nestedString(auth, ['tokens', 'access_token']);
  const apiKey = nestedString(auth, ['OPENAI_API_KEY']);
  const authMode = nestedString(auth, ['auth_mode']);

  // 1. Base auth mode (mirror codex resolved_mode: OAuth tokens take priority).
  if (accessToken.length === 0) {
    if (apiKey.length > 0 || authMode === 'apikey') {
      return { ok: false, reason: 'api-key' };
    }
    if (authMode && authMode !== 'chatgpt') {
      // agentIdentity / personalAccessToken / bedrock* — programmatic creds
      // that don't carry the ChatGPT-hosted image_gen tool.
      return { ok: false, reason: 'programmatic', detail: authMode };
    }
    return { ok: false, reason: 'not-signed-in' };
  }

  // 2. ChatGPT tokens present, but a third-party model_provider routes the turn
  //    away from OpenAI's hosted image_gen tool.
  const provider = topLevelModelProvider(configToml);
  if (provider && provider.toLowerCase() !== 'openai') {
    return { ok: false, reason: 'third-party-provider', detail: provider };
  }

  return { ok: true };
}

async function readJsonIfPresent(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // Missing or malformed auth cache: treat as "no credential" rather than
    // crashing the render — the classifier maps null → not-signed-in.
    return null;
  }
}

async function readTextIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Read $CODEX_HOME/auth.json + config.toml and classify image_gen auth. */
export async function inspectCodexImageAuth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CodexImageAuthVerdict> {
  const home = resolveCodexHome(env);
  const [authJson, configToml] = await Promise.all([
    readJsonIfPresent(path.join(home, 'auth.json')),
    readTextIfPresent(path.join(home, 'config.toml')),
  ]);
  return classifyCodexImageAuth(authJson, configToml);
}

/** Turn a non-ok verdict into a precise, actionable error message. */
export function codexImageAuthErrorMessage(
  verdict: Extract<CodexImageAuthVerdict, { ok: false }>,
): string {
  switch (verdict.reason) {
    case 'not-signed-in':
      return (
        'Codex CLI is not signed in, so its built-in image_gen tool is '
        + 'unavailable. codex-image-gen needs an official ChatGPT login '
        + '(Plus, Pro, Business, Team or Edu). Run `codex login`, choose '
        + '"Sign in with ChatGPT", then retry.'
      );
    case 'api-key':
      return (
        'Codex CLI is signed in with an API key, but the built-in image_gen '
        + 'tool is only available on a ChatGPT plan — an API key bills the '
        + 'Images API and exposes no image_gen tool here. Run `codex login` '
        + 'and choose "Sign in with ChatGPT" (Plus/Pro/Business/Team) to use '
        + 'codex-image-gen.'
      );
    case 'programmatic':
      return (
        `Codex CLI is using ${verdict.detail ?? 'a programmatic'} auth, which `
        + 'cannot reach the ChatGPT-hosted image_gen tool. Sign in with a '
        + 'ChatGPT plan via `codex login` ("Sign in with ChatGPT") to use '
        + 'codex-image-gen.'
      );
    case 'third-party-provider':
      return (
        `Codex CLI is routed through a third-party model provider `
        + `(model_provider = "${verdict.detail}"), which does not expose `
        + "OpenAI's hosted image_gen tool. Use the default OpenAI provider on "
        + 'a ChatGPT plan: remove the model_provider override in '
        + '$CODEX_HOME/config.toml (or select a profile without it), then retry.'
      );
  }
}

// ── Runtime failure classification ──────────────────────────────────────────
// After codex exec exits non-zero we have only its stderr + agent text. Split
// the one generic "exited" bucket into the three operator-actionable classes
// fancyboi asked for: auth (session died mid-run), quota (ChatGPT usage limit),
// and transient (network/crash/everything else → safe to retry).

export type CodexImageFailureKind = 'auth' | 'quota' | 'transient';

// Keep these high-precision: a TRANSIENT blip mislabelled as quota tells the
// user to stop retrying for ~5h, and as auth tells them to re-login — both
// worse than the safe "just retry" default. Numeric HTTP codes are guarded
// against word/hyphen neighbours so an embedded request id (`req-401-abc`)
// can't trip them, and we deliberately omit a bare "try again later" (a
// classic transient phrase) from the quota set.
const AUTH_SIGNALS =
  /(?<![\w-])(401|403)(?![\w-])|\b(unauthorized|unauthenticated)\b|not (logged|signed) in|invalid[\s_-]*(api[\s_-]*key|token)|expired[\s_-]*(token|session|credential)|codex login|sign in (again|with)/i;
const QUOTA_SIGNALS =
  /(?<![\w-])429(?![\w-])|\bquota\b|usage limit|rate[\s_-]*limit|too many requests|insufficient[\s_-]*quota|hit your [\w\s]*limit/i;

/** Classify a codex image_gen failure from its combined output text. */
export function classifyCodexImageFailure(output: string): CodexImageFailureKind {
  const text = output || '';
  if (AUTH_SIGNALS.test(text)) return 'auth';
  if (QUOTA_SIGNALS.test(text)) return 'quota';
  return 'transient';
}

/**
 * Build the failure message for a non-zero codex exit. `reason` is the
 * `exit N` / `signal X` summary; `tail` is the trailing codex output we attach
 * for context; `output` is the full combined stderr+agent text we classify on.
 */
export function codexImageFailureMessage(opts: {
  reason: string;
  tail: string;
  output: string;
}): string {
  const { reason, tail, output } = opts;
  const kind = classifyCodexImageFailure(output);
  const said = tail ? `\nCodex said:\n${tail}` : '';
  switch (kind) {
    case 'auth':
      return (
        'Codex rejected the image_gen request as unauthenticated — your '
        + 'ChatGPT session may have expired mid-run. Run `codex login` (sign in '
        + `with your ChatGPT plan) and retry.${said}`
      );
    case 'quota':
      return (
        "Codex hit your ChatGPT plan's usage limit while generating the image. "
        + 'image_gen shares your ChatGPT quota, which resets on a rolling '
        + 'window (~every 5 hours). Wait for the reset shown above or upgrade '
        + `your plan, then retry.${said}`
      );
    case 'transient':
      // Preserve the original wording so a generic blip reads the same as
      // before and stays obviously retry-able.
      return `codex image_gen exited ${reason}${tail ? `\n${tail}` : ''}`;
  }
}
