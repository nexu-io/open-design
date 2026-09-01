import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectAgent } from '../../src/runtimes/detection.js';
import { resolveAgentLaunch } from '../../src/runtimes/launch.js';
import type { RuntimeAgentDef } from '../../src/runtimes/types.js';

// A minimal agent def: no compatibility probe, so these cases isolate the
// binary-resolution stage from the profile handshake that `deepseek-harness`
// layers on top of it.
const def: RuntimeAgentDef = {
  id: 'deepseek-harness',
  name: 'DeepSeek Harness',
  bin: 'dsh',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default' }],
  buildArgs: () => [],
  streamFormat: 'dsh-profile-jsonl',
};

const isWindows = process.platform === 'win32';

// Windows resolves a bare `dsh` through PATHEXT, so the file the resolver can
// actually see there is `dsh.CMD` — the extension npm writes its global
// wrappers with. Naming the fixtures per platform is what lets these cases run
// natively on Windows instead of skipping the platform the bug came from.
const shimName = isWindows ? 'dsh.CMD' : 'dsh';

// Windows filesystems are case-insensitive and PATHEXT casing is user-tunable,
// so a resolver result may differ from the fixture path only in case.
function samePath(actual: string | null | undefined, expected: string): boolean {
  if (!actual) return false;
  return isWindows
    ? actual.toLowerCase() === expected.toLowerCase()
    : actual === expected;
}

function writeShim(dir: string, posix: string, windows: string): string {
  const bin = path.join(dir, shimName);
  if (isWindows) {
    // cmd.exe wants CRLF; normalize idempotently so a fixture written either
    // way lands the same on disk.
    writeFileSync(bin, windows.replace(/\r?\n/g, '\r\n'));
  } else {
    writeFileSync(bin, posix);
    chmodSync(bin, 0o755);
  }
  return bin;
}

/**
 * A wrapper that resolves on PATH but can never produce a working CLI — the
 * shape a half-finished `npm i -g` leaves behind, where the wrapper survives
 * and the package it points at does not.
 *
 * The two platforms fail this at different layers, so the fixture mirrors each
 * one rather than pretending they are the same:
 *
 * - POSIX: the shebang names an interpreter that does not exist, so the spawn
 *   itself fails with ENOENT.
 * - Windows: nothing fails to *start*. A `.CMD` is run through
 *   `cmd.exe /d /s /c`, which launches fine and hands off to node, which then
 *   exits 1 with MODULE_NOT_FOUND. See `writeOrphanedNpmWrapper`.
 */
function writeUnusableShim(dir: string): string {
  return writeShim(dir, '#!/nonexistent/interpreter\n', ORPHANED_NPM_WRAPPER_CMD);
}

const ORPHANED_NPM_WRAPPER_CMD = `@echo off
>&2 echo Error: Cannot find module 'C:\\Users\\1\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh-cmdline\\bin\\dsh.js'
>&2 echo   code: 'MODULE_NOT_FOUND'
exit /b 1
`;

// Only shell builtins here: the version probe runs with a deliberately
// narrowed PATH, so a fixture that shells out to `cat` would fail for the
// wrong reason and never produce the stderr this case is about.
const ORPHANED_NPM_WRAPPER_SH = `#!/bin/sh
echo "node:internal/modules/cjs/loader:1215" >&2
echo "  throw err;" >&2
echo "Error: Cannot find module '/usr/lib/node_modules/@deepseek-ai/dsh-cmdline/bin/dsh.js'" >&2
echo "  code: 'MODULE_NOT_FOUND'," >&2
exit 1
`;

/**
 * The failure native Windows actually reports, reproduced on every platform:
 * an npm global wrapper whose package directory was removed. The wrapper still
 * launches an interpreter successfully, so there is no spawn-level error to
 * catch — the only evidence is a non-zero exit plus node's MODULE_NOT_FOUND on
 * stderr.
 */
function writeOrphanedNpmWrapper(dir: string): string {
  return writeShim(dir, ORPHANED_NPM_WRAPPER_SH, ORPHANED_NPM_WRAPPER_CMD);
}

/**
 * A CLI that starts, runs its own code, and exits non-zero — the opposite case.
 * This is a real answer from the right binary and must end the walk, or any
 * agent whose `--version` is unhappy would silently exec a different install.
 */
