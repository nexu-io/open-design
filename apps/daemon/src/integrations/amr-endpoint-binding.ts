import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseAmrEndpointBinding,
  type AmrEndpointBinding,
} from '@open-design/contracts';

const BINDING_ENV = 'OPEN_DESIGN_AMR_ENDPOINT_BINDING';
const OVERRIDES = new Set([
  'OPEN_DESIGN_AMR_PROFILE',
  'VELA_PROFILE',
  'VELA_API_URL',
  'VELA_LINK_URL',
  'VELA_CONTROL_KEY',
  'VELA_RUNTIME_KEY',
  'AMR_HOME',
  BINDING_ENV,
]);
let credentialHome: string | undefined;
let initializedIdentity: string | undefined;
const pinnedHomes = new Map<string, string>();

export function readAmrEndpointBinding(env: NodeJS.ProcessEnv = process.env): AmrEndpointBinding | undefined {
  return parseAmrEndpointBinding(process.env[BINDING_ENV] || env[BINDING_ENV]);
}

function identity(binding: AmrEndpointBinding): string {
  return createHash('sha256').update(JSON.stringify([
    binding.profile, binding.apiUrl, binding.linkUrl, binding.webUrl, binding.credentialScope,
  ])).digest('hex');
}

/** Called only after the composition root has resolved its authoritative data root. */
export function initializeAmrEndpointBinding(dataRoot: string): void {
  const binding = readAmrEndpointBinding();
  if (!binding) return;
  if (!path.isAbsolute(dataRoot)) throw new Error('AMR binding requires the resolved absolute data root');
  initializedIdentity = identity(binding);
  credentialHome = path.join(dataRoot, 'agent-runtime', 'amr', `${binding.credentialScope}-${initializedIdentity}`);
  Object.assign(process.env, applyAmrEndpointBinding(process.env));
  delete process.env.VELA_CONTROL_KEY;
  delete process.env.VELA_RUNTIME_KEY;
}

/** Settings and inherited credential overrides cannot retarget a packaged binding. */
export function applyAmrEndpointBinding(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const binding = readAmrEndpointBinding(env);
  if (!binding) return env;
  const fingerprint = identity(binding);
  if (!credentialHome || initializedIdentity !== fingerprint) {
    throw new Error('AMR endpoint binding requires initialization from the resolved data root');
  }
  const pinned = env.AMR_HOME && pinnedHomes.get(env.AMR_HOME) === fingerprint;
  const next = { ...env };
  delete next.VELA_CONTROL_KEY;
  delete next.VELA_RUNTIME_KEY;
  return {
    ...next,
    [BINDING_ENV]: JSON.stringify(binding),
    OPEN_DESIGN_AMR_PROFILE: binding.profile,
    VELA_PROFILE: binding.profile,
    VELA_API_URL: binding.apiUrl,
    VELA_LINK_URL: binding.linkUrl,
    OD_VELA_WEB_URL: binding.webUrl,
    AMR_HOME: pinned ? env.AMR_HOME : credentialHome,
  };
}

function sameEndpoint(value: unknown, expected: string): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash
      && `${url.origin}${url.pathname.replace(/\/+$/, '')}` === expected;
  } catch { return false; }
}

export function amrStoredProfileMatchesBinding(profile: unknown, env: NodeJS.ProcessEnv): boolean {
  const binding = readAmrEndpointBinding(env);
  if (!binding) return true;
  if (!profile || typeof profile !== 'object') return false;
  const stored = profile as Record<string, unknown>;
  return sameEndpoint(stored.apiUrl, binding.apiUrl) && sameEndpoint(stored.linkUrl, binding.linkUrl);
}

/** Go reads the raw config itself, so reject mismatched credentials before any spawn. */
export function assertAmrBindingCredentials(env: NodeJS.ProcessEnv): void {
  const binding = readAmrEndpointBinding(env);
  if (!binding) return;
  const file = path.join(applyAmrEndpointBinding(env).AMR_HOME ?? '', 'config.json');
  if (!existsSync(file)) return;
  let config: { profiles?: Record<string, unknown> };
  try {
    config = JSON.parse(readFileSync(file, 'utf8')) as { profiles?: Record<string, unknown> };
    if (!config || typeof config !== 'object') throw new Error('invalid config');
  } catch {
    // Do not expose parse errors containing credential-file excerpts.
    throw new Error('AMR credentials are unreadable; sign in again');
  }
  const profile = config.profiles?.[binding.profile];
  if (profile && !amrStoredProfileMatchesBinding(profile, env)) {
    throw new Error('AMR stored endpoints do not match this environment; sign in again');
  }
}

/** Private captured sessions may keep their temporary home only after this check. */
export function registerPinnedAmrCredentialHome(
  home: string,
  session: { profile: string; apiUrl: string },
): () => void {
  const binding = readAmrEndpointBinding();
  if (!binding) return () => {};
  if (!path.isAbsolute(home) || session.profile !== binding.profile || !sameEndpoint(session.apiUrl, binding.apiUrl)) {
    throw new Error('Pinned AMR session does not match this environment');
  }
  pinnedHomes.set(home, identity(binding));
  return () => { pinnedHomes.delete(home); };
}

export function stripAmrEndpointOverrides(env: Record<string, string>): Record<string, string> {
  if (!readAmrEndpointBinding()) return env;
  return Object.fromEntries(Object.entries(env).filter(([key]) => !OVERRIDES.has(key)));
}

export function amrSettingsBindingConflict(raw: unknown): boolean {
  const binding = readAmrEndpointBinding();
  if (!binding || !raw || typeof raw !== 'object') return false;
  const amr = (raw as Record<string, unknown>).amr;
  if (!amr || typeof amr !== 'object') return false;
  for (const [key, value] of Object.entries(amr)) {
    if (!OVERRIDES.has(key) || value === '' || value === undefined) continue;
    if ((key === 'OPEN_DESIGN_AMR_PROFILE' || key === 'VELA_PROFILE') && value === binding.profile) continue;
    if (key === 'VELA_API_URL' && sameEndpoint(value, binding.apiUrl)) continue;
    if (key === 'VELA_LINK_URL' && sameEndpoint(value, binding.linkUrl)) continue;
    return true;
  }
  return false;
}
