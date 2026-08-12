import type { PackagedSmokeScenario } from './packaged-smoke-contract.ts';

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
