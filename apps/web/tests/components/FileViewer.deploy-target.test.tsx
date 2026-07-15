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

  fireEvent.click(screen.getByRole('button', { name: /share/i }));
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
