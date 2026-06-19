import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveFirstExistingExecutable, resolveHostToolLaunchPlan } from '../src/routes/host-tools.js';

describe('host tools open-in launch plans', () => {
  it('uses the absolute macOS open command to reveal project folders in Finder', async () => {
    if (process.platform !== 'darwin') return;

    const plan = await resolveHostToolLaunchPlan('finder', '/tmp/open-design-project');

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/usr/bin/open');
    expect(plan.args).toEqual(['-R', '/tmp/open-design-project']);
  });

  it('finds macOS system app bundles outside /Applications and launches through absolute open', async () => {
    if (process.platform !== 'darwin') return;

    const plan = await resolveHostToolLaunchPlan('terminal', '/tmp/open-design-project');

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/usr/bin/open');
    expect(plan.args).toEqual(['-a', 'Terminal', '/tmp/open-design-project']);
  });
});

// ---------------------------------------------------------------------------
// resolveFirstExistingExecutable — pure helper, no platform gate.
// Runs on Linux CI and Windows alike; must never branch on process.platform.
// ---------------------------------------------------------------------------

describe('resolveFirstExistingExecutable', () => {
  // Env-var key used across all tests in this suite. Chosen to be obviously
  // test-scoped and absent from any real environment.
  const TEST_VAR = 'OD_TEST_EXEC_TMPDIR_4539';
  let tmpDir = '';
  let realFile = '';

  beforeEach(async () => {
    // Create an isolated temp directory and place a real file inside it.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-host-tools-4539-'));
    realFile = path.join(tmpDir, 'fake-warp.exe');
    fs.writeFileSync(realFile, '');
    // Make it executable on POSIX (no-op on Windows; fs.access X_OK succeeds for any existing file).
    fs.chmodSync(realFile, 0o755);
    process.env[TEST_VAR] = tmpDir;
  });

  afterEach(() => {
    delete process.env[TEST_VAR];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the expanded absolute path when a forward-slash candidate exists', async () => {
    // Candidate uses %VAR%/filename — forward-slash form.
    const candidate = `%${TEST_VAR}%/fake-warp.exe`;

    const result = await resolveFirstExistingExecutable([candidate]);

    // Normalise separators for comparison so the test is platform-agnostic.
    expect(result?.replace(/\\/g, '/')).toBe(realFile.replace(/\\/g, '/'));
  });

  it('returns the expanded absolute path when a back-slash candidate exists', async () => {
    // Candidate uses %VAR%\filename — Windows-separator form.
    // This is the exact shape the Warp catalogue entry will use.
    const candidate = `%${TEST_VAR}%\\fake-warp.exe`;

    const result = await resolveFirstExistingExecutable([candidate]);

    expect(result?.replace(/\\/g, '/')).toBe(realFile.replace(/\\/g, '/'));
  });

  it('returns null when no candidate path exists on disk', async () => {
    const result = await resolveFirstExistingExecutable([
      `%${TEST_VAR}%/does-not-exist.exe`,
    ]);

    expect(result).toBeNull();
  });

  it('skips candidates whose env var is unset and falls through to a real path', async () => {
    // Guarantee the sentinel var is absent (should be, but be explicit).
    const UNSET_VAR = 'OD_DEFINITELY_UNSET_XYZ_4539';
    delete process.env[UNSET_VAR];

    const result = await resolveFirstExistingExecutable([
      `%${UNSET_VAR}%/nope.exe`,         // unset var → must be skipped, not throw
      `%${TEST_VAR}%/fake-warp.exe`,      // real file → should be returned
    ]);

    expect(result?.replace(/\\/g, '/')).toBe(realFile.replace(/\\/g, '/'));
  });
});

// ---------------------------------------------------------------------------
// Integration: Warp resolves as available on Windows
// ---------------------------------------------------------------------------

