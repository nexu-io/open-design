import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLinkedDirs } from '../src/linked-dirs.js';

test('rejects non-array input', () => {
  assert.equal(validateLinkedDirs('not-array').error, 'linkedDirs must be an array');
  assert.equal(validateLinkedDirs(null).error, 'linkedDirs must be an array');
});

test('rejects non-string entries', () => {
  assert.equal(validateLinkedDirs([123]).error, 'each linked dir must be a non-empty string');
  assert.equal(validateLinkedDirs(['']).error, 'each linked dir must be a non-empty string');
});

test('rejects relative paths by resolving them and checking existence', () => {
  // path.resolve() turns relative into absolute, so it fails on existence
  const result = validateLinkedDirs(['relative/path']);
  assert.ok(result.error);
});

test('rejects non-existent directories', () => {
  const result = validateLinkedDirs(['/no/such/directory/ever']);
  assert.ok(result.error.includes('does not exist'));
});

test('rejects files (non-directories)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  const file = join(tmp, 'file.txt');
  writeFileSync(file, 'test');
  try {
    const result = validateLinkedDirs([file]);
    assert.ok(result.error.includes('not a directory'));
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('accepts valid directories and normalizes paths', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-linked-'));
  try {
    const result = validateLinkedDirs([tmp]);
    assert.ok(!result.error);
    assert.deepEqual(result.dirs, [tmp]);
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
    assert.deepEqual(result.dirs, [tmp]);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});
