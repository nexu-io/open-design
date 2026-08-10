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

export const MAC_PACKAGED_SMOKE_SCENARIOS = {
  shellLifecycle: {
    domains: ['shell', 'standalone', 'contract', 'distribution'],
    id: 'mac-shell-lifecycle',
    lane: 'shell',
    title: 'runs the installed mac current-delivery lifecycle across Shell and Standalone boundaries',
  },
  shellSilentUpdate: {
    domains: ['shell', 'contract'],
    id: 'mac-shell-silent-update',
    lane: 'shell',
    title: 'applies a downloaded payload silently on the next cold start',
  },
  shellRollback: {
    domains: ['shell', 'contract'],
    id: 'mac-shell-rollback',
    lane: 'shell',
    title: 'rolls back a crashing payload and self-heals on the next good update',
  },
  standaloneClosure: {
    domains: ['standalone', 'contract'],
    id: 'mac-standalone-closure',
    lane: 'standalone',
    title: '[P0] attaches a release Closure across cold start and reinstall, then fails a damaged successor closed',
  },
  legacyMigration: {
    domains: ['migration', 'distribution', 'contract'],
    id: 'mac-legacy-migration',
    lane: 'migration',
    title: '[P0] routes the last packaged beta through the installer and preserves product data in the new architecture',
  },
} as const satisfies Record<string, PackagedSmokeScenario>;

export const MAC_SHELL_PROOF_SCENARIO_IDS = Object.values(MAC_PACKAGED_SMOKE_SCENARIOS)
  .filter((scenario) => scenario.lane === 'shell' || scenario.lane === 'migration')
  .map((scenario) => scenario.id);

export const WIN_PACKAGED_SMOKE_SCENARIOS = {
  shellLifecycle: {
    domains: ['shell', 'standalone', 'contract', 'distribution'],
    id: 'win-shell-lifecycle',
    lane: 'shell',
    title: '[P2] installs, starts, inspects with eval and screenshot, stops, and uninstalls the built windows artifact',
  },
  shellSilentUpdate: {
    domains: ['shell', 'contract'],
    id: 'win-shell-silent-update',
    lane: 'shell',
    title: 'applies a downloaded payload silently on the next cold start',
  },
  shellRollback: {
    domains: ['shell', 'contract'],
    id: 'win-shell-rollback',
    lane: 'shell',
    title: 'rolls back a crashing payload and self-heals on the next good update',
  },
  standaloneClosure: {
    domains: ['standalone', 'contract'],
    id: 'win-standalone-closure',
    lane: 'standalone',
    title: '[P0] attaches a release Closure across cold start and reinstall, then rolls a damaged successor back',
  },
  legacyMigration: {
    domains: ['migration', 'distribution', 'contract'],
    id: 'win-legacy-migration',
    lane: 'migration',
    title: '[P0] routes the last packaged Windows beta through the installer and preserves product data in the new architecture',
  },
} as const satisfies Record<string, PackagedSmokeScenario>;

export const WIN_SHELL_PROOF_SCENARIO_IDS = Object.values(WIN_PACKAGED_SMOKE_SCENARIOS)
  .filter((scenario) => scenario.lane === 'shell' || scenario.lane === 'migration')
  .map((scenario) => scenario.id);

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
