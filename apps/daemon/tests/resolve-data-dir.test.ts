/**
 * Unit tests for resolveDataDir, the OD_DATA_DIR path resolver. Covers the
 * $HOME / ${HOME} / ~/ shorthands that launchers can pass literally when no
 * shell is in the loop (#390), with both forward and backslash separators so
 * Windows launchers behave the same as Unix ones.
 *
 * Hermetic: every test runs against a fresh mkdtemp() home + projectRoot
 * pair, and os.homedir() is stubbed so resolveDataDir's writability check
 * never touches the developer's or CI runner's real home directory.
 */
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDataDir } from '../src/server.js';

describe('resolveDataDir', () => {
  let fakeHome: string;
  let projectRoot: string;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeHome = mkdtempSync(path.join(os.tmpdir(), 'rdd-home-'));
    projectRoot = mkdtempSync(path.join(os.tmpdir(), 'rdd-project-'));
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    homedirSpy.mockRestore();
    await rm(fakeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns <projectRoot>/.od when OD_DATA_DIR is unset', () => {
    expect(resolveDataDir(undefined, projectRoot)).toBe(path.join(projectRoot, '.od'));
    expect(resolveDataDir('', projectRoot)).toBe(path.join(projectRoot, '.od'));
  });

  it('expands a leading ~/ against the user home directory', () => {
    const out = resolveDataDir('~/od-test', projectRoot);
    expect(out).toBe(path.join(fakeHome, 'od-test'));
  });

  it('expands ~\\ (backslash) against the user home directory', () => {
    const out = resolveDataDir('~\\od-test', projectRoot);
    expect(out).toBe(path.join(fakeHome, 'od-test'));
  });

  it('expands a bare ~ to the user home directory', () => {
    expect(resolveDataDir('~', projectRoot)).toBe(fakeHome);
  });

  it('expands $HOME/ against the user home directory', () => {
    const out = resolveDataDir('$HOME/od-test', projectRoot);
    expect(out).toBe(path.join(fakeHome, 'od-test'));
  });

  it('expands $HOME\\ (backslash, Windows launcher) against the user home directory', () => {
    const out = resolveDataDir('$HOME\\od-test', projectRoot);
    expect(out).toBe(path.join(fakeHome, 'od-test'));
  });

  it('expands ${HOME}/ against the user home directory', () => {
    const out = resolveDataDir('${HOME}/od-test', projectRoot);
    expect(out).toBe(path.join(fakeHome, 'od-test'));
  });

  it('expands ${HOME}\\ (backslash) against the user home directory', () => {
    const out = resolveDataDir('${HOME}\\od-test', projectRoot);
    expect(out).toBe(path.join(fakeHome, 'od-test'));
  });

  it('expands a bare $HOME to the user home directory', () => {
    expect(resolveDataDir('$HOME', projectRoot)).toBe(fakeHome);
  });

  it('expands a bare ${HOME} to the user home directory', () => {
    expect(resolveDataDir('${HOME}', projectRoot)).toBe(fakeHome);
  });

  it('passes absolute paths through unchanged', async () => {
    const abs = mkdtempSync(path.join(os.tmpdir(), 'rdd-abs-'));
    try {
      expect(resolveDataDir(abs, projectRoot)).toBe(abs);
    } finally {
      await rm(abs, { recursive: true, force: true });
    }
  });

  it('resolves relative paths against projectRoot', () => {
    const out = resolveDataDir('rel-od', projectRoot);
    expect(out).toBe(path.join(projectRoot, 'rel-od'));
  });
});
