import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLinkedDirs } from '../src/linked-dirs.js';

/** Resolve macOS /var -> /private/var etc. so assertions match realpathSync. */
function real(p: string): string {
  try { return realpathSync(p); } catch { return p; }
}

function blockedSystemDir(): string {
  return real(process.platform === 'win32' ? (process.env.SystemRoot ?? 'C:\\Windows') : '/etc');
}

test('rejects non-array input', () => {
  assert.equal(validateLinkedDirs('not-array').error, 'linkedDirs must be an array');
  assert.equal(validateLinkedDirs(null).error, 'linkedDirs must be an array');
});

test('rejects non-string entries', () => {
  assert.equal(validateLinkedDirs([123]).error, 'each linked dir must be a non-empty string');
  assert.equal(validateLinkedDirs(['']).error, 'each linked dir must be a non-empty string');
});

test('rejects relative paths', () => {
  const result = validateLinkedDirs(['relative/path']);
  assert.ok(result.error);
  assert.ok(result.error.includes('absolute path'));
});

test('rejects non-existent directories', () => {
  const result = validateLinkedDirs(['/no/such/directory/ever']);
  assert.ok(result.error);
  assert.ok(result.error!.includes('does not exist'));
});

test('rejects files (non-directories)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  const file = join(tmp, 'file.txt');
  writeFileSync(file, 'test');
  try {
    const result = validateLinkedDirs([file]);
    assert.ok(result.error);
    assert.ok(result.error!.includes('not a directory'));
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('rejects filesystem root', () => {
  const result = validateLinkedDirs(['/']);
  assert.ok(result.error);
  assert.ok(result.error.includes('system directory'));
});

test('rejects blocked system directories', () => {
  const result = validateLinkedDirs([blockedSystemDir()]);
  assert.ok(result.error);
  assert.ok(result.error.includes('system directory'));
});

test('rejects symlink pointing to blocked directory', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  const link = join(tmp, 'etc-link');
  try {
    symlinkSync(blockedSystemDir(), link, process.platform === 'win32' ? 'junction' : 'dir');
    const result = validateLinkedDirs([link]);
    assert.ok(result.error);
    assert.ok(result.error.includes('system directory'));
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('accepts valid directories and normalizes paths', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  try {
    const result = validateLinkedDirs([tmp]);
    assert.ok(!result.error);
    assert.deepEqual(result.dirs, [real(tmp)]);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('deduplicates entries', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  try {
    const result = validateLinkedDirs([tmp, tmp]);
    assert.ok(!result.error);
    assert.equal(result.dirs!.length, 1);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('resolves and normalizes paths', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  const inner = join(tmp, 'inner');
  mkdirSync(inner);
  try {
    const result = validateLinkedDirs([join(tmp, 'inner', '..') + '/']);
    assert.ok(!result.error);
    assert.deepEqual(result.dirs, [real(tmp)]);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('resolves symlinks to real paths', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  const inner = join(tmp, 'inner');
  const link = join(tmp, 'link');
  mkdirSync(inner);
  try {
    symlinkSync(inner, link);
    const result = validateLinkedDirs([link]);
    assert.ok(!result.error);
    assert.deepEqual(result.dirs, [real(inner)]);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});
