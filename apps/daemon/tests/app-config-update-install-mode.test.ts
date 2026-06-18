// Tests for updateInstallMode pref — part of #4467 (PR1).
//
// Spec: apps/daemon/src/app-config.ts gains:
//   - `updateInstallMode?: 'automatic' | 'manual'` on AppConfigPrefs
//   - key added to ALLOWED_KEYS
//   - applyConfigValue validates the enum (accept 'automatic'/'manual'; reject anything else)
//   - absent/unset treated as 'automatic' (no migration needed)
//
// These tests are RED until the implementation lands.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAppConfig, writeAppConfig } from '../src/app-config.js';

describe('app-config updateInstallMode pref', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-update-install-mode-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("persists 'manual' and reads it back", async () => {
    await writeAppConfig(dataDir, { updateInstallMode: 'manual' });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBe('manual');
  });

  it("persists 'automatic' and reads it back", async () => {
    await writeAppConfig(dataDir, { updateInstallMode: 'automatic' });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBe('automatic');
  });

  it('rejects invalid enum values and drops them', async () => {
    // 'bogus' is not in the allowed enum; writeAppConfig must drop it.
    await writeAppConfig(dataDir, { updateInstallMode: 'bogus' as any });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBeUndefined();
  });

  it('treats absent field as automatic (no stored value, no crash)', async () => {
    // Fresh config with no updateInstallMode — should be absent (undefined),
    // which callers treat as 'automatic'.
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBeUndefined();
  });

  it("updateInstallMode is included in ALLOWED_KEYS (round-trip without unknown-key filter dropping it)", async () => {
    // ALLOWED_KEYS gate: only keys in the set survive writeAppConfig.
    // If updateInstallMode is missing from ALLOWED_KEYS it is silently
    // dropped — this test catches that regression.
    await writeAppConfig(dataDir, { updateInstallMode: 'manual', agentId: 'claude' });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBe('manual');
    expect(cfg.agentId).toBe('claude');
  });

  it("clears updateInstallMode when null is sent", async () => {
    await writeAppConfig(dataDir, { updateInstallMode: 'manual' });
    await writeAppConfig(dataDir, { updateInstallMode: null as any });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBeUndefined();
  });
});
