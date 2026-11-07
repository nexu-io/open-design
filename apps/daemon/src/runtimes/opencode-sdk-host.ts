import type { OpenCode } from '@opencode/sdk';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BYOK_OPENCODE_PROVIDER_ID } from './byok-opencode.js';

export type OpenCodeSdkSessionID = string;

export interface OpenCodeSdkModel {
  id: string;
  providerID: string;
  variant?: string;
}

export interface OpenCodeSdkPromptInput {
  sessionID: string;
  text: string;
}

/**
 * Parse a daemon model id (`provider/model[#variant]`, or
 * `open-design-byok/raw` for BYOK) into the `{ id, providerID, variant? }`
 * shape `sessions.create` / `sessions.switchModel` require.
 * Returns null for empty / `default` (caller omits `model` and keeps the
 * session default).
 */
export function toOpenCodeSdkModel(
  model: string | null | undefined,
  variant?: string | null | undefined,
): OpenCodeSdkModel | null {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed || trimmed.toLowerCase() === 'default') return null;
  // BYOK sessions always address the run-scoped provider.
  if (trimmed.startsWith(`${BYOK_OPENCODE_PROVIDER_ID}/`)) {
    const raw = trimmed.slice(BYOK_OPENCODE_PROVIDER_ID.length + 1).trim();
    if (!raw) return null;
    return { id: raw, providerID: BYOK_OPENCODE_PROVIDER_ID };
  }
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash >= trimmed.length - 1) {
    // No provider prefix (e.g. a raw BYOK model id that missed the prefix):
    // address it through the run-scoped BYOK provider.
    return { id: trimmed, providerID: BYOK_OPENCODE_PROVIDER_ID };
  }
  const providerID = trimmed.slice(0, slash);
  let id = trimmed.slice(slash + 1);
  let resolvedVariant = typeof variant === 'string' && variant.trim() && variant.trim().toLowerCase() !== 'default'
    ? variant.trim()
    : undefined;
  const hash = id.indexOf('#');
  if (hash >= 0) {
    const embedded = id.slice(hash + 1).trim();
    id = id.slice(0, hash).trim();
    if (embedded && !resolvedVariant) resolvedVariant = embedded;
  }
  if (!providerID || !id) return null;
  return resolvedVariant ? { id, providerID, variant: resolvedVariant } : { id, providerID };
}

type SdkHost = Awaited<ReturnType<typeof OpenCode.create>>;

let sharedHost: SdkHost | null = null;
let sharedHostRefCount = 0;

/**
 * Path of the CLI-owned OpenCode SQLite database (`opencode.db`), which
 * carries the user's login credentials and provider auth. A bare
 * `OpenCode.create()` boots with a fresh/empty database, so it only sees
 * the unauthenticated free-model subset (9 `opencode/*` models, 1 provider)
 * while the CLI reports the full catalog (72 models, `opencode` +
 * `opencode-go`). Pointing the embedded host at the CLI database makes the
 * SDK catalog identical to `opencode models`. Returns null when the file is
 * absent (fresh machine) so the host falls back to its default.
 */
export function resolveOpenCodeCliDatabasePath(homeDir: string = os.homedir()): string | null {
  const xdg = process.env.XDG_DATA_HOME?.trim();
  const base = xdg
    ? xdg
    : process.platform === 'win32'
      ? (process.env.LOCALAPPDATA?.trim() || path.join(homeDir, 'AppData', 'Local'))
      : path.join(homeDir, '.local', 'share');
  const file = path.join(base, 'opencode', 'opencode.db');
  try {
    if (existsSync(file)) return file;
  } catch {
    // Filesystem probe failure: behave as if the database is absent.
  }
  return null;
}

/**
 * Native in-process OpenCode host (see https://opencode.ai/docs/build/sdk/).
 * One host per daemon process, ref-counted. Callers must `releaseHost()`
 * when done so daemon shutdown can close the router cleanly.
 *
 * SDK is the default and only transport for the opencode family; there is
 * no env gate and no CLI fallback.
 */
export async function acquireSharedSdkHost(options?: { plugins?: unknown[] }): Promise<SdkHost> {
  if (sharedHost) {
    sharedHostRefCount += 1;
    return sharedHost;
  }
  const { OpenCode } = await import('@opencode/sdk');
  // Share the CLI's credential database so the embedded catalog (and every
  // session's provider auth) matches `opencode models` / `opencode run`.
  const databasePath = resolveOpenCodeCliDatabasePath();
  const host = (await OpenCode.create({
    ...(options?.plugins ? { plugins: options.plugins as never[] } : {}),
    ...(databasePath ? { database: { path: databasePath } } : {}),
  })) as SdkHost;
  sharedHost = host;
  sharedHostRefCount = 1;
  return host;
}

export async function releaseSharedSdkHost(): Promise<void> {
  if (!sharedHost) return;
  sharedHostRefCount -= 1;
  if (sharedHostRefCount > 0) return;
  const host = sharedHost;
  sharedHost = null;
  sharedHostRefCount = 0;
  await host.close().catch(() => {});
}

export async function createSdkSession(
  host: SdkHost,
  directory: string,
  init?: { agent?: string; model?: OpenCodeSdkModel | null; title?: string },
): Promise<OpenCodeSdkSessionID> {
  const session = (await (host as unknown as {
    sessions: { create: (input: unknown) => Promise<{ id: string }> };
  }).sessions.create({
    ...(init?.title ? { title: init.title } : {}),
    ...(init?.agent ? { agent: init.agent } : {}),
    ...(init?.model ? { model: init.model } : {}),
    location: { directory },
  })) as { id: string };
  if (!session?.id) throw new Error('opencode SDK session create returned no id');
  return session.id;
}

export async function switchSdkSessionModel(
  host: SdkHost,
  sessionID: string,
  model: OpenCodeSdkModel,
): Promise<void> {
  await (host as unknown as {
    sessions: { switchModel: (input: unknown) => Promise<unknown> };
  }).sessions.switchModel({ sessionID, model });
}

export function subscribeSdkEvents(
  host: SdkHost,
  options?: { signal?: AbortSignal; types?: string[] },
): AsyncIterable<unknown> {
  const events = (host as unknown as {
    events: { subscribe: (opts?: unknown) => AsyncIterable<unknown> };
  }).events;
  return events.subscribe({
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.types ? { types: options.types } : {}),
  });
}

/**
 * Prompt an existing SDK session. Resume is the same call with the same
 * `sessionID` — there is no `-s <id>` argv. Model selection happens at
 * `createSdkSession` / `switchSdkSessionModel`, never here: the prompt
 * wire (`SessionPromptInput`) carries only `{ sessionID, text }`.
 */
export async function promptSdkSession(
  host: SdkHost,
  input: OpenCodeSdkPromptInput,
  requestOptions?: { signal?: AbortSignal },
): Promise<unknown> {
  const sessions = (host as unknown as {
    sessions: { prompt: (input: unknown, opts?: unknown) => Promise<unknown> };
  }).sessions;
  return sessions.prompt(
    { sessionID: input.sessionID, text: input.text },
    requestOptions ?? {},
  );
}
