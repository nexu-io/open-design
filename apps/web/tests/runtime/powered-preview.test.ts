import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { buildProjectPoweredFileUrl } from '@open-design/contracts';
import {
  __resetPreviewIsolationCache,
  resolvePoweredBaseOrigin,
  resolvePoweredPreviewUrl,
} from '../../src/runtime/powered-preview';

afterEach(() => {
  vi.unstubAllGlobals();
  __resetPreviewIsolationCache();
});

const projectOrigin = (id: string, port = 17456) =>
  `http://od-${createHash('sha256').update(id).digest('hex').slice(0, 32)}.localhost:${port}`;

describe('resolvePoweredBaseOrigin', () => {
  it('gives each project a stable browser origin on the same daemon port', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:17456' } });
    const first = await resolvePoweredBaseOrigin('http://127.0.0.1:17456', 'project-a');
    const second = await resolvePoweredBaseOrigin('http://127.0.0.1:17456', 'project-b');
    expect(first).toBe(projectOrigin('project-a'));
    expect(second).not.toBe(first);
    expect(await resolvePoweredBaseOrigin('http://localhost:17456', 'project-a')).toBe(first);
  });

  it('returns a project origin from either normal loopback host', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:17456' },
    });

    expect(await resolvePoweredBaseOrigin('http://127.0.0.1:17456', 'p1')).toBe(projectOrigin('p1'));
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:17456' },
    });
    expect(await resolvePoweredBaseOrigin('http://localhost:17456', 'p1')).toBe(projectOrigin('p1'));
  });

  it('normalizes a base with a trailing path down to its origin', async () => {
    expect(await resolvePoweredBaseOrigin('http://127.0.0.1:17456/path', 'p1')).toBe(projectOrigin('p1'));
  });

  it('returns null for a non-loopback daemon', async () => {
    expect(await resolvePoweredBaseOrigin('http://192.168.1.20:17456', 'p1')).toBeNull();
    expect(await resolvePoweredBaseOrigin('https://example.com', 'p1')).toBeNull();
  });

  it('does not send a reverse-proxied app shell to the browser loopback interface', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://design.example.com' },
    });

    expect(await resolvePoweredBaseOrigin('http://127.0.0.1:17456', 'p1')).toBeNull();
  });

  it('keeps powered previews available to the packaged app custom protocol', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'od://app' },
    });

    expect(await resolvePoweredBaseOrigin('http://127.0.0.1:17456', 'p1')).toBe(projectOrigin('p1'));
  });

  it('fails closed for an invalid base, project, protocol, or unavailable crypto', async () => {
    expect(await resolvePoweredBaseOrigin('::::', 'p1')).toBeNull();
    expect(await resolvePoweredBaseOrigin('http://localhost:17456', '')).toBeNull();
    expect(await resolvePoweredBaseOrigin('file://localhost', 'p1')).toBeNull();
    vi.stubGlobal('crypto', {});
    expect(await resolvePoweredBaseOrigin('http://localhost:17456', 'p1')).toBeNull();
  });

  it('does not reuse the cached isolation probe as another project origin', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      supported: true,
      baseOrigin: 'http://127.0.0.1:17456',
      pathPrefix: 'powered',
      projectOrigins: true,
    })));
    vi.stubGlobal('fetch', fetchMock);
    const first = await resolvePoweredPreviewUrl('project-a', 'nested/index.html');
    const second = await resolvePoweredPreviewUrl('project-b', 'nested/index.html');
    expect(first).toBe(`${projectOrigin('project-a')}/api/projects/project-a/powered/nested/index.html`);
    expect(second).toBe(`${projectOrigin('project-b')}/api/projects/project-b/powered/nested/index.html`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, false])('fails closed when the daemon does not advertise project origins (%s)', async (projectOrigins) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      supported: true,
      baseOrigin: 'http://127.0.0.1:17456',
      pathPrefix: 'powered',
      projectOrigins,
    }))));
    expect(await resolvePoweredPreviewUrl('project-a', 'index.html')).toBeNull();
  });
});

describe('buildProjectPoweredFileUrl', () => {
  it('joins an absolute cross-origin base with the /powered/ route', () => {
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', 'index.html')).toBe(
      'http://127.0.0.1:17456/api/projects/p1/powered/index.html',
    );
  });

  it('encodes each path segment but keeps slashes as separators', () => {
    expect(
      buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p 1', 'sub dir/app.html'),
    ).toBe('http://127.0.0.1:17456/api/projects/p%201/powered/sub%20dir/app.html');
  });

  it('strips a trailing slash from the base origin', () => {
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456/', 'p1', 'a.html')).toBe(
      'http://127.0.0.1:17456/api/projects/p1/powered/a.html',
    );
  });

  it('returns null for empty / non-string file paths', () => {
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', '')).toBeNull();
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', undefined)).toBeNull();
    expect(buildProjectPoweredFileUrl('http://127.0.0.1:17456', 'p1', '///')).toBeNull();
  });
});
