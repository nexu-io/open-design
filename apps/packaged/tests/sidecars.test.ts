/**
 * Regression coverage for the OD_LEGACY_DATA_DIR migration-aware
 * daemon status timeout in apps/packaged/src/sidecars.ts.
 *
 * Background: when the user is recovering 0.3.x `.od/` data via
 * OD_LEGACY_DATA_DIR, apps/daemon/src/legacy-data-migrator.ts runs a
 * synchronous payload copy at module import time, before the daemon
 * sidecar can answer status. With the default 35-second status budget
 * a multi-GB legacy `.od/projects` or `.od/artifacts` tree can hit the
 * timeout while staging is still copying, after which the parent tears
 * the child down mid-promotion and can leave dataDir half-promoted
 * even with the in-process rollback.
 *
 * @see apps/packaged/src/sidecars.ts
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/nexu-io/open-design/issues/710
 */
import { describe, expect, it } from 'vitest';

import { resolveDaemonStatusTimeoutMs } from '../src/sidecars.js';

describe('resolveDaemonStatusTimeoutMs', () => {
  it('uses the default 35-second budget for normal cold boots', () => {
    expect(resolveDaemonStatusTimeoutMs({})).toBe(35_000);
  });

  it('treats an empty OD_LEGACY_DATA_DIR as unset', () => {
    expect(resolveDaemonStatusTimeoutMs({ OD_LEGACY_DATA_DIR: '' })).toBe(35_000);
  });

  it('extends the budget to 30 minutes when OD_LEGACY_DATA_DIR is set', () => {
    // The packaged sidecar must give the daemon a long-enough window to
    // sync-copy a multi-GB legacy `.od/` payload. Anything below ~10
    // minutes was historically observed to time out on real installs.
    const value = resolveDaemonStatusTimeoutMs({
      OD_LEGACY_DATA_DIR: '/path/to/old/.od',
    });
    expect(value).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(value).toBe(30 * 60 * 1000);
  });

  it('falls back to process.env when called with no argument', () => {
    const original = process.env.OD_LEGACY_DATA_DIR;
    try {
      delete process.env.OD_LEGACY_DATA_DIR;
      expect(resolveDaemonStatusTimeoutMs()).toBe(35_000);
      process.env.OD_LEGACY_DATA_DIR = '/some/legacy/path';
      expect(resolveDaemonStatusTimeoutMs()).toBe(30 * 60 * 1000);
    } finally {
      if (original == null) delete process.env.OD_LEGACY_DATA_DIR;
      else process.env.OD_LEGACY_DATA_DIR = original;
    }
  });
});
