const AMR_PROFILE_ENV = 'OPEN_DESIGN_AMR_PROFILE';
const DEFAULT_PROFILE = 'prod';
const ALLOWED_PROFILES = new Set(['prod', 'test', 'local']);

export type AmrProfile = 'prod' | 'test' | 'local';

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function resolveAmrProfile(env: EnvMap = process.env): AmrProfile {
  const raw = (env[AMR_PROFILE_ENV] || '').trim();
  if (!raw) return DEFAULT_PROFILE;
  if (ALLOWED_PROFILES.has(raw)) return raw as AmrProfile;
  console.warn(
    `[amr] invalid ${AMR_PROFILE_ENV}="${raw}"; falling back to ${DEFAULT_PROFILE}`,
  );
  return DEFAULT_PROFILE;
}

export function amrVelaProfileEnv(env: EnvMap = process.env): { VELA_PROFILE: AmrProfile } {
  return { VELA_PROFILE: resolveAmrProfile(env) };
}
