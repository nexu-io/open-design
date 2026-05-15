import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  initMcpKeyStore,
  generateMcpKey,
  listMcpKeys,
  revealMcpKey,
  revokeMcpKey,
  allMcpKeyHashes,
  verifyMcpKey,
} from '../src/mcp-key-store.js';

describe('mcp-key-store', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mcp-keys-'));
    await initMcpKeyStore(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('generate key returns {id, key, label, createdAt} where key starts with od_mcp_', async () => {
    const result = await generateMcpKey(dataDir, 'test-key');

    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.key).toMatch(/^od_mcp_/);
    expect(result.label).toBe('test-key');
    expect(typeof result.createdAt).toBe('number');
    expect(result.createdAt).toBeGreaterThan(0);
  });

  it('list keys shows keyPrefix starting with od_mcp_', async () => {
    const generated = await generateMcpKey(dataDir, 'list-test');
    const keys = await listMcpKeys(dataDir);

    expect(keys).toHaveLength(1);
    expect(keys[0]!.id).toBe(generated.id);
    expect(keys[0]!.keyPrefix).toMatch(/^od_mcp_/);
    expect(keys[0]!.label).toBe('list-test');
    expect(typeof keys[0]!.createdAt).toBe('number');
  });

  it('reveal key decrypted matches original generated key', async () => {
    const generated = await generateMcpKey(dataDir, 'reveal-test');
    const revealed = await revealMcpKey(dataDir, generated.id);

    expect(revealed).not.toBeNull();
    expect(revealed!.key).toBe(generated.key);
  });

  it('all hashes returns non-empty array of hex strings', async () => {
    await generateMcpKey(dataDir, 'hash-test');
    const hashes = await allMcpKeyHashes(dataDir);

    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verify key passes for correct key and fails for wrong key', async () => {
    const generated = await generateMcpKey(dataDir, 'verify-test');
    const hashes = await allMcpKeyHashes(dataDir);

    expect(verifyMcpKey(generated.key, hashes)).toBe(true);
    expect(verifyMcpKey('od_mcp_wrongkey', hashes)).toBe(false);
  });

  it('revoke key removes it and reveal returns null', async () => {
    const generated = await generateMcpKey(dataDir, 'revoke-test');

    const revoked = await revokeMcpKey(dataDir, generated.id);
    expect(revoked).toBe(true);

    const revealed = await revealMcpKey(dataDir, generated.id);
    expect(revealed).toBeNull();

    const keys = await listMcpKeys(dataDir);
    expect(keys).toHaveLength(0);
  });

  it('revoke nonexistent key returns false', async () => {
    const revoked = await revokeMcpKey(dataDir, 'does-not-exist');
    expect(revoked).toBe(false);
  });
});
