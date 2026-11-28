import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { wellKnownUserToolchainBins } from '../src/toolchain.js';

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

describe('Antigravity Windows toolchain discovery', () => {
  it('includes the home-relative installer directory without environment variables', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const home = join(tmpdir(), 'od-antigravity-home');
    const dirs = wellKnownUserToolchainBins({ home, env: {} });

    expect(dirs).toContain(join(home, 'AppData', 'Local', 'agy', 'bin'));
  });

  it('includes a relocated LOCALAPPDATA install directory', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const home = join(tmpdir(), 'od-antigravity-home');
    const localAppData = join(tmpdir(), 'od-antigravity-localappdata');
    const dirs = wellKnownUserToolchainBins({ home, env: { LOCALAPPDATA: localAppData } });

    expect(dirs).toContain(join(localAppData, 'agy', 'bin'));
  });

  it('does not add Windows installer directories on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const home = join(tmpdir(), 'od-antigravity-home');
    const dirs = wellKnownUserToolchainBins({ home, env: {}, includeSystemBins: false });

    expect(dirs).not.toContain(join(home, 'AppData', 'Local', 'agy', 'bin'));
  });
});
