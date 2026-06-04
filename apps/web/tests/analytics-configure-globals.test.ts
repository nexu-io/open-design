// Regression test for the v2 configure-state globals
// (has_available_configure_cli / configure_type / configure_availability).
//
// Reviewer comment on PR #2285 (mrcfps, 2026-05-19) flagged that
// `setConfigureGlobals` was defined but never called, so every browser
// capture inherited the boot defaults `{ false, 'unknown', 'unknown' }`.
// App.tsx now drives the setter from a useEffect that watches mode /
// agentId / apiKey / apiProtocolConfigs / agents; these tests pin the
// derive-then-register behavior end-to-end against the client module so a
// future refactor can't silently regress it back to a no-op setter.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deriveConfigureGlobals,
  type DeriveConfigureGlobalsInput,
} from '@open-design/contracts/analytics';
import {
  getConfigureGlobals,
  setConfigureGlobals,
} from '../src/analytics/client';

const BOOT_DEFAULTS = {
  has_available_configure_cli: false,
  configure_type: 'unknown' as const,
  configure_availability: 'unknown' as const,
};

describe('deriveConfigureGlobals', () => {
  it('returns "none" / "unknown" when nothing is configured', () => {
    expect(deriveConfigureGlobals({})).toEqual({
      has_available_configure_cli: false,
      configure_type: 'none',
      configure_availability: 'unknown',
    });
  });

  it('reports local_cli when an installed CLI is the selected agent in daemon mode', () => {
    const input: DeriveConfigureGlobalsInput = {
      mode: 'daemon',
      agentId: 'claude',
      agents: [
        { id: 'claude', available: true },
        { id: 'codex', available: false },
      ],
    };
    expect(deriveConfigureGlobals(input)).toEqual({
      has_available_configure_cli: true,
      configure_type: 'local_cli',
      configure_availability: 'available',
    });
  });

  it('marks the configure as unavailable when the selected daemon-mode agent is not installed', () => {
    const input: DeriveConfigureGlobalsInput = {
      mode: 'daemon',
      agentId: 'codex',
      agents: [
        { id: 'claude', available: true },
        { id: 'codex', available: false },
      ],
    };
    expect(deriveConfigureGlobals(input)).toMatchObject({
      configure_type: 'local_cli',
      configure_availability: 'unavailable',
    });
  });

  it('reports byok when an api-mode user has saved credentials', () => {
    expect(
      deriveConfigureGlobals({
        mode: 'api',
        byokConfigured: true,
        agents: [],
      }),
    ).toEqual({
      has_available_configure_cli: false,
      configure_type: 'byok',
      configure_availability: 'available',
    });
  });

  it('reports both when api-mode user also has CLIs installed', () => {
    expect(
      deriveConfigureGlobals({
        mode: 'api',
        byokConfigured: true,
        agents: [{ id: 'claude', available: true }],
      }),
    ).toMatchObject({
      has_available_configure_cli: true,
      configure_type: 'both',
    });
  });
});

describe('deriveConfigureGlobals — cold-start gating', () => {
  // Reviewer #2285 (mrcfps, 2026-05-20 03:10) flagged a cold-start hole:
  // `fetchAgentsStream()` is async, so the App-level useEffect first fires with
  // `agents=[]` and `mode='daemon'`. Without gating, the helper used to
  // stamp `has_available_configure_cli=false / configure_availability=
  // unavailable` on every page_view fired before the probe resolved.
  // App.tsx now waits on `agentsLoading === false` and leaves the boot
  // defaults in place; these tests pin what the helper SHOULD return
  // for the empty-agents / partial-config inputs so a future caller
  // can't silently skip the gate again.

  it('reports unavailable / local_cli when daemon mode is pinned but no agents are loaded yet', () => {
    expect(
      deriveConfigureGlobals({ mode: 'daemon', agentId: 'claude', agents: [] }),
    ).toEqual({
      has_available_configure_cli: false,
      configure_type: 'local_cli',
      configure_availability: 'unavailable',
    });
  });

  it('reports has_available_configure_cli=true once the probe lands and the selected agent is installed', () => {
    expect(
      deriveConfigureGlobals({
        mode: 'daemon',
        agentId: 'claude',
        agents: [{ id: 'claude', available: true }],
      }),
    ).toEqual({
      has_available_configure_cli: true,
      configure_type: 'local_cli',
      configure_availability: 'available',
    });
  });

  it('survives an undefined agents list (caller forgot to pass)', () => {
    expect(
      deriveConfigureGlobals({ mode: 'daemon', agentId: 'claude' }),
    ).toMatchObject({
      has_available_configure_cli: false,
      configure_availability: 'unavailable',
    });
  });

  // Reviewer #2285 (mrcfps, 2026-05-20 03:36) flagged the daemon call site
  // for not pinning `mode: 'daemon'`. Without the explicit mode the helper
  // falls through to the generic branch and reports `available` whenever
  // any unrelated CLI is on PATH — even when the requested agent is the
  // one that's missing. This test pins the right behavior: a run targeted
  // at an uninstalled agent must report `unavailable`, regardless of
  // whether other agents happen to be installed.
  it('reports unavailable when the requested daemon-mode agent is missing even if peers are installed', () => {
    expect(
      deriveConfigureGlobals({
        mode: 'daemon',
        agentId: 'codex',
        agents: [
          { id: 'claude', available: true },
          { id: 'codex', available: false },
        ],
      }),
    ).toEqual({
      has_available_configure_cli: true,
      configure_type: 'local_cli',
      configure_availability: 'unavailable',
    });
  });
});

describe('setConfigureGlobals (web client)', () => {
  // Reset the module-level state so other suites do not bleed in.
  beforeEach(() => {
    setConfigureGlobals(BOOT_DEFAULTS);
  });
  afterEach(() => {
    setConfigureGlobals(BOOT_DEFAULTS);
  });

  it('stores the latest configure-state for downstream captures', () => {
    expect(getConfigureGlobals()).toEqual(BOOT_DEFAULTS);
    setConfigureGlobals({
      has_available_configure_cli: true,
      configure_type: 'local_cli',
      configure_availability: 'available',
    });
    expect(getConfigureGlobals()).toEqual({
      has_available_configure_cli: true,
      configure_type: 'local_cli',
      configure_availability: 'available',
    });
  });

  it('never throws when no PostHog client is initialized', () => {
    expect(() =>
      setConfigureGlobals({
        has_available_configure_cli: true,
        configure_type: 'both',
        configure_availability: 'available',
      }),
    ).not.toThrow();
  });
});