function writeFailingCli(dir: string): string {
  return writeShim(
    dir,
    "#!/bin/sh\nprintf '%s\\n' 'dsh: unknown flag --version' >&2\nexit 1\n",
    '@echo off\n>&2 echo dsh: unknown flag --version\nexit /b 1\n',
  );
}

function writeWorkingShim(dir: string, version = '0.1.0-rc.6'): string {
  return writeShim(
    dir,
    `#!/bin/sh\nprintf '%s\\n' '${version}'\n`,
    `@echo off\necho ${version}\n`,
  );
}

describe('agent executable resolution falls back past unusable candidates', () => {
  const dirs: string[] = [];
  let savedPath: string | undefined;
  let savedAgentHome: string | undefined;
  let savedDshBin: string | undefined;

  beforeEach(() => {
    savedPath = process.env.PATH;
    savedAgentHome = process.env.OD_AGENT_HOME;
    savedDshBin = process.env.DSH_BIN;
    delete process.env.DSH_BIN;
  });

  afterEach(() => {
    if (savedPath === undefined) delete process.env.PATH;
    else process.env.PATH = savedPath;
    if (savedAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = savedAgentHome;
    if (savedDshBin === undefined) delete process.env.DSH_BIN;
    else process.env.DSH_BIN = savedDshBin;
    while (dirs.length > 0) {
      rmSync(dirs.pop() as string, { recursive: true, force: true });
    }
  });

  function tempDir(label: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), `od-exec-fallback-${label}-`));
    dirs.push(dir);
    return dir;
  }

  // The production report behind this suite: a stale `npm i -g` wrapper sat in
  // a directory that OpenDesign searches *before* the one the official
  // installer writes to, so the working CLI was never reached and the agent
  // vanished from the picker entirely.
  it('reaches a working binary that sits behind a broken one on PATH', async () => {
    const brokenDir = tempDir('broken');
    const goodDir = tempDir('good');
    writeUnusableShim(brokenDir);
    const goodBin = writeWorkingShim(goodDir);

    process.env.OD_AGENT_HOME = goodDir;
    process.env.PATH = [brokenDir, goodDir].join(path.delimiter);

    const detected = await detectAgent(def);

    expect(detected.available).toBe(true);
    expect(samePath(detected.path, goodBin)).toBe(true);
    expect(detected.version).toBe('0.1.0-rc.6');
  });

  // Native Windows validation of the first fix found this hole: there, a stale
  // npm wrapper never fails to *start*. `cmd.exe` runs, node runs, and only
  // then does node discover the script is gone — exit 1 with MODULE_NOT_FOUND.
  // Judging invocability by spawn errors alone classifies that as a real answer
  // from the right binary, so the walk stops on the dead wrapper and the
  // healthy CLI later on PATH is never reached. Reproduced on every platform so
  // the regression is caught in CI, not only on a Windows runner.
  it('walks past an npm wrapper whose package was uninstalled', async () => {
    const orphanDir = tempDir('orphan');
    const goodDir = tempDir('orphan-good');
    const orphanBin = writeOrphanedNpmWrapper(orphanDir);
    const goodBin = writeWorkingShim(goodDir);

    process.env.OD_AGENT_HOME = goodDir;
    process.env.PATH = [orphanDir, goodDir].join(path.delimiter);

    const detected = await detectAgent(def);

    expect(detected.available).toBe(true);
    expect(samePath(detected.path, goodBin)).toBe(true);
    expect(samePath(detected.path, orphanBin)).toBe(false);
    expect(detected.version).toBe('0.1.0-rc.6');

    // The same split the first review caught: what chat and the connection
    // test resolve must be what detection settled on, on Windows too.
    expect(samePath(resolveAgentLaunch(def).selectedPath, goodBin)).toBe(true);
  });

  // The guard on the case above. Falling through on any non-zero exit would
  // mean a CLI that merely dislikes its arguments gets abandoned for a
  // different install of itself — so the fall-through must key on evidence
  // that the *launcher* failed, never on the exit status alone.
  it('stops at a CLI that runs and exits non-zero', async () => {
    const failingDir = tempDir('failing');
    const goodDir = tempDir('failing-good');
    const failingBin = writeFailingCli(failingDir);
    const goodBin = writeWorkingShim(goodDir);

    process.env.OD_AGENT_HOME = failingDir;
    process.env.PATH = [failingDir, goodDir].join(path.delimiter);

    const detected = await detectAgent(def);

    expect(samePath(detected.path, failingBin)).toBe(true);
    expect(samePath(detected.path, goodBin)).toBe(false);
  });

  // Detection deciding an agent is usable is worthless if the spawn sites go
  // back to the binary detection just rejected: Settings would advertise the
  // agent as installed while every chat turn execs the broken shim. Detection
  // and launch have to agree on which executable this agent runs.
  it('makes every later launch resolve to the binary detection settled on', async () => {
    const brokenDir = tempDir('broken-launch');
    const goodDir = tempDir('good-launch');
    const brokenBin = writeUnusableShim(brokenDir);
    const goodBin = writeWorkingShim(goodDir);

    process.env.OD_AGENT_HOME = goodDir;
    process.env.PATH = [brokenDir, goodDir].join(path.delimiter);

    const detected = await detectAgent(def);
    expect(detected.available).toBe(true);
    expect(samePath(detected.path, goodBin)).toBe(true);

    // What chat, the connection test, memory-llm, and companion setup all call.
    const launch = resolveAgentLaunch(def);
    expect(samePath(launch.selectedPath, goodBin)).toBe(true);
    expect(samePath(launch.selectedPath, brokenBin)).toBe(false);
    expect(samePath(launch.launchPath, goodBin)).toBe(true);
  });

  // What detection carries forward is the set of paths it proved dead, not the
  // candidate that won. Recording the winner instead pinned the daemon to one
  // binary for its whole lifetime and silently outranked the caller's own PATH:
  // a CLI that became visible earlier afterwards — a fresh install, a version
  // manager swapping shims, a caller resolving under its own environment —
  // could no longer be reached. Everything still standing stays in PATH order.
  it('lets a CLI that appears earlier on PATH after detection win', async () => {
    const settledDir = tempDir('settled');
    const laterDir = tempDir('newly-installed');
    const settledBin = writeWorkingShim(settledDir);

    process.env.OD_AGENT_HOME = settledDir;
    process.env.PATH = settledDir;

    const detected = await detectAgent(def);
    expect(detected.available).toBe(true);
    expect(samePath(detected.path, settledBin)).toBe(true);

    // A second healthy install shows up ahead of the one detection settled on.
    const newBin = writeWorkingShim(laterDir, '0.1.0-rc.8');
    process.env.PATH = [laterDir, settledDir].join(path.delimiter);

    expect(samePath(resolveAgentLaunch(def).selectedPath, newBin)).toBe(true);
    expect(samePath(resolveAgentLaunch(def).selectedPath, settledBin)).toBe(false);
  });

  // Resolution stays a pure function of the current environment: an emptied
  // PATH, a sandboxed OD_AGENT_HOME, or an uninstalled CLI all still mean "not
  // found". Nothing detection learned may resurrect a binary the caller can no
  // longer see — that is how a route which must report the runtime as
  // unavailable starts reporting it as ready.
  it('does not resurrect a binary once the environment stops offering it', async () => {
    const goodDir = tempDir('remembered');
    const goodBin = writeWorkingShim(goodDir);

    process.env.OD_AGENT_HOME = goodDir;
    process.env.PATH = goodDir;

    const detected = await detectAgent(def);
    expect(detected.available).toBe(true);
    expect(samePath(detected.path, goodBin)).toBe(true);
    expect(samePath(resolveAgentLaunch(def).selectedPath, goodBin)).toBe(true);

    // The binary is still on disk — only the search environment changed.
    process.env.PATH = '';

    expect(resolveAgentLaunch(def).selectedPath).toBeNull();
  });

  // Even when every candidate is unusable, detection must surface the path it
  // actually tried. The picker hides an agent that reports no path at all, so
  // dropping it leaves the user with an invisible agent and no way to act.
  it('keeps the attempted path when no candidate can be executed', async () => {
    const brokenDir = tempDir('only-broken');
    const brokenBin = writeUnusableShim(brokenDir);

    process.env.OD_AGENT_HOME = brokenDir;
    process.env.PATH = brokenDir;

    const detected = await detectAgent(def);

    expect(detected.available).toBe(false);
    expect(samePath(detected.path, brokenBin)).toBe(true);
    expect(detected.diagnostics?.[0]?.reason).toBe('shim-broken');
  });
});
