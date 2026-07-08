import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runResource } from '../src/resource-cli.js';

const ORIGINAL_EXIT_CODE = process.exitCode;

describe('od resource CLI share/pull daemon wrappers', () => {
  let stdout: string[];
  let stderr: string[];
  let consoleLog: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.exitCode = undefined;
    stdout = [];
    stderr = [];
    consoleLog = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      stdout.push(`${String(message)}\n`);
    });
    consoleError = vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      stderr.push(`${String(message)}\n`);
    });
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ hubResourceId: 'hub-1', version: 3 }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleLog.mockRestore();
    consoleError.mockRestore();
    process.exitCode = ORIGINAL_EXIT_CODE;
  });

  it('posts share to the daemon resource route and supports JSON output', async () => {
    await runResource([
      'share',
      'design_system',
      'system-1',
      '--daemon-url',
      'http://127.0.0.1:7456/',
      '--json',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/resources/design_system/system-1/share',
      { method: 'POST' },
    );
    expect(JSON.parse(stdout.join(''))).toEqual({
      hubResourceId: 'hub-1',
      version: 3,
    });
    expect(stderr.join('')).toBe('');
  });

  it('posts pull to the daemon resource route and prints a readable summary', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ dir: '/tmp/team/design-systems/hub-1', version: 4 }), {
        status: 200,
      }),
    );

    await runResource([
      'pull',
      'design_system',
      'hub-1',
      '--daemon-url',
      'http://127.0.0.1:7456',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/resources/design_system/hub-1/pull',
      { method: 'POST' },
    );
    expect(stdout.join('')).toBe(
      'pulled design_system hub-1 -> /tmp/team/design-systems/hub-1 version 4\n',
    );
    expect(stderr.join('')).toBe('');
  });

  it('surfaces daemon errors from share', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unsupported_kind', detail: 'unknown kind: plugin' }), {
        status: 400,
      }),
    );

    await runResource([
      'share',
      'plugin',
      'plugin-1',
      '--daemon-url',
      'http://127.0.0.1:7456',
    ]);

    expect(process.exitCode).toBe(1);
    expect(stdout.join('')).toBe('');
    expect(stderr.join('')).toBe(
      'daemon resource endpoint failed (400 unsupported_kind): unknown kind: plugin\n',
    );
  });

  it('gets resource list from the daemon route and supports JSON output', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          resources: [
            {
              id: 'hub-1',
              teamId: 'team-1',
              kind: 'design_system',
              ownerMemberId: 'owner-1',
              createdAt: '2026-07-07T10:00:00.000Z',
              deletedAt: null,
              local: {
                kind: 'design_system',
                localId: 'system-1',
                hubResourceId: 'hub-1',
                hubTeamId: 'team-1',
                role: 'owner',
                lastSyncedVersion: 3,
                updatedAt: '2026-07-07T10:05:00.000Z',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await runResource([
      'list',
      '--daemon-url',
      'http://127.0.0.1:7456/',
      '--json',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/resources',
      { method: 'GET' },
    );
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      resources: [
        {
          id: 'hub-1',
          kind: 'design_system',
          local: {
            role: 'owner',
            localId: 'system-1',
            lastSyncedVersion: 3,
          },
        },
      ],
    });
    expect(stderr.join('')).toBe('');
  });

  it('prints resource list local mapping state in readable output', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          resources: [
            {
              id: 'hub-1',
              teamId: 'team-1',
              kind: 'design_system',
              ownerMemberId: 'owner-1',
              createdAt: '2026-07-07T10:00:00.000Z',
              deletedAt: null,
              local: {
                kind: 'design_system',
                localId: 'hub-1',
                hubResourceId: 'hub-1',
                hubTeamId: 'team-1',
                role: 'consumer',
                lastSyncedVersion: null,
                updatedAt: '2026-07-07T10:05:00.000Z',
              },
            },
            {
              id: 'hub-2',
              teamId: 'team-1',
              kind: 'plugin',
              ownerMemberId: 'owner-2',
              createdAt: '2026-07-07T10:01:00.000Z',
              deletedAt: null,
              local: null,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await runResource([
      'list',
      '--daemon-url',
      'http://127.0.0.1:7456',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(stdout.join('')).toBe(
      'design_system\thub-1\towner-1\tconsumer:hub-1:unsynced\n' +
        'plugin\thub-2\towner-2\t-\n',
    );
    expect(stderr.join('')).toBe('');
  });

  it('gets resource detail from the daemon route without local workspace principal env', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          resource: {
            id: 'hub-1',
            teamId: 'team-1',
            kind: 'design_system',
            ownerMemberId: 'owner-1',
            createdAt: '2026-07-07T10:00:00.000Z',
            deletedAt: null,
          },
          versions: [
            {
              id: 'version-1',
              resourceId: 'hub-1',
              version: 1,
              manifestDigest: 'sha256:abc',
              createdByMemberId: 'owner-1',
              createdAt: '2026-07-07T10:00:00.000Z',
            },
          ],
          manifest: {
            digest: 'sha256:abc',
            entries: [
              {
                path: 'tokens.json',
                type: 'file',
                executable: false,
                blobDigest: 'sha256:def',
                symlinkTarget: null,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await runResource([
      'detail',
      'hub-1',
      '--daemon-url',
      'http://127.0.0.1:7456/',
      '--json',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/resources/hub-1/detail',
      { method: 'GET' },
    );
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      resource: { id: 'hub-1', kind: 'design_system' },
      versions: [{ id: 'version-1', version: 1 }],
      manifest: { digest: 'sha256:abc' },
    });
    expect(stderr.join('')).toBe('');
  });

  it('posts snapshot publish to the daemon route with a name and supports JSON output', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          slug: 'snap-1',
          name: 'Launch review',
          kind: 'design_system',
          versionId: 'version-1',
          createdAt: '2026-07-08T06:00:00.000Z',
        }),
        { status: 200 },
      ),
    );

    await runResource([
      'snapshot',
      'hub-1',
      '--name',
      'Launch review',
      '--daemon-url',
      'http://127.0.0.1:7456/',
      '--json',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/resources/hub-1/snapshot?name=Launch%20review',
      { method: 'POST' },
    );
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      slug: 'snap-1',
      name: 'Launch review',
      kind: 'design_system',
    });
    expect(stderr.join('')).toBe('');
  });

  it('gets a public snapshot from the daemon route and prints entries', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          slug: 'snap-1',
          name: 'Launch review',
          kind: 'design_system',
          createdAt: '2026-07-08T06:00:00.000Z',
          manifest: {
            digest: 'sha256:abc',
            entries: [
              {
                path: 'tokens.json',
                type: 'file',
                executable: false,
                blobDigest: 'sha256:def',
                symlinkTarget: null,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await runResource([
      'public-snapshot',
      'snap-1',
      '--daemon-url',
      'http://127.0.0.1:7456',
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/public-snapshots/snap-1',
      { method: 'GET' },
    );
    expect(stdout.join('')).toBe(
      'design_system\tsnap-1\tLaunch review\n' +
        'manifest\tsha256:abc\t1 entries\n' +
        'entry\tfile\ttokens.json\tsha256:def\n',
    );
    expect(stderr.join('')).toBe('');
  });
});
