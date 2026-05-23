// Version-aware executable resolution for Gemini (#978).
//
// macOS GUI launchers strip PATH to `/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin`,
// then `userToolchainDirs()` appends Homebrew / nvm / npm-global / mise paths
// at the end. The previous `resolveOnPath()` was first-match, so a stale
// `/usr/local/bin/gemini=0.1.12` left over from an old global npm install
// would shadow the modern `/opt/homebrew/bin/gemini=0.40.1+` and the daemon
// spawn landed on yargs `Unknown arguments: output-format, outputFormat`
// (PR #1007 design, reviewer-approved).
//
// The fix is opt-in per agent via `RuntimeAgentDef.minVersion`. When set,
// the resolver enumerates every candidate path, probes `--version` on each
// in parallel, and returns the first whose version meets `minVersion`. Other
// agents (claude / codex / opencode / ...) skip the version walk and keep
// first-match resolution unchanged.

import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { delimiter } from 'node:path';
import {
  chooseExecutableByMinVersion,
  clearVersionAwareResolutionCache,
  compareSemver,
  enumerateOnPath,
  inspectAgentExecutableResolution,
  resolveAgentExecutable,
} from '../../src/runtimes/executables.js';
import { gemini, minimalAgentDef } from './helpers/test-helpers.js';

const fsTest = process.platform === 'win32' ? it.skip : it;

afterEach(() => {
  clearVersionAwareResolutionCache();
});

describe('compareSemver (#978 reviewer round 1: unparseable input must not pass through)', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns positive when a > b on major / minor / patch', () => {
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemver('1.3.0', '1.2.99')).toBeGreaterThan(0);
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('0.1.12', '0.30.0')).toBeLessThan(0);
    expect(compareSemver('0.29.9', '0.30.0')).toBeLessThan(0);
  });

  it('tolerates a leading "v" and trailing pre-release / metadata', () => {
    // Real-world Gemini CLI prints like "0.40.1", but other CLIs print
    // "v1.2.3", "1.2.3-rc.1", or "1.2.3+build.5". Major.minor.patch is
    // the only thing the version gate cares about.
    expect(compareSemver('v0.40.1', '0.30.0')).toBeGreaterThan(0);
    expect(compareSemver('0.40.1-rc.1', '0.30.0')).toBeGreaterThan(0);
    expect(compareSemver('0.40.1+build.5', '0.30.0')).toBeGreaterThan(0);
  });

  it('returns null for unparseable input — prose like CLI help text must not be silently accepted as ≥ minVersion', () => {
    // The previous draft of compareSemver let unparseable input return 0,
    // which meant a stale binary that printed `Usage: gemini ...` on
    // --version would silently pass the version gate. The reviewer
    // P1 fix forces unparseable inputs to null so the chooser explicitly
    // rejects them.
    expect(compareSemver('not-a-version', '0.30.0')).toBeNull();
    expect(compareSemver('Usage: gemini [options]', '0.30.0')).toBeNull();
    expect(compareSemver('', '0.30.0')).toBeNull();
    expect(compareSemver('0.30.0', 'minVersion-broken')).toBeNull();
  });

  it('is anchored — refuses prose-wrapped versions to prevent a partial regex match', () => {
    // "Help: see version 1.2.3 for details" must not parse as 1.2.3.
    expect(compareSemver('Help: see version 1.2.3 for details', '0.30.0')).toBeNull();
  });
});

