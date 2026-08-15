import type { PackagedSmokeScenario } from './packaged-smoke-contract.ts';

export const WIN_PACKAGED_SMOKE_SCENARIOS = {
  shellLifecycle: {
    boundaries: { agent: 'not-exercised', auth: 'not-exercised', landing: 'synthetic-state', release: 'temporary-fixture' },
    doesNotProve: ['real account authentication', 'real coding-agent connectivity', 'public feed availability'],
    domains: ['shell', 'standalone', 'contract', 'distribution'],
    id: 'win-shell-lifecycle',
    initialState: 'isolated install with validated completed local-execution projection',
    lane: 'shell',
    proves: ['installed product reaches its terminal surface', 'Shell and Standalone update transaction', 'clean stop and installed-outer restart'],
    title: '[P2] installs, starts, inspects with eval and screenshot, stops, and uninstalls the built windows artifact',
  },
  shellSilentUpdate: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'temporary-fixture' },
    doesNotProve: ['real account authentication', 'public feed availability'],
    domains: ['shell', 'contract'],
    id: 'win-shell-silent-update',
    initialState: 'healthy installed predecessor with a downloaded successor',
    lane: 'shell',
    proves: ['silent policy authorizes one cold-start activation'],
    title: 'applies a downloaded payload silently on the next cold start',
  },
  shellRollback: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'temporary-fixture' },
    doesNotProve: ['real account authentication', 'public feed availability'],
    domains: ['shell', 'contract'],
    id: 'win-shell-rollback',
    initialState: 'healthy last-successful predecessor with a corrupt prepared successor',
    lane: 'shell',
    proves: ['failed successor preserves lastSuccessful', 'later healthy successor converges'],
    title: 'rolls back a crashing payload and self-heals on the next good update',
  },
  nativeInstallBoundaries: {
    boundaries: { agent: 'not-exercised', auth: 'not-exercised', landing: 'not-exercised', release: 'temporary-fixture' },
    doesNotProve: ['renderer readiness', 'real account authentication'],
    domains: ['shell', 'distribution', 'contract'],
    id: 'win-native-install-boundaries',
    initialState: 'isolated Windows installer namespace',
    lane: 'shell',
    proves: ['native install transaction and repair', 'registry and uninstall ownership', 'embedded extraction tool'],
    title: '[P0] proves native Windows install transaction, repair, integration ownership, embedded 7zip, and uninstall data defaults',
  },
  standaloneClosure: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'public-immutable' },
    doesNotProve: ['real account authentication', 'real coding-agent connectivity'],
    domains: ['standalone', 'contract'],
    id: 'win-standalone-closure',
    initialState: 'isolated install with an immutable Closure distribution',
    lane: 'standalone',
    proves: ['Closure cold start and reinstall reuse', 'exact-version damage repair', 'store recovery'],
    title: '[P0] attaches a release Closure across cold start and reinstall, then repairs exact-version damage',
  },
  legacyMigration: {
    boundaries: { agent: 'not-exercised', auth: 'synthetic-state', landing: 'synthetic-state', release: 'public-immutable' },
    doesNotProve: ['real account authentication', 'real coding-agent connectivity'],
    domains: ['migration', 'distribution', 'contract'],
    id: 'win-legacy-migration',
    initialState: 'pinned immutable legacy package with product data',
    lane: 'migration',
    proves: ['legacy minVersion routes through installer', 'product data survives architecture migration'],
    title: '[P0] routes the last packaged Windows beta through the installer and preserves product data in the new architecture',
  },
} as const satisfies Record<string, PackagedSmokeScenario>;

export const WIN_SHELL_PROOF_SCENARIO_IDS = Object.values(WIN_PACKAGED_SMOKE_SCENARIOS)
  .filter((scenario) => scenario.lane === 'shell' || scenario.lane === 'migration')
  .map((scenario) => scenario.id);
