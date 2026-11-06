import { PassThrough } from 'node:stream';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import { streamAssetFileToResponse } from '../src/routes/library.js';

// A path that does not exist: `createReadStream` opens it lazily and emits an
// async ENOENT `error` on the Readable. `.pipe()` does not forward that error,
// so without the guard the unhandled `error` event would crash the whole process
// (uncaughtException). If these tests run to completion, the guard handled it.
const MISSING = path.join(tmpdir(), 'od-library-stream-error-does-not-exist-xyz');
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

function fakeRes(headersSent: boolean) {
  const removed: string[] = [];
  const res = new PassThrough() as unknown as {
    headersSent: boolean;
    removeHeader: (name: string) => void;
    destroy: () => void;
    _removed: string[];
  };
  res.headersSent = headersSent;
  res._removed = removed;
  res.removeHeader = (name: string) => {
    removed.push(name);
  };
  return res;
}

describe('streamAssetFileToResponse', () => {
  it('drops the success-only headers and sends the 404 fallback when the stream errors before any bytes', async () => {
    const res = fakeRes(false);
    const onOpenError = vi.fn();

    streamAssetFileToResponse(MISSING, res as never, onOpenError);
    await flush();

    expect(onOpenError).toHaveBeenCalledTimes(1);
    // The route's `Cache-Control: private, max-age=3600` must NOT survive onto a
    // transient 404, or a missing-file blip would be cached for an hour.
    expect(res._removed).toEqual(
      expect.arrayContaining(['Cache-Control', 'Content-Type', 'Content-Length', 'Content-Disposition']),
    );
  });

  it('destroys the response (rather than crashing) when the stream errors after headers are sent', async () => {
    const res = fakeRes(true);
    const destroySpy = vi.spyOn(res as unknown as PassThrough, 'destroy');
    const onOpenError = vi.fn();

    streamAssetFileToResponse(MISSING, res as never, onOpenError);
    await flush();

    expect(destroySpy).toHaveBeenCalled();
    expect(onOpenError).not.toHaveBeenCalled();
    // Headers already flushed → nothing to strip.
    expect(res._removed).toEqual([]);
  });
});
