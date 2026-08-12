import type { PackagedSmokeScenario } from './packaged-smoke-contract.ts';

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
    title: '[P0] attaches a release Closure across cold start and reinstall, then repairs exact-version damage',
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
