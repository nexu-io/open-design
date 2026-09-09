import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createChatArtifactBlobStore } from '../src/chat-artifacts/blob-store.js';

const bytes = (text: string) => Buffer.from(text, 'utf8');
const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

describe('chat artifact blob store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-chat-blob-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('refuses to construct without an absolute data root', () => {
    expect(() => createChatArtifactBlobStore({ dataDir: '' })).toThrow(/data root/i);
    expect(() => createChatArtifactBlobStore({ dataDir: 'relative/path' })).toThrow(/absolute/i);
  });

  it('roots every path under the caller-provided data dir', () => {
    const store = createChatArtifactBlobStore({ dataDir });
    expect(store.root.startsWith(path.resolve(dataDir))).toBe(true);
  });

  it('installs bytes at their content address and dedupes a second identical install', async () => {
    const store = createChatArtifactBlobStore({ dataDir });
    const payload = bytes('hello-artifact');
    const digest = sha256(payload);

    const firstTemp = store.newTempKey();
    const first = await store.writeTempFromBytes(firstTemp, payload);
    expect(first.digest).toBe(digest);
    expect(first.byteSize).toBe(payload.byteLength);
    const firstKey = await store.installTemp(firstTemp, first.digest);

    const secondTemp = store.newTempKey();
    const second = await store.writeTempFromBytes(secondTemp, payload);
    const secondKey = await store.installTemp(secondTemp, second.digest);

    expect(secondKey).toBe(firstKey);
    // The temp for the duplicate must be gone, not left behind as garbage.
    expect(await store.listTempEntries()).toHaveLength(0);
    expect(await store.readBlob(firstKey)).toEqual(payload);
  });

  it('never exposes an absolute path as a storage key', async () => {
    const store = createChatArtifactBlobStore({ dataDir });
    const temp = store.newTempKey();
    const written = await store.writeTempFromBytes(temp, bytes('x'));
    const key = await store.installTemp(temp, written.digest);
    expect(path.isAbsolute(key)).toBe(false);
    expect(key).not.toContain(dataDir);
    expect(key.startsWith('objects/')).toBe(true);
  });

  it('rejects a storage key that tries to escape the blob root', () => {
    const store = createChatArtifactBlobStore({ dataDir });
    expect(() => store.resolveStorageKey('../../etc/passwd')).toThrow(/storage key/i);
    expect(() => store.resolveStorageKey('objects/aa/bb/../../../../secret')).toThrow(/storage key/i);
    expect(() => store.resolveStorageKey('/etc/passwd')).toThrow(/storage key/i);
  });

  it('hashes a file stream and refuses to install a digest that does not match', async () => {
    const store = createChatArtifactBlobStore({ dataDir });
    const src = path.join(dataDir, 'source.bin');
    writeFileSync(src, bytes('streamed-bytes'));

    const temp = store.newTempKey();
    const written = await store.writeTempFromPath(temp, src);
    expect(written.digest).toBe(sha256(bytes('streamed-bytes')));

    await expect(
      store.installTemp(temp, `sha256:${'0'.repeat(64)}`),
    ).rejects.toThrow(/digest/i);
    // A refused install must not leave the wrong bytes installed.
    expect(await store.listTempEntries()).toHaveLength(0);
  });

  it('verifies an installed blob against its recorded size', async () => {
    const store = createChatArtifactBlobStore({ dataDir });
    const payload = bytes('verify-me');
    const temp = store.newTempKey();
    const written = await store.writeTempFromBytes(temp, payload);
    const key = await store.installTemp(temp, written.digest);

    expect(await store.verifyBlob(key, payload.byteLength)).toBe(true);
    // Corrupt it on disk: the store must refuse rather than serve wrong bytes.
    fs.writeFileSync(store.resolveStorageKey(key), bytes('corrupted-longer'));
    expect(await store.verifyBlob(key, payload.byteLength)).toBe(false);
  });
});
