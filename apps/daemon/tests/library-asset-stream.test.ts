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

describe('streamAssetFileToResponse', () => {
  it('sends the 404 fallback when the read stream errors before any bytes are written', async () => {
    const res = new PassThrough() as unknown as { headersSent: boolean; destroy: () => void };
    res.headersSent = false;
    const onOpenError = vi.fn();

    streamAssetFileToResponse(MISSING, res as never, onOpenError);
    await flush();

    expect(onOpenError).toHaveBeenCalledTimes(1);
  });

  it('destroys the response (rather than crashing) when the stream errors after headers are sent', async () => {
    const res = new PassThrough() as unknown as { headersSent: boolean; destroy: () => void };
    res.headersSent = true;
    const destroySpy = vi.spyOn(res as unknown as PassThrough, 'destroy');
    const onOpenError = vi.fn();

    streamAssetFileToResponse(MISSING, res as never, onOpenError);
    await flush();

    expect(destroySpy).toHaveBeenCalled();
    expect(onOpenError).not.toHaveBeenCalled();
  });
});
