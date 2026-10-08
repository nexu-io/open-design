// @vitest-environment jsdom

// A failed deploy keeps its existing `artifact_deploy_result.error_code`
// (derived client-side from the envelope code / HTTP status) and gains the
// daemon's closed-token `failure` classification as optional props. The
// attempt's analytics request id goes to the daemon as `x-od-request-id` and to
// the event as `request_id`, so the daemon's failure log line joins the event.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  newRequestId: vi.fn(() => 'request-deploy-1'),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analytics.track,
    newRequestId: analytics.newRequestId,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  analytics.track.mockReset();
  analytics.newRequestId.mockClear();
});

function deployableHtmlFile(): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Page',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function stubVercelDeployFailure(deployResponse: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method || 'GET';
    if (url === '/api/projects/project-1/deployments') {
      return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
    }
    if (url.startsWith('/api/deploy/config')) {
      return new Response(JSON.stringify({
        providerId: 'vercel-self',
        configured: true,
        tokenMask: 'saved-vercel-token',
        teamId: '',
        teamSlug: '',
        target: 'preview',
      }), { status: 200 });
    }
    if (url === '/api/projects/project-1/deploy' && method === 'POST') {
      return new Response(JSON.stringify(deployResponse.body), { status: deployResponse.status });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function deployToVercel() {
  render(
    <FileViewer projectId="project-1" projectKind="prototype" file={deployableHtmlFile()}
      liveHtml="<html><body><h1>Hello</h1></body></html>"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Vercel/i }));
  await screen.findByRole('combobox', { name: /Provider/i });
  const deployButtons = await screen.findAllByRole('button', { name: /^Deploy$/i });
  fireEvent.click(deployButtons[deployButtons.length - 1]!);
}

function deployResults(): Array<{ props: Record<string, unknown>; options: unknown }> {
  return analytics.track.mock.calls
    .filter(([event]) => event === 'artifact_deploy_result')
    .map(([, props, options]) => ({ props: props as Record<string, unknown>, options }));
}

describe('deploy failure detail analytics', () => {
  it('adds the failure detail and request id without changing error_code', async () => {
    const fetchMock = stubVercelDeployFailure({
      status: 429,
      body: {
        error: {
          code: 'BAD_REQUEST',
          message: 'Too many requests.',
          failure: { stage: 'provider', reason: 'provider_rejected', upstreamStatus: 429, upstreamCode: 'too_many_requests' },
        },
      },
    });

    await deployToVercel();

    await waitFor(() => expect(deployResults()).toHaveLength(1));
    const { props, options } = deployResults()[0]!;
    expect(props).toMatchObject({
      result: 'failed',
      error_code: 'HTTP_429',
      failed_stage: 'provider',
      failure_reason: 'provider_rejected',
      upstream_status: 429,
      upstream_error_code: 'too_many_requests',
    });
    expect(options).toEqual({ requestId: 'request-deploy-1' });
    const deployCall = fetchMock.mock.calls.find(([url, init]) =>
      url === '/api/projects/project-1/deploy' && init?.method === 'POST');
    expect(new Headers(deployCall?.[1]?.headers).get('x-od-request-id')).toBe('request-deploy-1');
  });

  it('reports no failure props when an older daemon sends none', async () => {
    stubVercelDeployFailure({
      status: 400,
      body: { error: { code: 'MISSING_REFERENCES', message: 'Missing references' } },
    });

    await deployToVercel();

    await waitFor(() => expect(deployResults()).toHaveLength(1));
    const { props } = deployResults()[0]!;
    expect(props).toMatchObject({ result: 'failed', error_code: 'MISSING_REFERENCES' });
    expect(props).not.toHaveProperty('failed_stage');
    expect(props).not.toHaveProperty('failure_reason');
  });
});
