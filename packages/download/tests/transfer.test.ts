import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MANAGED_DOWNLOAD_ERROR_CODES } from '../src/errors.js';
import * as fsIo from '../src/fs-io.js';
import { createManifest } from '../src/manifest.js';
import { targetFromOptions } from '../src/target.js';
import { downloadWithRetries } from '../src/transfer.js';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Create a disposable partial-download target without contacting a server. */
function targetFixture() {
  const root = mkdtempSync(join(tmpdir(), 'od-download-discard-'));
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

describe('discarded download responses', () => {
  it.each([
    { label: 'ignored Range', status: 200, headers: {} },
    { label: 'rejected Range', status: 416, headers: {} },
    { label: 'missing Content-Range', status: 206, headers: {} },
    { label: 'mismatched start', status: 206, headers: { 'content-range': 'bytes 0-6/7' } },
    { label: 'changed validator', status: 206, headers: { 'content-range': 'bytes 3-6/7', etag: '"changed"' } },
  ])('cancels a resume body before restarting: $label', async ({ status, headers }) => {
    const target = targetFixture();
    writeFileSync(target.partialPath, 'pay');
    const manifest = createManifest(target, 'partial', { validators: { etag: '"saved"' } });
    const events: string[] = [];
    const cancel = vi.fn(() => { events.push('cancel'); });
    const discarded = new Response(new ReadableStream<Uint8Array>({ cancel }), { status, headers });
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(discarded)
      .mockImplementationOnce(async () => {
        events.push('restart');
        return new Response('payload');
      });

    const result = await downloadWithRetries(target, manifest, {
      emit: () => {}, fetchImpl, maxAttempts: 1,
    });

    expect(events).toEqual(['cancel', 'restart']);
    expect(cancel).toHaveBeenCalledOnce();
    expect(result.resumed).toBe(false);
    expect(readFileSync(target.partialPath, 'utf8')).toBe('payload');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('still restarts when cancelling a discarded body rejects', async () => {
    const target = targetFixture();
    writeFileSync(target.partialPath, 'pay');
    const cancel = vi.fn(async () => { throw new Error('stream already failed'); });
    const discarded = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(discarded)
      .mockResolvedValueOnce(new Response('payload'));

    await downloadWithRetries(target, createManifest(target, 'partial'), {
      emit: () => {}, fetchImpl, maxAttempts: 1,
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(readFileSync(target.partialPath, 'utf8')).toBe('payload');
  });

  it('waits for cancellation before starting a replacement request', async () => {
    const target = targetFixture();
    writeFileSync(target.partialPath, 'pay');
    const started = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    const discarded = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        started.resolve();
        return finished.promise;
      },
    }));
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(discarded)
      .mockResolvedValueOnce(new Response('payload'));

    const download = downloadWithRetries(target, createManifest(target, 'partial'), {
      emit: () => {}, fetchImpl, maxAttempts: 1,
    });
    await started.promise;
    try {
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      finished.resolve();
    }
    await download;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('cancels an HTTP error body and preserves its status in the final error', async () => {
    const target = targetFixture();
    const cancel = vi.fn(async () => { throw new Error('cleanup failed'); });
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), { status: 503 });
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);

    await expect(downloadWithRetries(target, null, {
      emit: () => {}, fetchImpl, maxAttempts: 1,
    })).rejects.toMatchObject({
      code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED,
      message: expect.stringContaining('HTTP 503'),
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    { resume: false, cancelRejects: false },
    { resume: false, cancelRejects: true },
    { resume: true, cancelRejects: false },
    { resume: true, cancelRejects: true },
  ])('cancels a body after a manifest write fails (resume=$resume, cancelRejects=$cancelRejects)', async ({ resume, cancelRejects }) => {
    const target = targetFixture();
    if (resume) writeFileSync(target.partialPath, 'pay');
    vi.spyOn(fsIo, 'writeJson').mockRejectedValue(new Error('manifest write failed'));
    const cancel = vi.fn(async () => {
      if (cancelRejects) throw new Error('cleanup failed');
    });
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: resume ? 206 : 200,
      headers: resume ? { 'content-range': 'bytes 3-6/7' } : {},
    });
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);

    await expect(downloadWithRetries(target, resume ? createManifest(target, 'partial') : null, {
      emit: () => {}, fetchImpl, maxAttempts: 1,
    })).rejects.toMatchObject({
      code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED,
      message: 'download failed after 1 attempts: manifest write failed',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
    if (resume) expect(readFileSync(target.partialPath, 'utf8')).toBe('pay');
  });

  it('waits for cleanup after a manifest write fails before retrying', async () => {
    const target = targetFixture();
    vi.spyOn(fsIo, 'writeJson').mockRejectedValue(new Error('manifest write failed'));
    const started = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    const cancel = vi.fn(() => {
      started.resolve();
      return finished.promise;
    });
    const retryCancel = vi.fn();
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ cancel })))
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ cancel: retryCancel })));
    const failure = downloadWithRetries(target, null, {
      emit: () => {}, fetchImpl, maxAttempts: 2,
    }).catch((error: unknown) => error);

    try {
      expect(await Promise.race([started.promise.then(() => true), failure.then(() => false)])).toBe(true);
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      finished.resolve();
      await failure;
    }
    expect(await failure).toMatchObject({
      code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED,
      message: 'download failed after 2 attempts: manifest write failed',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(retryCancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('consumes an accepted resume body without cancelling it', async () => {
    const target = targetFixture();
    writeFileSync(target.partialPath, 'pay');
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('load'));
        controller.close();
      },
      cancel,
    }), { status: 206, headers: { 'content-range': 'bytes 3-6/7' } });
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);

    const result = await downloadWithRetries(target, createManifest(target, 'partial'), {
      emit: () => {}, fetchImpl, maxAttempts: 1,
    });

    expect(result.resumed).toBe(true);
    expect(readFileSync(target.partialPath, 'utf8')).toBe('payload');
    expect(response.bodyUsed).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
