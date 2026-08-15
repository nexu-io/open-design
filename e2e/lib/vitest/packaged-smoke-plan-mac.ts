import type { PackagedSmokeScenario } from './packaged-smoke-contract.ts';

export const MAC_PACKAGED_SMOKE_SCENARIOS = {
  shellLifecycle: {
    boundaries: { agent: 'not-exercised', auth: 'not-exercised', landing: 'synthetic-state', release: 'temporary-fixture' },
    doesNotProve: ['real account authentication', 'real coding-agent connectivity', 'public feed availability'],
    domains: ['shell', 'standalone', 'contract', 'distribution'],
    id: 'mac-shell-lifecycle',
    initialState: 'isolated install with validated completed local-execution projection',
    lane: 'shell',
    proves: ['installed product reaches its terminal surface', 'Shell and Standalone update transaction', 'clean stop and installed-outer restart'],
    title: 'runs the installed mac current-delivery lifecycle across Shell and Standalone boundaries',
  },
  shellSilentUpdate: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'temporary-fixture' },
    doesNotProve: ['real account authentication', 'public feed availability'],
    domains: ['shell', 'contract'],
    id: 'mac-shell-silent-update',
    initialState: 'healthy installed predecessor with a downloaded successor',
    lane: 'shell',
    proves: ['silent policy authorizes one cold-start activation'],
    title: 'applies a downloaded payload silently on the next cold start',
  },
  shellRollback: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'temporary-fixture' },
    doesNotProve: ['real account authentication', 'public feed availability'],
    domains: ['shell', 'contract'],
    id: 'mac-shell-rollback',
    initialState: 'healthy last-successful predecessor with a corrupt prepared successor',
    lane: 'shell',
    proves: ['failed successor preserves lastSuccessful', 'later healthy successor converges'],
    title: 'rolls back a crashing payload and self-heals on the next good update',
  },
  standaloneClosure: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'public-immutable' },
    doesNotProve: ['real account authentication', 'real coding-agent connectivity'],
    domains: ['standalone', 'contract'],
    id: 'mac-standalone-closure',
    initialState: 'isolated install with an immutable Closure distribution',
    lane: 'standalone',
    proves: ['Closure cold start and reinstall reuse', 'exact-version damage repair', 'store recovery'],
    title: '[P0] attaches a release Closure across cold start and reinstall, then repairs exact-version damage',
  },
  legacyMigration: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'public-immutable' },
    doesNotProve: ['real account authentication', 'real coding-agent connectivity'],
    domains: ['migration', 'distribution', 'contract'],
    id: 'mac-legacy-migration',
    initialState: 'pinned immutable legacy package with product data',
    lane: 'migration',
    proves: ['legacy minVersion routes through installer', 'product data survives architecture migration'],
    title: '[P0] routes the last packaged beta through the installer and preserves product data in the new architecture',
  },
} as const satisfies Record<string, PackagedSmokeScenario>;

export const MAC_SHELL_PROOF_SCENARIO_IDS = Object.values(MAC_PACKAGED_SMOKE_SCENARIOS)
  .filter((scenario) => scenario.lane === 'shell' || scenario.lane === 'migration')
  .map((scenario) => scenario.id);