describe('enumerateOnPath (#978: list every match across PATH + toolchain, not just the first)', () => {
  fsTest('returns one entry per PATH directory that contains the binary, in PATH order', () => {
    const a = mkdtempSync(join(tmpdir(), 'od-enum-a-'));
    const b = mkdtempSync(join(tmpdir(), 'od-enum-b-'));
    try {
      writeFileSync(join(a, 'gemini'), '#!/bin/sh\necho 0.1.12\n');
      writeFileSync(join(b, 'gemini'), '#!/bin/sh\necho 0.40.1\n');
      chmodSync(join(a, 'gemini'), 0o755);
      chmodSync(join(b, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = a; // suppresses toolchain leakage
      process.env.PATH = `${a}${delimiter}${b}`;

      const found = enumerateOnPath('gemini');
      expect(found).toEqual([join(a, 'gemini'), join(b, 'gemini')]);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  fsTest('returns an empty array when the binary is not on PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-enum-empty-'));
    try {
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      expect(enumerateOnPath('gemini')).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  fsTest('deduplicates identical paths that appear twice in PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-enum-dedup-'));
    try {
      writeFileSync(join(dir, 'gemini'), '#!/bin/sh\necho 0.40.1\n');
      chmodSync(join(dir, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = `${dir}${delimiter}${dir}`;
      expect(enumerateOnPath('gemini')).toEqual([join(dir, 'gemini')]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('chooseExecutableByMinVersion (#978: skip stale binaries that fail the floor)', () => {
  // The chooser is pure on top of an injectable `runVersion` — we pass a
  // fake probe so the tests do not depend on a real `gemini` install.

  fsTest('picks the second-on-PATH when the first is too old (the headline #978 scenario)', async () => {
    const usrLocal = mkdtempSync(join(tmpdir(), 'od-mv-usrlocal-'));
    const homebrew = mkdtempSync(join(tmpdir(), 'od-mv-homebrew-'));
    try {
      writeFileSync(join(usrLocal, 'gemini'), '');
      writeFileSync(join(homebrew, 'gemini'), '');
      chmodSync(join(usrLocal, 'gemini'), 0o755);
      chmodSync(join(homebrew, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = usrLocal;
      process.env.PATH = `${usrLocal}${delimiter}${homebrew}`;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const versions = new Map<string, string>([
        [join(usrLocal, 'gemini'), '0.1.12'],
        [join(homebrew, 'gemini'), '0.40.1'],
      ]);

      const chosen = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async (p) => versions.get(p) ?? '',
      });
      expect(chosen).toBe(join(homebrew, 'gemini'));
    } finally {
      rmSync(usrLocal, { recursive: true, force: true });
      rmSync(homebrew, { recursive: true, force: true });
    }
  });

  fsTest('returns the first candidate when no candidate meets minVersion (regression-safe fallback)', async () => {
    // When every installed gemini is too old, fall through to the
    // first-found path. The existing "agent exited with code 1" error
    // surfaces — same as before — instead of the chooser silently
    // hiding the agent.
    const a = mkdtempSync(join(tmpdir(), 'od-mv-allold-a-'));
    const b = mkdtempSync(join(tmpdir(), 'od-mv-allold-b-'));
    try {
      writeFileSync(join(a, 'gemini'), '');
      writeFileSync(join(b, 'gemini'), '');
      chmodSync(join(a, 'gemini'), 0o755);
      chmodSync(join(b, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = a;
      process.env.PATH = `${a}${delimiter}${b}`;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const chosen = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async () => '0.1.12',
      });
      expect(chosen).toBe(join(a, 'gemini'));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  fsTest('returns null when the binary is on no PATH directory at all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-mv-none-'));
    try {
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;
      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const chosen = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async () => '0.40.1',
      });
      expect(chosen).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  fsTest('rejects unparseable version output and continues probing the next candidate', async () => {
    // A stale binary that prints help text to `--version` (typical of
    // pre-1.0 CLIs) used to silently pass when compareSemver returned 0
    // for unparseable input. Now it does not parse, the chooser treats
    // the candidate as failed, and proceeds to the next one.
    const broken = mkdtempSync(join(tmpdir(), 'od-mv-broken-'));
    const ok = mkdtempSync(join(tmpdir(), 'od-mv-ok-'));
    try {
      writeFileSync(join(broken, 'gemini'), '');
      writeFileSync(join(ok, 'gemini'), '');
      chmodSync(join(broken, 'gemini'), 0o755);
      chmodSync(join(ok, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = broken;
      process.env.PATH = `${broken}${delimiter}${ok}`;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const versions = new Map<string, string>([
        [join(broken, 'gemini'), 'Usage: gemini [options]'],
        [join(ok, 'gemini'), '0.40.1'],
      ]);
      const chosen = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async (p) => versions.get(p) ?? '',
      });
      expect(chosen).toBe(join(ok, 'gemini'));
    } finally {
      rmSync(broken, { recursive: true, force: true });
      rmSync(ok, { recursive: true, force: true });
    }
  });

  fsTest('honors the configured `<AGENT>_BIN` override without running any version probes', async () => {
    // Explicit env override means the user has opted out of auto-pick.
    // The chooser must return the override verbatim and must not run
    // --version on anything (probing the override would be both
    // pointless and a noisy startup-time side effect).
    const override = mkdtempSync(join(tmpdir(), 'od-mv-override-'));
    const onPath = mkdtempSync(join(tmpdir(), 'od-mv-onpath-'));
    try {
      writeFileSync(join(override, 'gemini'), '');
      writeFileSync(join(onPath, 'gemini'), '');
      chmodSync(join(override, 'gemini'), 0o755);
      chmodSync(join(onPath, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = onPath;
      process.env.PATH = onPath;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      let probeCalls = 0;
      const chosen = await chooseExecutableByMinVersion(
        def,
        { GEMINI_BIN: join(override, 'gemini') },
        {
          runVersion: async () => {
            probeCalls++;
            return '0.40.1';
          },
        },
      );
      expect(chosen).toBe(join(override, 'gemini'));
      expect(probeCalls).toBe(0);
    } finally {
      rmSync(override, { recursive: true, force: true });
      rmSync(onPath, { recursive: true, force: true });
    }
  });

  fsTest('falls through to first-found when a version probe throws (e.g. binary times out or segfaults)', async () => {
    // We do not want a single misbehaving binary to break detection
    // for every Gemini install on the box. A throw should be treated
    // the same as "could not parse" — try the next candidate; if
    // nothing meets the floor, regression-safe fallback fires.
    const flaky = mkdtempSync(join(tmpdir(), 'od-mv-flaky-'));
    const ok = mkdtempSync(join(tmpdir(), 'od-mv-flaky-ok-'));
    try {
      writeFileSync(join(flaky, 'gemini'), '');
      writeFileSync(join(ok, 'gemini'), '');
      chmodSync(join(flaky, 'gemini'), 0o755);
      chmodSync(join(ok, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = flaky;
      process.env.PATH = `${flaky}${delimiter}${ok}`;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const chosen = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async (p) => {
          if (p === join(flaky, 'gemini')) throw new Error('boom');
          return '0.40.1';
        },
      });
      expect(chosen).toBe(join(ok, 'gemini'));
    } finally {
      rmSync(flaky, { recursive: true, force: true });
      rmSync(ok, { recursive: true, force: true });
    }
  });
});

describe('inspectAgentExecutableResolution + minVersion cache wiring (#978)', () => {
  // The async chooser populates a module-scoped cache; the sync resolver
  // used at chat-spawn time consults that cache so detection-time and
  // spawn-time always land on the same binary.

  fsTest('after a successful async chooser populates the cache, the sync resolver returns the version-checked pick', async () => {
    const usrLocal = mkdtempSync(join(tmpdir(), 'od-cache-usrlocal-'));
    const homebrew = mkdtempSync(join(tmpdir(), 'od-cache-homebrew-'));
    try {
      writeFileSync(join(usrLocal, 'gemini'), '');
      writeFileSync(join(homebrew, 'gemini'), '');
      chmodSync(join(usrLocal, 'gemini'), 0o755);
      chmodSync(join(homebrew, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = usrLocal;
      process.env.PATH = `${usrLocal}${delimiter}${homebrew}`;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const versions = new Map<string, string>([
        [join(usrLocal, 'gemini'), '0.1.12'],
        [join(homebrew, 'gemini'), '0.40.1'],
      ]);
      const chosen = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async (p) => versions.get(p) ?? '',
      });
      expect(chosen).toBe(join(homebrew, 'gemini'));

      // Without the cache, this sync call would still return usrLocal
      // (first-found). With it, it returns the version-checked pick.
      expect(resolveAgentExecutable(def)).toBe(join(homebrew, 'gemini'));
      expect(inspectAgentExecutableResolution(def).selectedPath).toBe(join(homebrew, 'gemini'));
    } finally {
      rmSync(usrLocal, { recursive: true, force: true });
      rmSync(homebrew, { recursive: true, force: true });
    }
  });

  fsTest('configured override beats the cache so the user escape hatch always wins', async () => {
    const cached = mkdtempSync(join(tmpdir(), 'od-cache-cached-'));
    const override = mkdtempSync(join(tmpdir(), 'od-cache-override-'));
    try {
      writeFileSync(join(cached, 'gemini'), '');
      writeFileSync(join(override, 'gemini'), '');
      chmodSync(join(cached, 'gemini'), 0o755);
      chmodSync(join(override, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = cached;
      process.env.PATH = cached;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      await chooseExecutableByMinVersion(def, {}, {
        runVersion: async () => '0.40.1',
      });
      // Cache is populated for the no-override case.
      expect(resolveAgentExecutable(def)).toBe(join(cached, 'gemini'));

      // Now the user pins GEMINI_BIN. The configured override must win
      // regardless of cache contents.
      expect(resolveAgentExecutable(def, { GEMINI_BIN: join(override, 'gemini') }))
        .toBe(join(override, 'gemini'));
    } finally {
      rmSync(cached, { recursive: true, force: true });
      rmSync(override, { recursive: true, force: true });
    }
  });

  fsTest('clearing GEMINI_BIN after a previous override-with-cache run still falls back to the auto-pick (override does not pollute cache, #1007 round-2 P2)', async () => {
    // Reviewer P2 fix on PR #1007: if `chooseExecutableByMinVersion`
    // were to write the override path into the cache, clearing the env
    // would leave the daemon pinned to a stale binary even though the
    // user has opted back into auto-pick. The override path must skip
    // the cache write entirely.
    const usrLocal = mkdtempSync(join(tmpdir(), 'od-cache-clear-usr-'));
    const homebrew = mkdtempSync(join(tmpdir(), 'od-cache-clear-brew-'));
    const override = mkdtempSync(join(tmpdir(), 'od-cache-clear-override-'));
    try {
      writeFileSync(join(usrLocal, 'gemini'), '');
      writeFileSync(join(homebrew, 'gemini'), '');
      writeFileSync(join(override, 'gemini'), '');
      chmodSync(join(usrLocal, 'gemini'), 0o755);
      chmodSync(join(homebrew, 'gemini'), 0o755);
      chmodSync(join(override, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = usrLocal;
      process.env.PATH = `${usrLocal}${delimiter}${homebrew}`;

      const def = minimalAgentDef({ id: 'gemini', bin: 'gemini', minVersion: '0.30.0' });
      const versions = new Map<string, string>([
        [join(usrLocal, 'gemini'), '0.1.12'],
        [join(homebrew, 'gemini'), '0.40.1'],
      ]);

      // First run with the override active — must not pollute the cache.
      await chooseExecutableByMinVersion(
        def,
        { GEMINI_BIN: join(override, 'gemini') },
        { runVersion: async (p) => versions.get(p) ?? '' },
      );

      // Next call with no override: cache lookup must MISS for the
      // override path and instead trigger a fresh auto-pick.
      const after = await chooseExecutableByMinVersion(def, {}, {
        runVersion: async (p) => versions.get(p) ?? '',
      });
      expect(after).toBe(join(homebrew, 'gemini'));
    } finally {
      rmSync(usrLocal, { recursive: true, force: true });
      rmSync(homebrew, { recursive: true, force: true });
      rmSync(override, { recursive: true, force: true });
    }
  });
});

describe('Gemini def carries the minVersion floor (#978)', () => {
  it('ships with minVersion set to the first stable --output-format release', () => {
    // Hard-pin the value so a future tweak that drops or changes the
    // floor is intentional, not a refactor accident.
    expect((gemini as { minVersion?: string }).minVersion).toBe('0.30.0');
  });
});
