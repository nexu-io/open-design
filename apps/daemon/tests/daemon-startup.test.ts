import { describe, expect, it } from 'vitest';

import { parseDaemonCliStartupArgs } from '../src/daemon-startup.js';

describe('daemon startup CLI parsing', () => {
  it('parses the documented daemon startup flags', () => {
    expect(parseDaemonCliStartupArgs(['--host', '0.0.0.0', '--port', '8123', '--no-open'], {})).toEqual({
      ok: true,
      config: {
        host: '0.0.0.0',
        open: false,
        port: 8123,
      },
    });
  });

  it('uses environment defaults when startup flags are omitted', () => {
    expect(parseDaemonCliStartupArgs([], { OD_BIND_HOST: '127.0.0.2', OD_PORT: '7345' })).toEqual({
      ok: true,
      config: {
        host: '127.0.0.2',
        open: true,
        port: 7345,
      },
    });
  });

  it('falls back to loopback when bind host input is blank', () => {
    expect(parseDaemonCliStartupArgs([], { OD_BIND_HOST: '   ' })).toEqual({
      ok: true,
      config: {
        host: '127.0.0.1',
        open: true,
        port: 7456,
      },
    });
    expect(parseDaemonCliStartupArgs(['--host', '   '], {})).toEqual({
      ok: true,
      config: {
        host: '127.0.0.1',
        open: true,
        port: 7456,
      },
    });
  });

  it('rejects browser snapshot instead of treating it as daemon startup', () => {
    expect(parseDaemonCliStartupArgs(['browser', 'snapshot', '--url', 'https://example.test/'], {})).toEqual({
      ok: false,
      kind: 'error',
      message: 'unknown command: od browser',
    });
  });

  it('rejects unknown daemon startup options', () => {
    expect(parseDaemonCliStartupArgs(['--url', 'https://example.test/'], {})).toEqual({
      ok: false,
      kind: 'error',
      message: 'unknown option: --url',
    });
  });

  it('rejects flag-shaped values for required daemon startup options', () => {
    expect(parseDaemonCliStartupArgs(['--host', '--no-open'], {})).toEqual({
      ok: false,
      kind: 'error',
      message: '--host requires an address',
    });
    expect(parseDaemonCliStartupArgs(['--port', '--no-open'], {})).toEqual({
      ok: false,
      kind: 'error',
      message: '--port requires a port',
    });
  });
});
