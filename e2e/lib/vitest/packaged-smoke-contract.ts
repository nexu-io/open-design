import type { PackagedSmokeProfile } from './packaged-smoke-profile.ts';

export const PACKAGED_SMOKE_LANES = ['shell', 'standalone', 'migration'] as const;

export type PackagedSmokeLane = typeof PACKAGED_SMOKE_LANES[number];
export type PackagedSmokeDomain = 'contract' | 'distribution' | 'migration' | 'shell' | 'standalone';

export type PackagedSmokeScenario = {
  domains: readonly PackagedSmokeDomain[];
  id: string;
  lane: PackagedSmokeLane;
  title: string;
};

export function resolvePackagedSmokeLanes(
  profile: PackagedSmokeProfile,
  raw: string | undefined | null,
): PackagedSmokeLane[] {
  const normalized = raw?.trim() ?? '';
  if (normalized.length === 0) {
    if (profile === 'skip') return [];
    if (profile === 'core') return ['shell', 'standalone'];
    return [...PACKAGED_SMOKE_LANES];
  }
  if (profile === 'skip') {
    throw new Error('packaged smoke lanes cannot be selected when the smoke profile is skip');
  }
  const requested = normalized.split(',').map((entry) => entry.trim());
  if (requested.some((entry) => entry.length === 0)) {
    throw new Error(`invalid packaged smoke lanes ${JSON.stringify(raw)}: empty lane`);
  }
  const unsupported = requested.filter((entry) => !PACKAGED_SMOKE_LANES.includes(entry as PackagedSmokeLane));
  if (unsupported.length > 0) {
    throw new Error(
      `unsupported packaged smoke lane(s) ${unsupported.join(', ')}; expected ${PACKAGED_SMOKE_LANES.join(', ')}`,
    );
  }
  return PACKAGED_SMOKE_LANES.filter((lane) => requested.includes(lane));
}

export function hasPackagedSmokeLane(
  lanes: readonly PackagedSmokeLane[],
  lane: PackagedSmokeLane,
): boolean {
  return lanes.includes(lane);
}
