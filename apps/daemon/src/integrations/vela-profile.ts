const AMR_PROFILE_ENV = 'OPEN_DESIGN_AMR_PROFILE';
const VELA_PROFILE_ENV = 'VELA_PROFILE';
const DEFAULT_PROFILE = 'prod';
const ALLOWED_PROFILES = new Set(['prod', 'test', 'feature-test', 'local']);

export type AmrProfile = 'prod' | 'test' | 'feature-test' | 'local';

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function resolveAmrProfile(env: EnvMap = process.env): AmrProfile {
  const source = (env[AMR_PROFILE_ENV] || '').trim() ? AMR_PROFILE_ENV : VELA_PROFILE_ENV;
  const raw = (env[AMR_PROFILE_ENV] || env[VELA_PROFILE_ENV] || '').trim();
  if (!raw) return DEFAULT_PROFILE;
  if (ALLOWED_PROFILES.has(raw)) return raw as AmrProfile;
  console.warn(
    `[amr] invalid ${source}="${raw}"; expected prod, test, feature-test, or local; falling back to ${DEFAULT_PROFILE}`,
  );
  return DEFAULT_PROFILE;
}

export function amrVelaProfileEnv(env: EnvMap = process.env): { VELA_PROFILE: AmrProfile } {
  return { VELA_PROFILE: resolveAmrProfile(env) };
}
