// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { DesignSystemInlinePreview } from '../../src/components/FileWorkspace';
import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import { setHtmlSourceSnapshot } from '../../src/components/html-source-snapshot-cache';
import type { ProjectFile } from '../../src/types';
import { workspaceContextFixture } from '../helpers/workspace-context';

const registryMocks = vi.hoisted(() => ({
  fetchProjectFileText: vi.fn(async () => null as string | null),
  fetchProjectFolders: vi.fn(async () => []),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: registryMocks.fetchProjectFileText,
    fetchProjectFolders: registryMocks.fetchProjectFolders,
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// `DesignSystemInlinePreview` is mounted from `renderReviewCard`, which the
// design-system panel no longer calls ("the kit is the single, on-brand view of
// the system"), so the component is currently only reachable from here. These
// specs pin the transport the section preview must have the moment that review
// surface is wired back up — not the fact that it is unwired today.
const PREVIEW_MTIME = Date.parse('2026-05-14T00:00:00.000Z');

function htmlFile(name: string, mtime = PREVIEW_MTIME): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 2048,
    mtime,
    kind: 'html',
    mime: 'text/html',
  };
}

function collabValue(): CollabContextValue {
  return {
    workspaceContext: workspaceContextFixture({
      workspaceId: 'workspace-ds',
      workspaceMemberId: 'member-ds',
    }),
    workspaceContextLoading: false,
    projectResourceAuthority: 'workspace',
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: false,
    writerAuthority: 'allowed',
    isOwner: true,
    isEffectiveOwner: true,
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

function mount(element: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host!);
    root.render(element);
  });
  return host;
}

async function settle(times = 6) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/**
 * The one reader both the converged surface and the srcdoc control are judged
 * by, so a green result on either can only come from the transport it claims.
 */
function readPreviewTransport(frame: HTMLIFrameElement | null) {
  return {
    renderMode: frame?.getAttribute('data-od-render-mode') ?? null,
    hasSrcdoc: frame ? frame.hasAttribute('srcdoc') : null,
    src: frame?.getAttribute('src') ?? null,
  };
}

describe('design-system inline preview transport', () => {
  it('renders the section preview from its one real project-file URL', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(
      '<!doctype html><html><body><h1>Buttons</h1></body></html>',
    );

    const container = mount(
      <CollabProvider value={collabValue()}>
        <DesignSystemInlinePreview projectId="ds-acme" file={htmlFile('preview/buttons.html')} />
      </CollabProvider>,
    );

    await settle();

    const frame = container.querySelector<HTMLIFrameElement>('iframe');
    const transport = readPreviewTransport(frame);
    expect(transport.renderMode).toBe('url-load');
    expect(transport.hasSrcdoc).toBe(false);
    expect(transport.src).not.toBeNull();

    const url = new URL(transport.src!, 'https://od.local');
    expect(url.pathname).toBe('/api/projects/ds-acme/raw/preview/buttons.html');
    expect(url.searchParams.get('v')).toBe(String(PREVIEW_MTIME));
  });

  it('leaves relative scripts, styles, images and fonts to the browser', async () => {
    const source = [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="buttons.css">',
      '<style>@font-face{font-family:Acme;src:url(../fonts/acme.woff2)}</style>',
      '</head><body>',
      '<img src="assets/hero.png" srcset="assets/hero@2x.png 2x">',
      '<script type="module" src="./buttons.js"></script>',
      '<script type="module">import("./chunk.js");</script>',
      '</body></html>',
    ].join('');
    registryMocks.fetchProjectFileText.mockResolvedValue(source);

    const container = mount(
      <CollabProvider value={collabValue()}>
        <DesignSystemInlinePreview projectId="ds-acme" file={htmlFile('preview/buttons.html')} />
      </CollabProvider>,
    );

    await settle();

    // Native resolution is the whole point: the host must not read the
    // document, must not harvest its relative assets, and must not hand the
    // iframe a rewritten copy of the page.
    expect(registryMocks.fetchProjectFileText).not.toHaveBeenCalled();

    const frame = container.querySelector<HTMLIFrameElement>('iframe');
    const transport = readPreviewTransport(frame);
    expect(transport.hasSrcdoc).toBe(false);
    expect(transport.renderMode).toBe('url-load');
    expect(new URL(transport.src!, 'https://od.local').pathname)
      .toBe('/api/projects/ds-acme/raw/preview/buttons.html');
    expect(container.innerHTML).not.toContain('data-od-inline-asset');
  });

  // Control: an off-screen thumbnail is still allowed to be a srcdoc string.
  // If the reader above could not tell the two transports apart, this case
  // would read the same as the converged one.
  it('still reports srcdoc for the file-card thumbnail that legitimately uses it', async () => {
    const thumbFile = htmlFile('preview/buttons.html', 1700000000000);
    setHtmlSourceSnapshot({
      authorizationScopeKey: 'local',
      projectId: 'ds-acme',
      fileName: thumbFile.name,
      refreshKey: `${thumbFile.mtime}:${thumbFile.size}:0`,
      source: '<!doctype html><html><body><main>Thumbnail</main></body></html>',
    });

    const container = mount(
      <DesignFilesPanel
        projectId="ds-acme"
        projectKind="prototype"
        files={[thumbFile]}
        folders={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onDeleteFiles={vi.fn()}
        onUpload={vi.fn()}
        onUploadFiles={vi.fn()}
        onPaste={vi.fn()}
        onNewSketch={vi.fn()}
      />,
    );

    await settle();

    const transport = readPreviewTransport(
      container.querySelector<HTMLIFrameElement>('.df-card-thumb iframe'),
    );
    expect(transport.hasSrcdoc).toBe(true);
    expect(transport.src).toBeNull();
    expect(transport.renderMode).toBeNull();
  });
});
