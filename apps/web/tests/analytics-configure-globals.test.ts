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
