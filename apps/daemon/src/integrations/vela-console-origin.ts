import { resolveAmrProfile } from './vela-profile.js';

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

// Publicly named console origins already used by the web client. Each value is
// a Cloud *base* that callers append a console path to (`/dashboard`,
// `/settings`), so the `/cloud` segment belongs here rather than at each call
// site — every consumer concatenates, none resolves against it as a URL base.
//
// The test entry moved off `vela.powerformer.net` onto
// `open-design.powerformer.net/cloud` when vela cut the test Cloud domain over
// (vela #1922 prepare, #1929 finalize). The new host serves the test Landing
// page at `/` and hands `/cloud*` and `/amr*` to a test-only path proxy; the
// legacy hostname is no longer a mapped test route and is scheduled for
// decommissioning, so it must not be relied on for a compatibility redirect.
//
// feature-test is deliberately absent: this repository ships publicly and that
// deployment's hostname is internal. It is supplied at packaging time through
// OD_VELA_WEB_URLS / OD_VELA_WEB_URL, so an un-injected build resolves nothing
// for it and the client falls back to the public console instead of guessing.
const PUBLIC_ORIGINS: Partial<Record<string, string>> = {
  prod: 'https://open-design.ai/cloud',
  test: 'https://open-design.powerformer.net/cloud',
  local: 'http://localhost:5173',
};

function normalizedOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const origin = value.trim().replace(/\/+$/, '');
  return origin.length > 0 ? origin : undefined;
}

function originsByProfile(env: EnvMap): Record<string, string> {
  const raw = env.OD_VELA_WEB_URLS?.trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const profile of ['prod', 'test', 'feature-test', 'local'] as const) {
      const origin = normalizedOrigin((parsed as Record<string, unknown>)[profile]);
      if (origin) result[profile] = origin;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Resolve the console origin for the AMR profile selected in app settings.
 *
 * `OD_VELA_WEB_URL` describes only the profile baked into the package. It is
 * safe as a compatibility fallback while that same profile remains selected,
 * but must never leak across a runtime profile switch. New packages also carry
 * `OD_VELA_WEB_URLS`, a build-time-injected profile map that makes switching
 * links deterministic without checking internal deployment names into source.
 */
export function resolveEffectiveVelaConsoleOrigin(
  env: EnvMap = process.env,
  configuredEnv: EnvMap = {},
): string | undefined {
  const packagedProfile = resolveAmrProfile(env);
  const selectedProfile = resolveAmrProfile({ ...env, ...configuredEnv });
  const mapped = originsByProfile(env)[selectedProfile];
  if (mapped) return mapped;
  if (selectedProfile === packagedProfile) {
    const packagedOrigin = normalizedOrigin(env.OD_VELA_WEB_URL);
    if (packagedOrigin) return packagedOrigin;
  }
  const hasRuntimeSelection = Boolean(
    configuredEnv.OPEN_DESIGN_AMR_PROFILE?.trim() || configuredEnv.VELA_PROFILE?.trim(),
  );
  const publicOrigin = hasRuntimeSelection ? PUBLIC_ORIGINS[selectedProfile] : undefined;
  if (publicOrigin) return publicOrigin;
  return undefined;
}
