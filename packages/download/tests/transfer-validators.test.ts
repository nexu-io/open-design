import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MANAGED_DOWNLOAD_ERROR_CODES } from '../src/errors.js';
import { createManifest } from '../src/manifest.js';
import { targetFromOptions } from '../src/target.js';
import { downloadWithRetries } from '../src/transfer.js';

const roots: string[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Create a disposable target with the real partial-file directory. */
function targetFixture() {
  const root = mkdtempSync(join(tmpdir(), 'od-download-validators-'));
  roots.push(root);
  const target = targetFromOptions({
    basePath: root,
    bucket: 'updates',
    fileName: 'payload.bin',
    payload: {
      url: 'https://example.test/payload.bin',
      checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
    },
  });
  mkdirSync(dirname(target.partialPath), { recursive: true });
  return target;
}

/** Fail the response only after the real partial writer has saved the prefix. */
function interruptedResponse(
  target: ReturnType<typeof targetFromOptions>,
  prefix: string,
  writtenSize: number,
  init: ResponseInit,
): Response {
  const flushed = Promise.withResolvers<void>();
  const watcher = watch(dirname(target.partialPath), () => {
    try {
      if (statSync(target.partialPath).size >= writtenSize) flushed.resolve();
    } catch {
      // The partial may not exist until the writer opens it.
    }
  });
  cleanups.push(() => watcher.close());
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(prefix));
    },
    async pull(controller) {
      await flushed.promise;
      watcher.close();
      controller.error(new Error('connection interrupted'));
    },
    cancel() {
      watcher.close();
    },
  }), init);
}

const validators = { etag: '"first"', lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT' };

describe('interrupted transfer validators', () => {
  it.each([false, true])('retains the response metadata after exhausting retries (resume=%s)', async (resume) => {
    const target = targetFixture();
    if (resume) writeFileSync(target.partialPath, 'pa');
    const response = interruptedResponse(target, resume ? 'y' : 'pay', 3, {
      status: resume ? 206 : 200,
      headers: {
        etag: validators.etag,
        'last-modified': validators.lastModified,
        'content-length': resume ? '5' : '7',
        ...(resume ? { 'content-range': 'bytes 2-6/7' } : {}),
      },
    });

    await expect(downloadWithRetries(target, resume ? createManifest(target, 'partial') : null, {
      emit: () => {}, fetchImpl: async () => response, maxAttempts: 1,
    })).rejects.toMatchObject({ code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED });

    expect(readFileSync(target.partialPath, 'utf8')).toBe('pay');
    const saved = JSON.parse(readFileSync(target.manifestPath, 'utf8'));
    expect(saved.validators).toEqual(validators);
    expect(saved.totalBytes).toBe(7);
  });

  it('restarts when the resource changes after an interrupted fresh transfer', async () => {
    const target = targetFixture();
    const first = interruptedResponse(target, 'bad', 3, {
      headers: { etag: '"old"', 'content-length': '7' },
    });
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(new Response('load', {
        status: 206,
        headers: { etag: '"new"', 'content-range': 'bytes 3-6/7', 'content-length': '4' },
      }))
      .mockResolvedValueOnce(new Response('payload', {
        headers: { etag: '"new"', 'content-length': '7' },
      }));

    const result = await downloadWithRetries(target, null, {
      emit: () => {}, fetchImpl, maxAttempts: 2,
    });

    expect(readFileSync(target.partialPath, 'utf8')).toBe('payload');
    expect(result.resumed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const retryHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers);
    expect(retryHeaders.get('range')).toBe('bytes=3-');
    expect(retryHeaders.get('if-range')).toBe('"old"');
  });

  it('resumes with the saved If-Range when the representation matches', async () => {
    const target = targetFixture();
    const first = interruptedResponse(target, 'pay', 3, {
      headers: { etag: '"same"', 'content-length': '7' },
    });
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(new Response('load', {
        status: 206,
        headers: { etag: '"same"', 'content-range': 'bytes 3-6/7' },
      }));

    const result = await downloadWithRetries(target, null, {
      emit: () => {}, fetchImpl, maxAttempts: 2,
    });

    expect(readFileSync(target.partialPath, 'utf8')).toBe('payload');
    expect(result.resumed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get('if-range')).toBe('"same"');
  });

  it('keeps existing metadata when a request fails before receiving a response', async () => {
    const target = targetFixture();
    writeFileSync(target.partialPath, 'pay');
    const manifest = createManifest(target, 'partial', { totalBytes: 7, validators });
    mkdirSync(dirname(target.manifestPath), { recursive: true });
    writeFileSync(target.manifestPath, JSON.stringify(manifest));

    await expect(downloadWithRetries(target, manifest, {
      emit: () => {},
      fetchImpl: async () => { throw new Error('offline'); },
      maxAttempts: 1,
    })).rejects.toMatchObject({ code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED });

    const saved = JSON.parse(readFileSync(target.manifestPath, 'utf8'));
    expect(saved.validators).toEqual(validators);
    expect(saved.totalBytes).toBe(7);
    expect(readFileSync(target.partialPath, 'utf8')).toBe('pay');
  });
});
