import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { download, testVersion, lock, targetInfo } from '../scripts/test-package.mjs';
import { nativeComponents } from '../scripts/runtime-assets.mjs';

test('test versions sort above an already distributed source version and distinguish attempts', () => {
  assert.equal(testVersion('0.6.1', '42', '1'), '0.6.2-beta.42.1');
  assert.equal(testVersion('0.6.1', '42', '2'), '0.6.2-beta.42.2');
  assert.throws(() => testVersion('0.6.1', '../x'), /positive/);
  assert.throws(() => testVersion('0.6.1-beta.1', '1'), /MAJOR/);
  assert.equal(targetInfo('mac-arm64').platform, 'darwin');
  assert.equal(targetInfo('win-x64').platform, 'win32');
  assert.throws(() => targetInfo('unknown'), /Unsupported/);
});
test('public runtime downloads never attach repository credentials and reject HTTPS downgrades', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'motion-redirect-')), filename = path.join(dir, 'runtime.zip');
  const previous = process.env.FORGEJO_TOKEN;
  process.env.FORGEJO_TOKEN = 'test-only-token';
  try {
    const bytes = 'pinned runtime', sum = createHash('sha256').update(bytes).digest('hex');
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      if (++calls === 1) {
        assert.equal(options.headers?.Authorization, undefined);
        return new Response(null, { status: 302, headers: { location: 'https://cdn.example.invalid/runtime.zip' } });
      }
      assert.equal(options.headers?.Authorization, undefined);
      return new Response(bytes);
    });
    await download({ url: 'https://origin.example.invalid/runtime.zip', sha256: sum }, filename);
    assert.equal(await readFile(filename, 'utf8'), bytes);
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location: 'http://example.invalid/runtime.zip' } }));
    await assert.rejects(download({ url: 'https://example.invalid/runtime.zip', sha256: 'a'.repeat(64) }, filename), /HTTPS/);
  } finally {
    if (previous === undefined) delete process.env.FORGEJO_TOKEN; else process.env.FORGEJO_TOKEN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
test('runtime sources require a pinned checksum and cannot replace earlier cache contents on invalid input', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'motion-pin-')), filename = path.join(dir, 'runtime.zip');
  try {
    await writeFile(filename, 'keep previous cache');
    await assert.rejects(download({ url: 'http://example.invalid/a.zip', sha256: 'a'.repeat(64) }, filename), /HTTPS/);
    t.mock.method(globalThis, 'fetch', async () => new Response('invalid runtime archive'));
    await assert.rejects(download({ url: 'https://example.invalid/a.zip', sha256: 'a'.repeat(64) }, filename), /SHA256 mismatch/);
    await assert.rejects(access(filename + '.part'), { code: 'ENOENT' });
    assert.equal(await readFile(filename, 'utf8'), 'keep previous cache');
    for (const target of Object.values(lock.targets)) for (const key of ['node', ...nativeComponents(target)]) {
      assert.match(target[key].sha256, /^[a-f0-9]{64}$/); assert.equal(new URL(target[key].url).protocol, 'https:');
      assert(['nodejs.org', 'storage.googleapis.com', 'ffmpeg.martin-riedl.de', 'github.com'].includes(new URL(target[key].url).hostname), 'Runtime sources must be public upstream hosts');
      assert(!target[key].url.includes('/latest/'), 'Use an immutable public version URL');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('public source failures report the HTTP status without requiring repository credentials', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'motion-public-'));
  try {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
    await assert.rejects(download({ url: 'https://example.invalid/runtime.zip', sha256: 'a'.repeat(64) }, path.join(dir, 'media.zip')), /HTTP 404$/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
