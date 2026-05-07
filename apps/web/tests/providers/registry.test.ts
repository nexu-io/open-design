import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deployProjectFile,
  fetchDeployConfig,
  fetchAppVersionInfo,
  fetchConnectorDiscovery,
  fetchProjectFileText,
  isDeployProviderId,
  updateDeployConfig,
  uploadProjectFiles,
} from '../../src/providers/registry';

describe('fetchAppVersionInfo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns version info from the daemon response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        version: { version: '1.2.3', channel: 'beta', packaged: true, platform: 'darwin', arch: 'arm64' },
      }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toEqual({
      version: '1.2.3',
      channel: 'beta',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('returns null when version info is unavailable or malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: { version: '1.2.3' } }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toBeNull();
  });
});

describe('fetchProjectFileText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('can bypass caches when fetching source text', async () => {
    const fetchMock = vi.fn(async () => new Response('<svg />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchProjectFileText('project-1', 'diagram.svg', {
        cache: 'no-store',
        cacheBustKey: '1710000000-2',
      }),
    ).resolves.toBe('<svg />');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/diagram.svg?cacheBust=1710000000-2',
      { cache: 'no-store' },
    );
  });

  it('logs HTTP failure context before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' })));

    await expect(fetchProjectFileText('project-1', 'missing.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        name: 'missing.svg',
        projectId: 'project-1',
        status: 404,
        statusText: 'Not Found',
        url: '/api/projects/project-1/raw/missing.svg',
      }),
    );
  });

  it('logs thrown fetch errors before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('network down');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw error;
    }));

    await expect(fetchProjectFileText('project-1', 'diagram.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        error,
        name: 'diagram.svg',
        projectId: 'project-1',
        url: '/api/projects/project-1/raw/diagram.svg',
      }),
    );
  });
});

describe('fetchConnectorDiscovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('caches connector discovery after a successful fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connectors: [{ id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectorDiscovery({ refresh: true })).resolves.toEqual([
      { id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] },
    ]);
    await expect(fetchConnectorDiscovery()).resolves.toEqual([
      { id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/discovery?refresh=true');
  });
});

describe('uploadProjectFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats every response entry as a success regardless of originalName drift', async () => {
    // Simulates an encoding edge case: the browser File.name carries a
    // composed CJK name (NFC) but multer round-trips it through latin1 and
    // returns a slightly different decoded form. The old name-equality
    // matching marked these as failed even though the server stored them.
    const composed = '测试.pdf';
    const decomposed = '测试.pdf'; // pretend the server returned a normalized variant
    const file = new File(['hello'], composed, { type: 'application/pdf' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          {
            name: 'mxk7-test.pdf',
            path: 'mxk7-test.pdf',
            size: 5,
            originalName: decomposed,
          },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [file]);

    expect(result.failed).toEqual([]);
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0]).toMatchObject({
      path: 'mxk7-test.pdf',
      name: decomposed,
      size: 5,
    });
  });

  it('marks the unmatched tail as failed when the server drops files mid-flight', async () => {
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    const c = new File(['c'], 'c.txt', { type: 'text/plain' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          { name: 't1-a.txt', path: 't1-a.txt', size: 1, originalName: 'a.txt' },
          { name: 't2-b.txt', path: 't2-b.txt', size: 1, originalName: 'b.txt' },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [a, b, c]);

    expect(result.uploaded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ name: 'c.txt' });
  });
});

describe('deploy provider registry helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recognizes Vercel and Cloudflare Pages provider ids only', () => {
    expect(isDeployProviderId(DEFAULT_DEPLOY_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId(CLOUDFLARE_PAGES_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId('netlify')).toBe(false);
    expect(isDeployProviderId(null)).toBe(false);
  });

  it('fetches provider-specific deploy config via query string', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID)).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config?providerId=cloudflare-pages');
  });

  it('sends Cloudflare Pages config fields without dropping provider-specific metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateDeployConfig({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      token: 'cf-token',
      accountId: 'account-123',
    })).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        token: 'cf-token',
        accountId: 'account-123',
      }),
    });
  });

  it('passes the selected Cloudflare Pages provider id through deploy requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'deployment-row-1',
      projectId: 'project-1',
      fileName: 'index.html',
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://open-design-preview.pages.dev',
      deploymentId: 'cf-deployment-1',
      deploymentCount: 1,
      target: 'preview',
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID),
    ).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'cf-deployment-1',
      url: 'https://open-design-preview.pages.dev',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      }),
    });
  });
});
