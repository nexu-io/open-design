// Regression: the AMR/vela API proxy pipes the upstream response body to the
// client (`upstreamRes.pipe(res)`) and the client upload body to the upstream
// (`req.pipe(upstream)`). `.pipe()` does not forward a source `'error'`, and a
// stream that emits `'error'` with no listener throws — an unhandled exception
// that crashes the privileged daemon. A mid-stream upstream ECONNRESET, or a
// client aborting an upload, would therefore take the whole daemon down. Only
// the outbound ClientRequest had a handler; the two piped stream bodies did not.
//
// `pipeProxyStreamWithGuard` attaches the missing source-error handler. This
// spec pins the crash vector (a bare pipe throws on a source error) against the
// fix (the guard routes the error to the handler and nothing throws).

import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { pipeProxyStreamWithGuard } from '../src/routes/vela.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('vela proxy pipe error guard', () => {
  it('CONTROL: a bare pipe (the pre-fix shape) throws on a source error — the daemon-crash vector', () => {
    const source = new PassThrough();
    const dest = new PassThrough();
    source.pipe(dest); // exactly what upstreamRes.pipe(res) / req.pipe(upstream) did
    expect(source.listenerCount('error')).toBe(0);
    // An 'error' with no listener throws (Node would surface this as an
    // uncaughtException and kill the daemon).
    expect(() => source.emit('error', new Error('ECONNRESET'))).toThrow('ECONNRESET');
  });

  it('routes a mid-stream source error to the handler instead of crashing', async () => {
    const source = new PassThrough();
    const dest = new PassThrough();
    const onError = vi.fn();

    pipeProxyStreamWithGuard(source, dest, onError);
    expect(source.listenerCount('error')).toBe(1);

    // The same error that threw above must now be delivered to the handler and
    // must NOT throw (test completing is itself the no-crash proof).
    expect(() => source.emit('error', new Error('ECONNRESET'))).not.toThrow();
    await flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('still pipes the payload through on the happy path', async () => {
    const source = new PassThrough();
    const dest = new PassThrough();
    const chunks: Buffer[] = [];
    dest.on('data', (c: Buffer) => chunks.push(c));

    pipeProxyStreamWithGuard(source, dest, () => {});
    source.end(Buffer.from('hello'));
    await flush();
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });
});
