// @vitest-environment jsdom
//
// The bridge measures first visible paint and posts it; nothing records it
// until the host listens. Without this, the one metric a user actually feels —
// how long until something is on screen — has no rows, and an empty metric is
// indistinguishable from a fast one.
//
// The report deliberately travels on its own message type rather than as an
// observability event: that channel ends in a catch-all which turns any parsed
// observability message into a runtime error, so routing paint through it would
// publish one fabricated error per healthy preview.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { PREVIEW_FIRST_PAINT_MESSAGE_TYPE } from '@open-design/contracts/runtime/preview-observability';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import { resetSharedCancellableGet } from '../../src/lib/shared-cancellable-get';
import { setPreviewPhaseSink } from '../../src/runtime/preview-phase-reporter';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  uninstallFileViewerPreviewRuntimeHarness,
  useSyntheticProjectScopedPreviewNavigation,
} from '../helpers/file-viewer-preview-runtime';
import { workspaceContextFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/use-project-preview-session-navigation', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/runtime/use-project-preview-session-navigation')
  >();
  return {
    ...actual,
    useProjectScopedPreviewNavigation: (
      options: Parameters<typeof actual.useProjectScopedPreviewNavigation>[0],
    ) => useSyntheticProjectScopedPreviewNavigation(options),
  };
});

const WORKSPACE_CONTEXT = workspaceContextFixture({
  workspaceId: 'ws-first-paint',
  workspaceMemberId: 'member-first-paint',
});

function collabValue(): CollabContextValue {
  return {
    workspaceContext: WORKSPACE_CONTEXT,
    workspaceContextLoading: false,
    projectResourceAuthority: 'workspace',
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'pending',
    isOwner: false,
    isEffectiveOwner: false,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => {},
    requestPublish: () => {},
    refreshPresence: () => {},
    checkStatusNow: () => {},
  };
}

function Wrap({ children }: { children: ReactNode }) {
  return <CollabProvider value={collabValue()}>{children}</CollabProvider>;
}

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

function pageFile(): ProjectFile {
  return {
    name: 'page.html',
    path: 'page.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
  };
}

const PAGE_HTML = '<html><body><h1>page</h1></body></html>';

function installFetchMock(projectId: string) {
  const filesUrl = `/api/projects/${encodeURIComponent(projectId)}/files`;
  const rawUrl = `/api/projects/${encodeURIComponent(projectId)}/raw/page.html`;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.split('?')[0] === filesUrl) {
      return new Response(
        JSON.stringify({ files: [pageFile()] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith(rawUrl)) return new Response(PAGE_HTML, { status: 200 });
    return new Response('', { status: 404 });
  }));
}

const sink = vi.fn();

function phaseRows(phase: string) {
  return sink.mock.calls.filter(
    ([, payload]) => (payload as Record<string, unknown> | undefined)?.phase === phase,
  );
}

function activeFrame(): HTMLIFrameElement {
  return document.querySelector('[data-testid="artifact-preview-frame"]') as HTMLIFrameElement;
}

function postFromFrame(detail: Record<string, unknown>) {
  const frame = activeFrame();
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE, version: 1, ...detail },
    }));
  });
}

beforeEach(() => {
  resetSharedCancellableGet();
  installFileViewerPreviewRuntimeHarness();
  sink.mockReset();
  setPreviewPhaseSink(sink);
});

afterEach(() => {
  setPreviewPhaseSink(null);
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderAndSettle() {
  const projectId = 'proj-first-paint';
  installFetchMock(projectId);
  render(
    <Wrap>
      <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
    </Wrap>,
  );
  await waitFor(() => expect(activeFrame()).not.toBeNull());
  await waitFor(() => expect(phaseRows('navigation_start').length).toBeGreaterThan(0));
}

describe('FileViewer records first visible paint', () => {
  it('records a paint reported by the running document', async () => {
    await renderAndSettle();
    postFromFrame({
      detector: 'bridge_report',
      paint_observed: true,
      visible_element_count: 3,
      elapsed_ms: 120,
    });

    await waitFor(() => expect(phaseRows('first_visible_paint').length).toBe(1));
    const payload = phaseRows('first_visible_paint')[0]?.[1] as Record<string, unknown>;
    expect(payload.detector).toBe('bridge_report');
    expect(payload.paint_observed).toBe(true);
    // Absent measurement and zero measurement have to stay distinguishable, and
    // this phase must never be readable as a promotion input.
    expect(payload.observation_only).toBe(true);
  });

  it('records a give-up as a missing measurement, not a zero one', async () => {
    await renderAndSettle();
    postFromFrame({
      detector: 'timeout',
      paint_observed: false,
      visible_element_count: 0,
      elapsed_ms: 4000,
    });

    await waitFor(() => expect(phaseRows('first_visible_paint').length).toBe(1));
    const payload = phaseRows('first_visible_paint')[0]?.[1] as Record<string, unknown>;
    expect(payload.detector).toBe('timeout');
    expect(payload.paint_observed).toBe(false);
  });

  it('ignores a paint claimed by a window that is not the active frame', async () => {
    await renderAndSettle();
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
        version: 1,
        detector: 'bridge_report',
        paint_observed: true,
        visible_element_count: 3,
        elapsed_ms: 10,
      },
      source: window,
    }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(phaseRows('first_visible_paint')).toHaveLength(0);
  });
});
