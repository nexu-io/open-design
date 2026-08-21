import { resolveAmrProfile } from './vela-profile.js';

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

// Publicly named console origins already used by the web client. feature-test
// remains build-injected because its deployment hostname is intentionally not
// part of the public repository.
const PUBLIC_ORIGINS: Partial<Record<string, string>> = {
  prod: 'https://open-design.ai/cloud',
  test: 'https://vela.powerformer.net',
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
