import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readKeys,
  generateKey,
  listKeys,
  revokeKey,
  allValidHashes,
  verifyKey,
} from '../src/auth-store.js';

describe('auth-store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'auth-store-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('generate key returns {id, key, label, createdAt} where key starts with od_', async () => {
    const result = await generateKey(dataDir, 'test-key');

    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.key).toMatch(/^od_/);
    expect(result.label).toBe('test-key');
    expect(typeof result.createdAt).toBe('number');
    expect(result.createdAt).toBeGreaterThan(0);
  });

  it('list keys shows keyPrefix starting with od_ and omits full key', async () => {
    const generated = await generateKey(dataDir, 'list-test');
    const keys = await listKeys(dataDir);

    expect(keys).toHaveLength(1);
    expect(keys[0]!.id).toBe(generated.id);
    expect(keys[0]!.keyPrefix).toMatch(/^od_/);
    expect(keys[0]!.label).toBe('list-test');
    expect((keys[0] as Record<string, unknown>).keyHash).toBeUndefined();
  });

  it('all hashes returns non-empty array of 64-char hex strings', async () => {
    await generateKey(dataDir, 'hash-test');
    const hashes = await allValidHashes(dataDir);

    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verify key passes for correct key and fails for wrong key', async () => {
    const generated = await generateKey(dataDir, 'verify-test');
    const hashes = await allValidHashes(dataDir);

    expect(verifyKey(generated.key, hashes)).toBe(true);
    expect(verifyKey('od_wrongkey', hashes)).toBe(false);
  });

  it('revoke key removes it and list returns empty', async () => {
    const generated = await generateKey(dataDir, 'revoke-test');

    const revoked = await revokeKey(dataDir, generated.id);
    expect(revoked).toBe(true);

    const keys = await listKeys(dataDir);
    expect(keys).toHaveLength(0);

    const hashes = await allValidHashes(dataDir);
    expect(hashes).toHaveLength(0);
  });

  it('revoke nonexistent key returns false', async () => {
    const revoked = await revokeKey(dataDir, 'does-not-exist');
    expect(revoked).toBe(false);
  });

  it('read keys returns empty array when no file exists', async () => {
    const keys = await readKeys(dataDir);
    expect(keys).toEqual([]);
  });

  it('generates multiple keys and lists all', async () => {
    await generateKey(dataDir, 'key-1');
    await generateKey(dataDir, 'key-2');
    await generateKey(dataDir, 'key-3');

    const keys = await listKeys(dataDir);
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => k.label).sort()).toEqual(['key-1', 'key-2', 'key-3']);
  });

  it('revoke one key preserves others', async () => {
    const k1 = await generateKey(dataDir, 'keep');
    await generateKey(dataDir, 'remove');

    await revokeKey(dataDir, k1.id);

    const keys = await listKeys(dataDir);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.label).toBe('remove');
  });

  it('verify key works after revoke', async () => {
    const keep = await generateKey(dataDir, 'keep');
    const remove = await generateKey(dataDir, 'remove');

    await revokeKey(dataDir, remove.id);
    const hashes = await allValidHashes(dataDir);

    expect(verifyKey(keep.key, hashes)).toBe(true);
    expect(verifyKey(remove.key, hashes)).toBe(false);
  });

  it('generates key without label', async () => {
    const result = await generateKey(dataDir);
    expect(result.label).toBe('');
    expect(result.key).toMatch(/^od_/);
  });
});