describe('Warp host tool on Windows', () => {
  it('reports available=true with executable path and no dir arg when LOCALAPPDATA Warp install is present', async () => {
    // This test only makes sense on Windows — gate it explicitly.
    if (process.platform !== 'win32') return;

    // Build a fake LOCALAPPDATA tree with a real warp.exe file.
    const fakeLOCALAPPDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'od-fake-localappdata-'));
    const warpDir = path.join(fakeLOCALAPPDATA, 'Programs', 'Warp');
    fs.mkdirSync(warpDir, { recursive: true });
    const fakeWarpExe = path.join(warpDir, 'warp.exe');
    fs.writeFileSync(fakeWarpExe, '');

    const originalLOCALAPPDATA = process.env.LOCALAPPDATA;

    try {
      process.env.LOCALAPPDATA = fakeLOCALAPPDATA;

      const plan = await resolveHostToolLaunchPlan('warp', 'C:\\some\\project\\dir');

      // Core contract: Warp must be detected as available.
      expect(plan.available).toBe(true);

      // The resolved command must point at the fake warp.exe.
      // Normalise separators before comparing.
      expect(plan.command?.replace(/\//g, '\\')).toBe(fakeWarpExe.replace(/\//g, '\\'));

      // Warp has no open-directory CLI argument (upstream gap warpdotdev/warp#6357).
      // The launch plan must pass an empty args array — no path argument.
      expect(plan.args).toEqual([]);

      // Working directory is passed as cwd so the OS opens Warp in the right place.
      expect(plan.cwd).toBe('C:\\some\\project\\dir');
    } finally {
      if (originalLOCALAPPDATA === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = originalLOCALAPPDATA;
      }
      fs.rmSync(fakeLOCALAPPDATA, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Regression: #4539 — Warp Windows launch must set shell:false
  //
  // cmd.exe mis-parses forward-slash exe paths (C:/Users/.../warp.exe) when
  // the route spawns with shell:true.  The fix: install-path launches set
  // shell:false so Node's CreateProcess handles the exe path directly.
  // ---------------------------------------------------------------------------

  it('sets shell:false on the launch plan so cmd.exe never parses the exe path', async () => {
    // Windows-only: shell:false vs shell:true is a win32 spawn distinction.
    if (process.platform !== 'win32') return;

    const fakeLOCALAPPDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'od-fake-localappdata-shell-'));
    const warpDir = path.join(fakeLOCALAPPDATA, 'Programs', 'Warp');
    fs.mkdirSync(warpDir, { recursive: true });
    fs.writeFileSync(path.join(warpDir, 'warp.exe'), '');

    const originalLOCALAPPDATA = process.env.LOCALAPPDATA;

    try {
      process.env.LOCALAPPDATA = fakeLOCALAPPDATA;

      const plan = await resolveHostToolLaunchPlan('warp', 'C:\\some\\project\\dir');

      // Detection must still succeed — this is a combined regression guard.
      expect(plan.available).toBe(true);

      // KEY ASSERTION (currently RED): install-path Warp launch must carry
      // shell:false so the resolved forward-slash exe path is passed directly
      // to CreateProcess rather than through cmd.exe, which would ENOENT it.
      expect(plan.shell).toBe(false);
    } finally {
      if (originalLOCALAPPDATA === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = originalLOCALAPPDATA;
      }
      fs.rmSync(fakeLOCALAPPDATA, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Counter-spec: PATH-shim entries must NOT force shell:false
  //
  // Bare-command entries (explorer, code, cursor …) rely on cmd.exe PATH
  // resolution to find .cmd shims and wrappers.  Setting shell:false on those
  // would break them.  This test locks the fix as *selective*: a future
  // "set shell:false everywhere" change must fail here.
  // ---------------------------------------------------------------------------

  it('leaves shell unset for PATH-shim entries so cmd.exe can resolve .cmd wrappers', async () => {
    // Shell-selection semantics are win32-specific.
    if (process.platform !== 'win32') return;

    // explorer.exe is always present on any Windows host via PATH; it is a
    // safe representative of a bare-command (non-install-path) entry.
    const plan = await resolveHostToolLaunchPlan('explorer', 'C:\\some\\dir');

    if (!plan.available) {
      // If the host's catalogue doesn't include explorer as an available tool,
      // skip rather than fail — the absence itself can't tell us about shell.
      return;
    }

    // Shell must be absent (undefined) — not false — for PATH-shim entries.
    // The route's existing win32 default (shell:true) handles .cmd resolution.
    expect(plan.shell).toBeUndefined();
  });
});
