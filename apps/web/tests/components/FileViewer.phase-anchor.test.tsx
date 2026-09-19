// @vitest-environment jsdom
//
// The phase anchor is the master switch for preview observability.
//
// `recordPhase` fails closed on a phase with no open attach, so every other
// phase — handshake, capabilities, promotion, retention, recovery, eviction —
// stays silent until FileViewer opens one. A host that forgets this does not
// look broken on the dashboard: it looks like a preview with no volume, which
// reads as "nobody opened anything" rather than "the instrumentation is half
// wired". This spec is what stops that from being discovered in production.
//
// It also pins the two labels the metrics actually turn on. `open_kind`
// separates cold time-to-visible from the warm-restore ratio; reusing a cold
// anchor for a warm re-attach would inherit the cold elapsed time and collapse
// the 100 ms ratio, which reads as a product regression rather than a
// measurement bug. `did_navigate` against a sanctioned trigger is the whole of
// the target-zero navigation metric.

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
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
  workspaceId: 'ws-phase-anchor',
  workspaceMemberId: 'member-phase-anchor',
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

// Every phase shares one event name; the phase lives in the payload.
function navigationStarts() {
  return sink.mock.calls.filter(
    ([, payload]) => (payload as Record<string, unknown> | undefined)?.phase === 'navigation_start',
  );
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

describe('FileViewer opens the phase anchor', () => {
  // Diagnostic, not an independent control: removing the anchor reddens this
  // too, because the anchor IS the master switch — nothing downstream emits
  // without it. It earns its place by separating two failure modes that need
  // different fixes: "the sink was never installed" from "the sink is live but
  // this phase never fired".
  it('receives preview phase records through the installed sink', async () => {
    const projectId = 'proj-phase-anchor-sink';
    installFetchMock(projectId);
    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );
    await waitFor(() => expect(sink.mock.calls.length).toBeGreaterThan(0));
  });

  it('anchors a cold open, labelled as a navigation', async () => {
    const projectId = 'proj-phase-anchor-cold';
    installFetchMock(projectId);
    render(
      <Wrap>
        <FileViewer projectId={projectId} projectKind="prototype" file={pageFile()} />
      </Wrap>,
    );

    await waitFor(() => expect(navigationStarts().length).toBeGreaterThan(0));
    const payload = navigationStarts()[0]?.[1] as Record<string, unknown>;
    expect(payload.open_kind).toBe('cold');
    expect(payload.attach_trigger).toBe('initial_open');
    expect(payload.did_navigate).toBe(true);
    // Never `unknown`: that counts as an unsanctioned navigation by design, so
    // lazy labelling has to surface as a red metric rather than be absorbed.
    expect(payload.attach_trigger).not.toBe('unknown');
  });
});
