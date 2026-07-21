// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

const { analyticsTrackMock } = vi.hoisted(() => ({
  analyticsTrackMock: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async () => {
  const actual = await vi.importActual<typeof import('../../src/analytics/provider')>(
    '../../src/analytics/provider',
  );
  return {
    ...actual,
    useAnalytics: () => ({
      ...actual.useAnalytics(),
      track: analyticsTrackMock,
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  analyticsTrackMock.mockReset();
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

function mockDeployFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    if (url === '/api/projects/project-1/deployments') {
      return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    }
    if (url.startsWith('/api/deploy/config') && method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({
        providerId: body.providerId ?? 'netlify',
        configured: true,
        tokenMask: 'saved-token',
        githubTokenMask: 'saved-github-token',
      }), { status: 200 });
    }
    if (url.startsWith('/api/deploy/config') && method === 'GET') {
      const parsedUrl = new URL(url, 'http://localhost');
      const providerId = parsedUrl.searchParams.get('providerId') ?? 'cloudflare-pages';
      return new Response(JSON.stringify({
        providerId,
        configured: false,
        tokenMask: '',
        githubTokenMask: '',
      }), { status: 200 });
    }
    if (url === '/api/projects/project-1/deploy' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: 'deploy-1',
        projectId: 'project-1',
        fileName: 'index.html',
        providerId: body.providerId ?? 'netlify',
        url: 'https://demo.netlify.app',
        deploymentId: 'dep-1',
        deploymentCount: 1,
        target: 'production',
        status: 'ready',
        createdAt: 1,
        updatedAt: 2,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

describe('FileViewer deploy analytics attribution', () => {
  it('tracks artifact_deploy_result with provider: "netlify" and saved_new_token: true when GitHub PAT is entered', async () => {
    vi.stubGlobal('fetch', mockDeployFetch());

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={deployableHtmlFile()}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });
    fireEvent.change(providerSelect, { target: { value: 'netlify' } });

    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('netlify');
    });

    const deployTokenInput = document.getElementById('deploy-token');
    expect(deployTokenInput).not.toBeNull();
    fireEvent.change(deployTokenInput!, { target: { value: 'nnt_123456' } });

    const githubPatInput = document.getElementById('github-pat-token');
    expect(githubPatInput).not.toBeNull();
    fireEvent.change(githubPatInput!, { target: { value: 'ghp_secretpat123' } });

    const deployButtons = screen.getAllByRole('button', { name: /^Deploy$/i });
    fireEvent.click(deployButtons[deployButtons.length - 1]!);

    await waitFor(() => {
      const trackCalls = analyticsTrackMock.mock.calls.filter(
        (call: any[]) => call[0] === 'artifact_deploy_result',
      );
      expect(trackCalls.length).toBeGreaterThan(0);
      const props = trackCalls[0][1] as Record<string, unknown>;
      expect(props).toMatchObject({
        page_name: 'artifact',
        area: 'deploy_modal',
        provider: 'netlify',
        result: 'success',
        saved_new_token: true,
      });
    });
  });
});
