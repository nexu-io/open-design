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
    if (url.startsWith('/api/deploy/config')) {
      const parsedUrl = new URL(url, 'http://localhost');
      const providerId = parsedUrl.searchParams.get('providerId') ?? 'cloudflare-pages';
      return new Response(JSON.stringify({
        providerId,
        configured: true,
        tokenMask: 'saved-token',
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
    if (url === '/api/deploy/config' && method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({
        providerId: body.providerId ?? 'cloudflare-pages',
        configured: true,
        tokenMask: 'saved-token',
        teamId: '',
        teamSlug: '',
        accountId: 'account-123',
        projectName: '',
        target: 'preview',
      }), { status: 200 });
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

describe('FileViewer GitHub PAT scope link', () => {
  it('requests repo scope for Netlify provider', async () => {
    vi.stubGlobal('fetch', mockDeployFetch(() => {}));

    await openCloudflareDeployModal(deployableHtmlFile());

    const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });
    fireEvent.change(providerSelect, { target: { value: 'netlify' } });

    const getPatLink = await screen.findByRole('link', { name: /Get GitHub PAT/i });
    expect(getPatLink).toHaveAttribute(
      'href',
      'https://github.com/settings/tokens/new?scopes=repo&description=Open%20Design%20Deploy',
    );
  });

  it('requests public_repo scope for Render and Railway providers', async () => {
    vi.stubGlobal('fetch', mockDeployFetch(() => {}));

    await openCloudflareDeployModal(deployableHtmlFile());

    const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });

    fireEvent.change(providerSelect, { target: { value: 'render' } });
    let getPatLink = await screen.findByRole('link', { name: /Get GitHub PAT/i });
    expect(getPatLink).toHaveAttribute(
      'href',
      'https://github.com/settings/tokens/new?scopes=public_repo&description=Open%20Design%20Deploy',
    );

    fireEvent.change(providerSelect, { target: { value: 'railway' } });
    getPatLink = await screen.findByRole('link', { name: /Get GitHub PAT/i });
    expect(getPatLink).toHaveAttribute(
      'href',
      'https://github.com/settings/tokens/new?scopes=public_repo&description=Open%20Design%20Deploy',
    );
  });
});

describe('FileViewer social share provider selector', () => {
  it('switches the visible URL and share payload when changing the deployment provider select', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');

      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'dep-netlify',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'netlify',
              url: 'https://site-netlify.netlify.app',
              status: 'ready',
              createdAt: 1000,
              updatedAt: 1000,
            },
            {
              id: 'dep-cf',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'cloudflare-pages',
              url: 'https://demo-pages.pages.dev',
              status: 'ready',
              createdAt: 2000,
              updatedAt: 2000,
            },
          ],
        }), { status: 200 });
      }
      if (url.startsWith('/api/deploy/config')) {
        return new Response(JSON.stringify({
          providerId: 'cloudflare-pages',
          configured: true,
          tokenMask: 'saved-token',
          accountId: 'account-123',
          target: 'production',
        }), { status: 200 });
      }
      if (url === '/api/deploy/cloudflare-pages/zones') {
        return new Response(JSON.stringify({ zones: [] }), { status: 200 });
      }
      if (url === '/api/projects/project-1/deploy' && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'cloudflare-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'cloudflare-pages',
          url: 'https://demo-pages.pages.dev',
          status: 'ready',
          createdAt: 2000,
          updatedAt: 2000,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deployableHtmlFile()}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    // Open share menu and click Publish share page to open the social share modal
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Publish share page/i }));

    // The social share modal should now be open
    const providerSelect = await screen.findByRole('combobox', {
      name: /Select deployment provider for social share/i,
    });
    expect((providerSelect as HTMLSelectElement).value).toBe('cloudflare-pages');

    // The displayed URL in the modal is the Cloudflare URL
    await waitFor(() => {
      const displayedUrlLinks = screen.getAllByRole('link', { name: 'https://demo-pages.pages.dev' });
      expect(displayedUrlLinks.length).toBeGreaterThan(0);
      expect(displayedUrlLinks[0]).toHaveAttribute('href', 'https://demo-pages.pages.dev');
    });

    // The modal's X share button has the Cloudflare URL
    await waitFor(() => {
      const modalXButtons = screen.getAllByRole('link', { name: /X/i });
      const modalXButton = modalXButtons[modalXButtons.length - 1]!;
      expect(modalXButton.getAttribute('href')).toContain(encodeURIComponent('https://demo-pages.pages.dev'));
    });

    // Switch provider to netlify
    fireEvent.change(providerSelect, { target: { value: 'netlify' } });

    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('netlify');
    });

    // The displayed link switches to the netlify URL
    await waitFor(() => {
      const netlifyLinks = screen.getAllByRole('link', { name: 'https://site-netlify.netlify.app' });
      expect(netlifyLinks.length).toBeGreaterThan(0);
      expect(netlifyLinks[0]).toHaveAttribute('href', 'https://site-netlify.netlify.app');
    });

    // The share payload on the X button switches to the netlify URL
    await waitFor(() => {
      const modalXButtons = screen.getAllByRole('link', { name: /X/i });
      const modalXButton = modalXButtons[modalXButtons.length - 1]!;
      expect(modalXButton.getAttribute('href')).toContain(encodeURIComponent('https://site-netlify.netlify.app'));
    });
  });
});

