/**
 * Unit tests for resolveDataDir, the OD_DATA_DIR path resolver. Covers the
 * $HOME / ${HOME} / ~/ shorthands that launchers can pass literally when
 * no shell is in the loop (#390).
 */
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveDataDir } from '../src/server.js';

describe('resolveDataDir', () => {
  const projectRoot = os.tmpdir();

  it('returns <projectRoot>/.od when OD_DATA_DIR is unset', () => {
    expect(resolveDataDir(undefined, projectRoot)).toBe(path.join(projectRoot, '.od'));
    expect(resolveDataDir('', projectRoot)).toBe(path.join(projectRoot, '.od'));
  });

  it('expands a leading ~/ against the user home directory', () => {
    const out = resolveDataDir('~/od-test', projectRoot);
    expect(out).toBe(path.join(os.homedir(), 'od-test'));
  });

  it('expands a bare ~ to the user home directory', () => {
    const out = resolveDataDir('~', projectRoot);
    expect(out).toBe(os.homedir());
  });

  it('expands a leading $HOME to the user home directory', () => {
    const out = resolveDataDir('$HOME/od-test', projectRoot);
    expect(out).toBe(path.join(os.homedir(), 'od-test'));
  });

  it('expands a leading ${HOME} to the user home directory', () => {
    const out = resolveDataDir('${HOME}/od-test', projectRoot);
    expect(out).toBe(path.join(os.homedir(), 'od-test'));
  });

  it('passes absolute paths through unchanged', () => {
    const abs = path.join(os.tmpdir(), 'od-abs');
    expect(resolveDataDir(abs, projectRoot)).toBe(abs);
  });

  it('resolves relative paths against projectRoot', () => {
    const out = resolveDataDir('rel-od', projectRoot);
    expect(out).toBe(path.join(projectRoot, 'rel-od'));
  });
});
