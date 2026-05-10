import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelConnectorAuthorization,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  connectConnector,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deployProjectFile,
  fetchCloudflarePagesZones,
  fetchDeployConfig,
  fetchAppVersionInfo,
  fetchConnectorDetail,
  fetchConnectorDiscovery,
  fetchProjectFileText,
  fetchSkillExample,
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

describe('fetchSkillExample', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Regression coverage for nexu-io/open-design#897. Skills declared with
  // a non-html `od.preview.type` ship no fetchable HTML — the daemon's
  // /example endpoint only resolves HTML files and 404s for everything
  // else, which left the gallery stuck on a misleading "Couldn't load
  // this example. The example HTML failed to fetch." state. The dispatch
  // now short-circuits at the data layer so the modal can render a calm
  // "no shipped preview" placeholder without firing a doomed network
  // call.
  it('short-circuits without a fetch when previewType is not html', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('hatch-pet', 'image')).resolves.toEqual({
      unavailable: true,
      kind: 'image',
    });
    await expect(
      fetchSkillExample('dcf-valuation', 'markdown'),
    ).resolves.toEqual({ unavailable: true, kind: 'markdown' });

    // The doomed-call is the bug we're fixing — assert no network call
    // was made for either non-html dispatch.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to html fetch when previewType is omitted (legacy callers)', async () => {
    const fetchMock = vi.fn(
      async () => new Response('<html><body>ok</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('blog-post')).resolves.toEqual({
      html: '<html><body>ok</body></html>',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/blog-post/example');
  });

  it('forwards the html fetch and returns a discriminated error on non-2xx', async () => {
    const fetchMock = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      error: 'HTTP 404',
    });
    // Confirm the dispatch did call through to the daemon for the html
    // path (i.e. the short-circuit above only catches non-html types).
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
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

describe('fetchConnectorDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests paginated hydrated tool previews for one connector', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connector: {
        id: 'canvas',
        name: 'Canvas',
        tools: [{ name: 'canvas.list_courses' }],
        toolCount: 574,
        toolsNextCursor: 'cursor_2',
        toolsHasMore: true,
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectorDetail('canvas', {
      hydrateTools: true,
      toolsLimit: 50,
      toolsCursor: 'cursor_1',
    })).resolves.toMatchObject({
      id: 'canvas',
      toolCount: 574,
      toolsNextCursor: 'cursor_2',
      tools: [{ name: 'canvas.list_courses' }],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/canvas?hydrateTools=true&toolsLimit=50&toolsCursor=cursor_1');
  });
});

describe('connectConnector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a fallback link before navigating the auth popup', async () => {
    const replace = vi.fn();
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace },
      close: vi.fn(),
    };
    const open = vi.fn(() => authWindow);
    vi.stubGlobal('window', {
      open,
      location: { assign: vi.fn() },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            airtable: { status: 'ready', authConfigId: 'ac_airtable' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'airtable', name: 'Airtable' },
        auth: {
          kind: 'redirect_required',
          redirectUrl: 'https://connect.composio.dev/link/lk_test?a=1&b=2',
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('airtable')).resolves.toMatchObject({
      connector: { id: 'airtable' },
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://connect.composio.dev/link/lk_test?a=1&b=2',
      },
    });

    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(authWindow.document.body.innerHTML).toContain('Open Composio');
    expect(authWindow.document.body.innerHTML).toContain('https://connect.composio.dev/link/lk_test?a=1&amp;b=2');
    expect(replace).toHaveBeenCalledWith('https://connect.composio.dev/link/lk_test?a=1&b=2');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/connectors/auth-configs/prepare',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/connectors/airtable/connect', { method: 'POST' });
  });

  it('keeps the popup open with the auth config error when initialization fails', async () => {
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => authWindow),
      location: { assign: vi.fn() },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        results: {
          canvas: {
            status: 'custom_required',
            message: 'Default auth config not found for toolkit "canvas".',
          },
        },
      }), { status: 200 })),
    );

    await expect(connectConnector('canvas')).resolves.toEqual({
      connector: null,
      error: 'Default auth config not found for toolkit "canvas".',
    });

    expect(authWindow.close).not.toHaveBeenCalled();
    expect(authWindow.document.title).toBe('Connection failed');
    expect(authWindow.document.body.innerHTML).toContain('Default auth config not found for toolkit "canvas".');
  });

  it('returns a user-facing error when the OAuth popup is blocked', async () => {
    const open = vi.fn(() => null);
    vi.stubGlobal('window', { open } as unknown as Window & typeof globalThis);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('github')).resolves.toEqual({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
      error: 'Popup blocked. Allow popups for Open Design and try again.',
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });

  it('renders an info notice in the popup when the connect response carries no redirect URL', async () => {
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => authWindow),
      location: { assign: vi.fn() },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: { twitter: { status: 'ready', authConfigId: 'ac_twitter' } },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'twitter', name: 'Twitter', status: 'available', tools: [] },
        auth: { kind: 'pending', expiresAt: '2026-05-08T10:00:00.000Z' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('twitter')).resolves.toMatchObject({
      connector: { id: 'twitter' },
      auth: { kind: 'pending' },
    });

    expect(authWindow.close).not.toHaveBeenCalled();
    expect(authWindow.document.title).toBe('Authorization pending');
    expect(authWindow.document.body.innerHTML).toContain('Authorization pending');
  });

  it('opens connector auth in the system browser when Electron returns a success boolean', async () => {
    const open = vi.fn();
    const openExternal = vi.fn(async () => true);
    vi.stubGlobal('window', {
      open,
      electronAPI: { openExternal },
    } as unknown as Window & typeof globalThis);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('github')).resolves.toEqual({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
      auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
    });
    expect(open).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth');
  });

  it('surfaces an error when Electron cannot confirm that the system browser opened', async () => {
    const open = vi.fn();
    const openExternal = vi.fn(async () => false);
    vi.stubGlobal('window', {
      open,
      electronAPI: { openExternal },
    } as unknown as Window & typeof globalThis);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('github')).resolves.toEqual({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
      error: 'Popup blocked. Allow popups for Open Design and try again.',
    });
    expect(open).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });
});

describe('cancelConnectorAuthorization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('invalidates pending connector authorization on the daemon', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelConnectorAuthorization('github')).resolves.toEqual({
      id: 'github',
      name: 'GitHub',
      status: 'available',
      tools: [],
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
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

  it('fetches Cloudflare Pages zones from the deploy helper route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCloudflarePagesZones()).resolves.toEqual({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/cloudflare-pages/zones');
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

  it('passes the selected Cloudflare Pages provider id and custom domain through deploy requests', async () => {
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
      deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID, {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      }),
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
        cloudflarePages: {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
      }),
    });
  });
});
