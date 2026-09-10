import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createJsonIpcServer, requestJsonIpc } from '../src/json-ipc.js';
import { resolvePrivateIpcPath, SIDECAR_STAMP_FIELDS, type SidecarStamp } from '../src/stamp.js';

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, tmpdir: vi.fn(os.tmpdir) };
});

const macTmpdir = '/var/folders/44/fmg2qx4n1wl13f0nrcjctpm4hjtjw_/T/';
const stamp: SidecarStamp = {
  channel: 'stable',
  namespace: 'release-stable',
  source: 'packaged',
  mode: 'runtime',
  app: 'daemon',
};

beforeEach(() => {
  vi.mocked(tmpdir).mockReturnValue(macTmpdir);
  vi.stubGlobal('process', { ...process, getuid: () => 555566986 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('private sidecar IPC paths', () => {
  it('fits the macOS socket limit with the reported long temp directory and UID', () => {
    const endpoint = resolvePrivateIpcPath(stamp, 'darwin');

    expect(Buffer.byteLength(endpoint)).toBeLessThanOrEqual(103);
    expect(endpoint).toMatch(/[\\/]od-sidecar-555566986[\\/][a-f0-9]{32}\.sock$/);
    expect(resolvePrivateIpcPath(stamp, 'darwin')).toBe(endpoint);
  });

  it('measures UTF-8 bytes rather than characters', () => {
    vi.mocked(tmpdir).mockReturnValue(`/tmp/${'\u00e9'.repeat(20)}`);

    expect(Buffer.byteLength(resolvePrivateIpcPath(stamp, 'darwin'))).toBeLessThanOrEqual(103);
  });

  it('preserves macOS endpoints that already fit', () => {
    vi.mocked(tmpdir).mockReturnValue('/tmp');
    const shortEndpoint = resolvePrivateIpcPath(stamp, 'darwin');
    vi.mocked(tmpdir).mockReturnValue('/var/tmp');

    expect(resolvePrivateIpcPath(stamp, 'darwin')).toBe(join('/var', shortEndpoint));
  });

  it('preserves a macOS endpoint at the 103-byte boundary', () => {
    const tempRoot = `/${'a'.repeat(43)}`;
    vi.mocked(tmpdir).mockReturnValue(tempRoot);
    const endpoint = resolvePrivateIpcPath(stamp, 'darwin');

    expect(Buffer.byteLength(endpoint)).toBe(103);
    expect(dirname(endpoint)).toBe(join(tempRoot, 'od-sidecar-555566986'));
  });

  it('keeps every stamp field and the OS user in the fallback identity', () => {
    const endpoint = resolvePrivateIpcPath(stamp, 'darwin');
    for (const field of SIDECAR_STAMP_FIELDS) {
      expect(resolvePrivateIpcPath({ ...stamp, [field]: 'other' }, 'darwin')).not.toBe(endpoint);
    }
    vi.stubGlobal('process', { ...process, getuid: () => 555566987 });
    expect(resolvePrivateIpcPath(stamp, 'darwin')).not.toBe(endpoint);
  });

  it('preserves Linux socket paths', () => {
    vi.mocked(tmpdir).mockReturnValue('/var/tmp');

    expect(dirname(resolvePrivateIpcPath(stamp, 'linux'))).toBe(join('/var/tmp', 'od-sidecar-555566986'));
  });

  it('keeps Windows named pipes independent of the temporary directory', () => {
    const endpoint = resolvePrivateIpcPath(stamp, 'win32');
    vi.mocked(tmpdir).mockReturnValue('/tmp');

    expect(endpoint).toMatch(/^\\\\\.\\pipe\\open-design-sidecar-[a-f0-9]{32}$/);
    expect(resolvePrivateIpcPath(stamp, 'win32')).toBe(endpoint);
  });

  it.skipIf(process.platform !== 'darwin')('binds private sockets for two macOS namespaces with a long TMPDIR', async () => {
    vi.unstubAllGlobals();
    vi.mocked(tmpdir).mockReturnValue(`${macTmpdir}${'long'.repeat(30)}`);
    const endpoints = [0, 1].map(() => resolvePrivateIpcPath({ ...stamp, namespace: randomUUID() }));
    const servers = [];
    try {
      for (const [index, socketPath] of endpoints.entries()) {
        servers.push(await createJsonIpcServer({ socketPath, handler: () => index }));
        expect((await lstat(dirname(socketPath))).mode & 0o777).toBe(0o700);
      }
      for (const [index, endpoint] of endpoints.entries()) {
        expect(await requestJsonIpc(endpoint, { type: 'status' })).toBe(index);
      }
    } finally {
      await Promise.all(servers.map((server) => server.close()));
    }
    for (const endpoint of endpoints) {
      await expect(lstat(endpoint)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
});
