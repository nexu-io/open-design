// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function baseFile(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'asset.png',
    path: 'asset.png',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'image',
    mime: 'image/png',
    ...overrides,
  };
}

function deployableHtmlFile(): ProjectFile {
  return baseFile({
    name: 'index.html',
    path: 'index.html',
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Page',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    },
  });
}

/**
 * Wires the fetch routes the Cloudflare Pages deploy modal exercises on open
 * and on submit, and reports the JSON body of the outgoing deploy POST back
 * to the caller so a test can assert what target the UI forwarded.
 */
function mockDeployFetch(onDeployBody: (body: Record<string, unknown>) => void) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    if (url === '/api/projects/project-1/deployments') {
      return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    }
    if (url === '/api/deploy/config?providerId=cloudflare-pages') {
      return new Response(JSON.stringify({
        providerId: 'cloudflare-pages',
        configured: true,
        tokenMask: 'saved-cloudflare-token',
        teamId: '',
        teamSlug: '',
        accountId: 'account-123',
        projectName: '',
        target: 'preview',
      }), { status: 200 });
    }
    if (url === '/api/deploy/cloudflare-pages/zones') {
      return new Response(JSON.stringify({ zones: [] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/deploy' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      onDeployBody(body);
      return new Response(JSON.stringify({
        id: 'cloudflare-deploy',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: 'cloudflare-pages',
        url: 'https://demo-pages.pages.dev',
        deploymentId: 'cf-dep-1',
        deploymentCount: 1,
        target: body.target ?? 'preview',
        status: 'ready',
        createdAt: 1,
        updatedAt: 2,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

async function openCloudflareDeployModal(file: ProjectFile) {
  render(
    <FileViewer projectId="project-1" projectKind="prototype" file={file}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
    />,
  );

  // Deploy providers live on the Share panel ("publish online" is sharing),
  // so reaching a provider takes Share button -> menu item.
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

  const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });
  await waitFor(() => {
    expect((providerSelect as HTMLSelectElement).value).toBe('cloudflare-pages');
  });
}

function clickDeploySubmitButton() {
  const deployButtons = screen.getAllByRole('button', { name: /^Deploy$/i });
  // The share-menu trigger is also labelled "Deploy to Cloudflare Pages"; the
  // modal's own submit button is the last "Deploy"-named button on screen.
  fireEvent.click(deployButtons[deployButtons.length - 1]!);
}

describe('FileViewer deploy target selector', () => {
  it('shows a deploy target selector defaulted to Production and forwards that default on deploy', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockDeployFetch((body) => { deployBody = body; }));

    await openCloudflareDeployModal(deployableHtmlFile());

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    expect((targetSelect as HTMLSelectElement).value).toBe('production');

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    // Default semantics: the daemon already treats an absent target as
    // production (apps/daemon/src/routes/deploy.ts), so the UI's default
    // must match that and explicitly send 'production' — leaving it
    // undefined or sending 'preview' would silently deploy to preview
    // instead of updating the live site, which is the regression this test
    // guards against.
    expect(deployBody!.target).toBe('production');
  });

  it('sends target: "preview" in the deploy request when the user selects the Preview target', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockDeployFetch((body) => { deployBody = body; }));

    await openCloudflareDeployModal(deployableHtmlFile());

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    fireEvent.change(targetSelect, { target: { value: 'preview' } });
    await waitFor(() => {
      expect((targetSelect as HTMLSelectElement).value).toBe('preview');
    });

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    expect(deployBody!.target).toBe('preview');
  });

  it('sends target: "production" in the deploy request when the user selects the Production target', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockDeployFetch((body) => { deployBody = body; }));

    await openCloudflareDeployModal(deployableHtmlFile());

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    fireEvent.change(targetSelect, { target: { value: 'production' } });
    await waitFor(() => {
      expect((targetSelect as HTMLSelectElement).value).toBe('production');
    });

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    expect(deployBody!.target).toBe('production');
  });
});

/**
 * Workers deploy modal fetch mock. Token mode (credentialMode: 'token') so the
 * modal skips the OAuth connect dance and can reach the target selector.
 */
