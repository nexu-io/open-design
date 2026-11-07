import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { ensureDetectedRuntimeCapabilities } from '../../src/runtimes/detection.js';

// SDK-only transport: the opencode def no longer declares `helpArgs` /
// `capabilityFlags`, so there is no `run --help` probe to cache, retry, or
// re-run after an in-place upgrade. These specs lock in that no-probe
// behavior: detection resolves null without spawning anything, even when a
// binary exists at the configured path.
describe('OpenCode capability cache', () => {
  const dirs: string[] = [];
  afterEach(() => {
    agentCapabilities.delete('opencode');
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('performs no --help probe for the SDK transport', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'od-opencode-scope-'));
    dirs.push(dir);
    const env = { OPENCODE_BIN: path.join(dir, 'opencode') };

    await expect(ensureDetectedRuntimeCapabilities('opencode', env)).resolves.toBeNull();
  });

  it('still performs no probe after a binary change at the same path', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'od-opencode-probe-'));
    dirs.push(dir);
    const env = { OPENCODE_BIN: path.join(dir, 'opencode') };

    await expect(ensureDetectedRuntimeCapabilities('opencode', env)).resolves.toBeNull();
    await expect(ensureDetectedRuntimeCapabilities('opencode', env)).resolves.toBeNull();
  });
});