function mockWorkersDeployFetch(onDeployBody: (body: Record<string, unknown>) => void) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    if (url === '/api/projects/project-1/deployments') {
      return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    }
    if (url === '/api/deploy/config?providerId=cloudflare-workers') {
      return new Response(JSON.stringify({
        providerId: 'cloudflare-workers',
        configured: true,
        tokenMask: 'saved-cloudflare-workers-token',
        teamId: '',
        teamSlug: '',
        accountId: 'account-123',
        scriptName: '',
        compatibilityDate: '',
        credentialMode: 'token',
        clientId: '',
        redirectUri: '',
        scopes: [],
        bindings: [],
        target: 'preview',
      }), { status: 200 });
    }
    if (url === '/api/deploy/cloudflare-workers/capabilities') {
      return new Response(JSON.stringify({
        workers: true,
        workersDevSubdomain: 'demo',
        r2: true,
        d1: true,
        access: false,
      }), { status: 200 });
    }
    if (url === '/api/deploy/cloudflare-workers/zones') {
      return new Response(JSON.stringify({ zones: [] }), { status: 200 });
    }
    if (url === '/api/cloudflare/auth/status') {
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    }
    if (url === '/api/cloudflare/resources/r2-buckets') {
      return new Response(JSON.stringify({ buckets: [] }), { status: 200 });
    }
    if (url === '/api/cloudflare/resources/d1-databases') {
      return new Response(JSON.stringify({ databases: [] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/deploy' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      onDeployBody(body);
      return new Response(JSON.stringify({
        id: 'cloudflare-workers-deploy',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: 'cloudflare-workers',
        url: 'https://demo.workers.dev',
        deploymentId: 'cf-w-1',
        deploymentCount: 1,
        target: body.target ?? 'production',
        status: 'ready',
        createdAt: 1,
        updatedAt: 2,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

describe('FileViewer Workers deploy target', () => {
  it('sends target: "preview" for a Workers preview selection', async () => {
    let deployBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockWorkersDeployFetch((body) => { deployBody = body; }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={deployableHtmlFile()}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Workers/i }));

    const targetSelect = await screen.findByRole('combobox', { name: /target/i });
    fireEvent.change(targetSelect, { target: { value: 'preview' } });
    await waitFor(() => {
      expect((targetSelect as HTMLSelectElement).value).toBe('preview');
    });

    clickDeploySubmitButton();

    await waitFor(() => {
      expect(deployBody).not.toBeNull();
    });
    expect(deployBody!.providerId).toBe('cloudflare-workers');
    expect(deployBody!.target).toBe('preview');
  });
});

/**
 * Parameterized Workers fetch mock for the review-driven regressions below:
 * `config` overrides the saved config, `zones` feeds the custom-domain zone
 * select, `onConfigPut` receives the body of PUT /api/deploy/config, and
 * `deployResponse` is merged into the deploy POST response.
 */
function mockWorkersFetch(options: {
  config?: Record<string, unknown>;
  zones?: Array<{ id: string; name: string }>;
  onConfigPut?: (body: Record<string, unknown>) => void;
  onDeployBody?: (body: Record<string, unknown>) => void;
  deployResponse?: Record<string, unknown>;
  /** Evaluated per request so a test can flip the daemon's OAuth status mid-flow. */
  authStatus?: () => Record<string, unknown>;
} = {}) {
  const baseConfig: Record<string, unknown> = {
    providerId: 'cloudflare-workers',
    configured: true,
    tokenMask: 'saved-cloudflare-workers-token',
    teamId: '',
    teamSlug: '',
    accountId: 'account-123',
    scriptName: '',
    compatibilityDate: '',
    credentialMode: 'token',
    clientId: '',
    redirectUri: '',
    scopes: [],
    bindings: [],
    target: 'preview',
    ...(options.config ?? {}),
  };
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    if (url === '/api/projects/project-1/deployments') {
      return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    }
    if (url === '/api/deploy/config?providerId=cloudflare-workers') {
      return new Response(JSON.stringify(baseConfig), { status: 200 });
    }
    if (url === '/api/deploy/config' && method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      options.onConfigPut?.(body);
      const { token: _token, customDomain, ...rest } = body;
      return new Response(JSON.stringify({
        ...baseConfig,
        ...rest,
        ...(customDomain ? { customDomain } : {}),
        configured: true,
      }), { status: 200 });
    }
    if (url === '/api/deploy/cloudflare-workers/capabilities') {
      return new Response(JSON.stringify({
        workers: true,
        workersDevSubdomain: 'demo',
        r2: true,
        d1: true,
        access: true,
      }), { status: 200 });
    }
    if (url === '/api/deploy/cloudflare-workers/zones') {
      return new Response(JSON.stringify({ zones: options.zones ?? [] }), { status: 200 });
    }
    if (url === '/api/cloudflare/auth/status') {
      return new Response(JSON.stringify(options.authStatus?.() ?? { connected: false }), { status: 200 });
    }
    if (url === '/api/cloudflare/oauth/start' && method === 'POST') {
      return new Response(JSON.stringify({
        authorizeUrl: 'https://dash.cloudflare.com/oauth2/auth?state=1',
      }), { status: 200 });
    }
    if (url === '/api/cloudflare/resources/r2-buckets') {
      return new Response(JSON.stringify({ buckets: [] }), { status: 200 });
    }
    if (url === '/api/cloudflare/resources/d1-databases') {
      return new Response(JSON.stringify({ databases: [] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/deploy' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      options.onDeployBody?.(body);
      return new Response(JSON.stringify({
        id: 'cloudflare-workers-deploy',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: 'cloudflare-workers',
        url: 'https://demo.workers.dev',
        deploymentId: 'cf-w-1',
        deploymentCount: 1,
        target: body.target ?? 'production',
        status: 'ready',
        createdAt: 1,
        updatedAt: 2,
        ...(options.deployResponse ?? {}),
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

async function openWorkersDeployModal() {
  render(
    <FileViewer projectId="project-1" projectKind="prototype" file={deployableHtmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Workers/i }));
  await screen.findByTestId('cfw-deploy-button');
}

describe('FileViewer Workers deploy config (review regressions)', () => {
  it('posts customDomain: null when the user clears a saved custom domain', async () => {
    let configPut: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockWorkersFetch({
      config: { customDomain: { hostname: 'app.example.com', zoneId: 'zone-1' } },
      zones: [{ id: 'zone-1', name: 'example.com' }],
      onConfigPut: (body) => { configPut = body; },
    }));

    await openWorkersDeployModal();
    const hostnameInput = await screen.findByTestId('cfw-custom-domain-hostname');
    await waitFor(() => {
      expect((hostnameInput as HTMLInputElement).value).toBe('app.example.com');
    });
    fireEvent.change(hostnameInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('cfw-deploy-button'));

    await waitFor(() => {
      expect(configPut).not.toBeNull();
    });
    // An absent key keeps the stored domain (daemon read-modify-write); only an
    // explicit null detaches it.
    expect(Object.prototype.hasOwnProperty.call(configPut, 'customDomain')).toBe(true);
    expect(configPut!.customDomain).toBeNull();
  });

  it('stops the OAuth status poll and resets the connect button when the modal closes', async () => {
    vi.stubGlobal('fetch', mockWorkersFetch({
      config: {
        credentialMode: 'oauth',
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:8976/callback',
        tokenMask: '',
      },
    }));
    const popup = { close: vi.fn(), location: { href: '' }, opener: {} as unknown };
    vi.stubGlobal('open', vi.fn(() => popup));
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    await openWorkersDeployModal();
    const connect = await screen.findByTestId('cfw-oauth-connect');
    await waitFor(() => {
      expect((connect as HTMLButtonElement).disabled).toBe(false);
    });
    const armedBefore = setIntervalSpy.mock.calls.length;
    fireEvent.click(connect);

    // The poll is a 2-second interval armed once the daemon returns the URL.
    let pollHandle: unknown = null;
    await waitFor(() => {
      const index = setIntervalSpy.mock.calls.findIndex((call, i) => i >= armedBefore && call[1] === 2000);
      expect(index).toBeGreaterThanOrEqual(0);
      pollHandle = setIntervalSpy.mock.results[index]!.value;
    });
    // The tab was opened inside the click gesture and pointed at Cloudflare
    // once the URL arrived.
    expect(popup.location.href).toBe('https://dash.cloudflare.com/oauth2/auth?state=1');
    expect(popup.opener).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(clearIntervalSpy).toHaveBeenCalledWith(pollHandle);
    });

    // Reopening must not show every OAuth button disabled on "Opening…".
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Workers/i }));
    const reconnect = await screen.findByTestId('cfw-oauth-connect');
    await waitFor(() => {
      expect((reconnect as HTMLButtonElement).disabled).toBe(false);
    });
    expect(reconnect.textContent).toBe('Sign in with Cloudflare');
  });

  it('drops stale resource fields when a binding row switches type', async () => {
    let configPut: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockWorkersFetch({
      onConfigPut: (body) => { configPut = body; },
    }));

    await openWorkersDeployModal();
    fireEvent.click(await screen.findByTestId('cfw-add-binding'));
    fireEvent.change(screen.getByTestId('cfw-binding-name'), { target: { value: 'STORE' } });
    fireEvent.change(screen.getByTestId('cfw-binding-resource'), { target: { value: 'my-bucket' } });
    fireEvent.change(screen.getByTestId('cfw-binding-type'), { target: { value: 'd1' } });
    expect((screen.getByTestId('cfw-binding-resource') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByTestId('cfw-binding-resource'), { target: { value: 'mydb' } });
    fireEvent.click(screen.getByTestId('cfw-deploy-button'));

    await waitFor(() => {
      expect(configPut).not.toBeNull();
    });
    // No `bucketName` from the R2 life of the row, and no `id: ''` (the daemon
    // forwards `id` whenever defined and Cloudflare rejects the metadata).
    expect(configPut!.bindings).toEqual([{ type: 'd1', name: 'STORE', databaseName: 'mydb' }]);
  });

  it('blocks deploy with a row-level message when a binding has no resource', async () => {
    let deployed = false;
    vi.stubGlobal('fetch', mockWorkersFetch({ onDeployBody: () => { deployed = true; } }));

    await openWorkersDeployModal();
    fireEvent.click(await screen.findByTestId('cfw-add-binding'));
    fireEvent.change(screen.getByTestId('cfw-binding-name'), { target: { value: 'STORE' } });
    fireEvent.click(screen.getByTestId('cfw-deploy-button'));

    await screen.findByText('Every binding needs a name and a bucket or database.');
    expect(deployed).toBe(false);
  });

  it('renders the step list, Access badge and 5xx warning from the typed cloudflareWorkers field', async () => {
    vi.stubGlobal('fetch', mockWorkersFetch({
      deployResponse: {
        cloudflareWorkers: {
          accessProtected: true,
          steps: [
            { name: 'script', status: 'done' },
            { name: 'access', status: 'done', detail: 'you@example.com' },
          ],
          check: { status: 503, ok: false },
        },
      },
    }));

    await openWorkersDeployModal();
    fireEvent.click(screen.getByTestId('cfw-deploy-button'));

    const steps = await screen.findByTestId('cfw-deploy-steps');
    expect(steps.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Protected by Cloudflare Access')).toBeTruthy();
    expect(screen.getByText(/HTTP 503/)).toBeTruthy();
  });

  it('keeps deploy enabled on an expired OAuth token the daemon can refresh, and disables it when it cannot', async () => {
    const oauthConfig = {
      credentialMode: 'oauth',
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:8976/callback',
      tokenMask: '',
    };
    const expired = Date.now() - 60_000;

    vi.stubGlobal('fetch', mockWorkersFetch({
      config: oauthConfig,
      authStatus: () => ({ connected: true, expiresAt: expired, savedAt: 1, refreshable: true }),
    }));
    await openWorkersDeployModal();
    await screen.findByText('Token expired. Sign in again.');
    const deploy = screen.getByTestId('cfw-deploy-button') as HTMLButtonElement;
    await waitFor(() => {
      expect(deploy.disabled).toBe(false);
    });
    cleanup();

    vi.stubGlobal('fetch', mockWorkersFetch({
      config: oauthConfig,
      authStatus: () => ({ connected: true, expiresAt: expired, savedAt: 1, refreshable: false }),
    }));
    await openWorkersDeployModal();
    await screen.findByText('Token expired. Sign in again.');
    await waitFor(() => {
      expect((screen.getByTestId('cfw-deploy-button') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('does not treat the pre-existing token as reconnect success; only a new savedAt stops the poll', async () => {
    let status: Record<string, unknown> = { connected: true, expiresAt: Date.now() - 60_000, savedAt: 100, refreshable: false };
    vi.stubGlobal('fetch', mockWorkersFetch({
      config: {
        credentialMode: 'oauth',
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:8976/callback',
        tokenMask: '',
      },
      authStatus: () => status,
    }));
    vi.stubGlobal('open', vi.fn(() => null));

    await openWorkersDeployModal();
    const reconnect = await screen.findByTestId('cfw-oauth-connect');
    await waitFor(() => {
      expect((reconnect as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(reconnect);
    // The Reconnect button stays disabled for as long as the poll is awaiting.
    await waitFor(() => {
      expect((reconnect as HTMLButtonElement).disabled).toBe(true);
    });

    // Tick one (2 s) sees the OLD record: still expired, still awaiting.
    await new Promise((resolve) => setTimeout(resolve, 2600));
    expect(screen.getByText('Token expired. Sign in again.')).toBeTruthy();
    expect((screen.getByTestId('cfw-oauth-connect') as HTMLButtonElement).disabled).toBe(true);

    // The new grant lands: a different savedAt is the success signal.
    status = { connected: true, expiresAt: Date.now() + 3_600_000, savedAt: 200, refreshable: true };
    await waitFor(() => {
      expect(screen.queryByText('Token expired. Sign in again.')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.queryByTestId('cfw-oauth-connect')).toBeNull();
    expect((screen.getByTestId('cfw-deploy-button') as HTMLButtonElement).disabled).toBe(false);
  }, 15_000);

  it('keeps the form in OAuth mode when Refresh runs mid-connect and the stored config still says token', async () => {
    vi.stubGlobal('fetch', mockWorkersFetch({
      config: { credentialMode: 'token', clientId: '', redirectUri: '' },
      authStatus: () => ({ connected: false }),
    }));
    vi.stubGlobal('open', vi.fn(() => null));

    await openWorkersDeployModal();
    const modeSelect = screen.getByRole('combobox', { name: /credential mode/i }) as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: 'oauth' } });
    // Fresh setup: nothing stored yet, the user types the identity by hand.
    const clientIdInput = screen.getByLabelText(/client id/i) as HTMLInputElement;
    const redirectUriInput = screen.getByLabelText(/redirect uri/i) as HTMLInputElement;
    fireEvent.change(clientIdInput, { target: { value: 'client-typed' } });
    fireEvent.change(redirectUriInput, { target: { value: 'http://127.0.0.1:8976/callback' } });
    const connect = await screen.findByTestId('cfw-oauth-connect');
    await waitFor(() => {
      expect((connect as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(connect);
    await screen.findByText('Waiting for Cloudflare authorization…');

    const configFetchesBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter((call) => String(call[0]) === '/api/deploy/config?providerId=cloudflare-workers').length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await waitFor(() => {
      const configFetches = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter((call) => String(call[0]) === '/api/deploy/config?providerId=cloudflare-workers').length;
      expect(configFetches).toBeGreaterThan(configFetchesBefore);
    });
    // Still OAuth mode, still waiting: the daemon's not-yet-committed 'token'
    // must not tear the OAuth surface down, and the Refresh button comes back
    // because the poll is still armed.
    await screen.findByRole('button', { name: 'Refresh status' });
    expect((screen.getByRole('combobox', { name: /credential mode/i }) as HTMLSelectElement).value).toBe('oauth');
    expect(screen.getByText('Waiting for Cloudflare authorization…')).toBeTruthy();
    // The stored config has no clientId yet (the daemon commits it with the
    // token), so a not-connected Refresh must not blank what the user typed.
    expect((screen.getByLabelText(/client id/i) as HTMLInputElement).value).toBe('client-typed');
    expect((screen.getByLabelText(/redirect uri/i) as HTMLInputElement).value).toBe('http://127.0.0.1:8976/callback');
  });
});

describe('FileViewer Workers Access rule default', () => {
  it('defaults the Access rule to emails, since "only me" cannot resolve under the OAuth scope set', async () => {
    let configPut: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', mockWorkersFetch({ onConfigPut: (body) => { configPut = body; } }));

    await openWorkersDeployModal();
    fireEvent.click(screen.getByTestId('cfw-access-enabled'));
    const ruleSelect = await screen.findByTestId('cfw-access-rule');
    expect((ruleSelect as HTMLSelectElement).value).toBe('emails');

    fireEvent.change(screen.getByPlaceholderText(/@/), { target: { value: 'me@example.com' } });
    clickDeploySubmitButton();
    await waitFor(() => {
      expect(configPut).not.toBeNull();
    });
    expect((configPut!.access as { rule?: { kind?: string } }).rule?.kind).toBe('emails');
  });
});
