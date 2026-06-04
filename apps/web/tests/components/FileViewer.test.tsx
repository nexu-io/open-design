// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useLayoutEffect, useRef, useState } from 'react';
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANNOTATION_EVENT } from '../../src/components/PreviewDrawOverlay';

const { saveTemplateMock } = vi.hoisted(() => ({
  saveTemplateMock: vi.fn(),
}));

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    saveTemplate: saveTemplateMock,
  };
});

import {
  CommentSidePanel,
  FileViewer,
  LiveArtifactViewer,
  LiveArtifactRefreshHistoryPanel,
  SvgViewer,
  appendSavedPreviewCommentOrder,
  applyInspectOverridesToSource,
  commentPreviewCanvasSize,
  effectivePreviewScale,
  parseInspectOverridesFromSource,
  previewOverlayTransform,
  serializeInspectOverrides,
  updateInspectOverride,
} from '../../src/components/FileViewer';
import {
  IframeKeepAliveProvider,
  PooledIframe,
  previewIframeKeepAliveKey,
  useIframeKeepAlivePool,
} from '../../src/components/IframeKeepAlivePool';
import type { InspectOverrideMap } from '../../src/components/FileViewer';
import type { LiveArtifact, LiveArtifactWorkspaceEntry, PreviewComment, ProjectFile } from '../../src/types';
import { I18nProvider } from '../../src/i18n';
import type { Dict } from '../../src/i18n/types';
import { emptyManualEditStyles } from '../../src/edit-mode/types';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const TEST_SNAPSHOT_DATA_URL = 'data:image/png;base64,c25hcHNob3Q=';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
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

function createDragDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
  };
}

// jsdom does not implement DragEvent, so fireEvent.dragOver/drop silently drop
// the `clientY` from the event init. Construct the event and pin the coordinate
// directly so handlers that read `event.clientY` (e.g. drop-edge math) see it.
function fireDragEventWithClientY(
  type: 'dragOver' | 'drop',
  element: Element,
  init: { dataTransfer: unknown; clientY: number },
) {
  const event = createEvent[type](element, { dataTransfer: init.dataTransfer } as never);
  Object.defineProperty(event, 'clientY', { value: init.clientY, configurable: true });
  fireEvent(element, event);
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function srcDocActivationMessages(calls: readonly (readonly unknown[])[]) {
  return calls
    .map(([message]) => message)
    .filter((message): message is { type: 'od:srcdoc-transport-activate'; html: string } => {
      if (typeof message !== 'object' || message === null) return false;
      const data = message as { type?: unknown; html?: unknown };
      return data.type === 'od:srcdoc-transport-activate' && typeof data.html === 'string';
    });
}

function testRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function clickAgentTool(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
}

function manualEditTarget(id: string, label: string, x: number) {
  return {
    id,
    kind: 'container',
    label,
    tagName: 'div',
    className: '',
    text: '',
    rect: { x, y: 20, width: 180, height: 80 },
    fields: {},
    attributes: { 'data-od-label': label },
    styles: emptyManualEditStyles(),
    isLayoutContainer: true,
    outerHtml: `<div data-od-id="${id}">${label}</div>`,
  };
}

function installCanvasSnapshotMocks() {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      window.setTimeout(() => this.onload?.(), 0);
    }
  }

  vi.stubGlobal('Image', MockImage as unknown as typeof Image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineCap: 'round',
    lineJoin: 'round',
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn(() => ({ width: 0 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    font: '',
    strokeStyle: '',
  }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
}

function installPreviewSnapshotBridge(iframe: HTMLIFrameElement) {
  const source = iframe.contentWindow;
  if (!source) throw new Error('Expected preview iframe contentWindow');
  return vi.spyOn(source, 'postMessage').mockImplementation((message: unknown) => {
    const data = message as { type?: string; id?: string } | null;
    if (!data || data.type !== 'od:snapshot' || !data.id) return;
    window.dispatchEvent(new MessageEvent('message', {
      source,
      data: {
        type: 'od:snapshot:result',
        id: data.id,
        dataUrl: TEST_SNAPSHOT_DATA_URL,
        w: 2,
        h: 2,
      },
    }));
  });
}

describe('FileViewer preview scale', () => {
  it('keeps file viewer selectors in the effective global stylesheet', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.viewer');
    expect(css).toContain('.viewer-toolbar');
    expect(css).toContain('.viewer-action');
  });

  it('keeps manual edit canvas layout aligned with comment preview on device viewports (#2960)', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain(
      '.preview-viewport:not(.preview-viewport-desktop).manual-edit-workspace .manual-edit-canvas',
    );
    expect(css).toMatch(
      /\.preview-viewport:not\(\.preview-viewport-desktop\) \.preview-frame-clip,\s*\n\.preview-viewport:not\(\.preview-viewport-desktop\):not\(\.comment-preview-layer-with-side-dock\) \.comment-preview-canvas,\s*\n\.preview-viewport:not\(\.preview-viewport-desktop\)\.manual-edit-workspace \.manual-edit-canvas \{\s*\n\s*width: calc\(var\(--preview-viewport-width\) \* var\(--preview-scale, 1\)\);/,
    );
    expect(css).toMatch(
      /\.preview-viewport:not\(\.preview-viewport-desktop\) \.preview-frame-clip,\s*\n\.preview-viewport:not\(\.preview-viewport-desktop\)\.manual-edit-workspace \.manual-edit-canvas \{\s*\n\s*position: relative;/,
    );
  });

  it('keeps the manual edit titlebar from overlapping the close button', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.manual-edit-titlebar');
    expect(css).toContain('justify-content: space-between;');
    expect(css).toContain('.manual-edit-titlebar > span');
    expect(css).toContain('text-overflow: ellipsis;');
    expect(css).toContain('.manual-edit-titlebar-close');
    expect(css).toContain('flex: 0 0 auto;');
    expect(css).toContain('width: 38px;');
    expect(css).toContain('height: 38px;');
  });

  it('uses the requested zoom for desktop preview overlays', () => {
    expect(effectivePreviewScale('desktop', 1.5, { width: 320, height: 480 })).toBe(1.5);
  });

  it('clamps mobile and tablet overlay scale to the iframe auto-fit scale', () => {
    expect(effectivePreviewScale('mobile', 1, { width: 390, height: 844 })).toBeLessThan(1);
    expect(effectivePreviewScale('tablet', 1.25, { width: 820, height: 700 })).toBeLessThan(1);
  });

  it('uses the reduced board canvas size when the side dock is open', () => {
    const dockedCanvas = commentPreviewCanvasSize(
      { width: 900, height: 700 },
      { boardMode: true, sidePanelCollapsed: false },
    );

    expect(dockedCanvas).toEqual({ width: 552, height: 684 });
    expect(effectivePreviewScale('tablet', 1, dockedCanvas)).toBeLessThan(
      effectivePreviewScale('tablet', 1, { width: 900, height: 700 }),
    );
  });

  it('uses stacked canvas sizing for narrow board panes instead of a 1px docked canvas', () => {
    const narrowCanvas = commentPreviewCanvasSize(
      { width: 400, height: 700 },
      { boardMode: true, sidePanelCollapsed: false },
    );

    expect(narrowCanvas).toEqual({ width: 384, height: 452 });
  });

  it('subtracts only the collapsed stacked rail height when the side dock is collapsed in the stacked layout', () => {
    const expandedStackedCanvas = commentPreviewCanvasSize(
      { width: 300, height: 700 },
      { boardMode: true, sidePanelCollapsed: false },
    );
    const collapsedStackedCanvas = commentPreviewCanvasSize(
      { width: 300, height: 700 },
      { boardMode: true, sidePanelCollapsed: true },
    );

    expect(expandedStackedCanvas).toEqual({ width: 284, height: 452 });
    expect(collapsedStackedCanvas).toEqual({ width: 284, height: 624 });
    expect(collapsedStackedCanvas!.height).toBeGreaterThan(expandedStackedCanvas!.height);
  });

  it('matches the rendered non-desktop dock padding in board canvas sizing', () => {
    const dockedCanvas = commentPreviewCanvasSize(
      { width: 900, height: 700 },
      { boardMode: true, sidePanelCollapsed: false, viewport: 'tablet' },
    );

    expect(dockedCanvas).toEqual({ width: 520, height: 652 });
  });

  it('fits non-desktop board previews against the inner canvas without subtracting viewport padding again', () => {
    const dockedCanvas = commentPreviewCanvasSize(
      { width: 900, height: 700 },
      { boardMode: true, sidePanelCollapsed: false, viewport: 'tablet' },
    );

    expect(effectivePreviewScale('tablet', 1, dockedCanvas, { canvasPadding: 0 })).toBeCloseTo(652 / 1180);
  });

  it('offsets tablet and mobile overlays to the centered viewport card', () => {
    expect(previewOverlayTransform('desktop', 1.25, { width: 1200, height: 800 })).toEqual({
      scale: 1.25,
      offsetX: 0,
      offsetY: 0,
    });

    expect(previewOverlayTransform('mobile', 1, { width: 1200, height: 1000 })).toEqual({
      scale: 1,
      offsetX: 405,
      offsetY: 24,
    });

    const tablet = previewOverlayTransform('tablet', 1.25, { width: 1200, height: 800 });
    expect(tablet.scale).toBeCloseTo(752 / 1180, 5);
    expect(tablet.offsetX).toBeCloseTo(24 + (1152 - 820 * (752 / 1180)) / 2, 5);
    expect(tablet.offsetY).toBe(24);
  });
});

describe('FileViewer JSON artifacts', () => {
  it('pretty-prints valid JSON in the text viewer', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response('{"title":"Launch Metrics","stats":{"views":42,"active":true}}');
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      expect(container.querySelector('.lines')?.textContent).toBe(
        '{\n  "title": "Launch Metrics",\n  "stats": {\n    "views": 42,\n    "active": true\n  }\n}',
      );
    });
  });

  it('keeps raw JSON when pretty-printing would round an unsafe integer', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"id":9007199254740993,"name":"large"}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('9007199254740993');
      expect(displayedText).not.toContain('9007199254740992');
    });
  });

  it('keeps raw JSON when pretty-printing would round a high-precision decimal', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"ratio":0.1234567890123456789,"name":"precise"}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('0.1234567890123456789');
      expect(displayedText).not.toContain('0.12345678901234568');
    });
  });

  it('keeps raw JSON when pretty-printing would round a high-precision exponent', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"ratio":1.234567890123456789e2,"name":"precise"}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('1.234567890123456789e2');
      expect(displayedText).not.toContain('123.45678901234568');
    });
  });

  it('keeps raw JSON when pretty-printing would erase signed negative zero', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"delta":-0}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('-0');
      expect(displayedText).not.toContain('{"delta":0}');
    });
  });
});

describe('FileViewer SVG artifacts', () => {
  it('routes SVG artifacts to the SVG viewer instead of the generic image viewer', () => {
    const file = baseFile({
      name: 'diagram.svg',
      path: 'diagram.svg',
      mime: 'image/svg+xml',
      artifactManifest: {
        version: 1,
        kind: 'svg',
        title: 'Diagram',
        entry: 'diagram.svg',
        renderer: 'svg',
        exports: ['svg'],
      },
    });

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    expect(markup).toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer image-viewer"');
    expect(markup).toContain('Preview');
    expect(markup).toContain('Code');
    expect(markup).toContain('src="/api/projects/project-1/raw/diagram.svg?v=1710000000&amp;r=0"');
  });

  it('keeps normal image artifacts on the existing image viewer path', () => {
    const file = baseFile({ name: 'photo.png', path: 'photo.png' });

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    expect(markup).toContain('class="viewer image-viewer"');
    expect(markup).not.toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer-tabs"');
  });

  it('renders sketch json files through the static sketch preview instead of the image viewer', async () => {
    const file = baseFile({
      name: 'board.sketch.json',
      path: 'board.sketch.json',
      kind: 'sketch',
      mime: 'application/json; charset=utf-8',
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      items: [
        {
          kind: 'arrow',
          x1: 16,
          y1: 24,
          x2: 180,
          y2: 108,
          color: '#1c1b1a',
          size: 3,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sketch-preview-svg"]')).toBeTruthy();
    });
    expect(container.querySelector('.viewer.image-viewer img')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/raw/board.sketch.json', { cache: 'no-store' });
  });

  it('expands the sketch preview viewBox for off-origin sketches outside the default frame', async () => {
    const file = baseFile({
      name: 'offset-board.sketch.json',
      path: 'offset-board.sketch.json',
      kind: 'sketch',
      mime: 'application/json; charset=utf-8',
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      items: [
        {
          kind: 'rect',
          x: 500,
          y: 300,
          w: 20,
          h: 10,
          color: '#1c1b1a',
          size: 2,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const svg = container.querySelector<SVGSVGElement>('[data-testid="sketch-preview-svg"] svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 545 335');
    });
  });

  it('marks preview and source modes through the SVG viewer toggle controls', () => {
    const file = baseFile({ name: 'diagram.svg', path: 'diagram.svg', mime: 'image/svg+xml' });

    const previewMarkup = renderToStaticMarkup(
      <SvgViewer projectId="project-1" file={file} initialMode="preview" />,
    );
    const sourceMarkup = renderToStaticMarkup(
      <SvgViewer
        projectId="project-1"
        file={file}
        initialMode="source"
        initialSource="<svg><title>Diagram</title></svg>"
      />,
    );

    expect(previewMarkup).toContain('class="viewer-tab active" aria-pressed="true">Preview</button>');
    expect(previewMarkup).toContain('aria-pressed="false">Code</button>');
    expect(previewMarkup).toContain('<img');

    expect(sourceMarkup).toContain('aria-pressed="false">Preview</button>');
    expect(sourceMarkup).toContain('class="viewer-tab active" aria-pressed="true">Code</button>');
    expect(sourceMarkup).toContain('class="viewer-source"');
    expect(sourceMarkup).not.toContain('<img');
  });

  it('keeps a URL-loaded preview iframe alive while the viewer unmounts and remounts', () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    function Shell() {
      const [visible, setVisible] = useState(true);
      return (
        <IframeKeepAliveProvider>
          <button type="button" onClick={() => setVisible((next) => !next)}>
            {visible ? 'Leave project' : 'Return project'}
          </button>
          {visible ? (
            <FileViewer
              projectId="project-1"
              projectKind="prototype"
              file={file}
              liveHtml="<html><body>hi</body></html>"
            />
          ) : (
            <div data-testid="home-view" />
          )}
        </IframeKeepAliveProvider>
      );
    }

    const { container } = render(<Shell />);

    const firstFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(firstFrame.getAttribute('src')).toBe('/api/projects/project-1/raw/page.html?v=1710000000&r=0&odPreviewBridge=scroll&odPreviewBridge=selection');

    fireEvent.click(screen.getByRole('button', { name: 'Leave project' }));

    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull();
    expect(screen.getByTestId('home-view')).toBeTruthy();
    const parkedFrame = container.querySelector<HTMLIFrameElement>('.iframe-keep-alive-pool iframe');
    expect(parkedFrame).toBe(firstFrame);
    expect(parkedFrame?.getAttribute('src')).toBe('/api/projects/project-1/raw/page.html?v=1710000000&r=0&odPreviewBridge=scroll&odPreviewBridge=selection');

    fireEvent.click(screen.getByRole('button', { name: 'Return project' }));

    expect(screen.getByTestId('artifact-preview-frame')).toBe(firstFrame);
  });

  it('evicts least-recent inactive preview iframes once the pool exceeds its limit', () => {
    function Harness({ activeKey }: { activeKey: string | null }) {
      return (
        <IframeKeepAliveProvider maxEntries={2}>
          {activeKey ? (
            <PooledIframe
              cacheKey={previewIframeKeepAliveKey('project-1', `${activeKey}.html`)}
              src={`/api/projects/project-1/raw/${activeKey}.html?v=1&r=0`}
              title={`${activeKey}.html`}
              sandbox="allow-scripts allow-downloads"
              data-testid="pooled-frame"
              data-od-render-mode="url-load"
              data-od-active="true"
            />
          ) : null}
        </IframeKeepAliveProvider>
      );
    }

    const { container, rerender } = render(<Harness activeKey="one" />);
    const firstFrame = screen.getByTestId('pooled-frame');
    rerender(<Harness activeKey={null} />);
    rerender(<Harness activeKey="two" />);
    const secondFrame = screen.getByTestId('pooled-frame');
    rerender(<Harness activeKey={null} />);
    rerender(<Harness activeKey="three" />);
    const thirdFrame = screen.getByTestId('pooled-frame');
    rerender(<Harness activeKey={null} />);

    const parkedFrames = Array.from(
      container.querySelectorAll<HTMLIFrameElement>('.iframe-keep-alive-pool iframe'),
    );
    expect(parkedFrames).toEqual([secondFrame, thirdFrame]);
    expect(parkedFrames).not.toContain(firstFrame);
  });

  it('evicts inactive preview iframes for a project when the project is invalidated', () => {
    function Harness({ active }: { active: boolean }) {
      const pool = useIframeKeepAlivePool();
      return (
        <>
          <button type="button" onClick={() => pool.evictProject('project-1')}>
            Invalidate project
          </button>
          {active ? (
            <PooledIframe
              cacheKey={previewIframeKeepAliveKey('project-1', 'page.html')}
              src="/api/projects/project-1/raw/page.html?v=1&r=0"
              title="page.html"
              sandbox="allow-scripts allow-downloads"
              data-testid="pooled-frame"
              data-od-render-mode="url-load"
              data-od-active="true"
            />
          ) : null}
        </>
      );
    }

    const { container, rerender } = render(
      <IframeKeepAliveProvider>
        <Harness active />
      </IframeKeepAliveProvider>,
    );
    const firstFrame = screen.getByTestId('pooled-frame');

    rerender(
      <IframeKeepAliveProvider>
        <Harness active={false} />
      </IframeKeepAliveProvider>,
    );
    expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBe(firstFrame);

    fireEvent.click(screen.getByRole('button', { name: 'Invalidate project' }));

    expect(container.querySelector('.iframe-keep-alive-pool iframe')).toBeNull();
  });

  it('reattaches a fresh visible iframe after active project invalidation', () => {
    function Harness() {
      const pool = useIframeKeepAlivePool();
      return (
        <>
          <button
            type="button"
            onClick={() => pool.evictProject('project-1', { includeActive: true })}
          >
            Invalidate active project
          </button>
          <PooledIframe
            cacheKey={previewIframeKeepAliveKey('project-1', 'page.html')}
            src="/api/projects/project-1/raw/page.html?v=1&r=0"
            title="page.html"
            sandbox="allow-scripts allow-downloads"
            data-testid="pooled-frame"
            data-od-render-mode="url-load"
            data-od-active="true"
          />
        </>
      );
    }

    render(
      <IframeKeepAliveProvider>
        <Harness />
      </IframeKeepAliveProvider>,
    );
    const firstFrame = screen.getByTestId('pooled-frame');

    fireEvent.click(screen.getByRole('button', { name: 'Invalidate active project' }));

    const secondFrame = screen.getByTestId('pooled-frame');
    expect(secondFrame).not.toBe(firstFrame);
    expect(secondFrame.getAttribute('src')).toBe('/api/projects/project-1/raw/page.html?v=1&r=0');
  });

  it('URL-loads a plain HTML preview iframe instead of inlining via srcDoc', () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const markup = renderToStaticMarkup(
      <FileViewer projectId="project-1" projectKind="prototype" file={file} liveHtml="<html><body>hi</body></html>" />,
    );

    expect(markup).toContain('data-testid="artifact-preview-frame"');
    expect(markup).toContain('data-od-render-mode="url-load"');
    expect(markup).toContain('data-od-render-mode="url-load" data-od-active="true"');
    expect(markup).toContain('data-od-render-mode="srcdoc" data-od-active="false"');
    expect(markup).toContain('src="/api/projects/project-1/raw/page.html?v=1710000000&amp;r=0&amp;odPreviewBridge=scroll&amp;odPreviewBridge=selection"');
    expect(markup).toContain('sandbox="allow-scripts allow-downloads"');
  });

  it('reloads a URL-loaded HTML preview with a new cache key without replacing the iframe', () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml="<html><body>hi</body></html>"
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('/api/projects/project-1/raw/page.html?v=1710000000&r=0&odPreviewBridge=scroll&odPreviewBridge=selection');

    fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));

    const reloadedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(reloadedFrame).toBe(frame);
    expect(reloadedFrame.getAttribute('src')).toBe('/api/projects/project-1/raw/page.html?v=1710000000&r=1&odPreviewBridge=scroll&odPreviewBridge=selection');
  });

  it('remounts the srcDoc HTML preview when reload is requested', () => {
    const file = baseFile({
      name: 'deck.html',
      path: 'deck.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Deck',
        entry: 'deck.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        isDeck
        liveHtml={'<html><body><section class="slide">one</section><section class="slide">two</section></body></html>'}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');

    fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));

    const reloadedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(reloadedFrame).not.toBe(frame);
    expect(reloadedFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
  });

  it('offers image export for URL-loaded HTML previews', () => {
    const file = baseFile({
      name: 'workspace.html',
      path: 'workspace.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Workspace',
        entry: 'workspace.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml="<html><body><main>Workspace</main></body></html>"
      />,
    );

    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).getAttribute('data-od-render-mode')).toBe('url-load');

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(screen.getByRole('menuitem', { name: /export as image/i })).toBeTruthy();
  });

  it('keeps inactive HTML preview transports mounted without booting the artifact', async () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml='<html><body><script>window.__odArtifactBootCount = (window.__odArtifactBootCount || 0) + 1;</script><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const urlFrame = container.querySelector('iframe[data-od-render-mode="url-load"]') as HTMLIFrameElement | null;
    const srcDocFrame = container.querySelector('iframe[data-od-render-mode="srcdoc"]') as HTMLIFrameElement | null;

    expect(urlFrame).toBeTruthy();
    expect(srcDocFrame).toBeTruthy();
    expect(urlFrame?.getAttribute('data-od-active')).toBe('true');
    expect(srcDocFrame?.getAttribute('data-od-active')).toBe('false');
    expect(srcDocFrame?.srcdoc).toContain('data-od-lazy-srcdoc-transport');
    expect(srcDocFrame?.srcdoc).not.toContain('__odArtifactBootCount');

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));

    const urlFrameAfter = container.querySelector('iframe[data-od-render-mode="url-load"]') as HTMLIFrameElement | null;
    const srcDocFrameAfter = container.querySelector('iframe[data-od-render-mode="srcdoc"]') as HTMLIFrameElement | null;

    expect(urlFrameAfter).toBe(urlFrame);
    expect(urlFrameAfter?.getAttribute('data-od-active')).toBe('false');
    expect(urlFrameAfter?.getAttribute('src')).toBe('about:blank');
    expect(srcDocFrameAfter?.getAttribute('data-od-active')).toBe('true');
    expect(srcDocFrameAfter?.srcdoc).toContain('__odArtifactBootCount');
    expect(srcDocFrameAfter?.srcdoc).toContain('data-od-edit-bridge');
  });

  it('keeps the srcDoc edit transport active after canceling manual edit', async () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).getAttribute('data-od-render-mode')).toBe('url-load');

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    const editFrame = await waitFor(() => {
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(frame.srcdoc).toContain('data-od-edit-bridge');
      return frame;
    });

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));

    await waitFor(() => expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false'));
    const previewFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const urlFrame = container.querySelector('iframe[data-od-render-mode="url-load"]') as HTMLIFrameElement | null;

    expect(previewFrame).toBe(editFrame);
    expect(previewFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
    expect(previewFrame.srcdoc).toContain('data-od-edit-bridge');
    expect(urlFrame?.getAttribute('data-od-active')).toBe('false');
  });

  it('keeps the manual edit inspector pinned after clicking a target', async () => {
    const heroTarget = manualEditTarget('hero-card', 'Hero card', 20);
    const trendTarget = manualEditTarget('trend-card', 'Trend card', 320);
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={baseFile({
          name: 'page.html',
          path: 'page.html',
          mime: 'text/html',
          kind: 'html',
          artifactManifest: {
            version: 1,
            kind: 'html',
            title: 'Page',
            entry: 'page.html',
            renderer: 'html',
            exports: ['html'],
          },
        })}
        liveHtml='<html><body><main data-od-id="hero-card">Hero</main><aside data-od-id="trend-card">Trend</aside></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('artifact-preview-frame').getAttribute('data-od-render-mode')).toBe('srcdoc');
    });
    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;

    // Hover only surfaces the floating "edit params" affordance (#3438); it
    // must not open the inspector. Pinning requires an explicit select.
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-hover', target: heroTarget },
    }));
    expect(await screen.findByTestId('manual-edit-hover-open')).toBeTruthy();
    expect(screen.queryByText('Hero card')).toBeNull();

    // Selecting pins the inspector to the hero card.
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-select', target: heroTarget },
    }));
    expect(await screen.findByText('Hero card')).toBeTruthy();

    // Hovering a different element must not switch the pinned inspector.
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od-edit-hover', target: trendTarget },
    }));

    expect(screen.getByText('Hero card')).toBeTruthy();
    expect(screen.queryByText('Trend card')).toBeNull();
  });

  it('renders sandbox-shim artifacts on the srcdoc transport without entering edit mode (#2791)', () => {
    const file = baseFile({
      name: 'search.html',
      path: 'search.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Search',
        entry: 'search.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml='<html><body><script src="app.js"></script><main data-od-id="results">Results</main></body></html>'
      />,
    );

    const srcDocFrame = container.querySelector('iframe[data-od-render-mode="srcdoc"]') as HTMLIFrameElement | null;
    expect(srcDocFrame?.getAttribute('data-od-active')).toBe('true');
    expect(srcDocFrame?.srcdoc).toContain('data-od-id="results"');
    expect(srcDocFrame?.srcdoc).not.toContain('data-od-lazy-srcdoc-transport');
    expect(srcDocFrame?.srcdoc).toContain('data-od-sandbox-shim');
  });

  it('reactivates the srcDoc transport after switching source back to preview', async () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));

    await waitFor(() => {
      const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(activeFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    await waitFor(() => {
      const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(activeFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(activeFrame.srcdoc).toContain('data-od-edit-bridge');
      expect(activeFrame.srcdoc).toContain('Hero');
    });
  });

  it('uses the next file URL immediately when switching URL-loaded HTML previews', () => {
    const first = baseFile({
      name: 'first.html',
      path: 'first.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'First',
        entry: 'first.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    const second = {
      ...first,
      name: 'second.html',
      path: 'second.html',
      artifactManifest: {
        ...first.artifactManifest!,
        title: 'Second',
        entry: 'second.html',
      },
    };
    const observedCommittedSrcs: Array<string | null> = [];

    function Switcher() {
      const [file, setFile] = useState<ProjectFile>(first);
      const hostRef = useRef<HTMLDivElement | null>(null);
      useLayoutEffect(() => {
        observedCommittedSrcs.push(
          hostRef.current
            ?.querySelector<HTMLIFrameElement>('[data-testid="artifact-preview-frame"]')
            ?.getAttribute('src') ?? null,
        );
      });
      return (
        <div ref={hostRef}>
          <button type="button" onClick={() => setFile(second)}>Switch file</button>
          <FileViewer projectId="project-1" projectKind="prototype" file={file}
            liveHtml="<html><body>preview</body></html>"
          />
        </div>
      );
    }

    const { container } = render(<Switcher />);
    const getFrame = () => container.querySelector<HTMLIFrameElement>('[data-testid="artifact-preview-frame"]');
    const initialFrame = getFrame();
    expect(initialFrame?.getAttribute('src')).toBe('/api/projects/project-1/raw/first.html?v=1710000000&r=0&odPreviewBridge=scroll&odPreviewBridge=selection');

    const observationsBeforeSwitch = observedCommittedSrcs.length;
    fireEvent.click(screen.getByRole('button', { name: 'Switch file' }));

    const nextFrame = getFrame();
    expect(nextFrame).toBeTruthy();
    expect(observedCommittedSrcs[observationsBeforeSwitch]).toBe(
      '/api/projects/project-1/raw/second.html?v=1710000000&r=0&odPreviewBridge=scroll&odPreviewBridge=selection',
    );
    expect(nextFrame?.getAttribute('src')).toBe('/api/projects/project-1/raw/second.html?v=1710000000&r=0&odPreviewBridge=scroll&odPreviewBridge=selection');
  });

  it('allows downloads in the in-tab HTML presentation iframe', async () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file} liveHtml="<html><body>hi</body></html>" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /in this tab/i }));

    await waitFor(() => {
      const frame = container.querySelector('.present-overlay iframe');
      expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-downloads');
      expect(frame?.getAttribute('data-od-render-mode')).toBe('url-load');
    });
  });

  it('allows downloads in React component preview iframes', async () => {
    const file = baseFile({
      name: 'Card.jsx',
      path: 'Card.jsx',
      mime: 'text/jsx',
      kind: 'code',
      artifactManifest: {
        version: 1,
        kind: 'react-component',
        title: 'Card',
        entry: 'Card.jsx',
        renderer: 'react-component',
        exports: ['jsx', 'html', 'zip'],
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/Card.jsx') {
        return new Response('export default function Card() { return <button>Download</button>; }');
      }
      return new Response('', { status: 404 });
    }));

    render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    const frame = await screen.findByTestId('react-component-preview-frame');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-downloads');
  });

  it('points a .jsx module loaded by a sibling HTML to that entry, not the React error (issue #2744)', async () => {
    const file = baseFile({
      name: 'icons.jsx',
      path: 'icons.jsx',
      mime: 'text/jsx',
      kind: 'code',
      artifactManifest: {
        version: 1,
        kind: 'react-component',
        title: 'icons',
        entry: 'icons.jsx',
        renderer: 'react-component',
        exports: ['jsx'],
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url === '/api/projects/project-1/files') {
          return new Response(
            JSON.stringify({
              files: [
                { name: 'icons.jsx', path: 'icons.jsx' },
                { name: 'backups.html', path: 'backups.html' },
              ],
            }),
          );
        }
        if (url === '/api/projects/project-1/raw/backups.html') {
          return new Response('<script type="text/babel" src="icons.jsx"></script>');
        }
        if (url === '/api/projects/project-1/raw/icons.jsx') {
          return new Response('window.I = { star: null };');
        }
        return new Response('', { status: 404 });
      }),
    );

    const onOpenFileReplacing = vi.fn();
    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        onOpenFileReplacing={onOpenFileReplacing}
      />,
    );

    // The module points at its HTML entry instead of rendering the React
    // runtime (which would throw "No React component export found").
    const link = await screen.findByRole('button', { name: /backups\.html/ });
    expect(screen.queryByTestId('react-component-preview-frame')).toBeNull();

    // The toolbar still offers a way to read the raw code: clicking the Code
    // tab swaps the pointer for the file's source. Issue #2744 follow-up.
    fireEvent.click(screen.getByRole('button', { name: /^code$/i }));
    expect(container.textContent).toContain('window.I');
    expect(screen.queryByRole('button', { name: /backups\.html/ })).toBeNull();

    // Back on Preview, clicking the entry opens the HTML page and closes the
    // dead-end module tab (icons.jsx) in one move.
    fireEvent.click(screen.getByRole('button', { name: /^preview$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /backups\.html/ }));
    expect(onOpenFileReplacing).toHaveBeenCalledWith('backups.html', 'icons.jsx');
  });

  it('keeps decks on the srcDoc path so the deck postMessage bridge can run', () => {
    const file = baseFile({
      name: 'deck.html',
      path: 'deck.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'deck',
        title: 'Deck',
        entry: 'deck.html',
        renderer: 'deck-html',
        exports: ['html'],
      },
    });

    const markup = renderToStaticMarkup(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        isDeck
        liveHtml={'<html><body><section class="slide">one</section></body></html>'}
      />,
    );

    expect(markup).toContain('data-testid="artifact-preview-frame"');
    expect(markup).toContain('data-od-render-mode="srcdoc"');
    expect(markup).toContain('data-od-render-mode="srcdoc" data-od-active="true"');
    expect(markup).toContain('data-od-render-mode="url-load" data-od-active="false"');
    expect(markup).not.toContain('data-od-lazy-srcdoc-transport');
    expect(markup).toContain('sandbox="allow-scripts allow-downloads"');
  });

  it('falls back to srcDoc when the HTML body looks deck-shaped even without an isDeck hint', () => {
    const file = baseFile({
      name: 'inferred.html',
      path: 'inferred.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Inferred',
        entry: 'inferred.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const markup = renderToStaticMarkup(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml={'<html><body><section class="slide">one</section><section class="slide">two</section></body></html>'}
      />,
    );

    expect(markup).toContain('data-od-render-mode="srcdoc"');
    expect(markup).toContain('data-od-render-mode="srcdoc" data-od-active="true"');
    expect(markup).toContain('data-od-render-mode="url-load" data-od-active="false"');
  });

  it('hides preview-only toolbar controls when switching an HTML deck to source view', async () => {
    const file = baseFile({
      name: 'deck.html',
      path: 'deck.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Deck',
        entry: 'deck.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        isDeck
        liveHtml={'<html><body><section class="slide">one</section><section class="slide">two</section></body></html>'}
      />,
    );

    expect(container.querySelector('.deck-nav')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manual' })).toBeNull();
    expect(container.querySelector('.viewer-viewport-switcher')).toBeTruthy();
    expect(screen.queryByTestId('palette-tweaks-toggle')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Code' }));

    await waitFor(() => {
      expect(container.querySelector('.deck-nav')).toBeNull();
      expect(container.querySelector('.viewer-viewport-switcher')).toBeNull();
      expect(screen.queryByTestId('manual-edit-mode-toggle')).toBeNull();
      expect(screen.queryByTestId('draw-overlay-toggle')).toBeNull();
      expect(screen.queryByTestId('palette-tweaks-toggle')).toBeNull();
      expect(screen.queryByRole('button', { name: /100%/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /zoom out/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /zoom in/i })).toBeNull();
    });
  });

  it('shows Cloudflare Pages as a deploy action without requiring a project name input', async () => {
    const file = baseFile({
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

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.getByRole('menuitem', { name: /Deploy to Vercel/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Account ID')).toBeTruthy();
    expect(screen.getByText(/Select Pages Edit when creating the API token/i)).toBeTruthy();
    expect(screen.getByText(/Zone Read/i)).toBeTruthy();
    expect(screen.getByText(/custom domains need Zone Read \/ DNS Edit/i)).toBeTruthy();
    expect(screen.queryByText(/Pages Read\/Write/i)).toBeNull();
    const subdomainInput = screen.getByLabelText('Subdomain prefix');
    const domainSelect = screen.getByLabelText('Domain');
    expect(Boolean(subdomainInput.compareDocumentPosition(domainSelect) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.queryByText('Pages project name')).toBeNull();
    expect(screen.queryByText(/generates a Pages project name automatically/i)).toBeNull();
    expect(screen.queryByText(/project name is selected automatically/i)).toBeNull();
    expect(screen.queryByLabelText('Pages project name')).toBeNull();
  });

  it('closes the deploy/share modal from the backdrop or Escape', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: false,
          tokenMask: '',
          teamId: '',
          teamSlug: '',
          target: 'preview',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    const openDeployModal = async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
      fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Vercel/i }));
      return screen.findByRole('dialog');
    };

    const dialog = await openDeployModal();
    expect(dialog).toBeTruthy();
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeTruthy();
    const backdrop = document.querySelector<HTMLElement>('.deploy-flow-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(screen.queryByRole('dialog')).toBeNull();

    expect(await openDeployModal()).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('nudges the export button once when an artifact becomes exportable', async () => {
    const file = baseFile({
      name: 'nudge.html',
      path: 'nudge.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Nudge',
        entry: 'nudge.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer
        projectId="project-nudge"
        projectKind="prototype"
        file={file}
        liveHtml="<html><body><h1>Ready</h1></body></html>"
      />,
    );

    const exportButton = screen.getByRole('button', { name: /download/i });
    await waitFor(() => {
      expect(exportButton.classList.contains('export-ready-nudge')).toBe(true);
    });

    fireEvent.click(exportButton);

    expect(exportButton.classList.contains('export-ready-nudge')).toBe(false);
  });

  it('nudges each exportable artifact once when the mounted viewer switches files', async () => {
    const firstFile = baseFile({
      name: 'nudge-first.html',
      path: 'nudge-first.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'First',
        entry: 'nudge-first.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    const secondFile = baseFile({
      name: 'nudge-second.html',
      path: 'nudge-second.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Second',
        entry: 'nudge-second.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { rerender } = render(
      <FileViewer
        projectId="project-nudge-switch"
        projectKind="prototype"
        file={firstFile}
        liveHtml="<html><body><h1>First</h1></body></html>"
      />,
    );

    const firstExportButton = screen.getByRole('button', { name: /download/i });
    await waitFor(() => {
      expect(firstExportButton.classList.contains('export-ready-nudge')).toBe(true);
    });
    fireEvent.click(firstExportButton);
    expect(firstExportButton.classList.contains('export-ready-nudge')).toBe(false);

    rerender(
      <FileViewer
        projectId="project-nudge-switch"
        projectKind="prototype"
        file={secondFile}
        liveHtml="<html><body><h1>Second</h1></body></html>"
      />,
    );

    const secondExportButton = screen.getByRole('button', { name: /download/i });
    await waitFor(() => {
      expect(secondExportButton.classList.contains('export-ready-nudge')).toBe(true);
    });
  });

  it('keeps the explicitly selected deploy provider when another provider already has a deployment', async () => {
    const file = baseFile({
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
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'vercel-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'vercel-self',
              url: 'https://vercel.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=cloudflare-pages') {
        return new Response(JSON.stringify({
          providerId: 'cloudflare-pages',
          configured: true,
          tokenMask: 'saved-cloudflare-token',
          accountId: 'account-123',
        }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-vercel-token',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

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

    const calledUrls = fetchMock.mock.calls.map(([input]) => (
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    ));
    expect(calledUrls).toContain('/api/deploy/config?providerId=cloudflare-pages');
    expect(calledUrls).not.toContain('/api/deploy/config?providerId=vercel-self');
    expect((screen.getByLabelText(/Cloudflare API token/i) as HTMLInputElement).value).toBe('saved-cloudflare-token');
  });

  it('ignores stale deploy config loads after switching providers', async () => {
    const file = baseFile({
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
    const delayedCloudflareConfig = deferredResponse();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=cloudflare-pages') {
        return delayedCloudflareConfig.promise;
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-vercel-token',
        }), { status: 200 });
      }
      if (url === '/api/deploy/cloudflare-pages/zones') {
        return new Response(JSON.stringify({
          zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

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
    fireEvent.change(providerSelect, { target: { value: 'vercel-self' } });

    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('vercel-self');
    });
    expect((screen.getByLabelText(/Vercel token/i) as HTMLInputElement).value).toBe('saved-vercel-token');

    delayedCloudflareConfig.resolve(new Response(JSON.stringify({
      providerId: 'cloudflare-pages',
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      accountId: 'account-123',
      cloudflarePages: {
        lastZoneId: 'zone-1',
        lastDomainPrefix: 'demo',
      },
    }), { status: 200 }));

    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('vercel-self');
      expect((screen.getByLabelText(/Vercel token/i) as HTMLInputElement).value).toBe('saved-vercel-token');
    });
    expect(screen.queryByLabelText(/Cloudflare API token/i)).toBeNull();
  });

  it('loads Cloudflare domains, sends the selected custom domain, and renders both links', async () => {
    const file = baseFile({
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
    let deployBody: any = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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
          target: 'preview',
        }), { status: 200 });
      }
      if (url === '/api/deploy/cloudflare-pages/zones') {
        return new Response(JSON.stringify({
          zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
        }), { status: 200 });
      }
      if (url === '/api/deploy/config' && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          providerId: 'cloudflare-pages',
          configured: true,
          tokenMask: 'saved-cloudflare-token',
          teamId: '',
          teamSlug: '',
          accountId: body.accountId,
          cloudflarePages: body.cloudflarePages,
          target: 'preview',
        }), { status: 200 });
      }
      if (url === '/api/projects/project-1/deploy' && method === 'POST') {
        deployBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          id: 'cloudflare-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'cloudflare-pages',
          url: 'https://demo-pages.pages.dev',
          deploymentId: 'cf-dep-1',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          cloudflarePages: {
            projectName: 'demo-pages',
            pagesDev: {
              url: 'https://demo-pages.pages.dev',
              status: 'ready',
            },
            customDomain: {
              hostname: 'demo.example.com',
              url: 'https://demo.example.com',
              zoneId: 'zone-1',
              zoneName: 'example.com',
              domainPrefix: 'demo',
              status: 'ready',
              dnsStatus: 'created',
              domainStatus: 'active',
            },
          },
          createdAt: 1,
          updatedAt: 2,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    const zoneSelect = await screen.findByRole('combobox', { name: /Domain/i });
    await waitFor(() => {
      expect((zoneSelect as HTMLSelectElement).value).toBe('zone-1');
    });
    fireEvent.change(screen.getByLabelText(/Subdomain prefix/i), { target: { value: 'demo' } });

    const deployButtons = screen.getAllByRole('button', { name: /^Deploy$/i });
    fireEvent.click(deployButtons[deployButtons.length - 1]!);

    const pagesDevLabel = await screen.findByText('pages.dev URL');
    const customDomainLabel = await screen.findByText('Custom domain');
    expect(customDomainLabel).toBeTruthy();
    expect(pagesDevLabel.closest('.deploy-result-block')).toBe(customDomainLabel.closest('.deploy-result-block'));
    expect(screen.getByText('https://demo-pages.pages.dev')).toBeTruthy();
    // The custom domain is also the public share URL, so it renders both in the
    // result block and in the social-share header; scope to the result block.
    const resultBlock = customDomainLabel.closest('.deploy-result-block') as HTMLElement;
    expect(within(resultBlock).getByText('https://demo.example.com')).toBeTruthy();
    const deployToast = document.querySelector('.od-toast');
    expect(deployToast?.className).toContain('tone-success');
    expect(deployToast?.className).toContain('placement-top');
    expect(deployToast?.textContent).toContain('Deployment uploaded successfully');
    expect(deployToast?.textContent).toContain('Cloudflare Pages');
    expect(deployToast?.textContent).toContain('https://demo-pages.pages.dev');
    expect(deployBody).toMatchObject({
      fileName: 'index.html',
      providerId: 'cloudflare-pages',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
    });
  });

  it('copies the newest deployment URL across providers', async () => {
    const file = baseFile({
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
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'vercel-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'vercel-self',
              url: 'https://vercel.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            },
            {
              id: 'cloudflare-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'cloudflare-pages',
              url: 'https://cloudflare.pages.dev',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 3,
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i });
    expect(screen.queryByRole('menuitem', { name: /Copy Vercel link/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Copy Cloudflare link/i })).toBeNull();
    fireEvent.click(copyShareLink);

    expect(writeText).toHaveBeenCalledWith('https://cloudflare.pages.dev');
    expect(await screen.findByRole('menuitem', { name: /Copied!/i })).toBeTruthy();
  });

  it('uses a ready Cloudflare custom domain for the share link', async () => {
    const file = baseFile({
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
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'cloudflare-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'cloudflare-pages',
          url: 'https://demo-pages.pages.dev',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          cloudflarePages: {
            projectName: 'demo-pages',
            pagesDev: {
              url: 'https://demo-pages.pages.dev',
              status: 'ready',
            },
            customDomain: {
              hostname: 'demo.example.com',
              url: 'https://demo.example.com',
              zoneId: 'zone-1',
              zoneName: 'example.com',
              domainPrefix: 'demo',
              status: 'ready',
            },
          },
          createdAt: 1,
          updatedAt: 3,
        },
      ],
    }), { status: 200 })));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i });
    fireEvent.click(copyShareLink);

    expect(writeText).toHaveBeenCalledWith('https://demo.example.com');
  });

  it('allows copying but not opening a deployment while its public link is still preparing', async () => {
    const file = baseFile({
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
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'pending-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'vercel-self',
          url: 'https://pending.example',
          deploymentCount: 1,
          target: 'preview',
          status: 'link-delayed',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }), { status: 200 })));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i });
    const openSharePage = screen.getByRole('menuitem', { name: /Open share page/i }) as HTMLButtonElement;
    expect((copyShareLink as HTMLButtonElement).disabled).toBe(false);
    expect(openSharePage.disabled).toBe(true);
    expect(screen.getAllByText(/public link is still being prepared/i).length).toBeGreaterThan(0);
    fireEvent.click(copyShareLink);

    expect(writeText).toHaveBeenCalledWith('https://pending.example');
  });

  it('allows copying and opening a protected deployment but shows an access hint', async () => {
    const file = baseFile({
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
    const writeText = vi.fn().mockResolvedValue(undefined);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'protected-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'vercel-self',
          url: 'https://protected.example',
          deploymentCount: 1,
          target: 'preview',
          status: 'protected',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }), { status: 200 })));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i });
    const openSharePage = screen.getByRole('menuitem', { name: /Open share page/i }) as HTMLButtonElement;
    expect((copyShareLink as HTMLButtonElement).disabled).toBe(false);
    expect(openSharePage.disabled).toBe(false);
    expect(screen.getAllByText(/requiring authentication/i).length).toBeGreaterThan(0);
    fireEvent.click(openSharePage);

    expect(openSpy).toHaveBeenCalledWith('https://protected.example', '_blank', 'noopener');
  });

  it('shows one copy link when only one deployment provider has a URL', async () => {
    const file = baseFile({
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
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'cloudflare-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'cloudflare-pages',
          url: 'https://cloudflare.pages.dev',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          createdAt: 1,
          updatedAt: 3,
        },
      ],
    }), { status: 200 })));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i });
    fireEvent.click(copyShareLink);

    expect(writeText).toHaveBeenCalledWith('https://cloudflare.pages.dev');
    expect(screen.queryByRole('menuitem', { name: /Copy Vercel link/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Copy Cloudflare link/i })).toBeNull();
  });

  it('separates deploy sharing actions from download actions', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ deployments: [] }), { status: 200 })));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.getByText('SHARE')).toBeTruthy();
    expect(screen.getByText('PUBLISH ONLINE')).toBeTruthy();
    const menuItems = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(menuItems.slice(0, 1)).toEqual([
      'Publish online above to enable share ↑',
    ]);
    expect(menuItems.slice(1, 3)).toEqual([
      'Deploy to Vercel',
      'Deploy to Cloudflare Pages',
    ]);
    expect(screen.getByText('Publish online above to enable share ↑')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Copy share link/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Open share page/i })).toBeNull();
    expect(menuItems).not.toContain('Export as PDF');
    expect(menuItems).not.toContain('Export as image');
    expect(menuItems).not.toContain('Download as .zip');
    expect(menuItems).not.toContain('Export as standalone HTML');

    fireEvent.click(screen.getByRole('menuitem', { name: /Publish online above to enable share/i }));
    expect(await screen.findByText('Publish online first to get a link')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    const downloadItems = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(downloadItems).toContain('Export as PDF');
    expect(downloadItems).toContain('Export as image');
    expect(downloadItems).toContain('Download as .zip');
    expect(downloadItems).toContain('Export as standalone HTML');
    expect(downloadItems).not.toContain('Copy share link');
    expect(downloadItems).not.toContain('Deploy to Vercel');
    expect(downloadItems).not.toContain('Export as PPTX');
    expect(downloadItems).not.toContain('Export as Markdown');
  });

  it('disables share link actions while the artifact is still streaming', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'vercel-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'vercel-self',
          url: 'https://vercel.example',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }), { status: 200 })));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
        streaming
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i }) as HTMLButtonElement;
    const openSharePage = screen.getByRole('menuitem', { name: /Open share page/i }) as HTMLButtonElement;
    expect(copyShareLink.disabled).toBe(true);
    expect(openSharePage.disabled).toBe(true);
    expect(screen.getAllByText(/Share after generation completes/i).length).toBeGreaterThan(0);
  });

  it('shows markdown export without exposing deploy actions for markdown artifacts', async () => {
    const file = baseFile({
      name: 'notes.md',
      path: 'notes.md',
      mime: 'text/markdown',
      kind: 'text',
      artifactManifest: {
        version: 1,
        kind: 'markdown-document',
        title: 'Notes',
        entry: 'notes.md',
        renderer: 'markdown',
        exports: ['md'],
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/notes.md') {
        return new Response('# Notes\n\nKeep this as markdown.');
      }
      return new Response('', { status: 404 });
    }));

    render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    expect(screen.queryByRole('button', { name: /^deploy$/i })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /^download$/i }));

    expect(screen.getByRole('menuitem', { name: /Export as Markdown/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Deploy to Vercel/i })).toBeNull();
  });

  it('shows failed copy feedback when deployed link copying is blocked', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'vercel-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'vercel-self',
          url: 'https://vercel.example',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }), { status: 200 })));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    const copyShareLink = await screen.findByRole('menuitem', { name: /Copy share link/i });
    expect((copyShareLink as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(copyShareLink);

    expect(await screen.findByRole('menuitem', { name: /Copy failed/i })).toBeTruthy();
    expect(screen.getAllByText('Copy failed').length).toBeGreaterThan(1);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('opens existing deployed projects in the deploy/share modal before showing social targets', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'vercel-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'vercel-self',
              url: 'https://vercel.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-token',
          teamId: '',
          teamSlug: '',
          target: 'preview',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    const socialShareItem = await screen.findByRole('menuitem', { name: /social share/i });
    expect(document.querySelector('.share-menu-social-grid')).toBeNull();
    fireEvent.click(socialShareItem);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'X' })).toBeTruthy();
    expect(screen.getAllByText('https://vercel.example').length).toBeGreaterThan(0);
  });

  it('keeps social sharing in the deploy modal after a successful deploy', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-token',
          teamId: '',
          teamSlug: '',
          target: 'preview',
        }), { status: 200 });
      }
      if (url === '/api/projects/project-1/deploy' && method === 'POST') {
        return new Response(JSON.stringify({
          id: 'vercel-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'vercel-self',
          url: 'https://vercel.example',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          createdAt: 1,
          updatedAt: 2,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /deploy then share/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'X' })).toBeNull();
    const deployButtons = within(dialog).getAllByRole('button', { name: /^Deploy$/i });
    fireEvent.click(deployButtons[deployButtons.length - 1]!);

    expect(await screen.findByRole('link', { name: 'X' })).toBeTruthy();
    expect(screen.getAllByText('https://vercel.example').length).toBeGreaterThan(0);
  });

  it('shows social sharing with a warning for protected deployments', async () => {
    const file = baseFile({
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
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'vercel-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'vercel-self',
              url: 'https://protected.vercel.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'protected',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-token',
          teamId: '',
          teamSlug: '',
          target: 'preview',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    const socialShareItem = await screen.findByRole('menuitem', { name: /social share/i });
    fireEvent.click(socialShareItem);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'X' })).toBeTruthy();
    expect(screen.getAllByText(/requiring authentication/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('https://protected.vercel.example').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /copy link/i }).length).toBeGreaterThan(0);
  });

  it('renders unsafe SVG source as escaped text instead of executable markup', () => {
    const file = baseFile({ name: 'unsafe.svg', path: 'unsafe.svg', mime: 'image/svg+xml' });
    const unsafeSource = [
      '<svg onload="alert(1)"><script>alert(2)</script><text>Logo</text></svg>',
      '<svg><![CDATA[<script>alert(3)</script>]]></svg>',
    ].join('\n');

    const markup = renderToStaticMarkup(
      <SvgViewer
        projectId="project-1"
        file={file}
        initialMode="source"
        initialSource={unsafeSource}
      />,
    );

    expect(markup).toContain('&lt;svg onload=&quot;alert(1)&quot;&gt;');
    expect(markup).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(markup).toContain('&lt;![CDATA[&lt;script&gt;alert(3)&lt;/script&gt;]]&gt;');
    expect(markup).not.toContain('<svg onload');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<![CDATA[');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });

  it('uses an in-app modal instead of window.prompt() when saving a template', async () => {
    saveTemplateMock.mockResolvedValueOnce({
      id: 'tpl_1',
      name: 'Landing Page',
      description: null,
      sourceProjectId: 'project-1',
      files: [],
      createdAt: Date.now(),
    });
    const promptSpy = vi.spyOn(window, 'prompt');
    const file = baseFile({
      name: 'landing-page.html',
      path: 'landing-page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Landing Page',
        entry: 'landing-page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /save as template/i }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    const nameInput = screen.getByLabelText(/template name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('landing-page');
    fireEvent.change(nameInput, { target: { value: 'Landing Page' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(saveTemplateMock).toHaveBeenCalledWith({
        name: 'Landing Page',
        description: undefined,
        sourceProjectId: 'project-1',
      }),
    );
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });
});

describe('FileViewer tweaks toolbar', () => {
  const t = (key: keyof Dict) => {
    const labels: Partial<Record<keyof Dict, string>> = {
      'chat.tabComments': 'Comments',
      'chat.comments.emptySaved': 'No saved comments.',
      'chat.comments.targetText': 'Text',
      'chat.comments.targetLink': 'Link',
      'chat.comments.selectAll': 'Select all',
      'common.close': 'Close',
      'common.delete': 'Delete',
      'preview.showSidebar': 'Show Comments',
      'preview.hideSidebar': 'Hide Comments',
    };
    return labels[key] ?? key;
  };

  function htmlPreviewFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
    return baseFile({
      name: 'preview.html',
      path: 'preview.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Preview',
        entry: 'preview.html',
        renderer: 'html',
        exports: ['html'],
      },
      ...overrides,
    });
  }

  it('renders Annotation, Edit, and Draw as the primary preview tools', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    expect(screen.queryByTestId('palette-tweaks-toggle')).toBeNull();
    expect(screen.queryByTestId('inspect-mode-toggle')).toBeNull();
    expect(screen.getByTestId('board-mode-toggle')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More annotation tools' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Pick element' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Region' })).toBeNull();
    expect(screen.getByTestId('draw-overlay-toggle')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark' })).toBeTruthy();
    // Screenshot-to-clipboard is a primary preview tool: present in preview mode.
    expect(screen.getByTestId('screenshot-copy-button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Screenshot' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Add a note for this mark')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pods' })).toBeNull();

    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    expect(screen.getByPlaceholderText('Add a note for this mark')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Box select' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Click' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();

    clickAgentTool('draw-overlay-toggle');
    expect(screen.queryByPlaceholderText('Add a note for this mark')).toBeNull();
  });

  it('keeps preview viewport selection scoped to each HTML file', async () => {
    const firstFile = htmlPreviewFile({ name: 'first.html', path: 'first.html' });
    const secondFile = htmlPreviewFile({ name: 'second.html', path: 'second.html' });
    const { rerender } = render(
      <FileViewer
        projectId="viewport-scope-project"
        projectKind="prototype"
        file={firstFile}
        liveHtml='<html><body><main>First</main></body></html>'
      />,
    );

    const viewportButton = screen.getByRole('button', { name: 'Preview viewport' });
    expect(viewportButton.textContent).toContain('Desktop');
    fireEvent.click(viewportButton);
    fireEvent.click(screen.getByRole('option', { name: /tablet/i }));
    expect(screen.getByRole('button', { name: 'Preview viewport' }).textContent).toContain('Tablet');

    rerender(
      <FileViewer
        projectId="viewport-scope-project"
        projectKind="prototype"
        file={secondFile}
        liveHtml='<html><body><main>Second</main></body></html>'
      />,
    );

    expect((await screen.findByRole('button', { name: 'Preview viewport' })).textContent).toContain('Desktop');

    rerender(
      <FileViewer
        projectId="viewport-scope-project"
        projectKind="prototype"
        file={firstFile}
        liveHtml='<html><body><main>First</main></body></html>'
      />,
    );

    expect((await screen.findByRole('button', { name: 'Preview viewport' })).textContent).toContain('Tablet');
  });

  it('keeps the Draw bar open after queueing an annotation', () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    clickAgentTool('draw-overlay-toggle');
    const note = screen.getByPlaceholderText('Add a note for this mark');
    fireEvent.change(note, { target: { value: 'mark this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(screen.getByPlaceholderText('Add a note for this mark')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Click' })).toBeNull();

    clickAgentTool('draw-overlay-toggle');
    expect(screen.queryByPlaceholderText('Add a note for this mark')).toBeNull();
  });

  it('uses a materialized srcDoc bridge while the Draw bar is open', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).getAttribute('data-od-render-mode')).toBe('url-load');
    clickAgentTool('draw-overlay-toggle');

    const frame = await waitFor(() => {
      const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(activeFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      expect(activeFrame.srcdoc).toContain('data-od-selection-bridge');
      expect(activeFrame.srcdoc).toContain('data-od-snapshot-bridge');
      expect(activeFrame.srcdoc).not.toContain('data-od-lazy-srcdoc-transport');
      return activeFrame;
    });
    await waitFor(() => {
      expect(frame.srcdoc).toContain('data-od-id="hero"');
    });
    expect(screen.queryByRole('button', { name: 'Click' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect((screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).srcdoc).toBe(frame.srcdoc);
  });

  it('preserves URL-loaded preview scroll when opening Draw', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const urlFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(urlFrame.getAttribute('data-od-render-mode')).toBe('url-load');
    expect(urlFrame.getAttribute('src')).toContain('odPreviewBridge=scroll');

    const srcDocFrame = screen.getByTestId('artifact-preview-frame-srcdoc') as HTMLIFrameElement;
    const postSpy = vi.spyOn(srcDocFrame.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: urlFrame.contentWindow,
      data: {
        type: 'od:preview-scroll',
        frameLeft: 4,
        frameTop: 640,
        canvasLeft: 0,
        canvasTop: 640,
      },
    }));

    clickAgentTool('draw-overlay-toggle');

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'od:preview-scroll-restore',
          frameLeft: 4,
          frameTop: 640,
          canvasTop: 640,
        }),
        '*',
      );
    });
  });

  it('keeps the URL-loaded preview mounted when opening comments', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const urlFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const srcDocFrame = screen.getByTestId('artifact-preview-frame-srcdoc') as HTMLIFrameElement;
    const postSpy = vi.spyOn(urlFrame.contentWindow!, 'postMessage');
    expect(urlFrame.getAttribute('data-od-render-mode')).toBe('url-load');
    expect(urlFrame.getAttribute('src')).toContain('odPreviewBridge=selection');
    expect(srcDocFrame.getAttribute('data-od-active')).toBe('false');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: urlFrame.contentWindow,
        data: { type: 'od:url-selection-bridge-ready' },
      }));
    });

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('artifact-preview-frame')).toBe(urlFrame);
      expect(urlFrame.getAttribute('data-od-render-mode')).toBe('url-load');
      expect(urlFrame.getAttribute('data-od-active')).toBe('true');
      expect(srcDocFrame.getAttribute('data-od-active')).toBe('false');
      expect(postSpy).toHaveBeenCalledWith(
        { type: 'od:comment-mode', enabled: true, mode: 'inspect' },
        '*',
      );
    });
  });

  it('falls back to srcDoc comments when the URL selection bridge is not ready', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const urlFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(urlFrame.getAttribute('data-od-render-mode')).toBe('url-load');

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    const srcDocFrame = await waitFor(() => {
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(frame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      return frame;
    });
    expect(srcDocFrame.srcdoc).toContain('data-od-selection-bridge');
  });

  it('lets Draw direct send emit a queued annotation while a task is running', async () => {
    const annotationSpy = vi.fn();
    installCanvasSnapshotMocks();

    window.addEventListener(ANNOTATION_EVENT, annotationSpy);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        streaming
      />,
    );

    clickAgentTool('draw-overlay-toggle');
    const srcDocFrame = await waitFor(() => {
      const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(activeFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
      return activeFrame;
    });
    installPreviewSnapshotBridge(srcDocFrame);
    fireEvent.change(screen.getByPlaceholderText('Add a note for this mark'), {
      target: { value: 'mark this' },
    });

    // While a task is running the primary Send is disabled; Queue stays available
    // so the annotation is staged for the next turn rather than sent mid-run.
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const queue = screen.getByRole('button', { name: 'Queue' }) as HTMLButtonElement;
    expect(queue.disabled).toBe(false);

    fireEvent.click(send);
    expect(annotationSpy).not.toHaveBeenCalled();

    fireEvent.click(queue);

    await waitFor(() => expect(annotationSpy).toHaveBeenCalledTimes(1));
    expect(annotationSpy.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        action: 'queue',
        note: 'mark this',
        filePath: 'preview.html',
      },
    });
    expect(annotationSpy.mock.calls[0]?.[0].detail.file).toBeInstanceOf(File);
    window.removeEventListener(ANNOTATION_EVENT, annotationSpy);
  });

  it('hides non-open saved comments from preview markers when the side panel is empty', () => {
    const resolvedComment: PreviewComment = {
      id: 'comment-applying',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-applying',
      selector: '[data-od-pin="pin-applying"]',
      label: 'pin-applying',
      text: '',
      htmlHint: '',
      position: { x: 24, y: 32, width: 18, height: 18 },
      note: 'Already sent to Claude',
      status: 'applying',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[resolvedComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.queryByTestId('comment-saved-marker-pin-applying')).toBeNull();
    expect(screen.queryByText('Already sent to Claude')).toBeNull();
  });

  it('does not render the comments drawer over the preview while waiting for a configured dock portal', () => {
    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        commentPortalId="project-comments-dock"
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    expect(container.querySelector('.comment-preview-layer > .comment-side-panel')).toBeNull();
  });

  it('shows the open comment count beside the comments icon', () => {
    const openComment: PreviewComment = {
      id: 'comment-open',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-open',
      selector: '[data-od-pin="pin-open"]',
      label: 'pin-open',
      text: '',
      htmlHint: '',
      position: { x: 24, y: 32, width: 18, height: 18 },
      note: 'Open comment',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const otherFileComment: PreviewComment = {
      ...openComment,
      id: 'comment-other',
      filePath: 'other.html',
    };
    const resolvedComment: PreviewComment = {
      ...openComment,
      id: 'comment-resolved',
      status: 'applying',
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[openComment, otherFileComment, resolvedComment]}
      />,
    );

    const commentsButton = screen.getByTestId('comment-panel-toggle');
    expect(commentsButton.textContent).toContain('1');
    expect(commentsButton.getAttribute('aria-label')).toBe('Comments (1)');
    expect(
      screen.getByTestId('board-mode-toggle').compareDocumentPosition(screen.getByTestId('manual-edit-mode-toggle')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByTestId('manual-edit-mode-toggle').compareDocumentPosition(commentsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps comments and annotation picker mutually exclusive', () => {
    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
    expect(container.querySelector('.comment-preview-layer')?.className).not.toContain('comment-preview-layer-comments-open');
    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByTestId('comment-panel-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('board-mode-toggle').getAttribute('aria-pressed')).toBe('false');

    clickAgentTool('board-mode-toggle');

    expect(screen.queryByTestId('comment-side-panel')).toBeNull();
    expect(container.querySelector('.comment-preview-layer')?.className).not.toContain('comment-preview-layer-comments-open');
    expect(screen.getByTestId('comment-panel-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('board-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('inspect-empty-hint-container')).toBeNull();

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByTestId('comment-panel-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('board-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('inspect-empty-hint-container')).toBeNull();
  });

  it('keeps the picker hint inside the canvas and clear of the open comment side panel', () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    const canvas = screen.getByTestId('comment-preview-canvas');
    const dock = screen.getByTestId('comment-side-dock');

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(canvas.contains(screen.getByTestId('artifact-preview-frame'))).toBe(true);
    expect(dock.contains(screen.getByTestId('artifact-preview-frame'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /hide comments/i }));

    expect(screen.queryByTestId('comment-side-panel')).toBeNull();
    expect(screen.getByTestId('comment-side-collapsed-rail')).toBeTruthy();
    expect(canvas.contains(screen.getByTestId('artifact-preview-frame'))).toBe(true);
    expect(dock.contains(screen.getByTestId('artifact-preview-frame'))).toBe(false);
  });

  it('keeps non-docked tablet comment-tool previews fitted to the padded canvas', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
        if (this.classList.contains('viewer-body')) return testRect(0, 0, 900, 700);
        return testRect(0, 0, 0, 0);
      });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByLabelText('Preview viewport'));
    fireEvent.click(screen.getByRole('option', { name: 'Tablet' }));
    clickAgentTool('board-mode-toggle');

    const layout = screen.getByTestId('comment-preview-layout');
    await waitFor(() => {
      expect(layout.className).not.toContain('comment-preview-layer-with-side-dock');
      expect(Number(layout.style.getPropertyValue('--preview-scale'))).toBeCloseTo((700 - 48) / 1180);
    });
  });

  it('docks the comment side panel outside the clickable preview canvas', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
        if (this.classList.contains('viewer-body')) return testRect(0, 0, 900, 700);
        if (this.dataset.testid === 'comment-preview-canvas') return testRect(8, 8, 552, 684);
        if (this.dataset.testid === 'comment-side-dock') return testRect(572, 8, 320, 684);
        if (this.dataset.testid === 'comment-side-panel') return testRect(572, 8, 320, 684);
        return testRect(0, 0, 0, 0);
      });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    const canvas = screen.getByTestId('comment-preview-canvas');
    const dock = screen.getByTestId('comment-side-dock');
    const panel = screen.getByTestId('comment-side-panel');
    const canvasBox = canvas.getBoundingClientRect();
    const dockBox = dock.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();

    expect(canvas.contains(screen.getByTestId('artifact-preview-frame'))).toBe(true);
    expect(dock.contains(panel)).toBe(true);
    expect(canvas.contains(panel)).toBe(false);
    expect(screen.getByTestId('comment-preview-layout').className).toContain(
      'comment-preview-layer-with-side-dock',
    );
    expect(dockBox.left).toBeGreaterThanOrEqual(canvasBox.right);
    expect(panelBox.left).toBeGreaterThanOrEqual(canvasBox.right);
  });

  it('uses the narrow board layout when docking would leave too little canvas', async () => {
    const getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
        if (this.classList.contains('viewer-body')) return testRect(0, 0, 400, 700);
        return testRect(0, 0, 0, 0);
      });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('comment-preview-layout').className).toContain(
        'comment-preview-layer-side-dock-stacked',
      );
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it('keeps saved comment pins visible while adding another comment', async () => {
    const olderComment: PreviewComment = {
      id: 'comment-older',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-older',
      selector: '[data-od-pin="pin-older"]',
      label: 'pin-older',
      text: '',
      htmlHint: '',
      position: { x: 24, y: 32, width: 18, height: 18 },
      note: 'Older comment',
      status: 'open',
      createdAt: 10,
      updatedAt: 10,
    };
    const newerComment: PreviewComment = {
      ...olderComment,
      id: 'comment-newer',
      elementId: 'pin-newer',
      selector: '[data-od-pin="pin-newer"]',
      label: 'pin-newer',
      position: { x: 72, y: 32, width: 18, height: 18 },
      note: 'Newer comment',
      createdAt: 20,
      updatedAt: 20,
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[newerComment, olderComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByTestId('comment-saved-marker-pin-older').textContent).toBe('1');
    expect(screen.getByTestId('comment-saved-marker-pin-newer').textContent).toBe('2');

    clickAgentTool('board-mode-toggle');

    expect(screen.queryByTestId('comment-side-panel')).toBeNull();
    expect(screen.queryByTestId('comment-saved-marker-pin-newer')).toBeNull();
    expect(screen.queryByTestId('comment-saved-marker-pin-older')).toBeNull();

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        hoverPoint: { x: 12, y: 16 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    expect((await screen.findByTestId('comment-active-pin')).textContent).toBe('3');
    expect(screen.getByTestId('comment-saved-marker-pin-newer')).toBeTruthy();
    expect(screen.getByTestId('comment-saved-marker-pin-older')).toBeTruthy();

    fireEvent.click(screen.getByTestId('comment-saved-marker-pin-newer'));
    await waitFor(() => {
      const activeItem = document.querySelector('[data-comment-id="comment-newer"]');
      expect(activeItem?.className).toContain('active');
      expect(activeItem?.getAttribute('aria-current')).toBe('true');
    });
    expect(screen.getByTestId('comment-active-pin').textContent).toBe('2');
    expect(document.querySelector('[data-comment-id="comment-older"]')?.className).not.toContain('active');
  });

  it('orders side comments by creation time while keeping activity timestamps', () => {
    const createdFirstUpdatedLast: PreviewComment = {
      id: 'comment-updated-last',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'hero-title',
      selector: '[data-od-id="hero-title"]',
      label: 'Hero title',
      text: 'Hero',
      htmlHint: '<h1 data-od-id="hero-title">Hero</h1>',
      position: { x: 24, y: 32, width: 180, height: 36 },
      note: 'Latest edit',
      status: 'open',
      createdAt: Date.now() - 20 * 60_000,
      updatedAt: Date.now(),
    };
    const createdLastUpdatedFirst: PreviewComment = {
      ...createdFirstUpdatedLast,
      id: 'comment-created-last',
      elementId: 'hero-subtitle',
      selector: '[data-od-id="hero-subtitle"]',
      label: 'Hero subtitle',
      note: 'Older edit',
      createdAt: Date.now() - 5 * 60_000,
      updatedAt: Date.now() - 10 * 60_000,
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[createdLastUpdatedFirst, createdFirstUpdatedLast]}
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    const items = screen.getAllByTestId('comment-side-item');
    const [firstItem, secondItem] = items;
    expect(firstItem).toBeDefined();
    expect(secondItem).toBeDefined();
    expect(firstItem!.textContent).toContain('Latest edit');
    expect(firstItem!.textContent).toContain('just now');
    expect(secondItem!.textContent).toContain('Older edit');
  });

  it('does not preload non-open element comments into the picker composer', async () => {
    const applyingElementComment: PreviewComment = {
      id: 'comment-element-applying',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'Hero',
      text: 'Hero',
      htmlHint: '<main data-od-id="hero">Hero</main>',
      position: { x: 8, y: 12, width: 120, height: 48 },
      note: 'Do not resurrect this note',
      status: 'applying',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[applyingElementComment]}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.queryByText('Do not resurrect this note')).toBeNull();
  });

  it('does not preload open element comments when starting a new annotation', async () => {
    const openComment: PreviewComment = {
      id: 'comment-element-open',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'Hero',
      text: 'Hero',
      htmlHint: '<main data-od-id="hero">Hero</main>',
      position: { x: 8, y: 12, width: 120, height: 48 },
      note: 'Existing note should stay in the thread',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[openComment]}
        onRemovePreviewComment={vi.fn()}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    clickAgentTool('board-mode-toggle');

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    expect(screen.queryByText('Existing note should stay in the thread')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('shows saved image attachments when reopening a comment from the list', async () => {
    const openComment: PreviewComment = {
      id: 'comment-with-image',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-with-image',
      selector: '[data-od-pin="pin-with-image"]',
      label: 'pin-with-image',
      text: '',
      htmlHint: '',
      position: { x: 40, y: 52, width: 18, height: 18 },
      note: 'Use this screenshot',
      attachments: [{ path: 'uploads/ref-a.png', name: 'ref-a.png' }],
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[openComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
    const sideImageLink = await screen.findByTestId('comment-side-attachment');
    expect(sideImageLink.getAttribute('href')).toBe('/api/projects/project-1/raw/uploads/ref-a.png');
    expect(sideImageLink.querySelector('img')?.getAttribute('src')).toBe('/api/projects/project-1/raw/uploads/ref-a.png');

    fireEvent.click(screen.getByText('Use this screenshot').closest('[data-testid="comment-side-item"]')!);

    const imageLink = await screen.findByTestId('comment-popover-existing-image');
    expect(imageLink.getAttribute('href')).toBe('/api/projects/project-1/raw/uploads/ref-a.png');
    expect(imageLink.querySelector('img')?.getAttribute('src')).toBe('/api/projects/project-1/raw/uploads/ref-a.png');
  });

  it('keeps the comment composer focused on the note after picking an element', async () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'p',
        text: 'Hero',
        position: { x: 8, y: 12, width: 312, height: 63 },
        htmlHint: '<p data-od-id="hero">Hero</p>',
        style: {
          color: 'rgb(26, 25, 22)',
          fontSize: '13.5px',
          fontFamily: 'Inter, "PingFang SC", sans-serif',
          lineHeight: '20px',
        },
      },
    }));

    expect(await screen.findByTestId('comment-popover-input')).toBeTruthy();
    expect(screen.queryByTestId('annotation-style-summary')).toBeNull();
  });

  it('switches to the comment panel after saving an annotation comment', async () => {
    function Harness() {
      const [comments, setComments] = useState<PreviewComment[]>([]);
      return (
        <FileViewer
          projectId="project-1"
          projectKind="prototype"
          file={htmlPreviewFile()}
          liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
          previewComments={comments}
          onSavePreviewComment={async (target, note) => {
            const saved: PreviewComment = {
              id: 'comment-saved',
              projectId: 'project-1',
              conversationId: 'conversation-1',
              filePath: target.filePath,
              elementId: target.elementId,
              selector: target.selector,
              label: target.label,
              text: target.text,
              htmlHint: target.htmlHint,
              position: target.position,
              style: target.style,
              selectionKind: target.selectionKind,
              memberCount: target.memberCount,
              podMembers: target.podMembers,
              note,
              status: 'open',
              createdAt: 20,
              updatedAt: 20,
            };
            setComments([saved]);
            return saved;
          }}
        />
      );
    }

    render(<Harness />);

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input');
    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    fireEvent.change(input, { target: { value: '加大字号' } });
    fireEvent.click(screen.getByTestId('comment-popover-save'));

    await waitFor(() => expect(screen.queryByTestId('comment-popover')).toBeNull());
    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByTestId('comment-panel-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('加大字号')).toBeTruthy();
    const activeItem = document.querySelector('[data-comment-id="comment-saved"]');
    expect(activeItem?.className).toContain('active');
    expect(activeItem?.getAttribute('aria-current')).toBe('true');
  });

  it('keeps saved marker numbers stable after saving another comment', async () => {
    const olderComment: PreviewComment = {
      id: 'comment-older',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-older',
      selector: '[data-od-pin="pin-older"]',
      label: 'pin-older',
      text: '',
      htmlHint: '',
      position: { x: 24, y: 32, width: 18, height: 18 },
      note: 'Older comment',
      status: 'open',
      createdAt: 10,
      updatedAt: 10,
    };
    const newerComment: PreviewComment = {
      ...olderComment,
      id: 'comment-newer',
      elementId: 'pin-newer',
      selector: '[data-od-pin="pin-newer"]',
      label: 'pin-newer',
      position: { x: 72, y: 32, width: 18, height: 18 },
      note: 'Newer comment',
      createdAt: 20,
      updatedAt: 20,
    };

    function Harness() {
      const [comments, setComments] = useState<PreviewComment[]>([olderComment, newerComment]);
      return (
        <FileViewer
          projectId="project-1"
          projectKind="prototype"
          file={htmlPreviewFile()}
          liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
          previewComments={comments}
          onSavePreviewComment={async (target, note) => {
            const saved: PreviewComment = {
              id: 'comment-third',
              projectId: 'project-1',
              conversationId: 'conversation-1',
              filePath: target.filePath,
              elementId: target.elementId,
              selector: target.selector,
              label: target.label,
              text: target.text,
              htmlHint: target.htmlHint,
              position: target.position,
              style: target.style,
              selectionKind: target.selectionKind,
              memberCount: target.memberCount,
              podMembers: target.podMembers,
              note,
              status: 'open',
              createdAt: 5,
              updatedAt: 30,
            };
            setComments((current) => [saved, ...current]);
            return saved;
          }}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    expect(screen.getByTestId('comment-saved-marker-pin-older').textContent).toBe('1');
    expect(screen.getByTestId('comment-saved-marker-pin-newer').textContent).toBe('2');

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        hoverPoint: { x: 12, y: 16 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input');
    fireEvent.change(input, { target: { value: 'Third comment' } });
    fireEvent.click(screen.getByTestId('comment-popover-save'));

    await waitFor(() => {
      expect(screen.getByTestId('comment-saved-marker-pin-older').textContent).toBe('1');
      expect(screen.getByTestId('comment-saved-marker-pin-newer').textContent).toBe('2');
      expect(screen.getByTestId('comment-saved-marker-hero').textContent).toBe('3');
    });
  });

  it('lets element comments queue to chat while a task is running', async () => {
    const onSendBoardCommentAttachments = vi.fn().mockResolvedValue(undefined);
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        streaming
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('board-mode-toggle'));
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input');
    fireEvent.change(input, { target: { value: '加大字号' } });
    const send = screen.getByTestId('comment-add-send') as HTMLButtonElement;
    expect(send.disabled).toBe(false);

    fireEvent.click(send);

    await waitFor(() => expect(onSendBoardCommentAttachments).toHaveBeenCalledTimes(1));
    expect(onSendBoardCommentAttachments.mock.calls[0]?.[0]?.[0]).toMatchObject({
      filePath: 'preview.html',
      elementId: 'hero',
      comment: '加大字号',
      source: 'board-batch',
    });
    await waitFor(() => expect(screen.queryByTestId('comment-popover')).toBeNull());
  });

  it('keeps the comment draft when chat queueing declines the send', async () => {
    const onSendBoardCommentAttachments = vi.fn().mockResolvedValue(false);
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('board-mode-toggle'));
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '保留这个评论' } });
    fireEvent.click(screen.getByTestId('comment-add-send'));

    await waitFor(() => expect(onSendBoardCommentAttachments).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('comment-popover')).toBeTruthy();
    expect((screen.getByTestId('comment-popover-input') as HTMLTextAreaElement).value)
      .toBe('保留这个评论');
  });

  it('returns to element picking from the Comment button while another annotation tool is active', async () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    clickAgentTool('draw-overlay-toggle');
    expect(screen.getByTestId('draw-overlay-toggle').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));

    expect(screen.queryByRole('menuitem', { name: 'Pick element' })).toBeNull();
    expect(screen.getByTestId('board-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('comment-panel-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens annotation parameters and comments on click only', async () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    clickAgentTool('board-mode-toggle');

    const target = {
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'p',
      text: 'Hero',
      position: { x: 8, y: 12, width: 312, height: 63 },
      hoverPoint: { x: 200, y: 100 },
      htmlHint: '<p data-od-id="hero">Hero</p>',
      style: {
        color: 'rgb(26, 25, 22)',
        fontSize: '13.5px',
        fontFamily: 'Inter, "PingFang SC", sans-serif',
      },
    };

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { ...target, type: 'od:comment-hover' },
    }));

    expect(screen.queryByTestId('annotation-hover-style-summary')).toBeNull();
    expect(screen.queryByTestId('annotation-hover-popover')).toBeNull();
    expect(screen.queryByTestId('inspect-panel')).toBeNull();
    expect(await screen.findByTestId('comment-target-overlay')).toBeTruthy();
    expect(screen.queryByTestId('comment-popover-input')).toBeNull();

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { ...target, type: 'od:comment-target' },
    }));

    const summary = await screen.findByTestId('comment-popover-style-summary');
    expect(summary.textContent).toContain('Color');
    expect(summary.textContent).toContain('#1A1916');
    expect(summary.textContent).toContain('13.5px');
    expect(await screen.findByTestId('comment-popover-input')).toBeTruthy();
    expect(screen.getByTestId('comment-target-overlay')).toBeTruthy();
    expect(screen.getByTestId('comment-panel-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('board-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('inspect-panel')).toBeNull();
    await waitFor(() => {
      expect(screen.queryByTestId('annotation-hover-popover')).toBeNull();
    });
  });

  it('keeps the hover card mounted when the pointer moves onto it (no flicker)', async () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    clickAgentTool('board-mode-toggle');

    const target = {
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'p',
      text: 'Hero',
      position: { x: 8, y: 12, width: 312, height: 63 },
      hoverPoint: { x: 200, y: 100 },
      htmlHint: '<p data-od-id="hero">Hero</p>',
      style: { color: 'rgb(26, 25, 22)', fontSize: '13.5px' },
    };

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { ...target, type: 'od:comment-hover' },
    }));

    const card = await screen.findByTestId('annotation-hover-popover');

    // Pointer crosses from the element onto the floating card. The iframe sees
    // that as a mouseout and posts od:comment-leave; the card's own mouseenter
    // fires first and pins it, so the leave must be ignored and the card stays.
    fireEvent.mouseEnter(card);
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od:comment-leave' },
    }));

    // Give React a chance to (wrongly) unmount before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('annotation-hover-popover')).not.toBeNull();

    // Leaving the card itself dismisses it.
    fireEvent.mouseLeave(card);
    await waitFor(() => {
      expect(screen.queryByTestId('annotation-hover-popover')).toBeNull();
    });
  });

  it('ignores an occlusion leave that arrives before the card pins (no entry flicker)', async () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    clickAgentTool('board-mode-toggle');

    const target = {
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'p',
      text: 'Hero',
      position: { x: 8, y: 12, width: 312, height: 63 },
      hoverPoint: { x: 200, y: 100 },
      htmlHint: '<p data-od-id="hero">Hero</p>',
      style: { color: 'rgb(26, 25, 22)', fontSize: '13.5px' },
    };

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { ...target, type: 'od:comment-hover' },
    }));

    const card = await screen.findByTestId('annotation-hover-popover');

    // Real-world ordering the synchronous teardown got wrong: the iframe's async
    // od:comment-leave lands BEFORE the card's mouseenter has had a chance to pin
    // it. The dismiss must be deferred so the imminent mouseenter cancels it —
    // otherwise the card tears down for a frame and flickers on the way in.
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od:comment-leave' },
    }));
    fireEvent.mouseEnter(card);

    await new Promise((resolve) => setTimeout(resolve, 140));
    expect(screen.queryByTestId('annotation-hover-popover')).not.toBeNull();
  });

  it('keeps the card when the pointer moves from it back onto the element', async () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    clickAgentTool('board-mode-toggle');

    const target = {
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'p',
      text: 'Hero',
      position: { x: 8, y: 12, width: 312, height: 63 },
      hoverPoint: { x: 200, y: 100 },
      htmlHint: '<p data-od-id="hero">Hero</p>',
      style: { color: 'rgb(26, 25, 22)', fontSize: '13.5px' },
    };

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { ...target, type: 'od:comment-hover' },
    }));

    const card = await screen.findByTestId('annotation-hover-popover');
    fireEvent.mouseEnter(card);

    // Pointer leaves the card heading back onto the element it overlaps. The
    // card must NOT tear down synchronously on its own mouseleave — clearing
    // here is what made the card vanish while the pointer was still over the
    // element (the iframe does not always re-emit a hover to bring it back).
    fireEvent.mouseLeave(card);
    expect(screen.queryByTestId('annotation-hover-popover')).not.toBeNull();

    // A re-hover (pointer landed back on the element) cancels the pending
    // dismiss, so the card stays put rather than blinking out.
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { ...target, type: 'od:comment-hover' },
    }));

    await new Promise((resolve) => setTimeout(resolve, 140));
    expect(screen.queryByTestId('annotation-hover-popover')).not.toBeNull();
  });

  it('closes an open saved-comment composer when that comment leaves the open state', async () => {
    const openComment: PreviewComment = {
      id: 'comment-status-transition',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-transition',
      selector: '[data-od-pin="pin-transition"]',
      label: 'pin-transition',
      text: '',
      htmlHint: '',
      position: { x: 40, y: 52, width: 18, height: 18 },
      note: 'Do not recreate this stale comment',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[openComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Open comment for pin-transition' }));

    expect((await screen.findByTestId('comment-popover-input') as HTMLTextAreaElement).value)
      .toBe('Do not recreate this stale comment');

    rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[{ ...openComment, status: 'applying' }]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('comment-popover-input')).toBeNull();
    });
    expect(screen.queryByTestId('comment-saved-marker-pin-transition')).toBeNull();
    expect(screen.queryByText('Do not recreate this stale comment')).toBeNull();
  });

  it('moves focus between comment side panel toggles when collapsing and expanding without a pre-focused click target', async () => {
    const onCollapseChange = vi.fn();
    const onSelectAll = vi.fn();
    const onReply = vi.fn();

    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <CommentSidePanel
          comments={[
            {
              id: 'comment-1',
              projectId: 'project-1',
              conversationId: 'conversation-1',
              filePath: 'preview.html',
              elementId: 'button.sso-btn',
              selector: '[data-od-id="button.sso-btn"]',
              label: 'button.sso-btn',
              text: 'GitHub',
              htmlHint: '<button>GitHub</button>',
              position: { x: 16, y: 24, width: 160, height: 48 },
              note: '不要github，换成微信',
              status: 'open',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ]}
          selectedIds={new Set(['comment-1'])}
          activeCommentId={null}
          collapsed={collapsed}
          onCollapsedChange={(next) => {
            onCollapseChange(next);
            setCollapsed(next);
          }}
          onToggleSelect={() => {}}
          onSelectAll={onSelectAll}
          onClearSelection={() => {}}
          onReply={onReply}
          onSendSelected={() => {}}
          sending={false}
          t={t}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByText('不要github，换成微信')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select all' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    fireEvent.click(screen.getByText('不要github，换成微信').closest('[data-testid="comment-side-item"]')!);
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'comment-1' }));

    const hideComments = screen.getByRole('button', { name: /hide comments/i });

    fireEvent.click(hideComments);

    expect(onCollapseChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText('不要github，换成微信')).toBeNull();
    expect(screen.queryByTestId('comment-side-selectbar')).toBeNull();
    const showComments = screen.getByTestId('comment-side-collapsed-rail');
    await waitFor(() => expect(document.activeElement).toBe(showComments));

    fireEvent.click(showComments);

    expect(onCollapseChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /hide comments/i }));
    });
  });

  it('announces comment side dock disclosure state without pointing at an unmounted panel', () => {
    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <CommentSidePanel
          comments={[]}
          selectedIds={new Set()}
          activeCommentId={null}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          onToggleSelect={() => {}}
          onSelectAll={() => {}}
          onClearSelection={() => {}}
          onReply={() => {}}
          onSendSelected={() => {}}
          sending={false}
          t={t}
        />
      );
    }

    render(<Harness />);

    const panel = screen.getByTestId('comment-side-panel');
    const hideComments = screen.getByRole('button', { name: /hide comments/i });
    const panelId = panel.id;

    expect(panelId).toBeTruthy();
    expect(hideComments.getAttribute('aria-controls')).toBe(panelId);
    expect(hideComments.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(hideComments);

    const showComments = screen.getByTestId('comment-side-collapsed-rail');
    expect(screen.queryByTestId('comment-side-panel')).toBeNull();
    expect(document.getElementById(panelId)).toBeNull();
    expect(showComments.getAttribute('aria-controls')).toBeNull();
    expect(showComments.getAttribute('aria-expanded')).toBe('false');
  });

  it('lets the inspect panel shrink inside narrow preview layouts', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/viewer/core.css'), 'utf8');
    const rule = css.match(/\.inspect-panel\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rule).toContain('width: min(296px, calc(100% - 28px));');
  });

  it('reorders saved comments with the drag handle for send sequence', () => {
    const onReorder = vi.fn();
    const comments: PreviewComment[] = [
      {
        id: 'comment-1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        filePath: 'preview.html',
        elementId: 'first',
        selector: '[data-od-id="first"]',
        label: 'First',
        text: 'First',
        htmlHint: '<p>First</p>',
        position: { x: 0, y: 0, width: 100, height: 30 },
        note: 'First task',
        status: 'open',
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'comment-2',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        filePath: 'preview.html',
        elementId: 'second',
        selector: '[data-od-id="second"]',
        label: 'Second',
        text: 'Second',
        htmlHint: '<p>Second</p>',
        position: { x: 0, y: 40, width: 100, height: 30 },
        note: 'Second task',
        status: 'open',
        createdAt: 20,
        updatedAt: 20,
      },
    ];

    render(
      <CommentSidePanel
        comments={comments}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReorder={onReorder}
        onReply={() => {}}
        onSendSelected={() => {}}
        sending={false}
        t={t}
      />,
    );

    const items = screen.getAllByTestId('comment-side-item');
    items[0]!.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 40,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    }));
    const dataTransfer = createDragDataTransfer();
    fireEvent.dragStart(screen.getAllByLabelText('chat.queuedReorder')[1]!, { dataTransfer });
    fireDragEventWithClientY('dragOver', items[0]!, { dataTransfer, clientY: 0 });
    fireDragEventWithClientY('drop', items[0]!, { dataTransfer, clientY: 0 });

    expect(onReorder).toHaveBeenCalledWith(['comment-2', 'comment-1']);
  });

  it('appends a newly saved comment to the current visible comment order', () => {
    expect(
      appendSavedPreviewCommentOrder(
        [],
        [{ id: 'comment-1' }, { id: 'comment-2' }],
        'comment-3',
      ),
    ).toEqual(['comment-1', 'comment-2', 'comment-3']);

    expect(
      appendSavedPreviewCommentOrder(
        ['comment-2', 'comment-1'],
        [{ id: 'comment-1' }, { id: 'comment-2' }],
        'comment-3',
      ),
    ).toEqual(['comment-2', 'comment-1', 'comment-3']);

    expect(
      appendSavedPreviewCommentOrder(
        ['comment-1', 'comment-2'],
        [{ id: 'comment-1' }, { id: 'comment-2' }],
        'comment-2',
      ),
    ).toEqual(['comment-1', 'comment-2']);
  });

  it('does not classify text labels containing a standalone article as links', () => {
    const comment: PreviewComment = {
      id: 'comment-plain-text',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'copy-1',
      selector: '[data-od-id="copy-1"]',
      label: 'Turn a brand brief into an editorial collage system.',
      text: 'Turn a brand brief into an editorial collage system.',
      htmlHint: '<p data-od-id="copy-1">',
      position: { x: 16, y: 24, width: 320, height: 48 },
      note: 'Make this copy tighter.',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <CommentSidePanel
        comments={[comment]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReply={() => {}}
        onSendSelected={() => {}}
        sending={false}
        t={t}
      />,
    );

    expect(screen.getByText('1. Text')).toBeTruthy();
    expect(screen.queryByText('Link')).toBeNull();
  });

  it('clears the comment selection without deleting when clear is clicked', async () => {
    const removed: string[] = [];

    function Harness() {
      const [comments, setComments] = useState<PreviewComment[]>([
        {
          id: 'comment-1',
          projectId: 'project-1',
          conversationId: 'conversation-1',
          filePath: 'preview.html',
          elementId: 'pin-1',
          selector: '[data-od-pin="pin-1"]',
          label: 'pin-1',
          text: '',
          htmlHint: '',
          position: { x: 16, y: 20, width: 18, height: 18 },
          note: 'First',
          status: 'open',
          createdAt: 10,
          updatedAt: 10,
        },
        {
          id: 'comment-2',
          projectId: 'project-1',
          conversationId: 'conversation-1',
          filePath: 'preview.html',
          elementId: 'pin-2',
          selector: '[data-od-pin="pin-2"]',
          label: 'pin-2',
          text: '',
          htmlHint: '',
          position: { x: 48, y: 20, width: 18, height: 18 },
          note: 'Second',
          status: 'open',
          createdAt: 20,
          updatedAt: 20,
        },
      ]);

      return (
        <FileViewer
          projectId="project-1"
          projectKind="prototype"
          file={htmlPreviewFile()}
          liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
          previewComments={comments}
          onRemovePreviewComment={async (commentId) => {
            removed.push(commentId);
            setComments((current) => current.filter((comment) => comment.id !== commentId));
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
    const selectButtons = screen.getAllByRole('button', { name: /select/i });
    const firstSelectButton = selectButtons[0];
    expect(firstSelectButton).toBeTruthy();
    if (!firstSelectButton) return;
    fireEvent.click(firstSelectButton);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    // Per #3081, Clear deselects rather than batch-deleting: the comments stay
    // and removal stays wired to per-comment delete / send-selected instead.
    expect(screen.queryByText('Second')).not.toBeNull();
    expect(removed).toEqual([]);
  });
});

describe('applyInspectOverridesToSource', () => {
  const base = `<!doctype html><html><head><title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
  const css = `[data-od-id="hero"] { color: #ff0000 !important }`;

  it('inserts the overrides block before </head>', () => {
    const next = applyInspectOverridesToSource(base, css);
    expect(next).toContain('<style data-od-inspect-overrides>');
    expect(next).toContain('color: #ff0000');
    expect(next.indexOf('<style data-od-inspect-overrides>')).toBeLessThan(next.indexOf('</head>'));
  });

  it('replaces an existing overrides block instead of duplicating', () => {
    const once = applyInspectOverridesToSource(base, css);
    const twice = applyInspectOverridesToSource(once, `[data-od-id="hero"] { color: #00ff00 !important }`);
    const matches = twice.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(twice).toContain('color: #00ff00');
    expect(twice).not.toContain('color: #ff0000');
  });

  it('strips the overrides block when called with empty css', () => {
    const once = applyInspectOverridesToSource(base, css);
    const stripped = applyInspectOverridesToSource(once, '');
    expect(stripped).not.toContain('data-od-inspect-overrides');
  });

  it('handles fragments without an explicit <head>', () => {
    const next = applyInspectOverridesToSource('<main data-od-id="x">x</main>', css);
    expect(next).toContain('<style data-od-inspect-overrides>');
    expect(next.indexOf('<style data-od-inspect-overrides>')).toBeLessThan(next.indexOf('<main'));
  });

  // Regression for nexu-io/open-design#362: if a source file has more than
  // one inspect override block (manual edit, or an earlier buggy save), the
  // splicer must drop them all before inserting the new block. A non-global
  // regex would only strip the first, so save-then-reload could resurrect an
  // override the user just cleared.
  it('removes every existing overrides block, not just the first', () => {
    const dup = `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides>[data-od-id="hero"] { color: #ff0000 !important }</style>` +
      `<style data-od-inspect-overrides>[data-od-id="hero"] { color: #00ff00 !important }</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const replaced = applyInspectOverridesToSource(dup, `[data-od-id="hero"] { color: #0000ff !important }`);
    const matches = replaced.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(replaced).toContain('color: #0000ff');
    expect(replaced).not.toContain('color: #ff0000');
    expect(replaced).not.toContain('color: #00ff00');

    const cleared = applyInspectOverridesToSource(dup, '');
    expect(cleared).not.toContain('data-od-inspect-overrides');
  });

  // Regression for nexu-io/open-design#362: the splicer must be HTML-aware
  // when locating its own override block and the head insertion point.
  // Generated artifacts commonly carry inline scripts/styles that mention
  // `</head>` or `<style data-od-inspect-overrides>` as text, e.g. a
  // template literal that builds HTML at runtime or a CSS rule that
  // documents the override block. A regex-only splicer would happily
  // splice into the middle of the script body or strip the literal string,
  // corrupting user code on Save to source.
  it('ignores </head> literals inside inline <script> and <style>', () => {
    const sourceWithLiteral =
      `<!doctype html><html><head>` +
      // Script body contains a quoted "</head>" string that must NOT be
      // treated as the real head close.
      `<script>const tpl = "<head>\\n</head>";</script>` +
      `<style>/* sentinel: </head> appears in this CSS comment */</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithLiteral, css);
    // The override block must land exactly once, before the real </head>,
    // and after the inline <script> and <style> that contain `</head>`
    // text. Without HTML-aware scanning the regex would splice before the
    // first textual `</head>`, which sits inside the script body.
    const blockIdx = next.indexOf('<style data-od-inspect-overrides>');
    const realHeadEndIdx = next.indexOf('</head>', next.indexOf('<title>'));
    const scriptOpenIdx = next.indexOf('<script>');
    const scriptCloseIdx = next.indexOf('</script>');
    expect(blockIdx).toBeGreaterThan(-1);
    expect(realHeadEndIdx).toBeGreaterThan(-1);
    expect(scriptOpenIdx).toBeGreaterThan(-1);
    expect(scriptCloseIdx).toBeGreaterThan(-1);
    // Override block sits BEFORE the real </head>, AFTER the script body.
    expect(blockIdx).toBeLessThan(realHeadEndIdx);
    expect(blockIdx).toBeGreaterThan(scriptCloseIdx);
    // The script's `</head>` literal still survives in the output —
    // the splicer must not have hijacked it as the head insertion point.
    expect(next).toContain('const tpl = "<head>\\n</head>";');
    // The CSS comment's `</head>` token also survives untouched.
    expect(next).toContain('/* sentinel: </head> appears in this CSS comment */');
    // Only one override block in total.
    const blockMatches = next.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(blockMatches).toHaveLength(1);
  });

  it('ignores `<style data-od-inspect-overrides>` literals inside <script>', () => {
    // A sentinel string literal in an inline script that mentions the
    // override block by name. A regex-only splicer would strip the
    // literal as if it were a real block, mangling the script.
    const sourceWithLiteral =
      `<!doctype html><html><head>` +
      `<script>const banner = "<style data-od-inspect-overrides>color: red</style>";</script>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithLiteral, css);
    // The literal must survive verbatim inside the script body.
    expect(next).toContain('const banner = "<style data-od-inspect-overrides>color: red</style>";');
    // The output still gains exactly one real override block.
    const blockMatches = next.match(/<style data-od-inspect-overrides>\n\[data-od-id="hero"\]/g) ?? [];
    expect(blockMatches).toHaveLength(1);
    // Stripping with empty css must NOT touch the script literal.
    const stripped = applyInspectOverridesToSource(sourceWithLiteral, '');
    expect(stripped).toContain('const banner = "<style data-od-inspect-overrides>color: red</style>";');
    // The script-internal literal is the only mention of the marker after
    // stripping — the splicer must not have inserted or kept any real
    // override block.
    const allMatches = stripped.match(/data-od-inspect-overrides/g) ?? [];
    expect(allMatches).toHaveLength(1);
  });

  // Regression for nexu-io/open-design#362: the splicer must look at real
  // attribute names, not just substring-match the marker text against the
  // whole opening tag. A `\bdata-od-inspect-overrides\b` regex over the
  // full tag matches both a longer attribute name (`-note` suffix) and the
  // marker spelled inside another attribute's value, so a plain `<style>`
  // documenting the override block in a `title` tooltip or a sibling note
  // attribute would be mis-stripped on save and would have its inner CSS
  // mis-parsed as override rules on hydration.
  it('does not strip <style> blocks whose attribute name only PREFIXES the marker', () => {
    const css2 = `[data-od-id="hero"] { color: #00ffaa !important }`;
    const userBlock = `body { background: red !important }`;
    const sourceWithLongerName =
      `<!doctype html><html><head>` +
      // attribute is named data-od-inspect-overrides-note, NOT the marker.
      // The note shouldn't be treated as an Inspect-owned style block.
      `<style data-od-inspect-overrides-note="docs">${userBlock}</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithLongerName, css2);
    // The user's style with the longer attribute name must survive in the
    // output verbatim (with both the attribute and the body intact).
    expect(next).toContain('<style data-od-inspect-overrides-note="docs">');
    expect(next).toContain(userBlock);
    // Exactly one real override block lands before </head>.
    const blockMatches = next.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(blockMatches).toHaveLength(1);
    // Stripping with empty CSS still leaves the user's longer-name block
    // alone — there was no real override block to remove.
    const stripped = applyInspectOverridesToSource(sourceWithLongerName, '');
    expect(stripped).toContain('<style data-od-inspect-overrides-note="docs">');
    expect(stripped).toContain(userBlock);
    expect(stripped).not.toContain('<style data-od-inspect-overrides>');
  });

  it('does not strip <style> blocks that only mention the marker inside an attribute value', () => {
    const css2 = `[data-od-id="hero"] { color: #00ffaa !important }`;
    const userBlock = `body { background: red !important }`;
    const sourceWithMarkerInValue =
      `<!doctype html><html><head>` +
      // The literal text data-od-inspect-overrides appears as an attribute
      // VALUE on a normal <style title="..."> — there is no real override
      // marker here, so the splicer must keep the block.
      `<style title="data-od-inspect-overrides">${userBlock}</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithMarkerInValue, css2);
    expect(next).toContain('<style title="data-od-inspect-overrides">');
    expect(next).toContain(userBlock);
    const blockMatches = next.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(blockMatches).toHaveLength(1);
    const stripped = applyInspectOverridesToSource(sourceWithMarkerInValue, '');
    expect(stripped).toContain('<style title="data-od-inspect-overrides">');
    expect(stripped).toContain(userBlock);
    expect(stripped).not.toContain('<style data-od-inspect-overrides>');
  });

  it('still strips a real <style data-od-inspect-overrides> block with assigned value', () => {
    // The marker is allowed both as a boolean attribute and with an
    // assigned value (`<style data-od-inspect-overrides="">`). The splicer
    // must treat both as the override block, not just the boolean shape.
    const sourceWithValuedMarker =
      `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides="">` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style>` +
      `<title>X</title></head><body></body></html>`;
    const stripped = applyInspectOverridesToSource(sourceWithValuedMarker, '');
    expect(stripped).not.toContain('data-od-inspect-overrides');
    expect(stripped).not.toContain('color: #ff0000');
  });

  it('ignores </head> inside <textarea> and <title> raw-text elements', () => {
    // <textarea> and <title> are escapable raw-text elements; their
    // contents are text, not markup, so a literal `</head>` inside them
    // must not be treated as a tag boundary.
    const sourceWithTextarea =
      `<!doctype html><html><head><title>Has </head> in title</title></head>` +
      `<body><textarea>literal </head> goes here</textarea>` +
      `<main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithTextarea, css);
    // Override block lands before the REAL </head>, which is after the
    // </title>'s close. The title-internal `</head>` must not be the
    // chosen insertion point.
    const blockIdx = next.indexOf('<style data-od-inspect-overrides>');
    const titleCloseIdx = next.indexOf('</title>');
    const realHeadCloseIdx = next.indexOf('</head>', titleCloseIdx);
    expect(blockIdx).toBeGreaterThan(titleCloseIdx);
    expect(blockIdx).toBeLessThan(realHeadCloseIdx);
    // Both literals survive untouched.
    expect(next).toContain('Has </head> in title');
    expect(next).toContain('literal </head> goes here');
  });
});

describe('serializeInspectOverrides', () => {
  it('emits validated declarations for legitimate overrides', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-od-id="hero"]', props: { color: '#ff0000', 'font-size': '18px' } },
    });
    expect(out).toContain('[data-od-id="hero"]');
    expect(out).toContain('color: #ff0000 !important');
    expect(out).toContain('font-size: 18px !important');
  });

  it('honours data-screen-label entries the bridge tagged that way', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-screen-label="hero"]', props: { color: '#0f0' } },
    });
    expect(out).toContain('[data-screen-label="hero"]');
    expect(out).not.toContain('[data-od-id="hero"]');
  });

  // Regression for nexu-io/open-design#362: standard deck slides ship as
  // `<section data-screen-label="01 Cover">`. The bridge keys overrides by
  // the raw label and posts a CSS.escape'd selector, so the host must
  // accept whitespace/leading-digit ids and detect the selector kind by
  // prefix instead of full equality. Otherwise the override is dropped
  // outright (or silently rewritten to `[data-od-id="..."]`) and reload
  // erases the user's edit.
  it('preserves data-screen-label values with whitespace and leading digits', () => {
    const out = serializeInspectOverrides({
      '01 Cover': {
        selector: '[data-screen-label="\\30 1\\20 Cover"]',
        props: { color: '#ff0000', 'font-size': '20px' },
      },
    });
    expect(out).toContain('[data-screen-label="01 Cover"]');
    expect(out).not.toContain('[data-od-id="01 Cover"]');
    expect(out).toContain('color: #ff0000 !important');
    expect(out).toContain('font-size: 20px !important');
  });

  it('rejects non-allow-listed properties', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-od-id="hero"]', props: { position: 'absolute', color: '#fff' } },
    });
    expect(out).not.toContain('position');
    expect(out).toContain('color: #fff !important');
  });

  it('drops values that try to break out of a `prop: value` declaration', () => {
    const out = serializeInspectOverrides({
      hero: {
        selector: '[data-od-id="hero"]',
        // semicolon, brace, angle bracket, and newline are all rejected.
        props: {
          color: 'red; background: url(x)',
          'font-size': '16px } [body] { color: red',
          'font-family': 'Arial</style><script>alert(1)</script>',
          'line-height': '1\n.evil',
        },
      },
    });
    expect(out).toBe('');
  });

  // The vulnerability we're regression-testing: artifact code rendered with
  // scripts enabled can call window.parent.postMessage({ type:
  // 'od:inspect-overrides', overrides, css: '</style><script>...</script>' })
  // — ev.source still matches iframe.contentWindow, so the host listener
  // accepts it. The fix is that the host re-derives CSS from the structured
  // `overrides` field under its own allow-list and ignores the inbound `css`
  // entirely. This test covers that the serializer never lets a forged
  // payload reach the persisted style block.
  it('refuses to surface a forged </style><script> payload', () => {
    const forged = {
      // Hostile selector string: re-derived from elementId, never trusted.
      hero: {
        selector: '} </style><script>alert(1)</script><style>{',
        props: { color: '#fff' },
      },
      // Hostile elementId: rejected outright by the safe-id check.
      '"></style><script>alert(2)</script>': {
        selector: '[data-od-id="x"]',
        props: { color: '#fff' },
      },
      // Hostile value: rejected by UNSAFE_VALUE.
      villain: {
        selector: '[data-od-id="villain"]',
        props: { color: '</style><script>alert(3)</script>' },
      },
    };
    const out = serializeInspectOverrides(forged);
    expect(out).not.toContain('</style>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(');
    // The legitimate-looking entry still serializes — but with a re-derived
    // selector, not the attacker-supplied one.
    expect(out).toContain('[data-od-id="hero"] { color: #fff !important }');
    expect(out).not.toContain('villain');

    // And the spliced source must not contain executable markup either,
    // even when the forged body is concatenated into a <style> block.
    const spliced = applyInspectOverridesToSource(
      '<!doctype html><html><head></head><body></body></html>',
      out,
    );
    expect(spliced).not.toContain('</style><script>');
    expect(spliced).not.toContain('alert(');
  });

  it('returns empty string for non-object payloads', () => {
    expect(serializeInspectOverrides(null)).toBe('');
    expect(serializeInspectOverrides(undefined)).toBe('');
    expect(serializeInspectOverrides('</style><script>alert(1)</script>')).toBe('');
    expect(serializeInspectOverrides(42)).toBe('');
  });
});

// Regression for nexu-io/open-design#362: the host owns the inspect override
// map authoritatively. Hydration parses the artifact source on load so an
// initial Save-to-source preserves prior rules even when the user edits a
// different element, and forging the iframe's od:inspect-overrides reply
// cannot inject overrides — the host never ingests it.
describe('parseInspectOverridesFromSource', () => {
  it('returns an empty map when the source has no override block', () => {
    expect(parseInspectOverridesFromSource('')).toEqual({});
    expect(parseInspectOverridesFromSource('<!doctype html><html><body>x</body></html>')).toEqual({});
  });

  it('parses an existing override block into the host map', () => {
    const source =
      `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { color: #ff0000 !important; font-size: 18px !important }` +
      `\n[data-screen-label="01 Cover"] { background-color: #000 !important }` +
      `</style></head><body></body></html>`;
    const map = parseInspectOverridesFromSource(source);
    expect(map.hero?.props).toEqual({ color: '#ff0000', 'font-size': '18px' });
    expect(map.hero?.selector).toBe('[data-od-id="hero"]');
    expect(map['01 Cover']?.props).toEqual({ 'background-color': '#000' });
    expect(map['01 Cover']?.selector).toBe('[data-screen-label="01 Cover"]');
  });

  it('aggregates rules across multiple persisted blocks', () => {
    const source =
      `<style data-od-inspect-overrides>[data-od-id="a"] { color: #111 !important }</style>` +
      `<style data-od-inspect-overrides>[data-od-id="b"] { color: #222 !important }</style>`;
    const map = parseInspectOverridesFromSource(source);
    expect(Object.keys(map).sort()).toEqual(['a', 'b']);
  });

  it('drops disallowed properties and rules whose only declarations are unsafe', () => {
    const source =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { position: absolute !important; color: #fff !important }` +
      `[data-od-id="bad"] { background: red } ` +
      `</style>`;
    const map = parseInspectOverridesFromSource(source);
    expect(map.hero?.props).toEqual({ color: '#fff' });
    expect(map.bad).toBeUndefined();
  });

  it('refuses elementIds whose characters could break out of the attr value', () => {
    const hostile =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="\"><script>alert(1)</script>"] { color: #fff !important }` +
      `</style>`;
    expect(parseInspectOverridesFromSource(hostile)).toEqual({});
  });

  it('ignores override-shaped text inside raw-text elements and HTML comments', () => {
    // A template literal in a <script>, a CSS comment in a sibling <style>, the
    // body of a <textarea> / <title>, and an HTML comment all contain text that
    // would match the override block regex. None of them are real persisted
    // overrides, so the host map must stay empty — otherwise useEffect would
    // seed phantom rules and a later Save-to-source would write CSS the user
    // never created.
    const phantomBlock =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style>`;
    const source =
      `<!doctype html><html><head>` +
      `<script>const tmpl = \`${phantomBlock}\`;</script>` +
      `<style>/* docs: ${phantomBlock} */</style>` +
      `<title>${phantomBlock}</title>` +
      `<!-- ${phantomBlock} -->` +
      `</head><body><textarea>${phantomBlock}</textarea></body></html>`;
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });

  // Regression for nexu-io/open-design#362: hydration must require an
  // actual `data-od-inspect-overrides` attribute name, not a boundary-only
  // substring match against the whole opening tag. Otherwise a sibling
  // attribute name with `-note` suffix or a tooltip whose value contains
  // the marker text would seed phantom overrides into the host map and
  // a later Save-to-source would persist CSS the artifact never had.
  it('does not seed phantom overrides from a longer attribute name', () => {
    const source =
      `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides-note="docs">` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style></head><body></body></html>`;
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });

  it('does not seed phantom overrides when the marker text only appears in an attribute value', () => {
    const source =
      `<!doctype html><html><head>` +
      `<style title="data-od-inspect-overrides">` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style></head><body></body></html>`;
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });

  it('still parses a real override block when raw-text literals also mention one', () => {
    const phantomBlock =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="phantom"] { color: #ff0000 !important }` +
      `</style>`;
    const source =
      `<!doctype html><html><head>` +
      `<script>const tmpl = \`${phantomBlock}\`;</script>` +
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { color: #00ff00 !important }` +
      `</style>` +
      `</head><body></body></html>`;
    const map = parseInspectOverridesFromSource(source);
    expect(Object.keys(map)).toEqual(['hero']);
    expect(map.hero?.props).toEqual({ color: '#00ff00' });
  });
});

describe('updateInspectOverride', () => {
  const base: InspectOverrideMap = {
    hero: { selector: '[data-od-id="hero"]', props: { color: '#ff0000' } },
  };

  it('adds a new property to an existing entry', () => {
    const next = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '18px');
    expect(next).not.toBe(base);
    expect(next.hero?.props).toEqual({ color: '#ff0000', 'font-size': '18px' });
  });

  it('creates a new entry for a previously untouched element', () => {
    const next = updateInspectOverride(base, 'cta', '[data-od-id="cta"]', 'color', '#00ff00');
    expect(next.cta?.props).toEqual({ color: '#00ff00' });
    expect(next.hero?.props).toEqual({ color: '#ff0000' });
  });

  it('clears a single property when given an empty value', () => {
    const seeded = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '18px');
    const cleared = updateInspectOverride(seeded, 'hero', '[data-od-id="hero"]', 'font-size', '');
    expect(cleared.hero?.props).toEqual({ color: '#ff0000' });
  });

  it('drops the entry once the last property is cleared', () => {
    const cleared = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'color', '');
    expect(cleared.hero).toBeUndefined();
  });

  it('returns the same map reference when the change is a no-op', () => {
    const same = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'color', '#ff0000');
    expect(same).toBe(base);
    const noClear = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '');
    expect(noClear).toBe(base);
  });

  it('rejects properties off the host allow-list', () => {
    const ignored = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'position', 'absolute');
    expect(ignored).toBe(base);
  });

  it('rejects values that could break out of `prop: value`', () => {
    const ignored = updateInspectOverride(
      base,
      'hero',
      '[data-od-id="hero"]',
      'color',
      'red; background: url(x)',
    );
    expect(ignored).toBe(base);
  });

  it('rejects elementIds whose characters could break out of the attr value', () => {
    const ignored = updateInspectOverride(
      base,
      '"><script>alert(1)</script>',
      '[data-od-id="x"]',
      'color',
      '#fff',
    );
    expect(ignored).toBe(base);
  });
});

function baseLiveArtifact(overrides: Partial<LiveArtifact> = {}): LiveArtifact {
  const artifact: LiveArtifact = {
    schemaVersion: 1,
    id: 'la_1',
    projectId: 'proj_1',
    title: 'Launch Metrics',
    slug: 'launch-metrics',
    status: 'active',
    pinned: false,
    preview: { type: 'html', entry: 'index.html' },
    refreshStatus: 'idle',
    createdAt: '2026-04-29T12:00:00.000Z',
    updatedAt: '2026-04-29T12:00:00.000Z',
    document: {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: { title: 'Launch Metrics' },
    },
  };
  return { ...artifact, ...overrides, document: overrides.document ?? artifact.document };
}

function baseLiveArtifactWorkspaceEntry(
  overrides: Partial<LiveArtifactWorkspaceEntry> = {},
): LiveArtifactWorkspaceEntry {
  const entry: LiveArtifactWorkspaceEntry = {
    kind: 'live-artifact',
    tabId: 'live:la_1',
    artifactId: 'la_1',
    projectId: 'proj_1',
    title: 'Launch Metrics',
    slug: 'launch-metrics',
    status: 'active',
    refreshStatus: 'idle',
    pinned: false,
    preview: { type: 'html', entry: 'index.html' },
    hasDocument: true,
    updatedAt: '2026-04-29T12:00:00.000Z',
  };
  return { ...entry, ...overrides };
}

describe('LiveArtifactViewer', () => {
  it('hides inactive live previews even when a device viewport sets display', () => {
    const css = readExpandedIndexCss();
    const rule = css.match(/\.live-artifact-preview-layer\.preview-viewport\[data-active='false'\]\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rule).toContain('display: none;');
  });

  it('keeps the presentation exit button aligned with preview chrome spacing', () => {
    const css = readExpandedIndexCss();
    const rule = css.match(/\.present-exit\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rule).toContain('top: calc(env(safe-area-inset-top, 0px) + 20px);');
    expect(rule).toContain('right: calc(env(safe-area-inset-right, 0px) + 20px);');
    expect(rule).toContain('display: inline-flex;');
    expect(rule).toContain('align-items: center;');
  });

  it('uses the shared zoom dropdown for live artifact previews', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    const zoomTrigger = await screen.findByRole('button', { name: '100%' });
    expect(screen.queryByRole('button', { name: /zoom out/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /zoom in/i })).toBeNull();

    fireEvent.click(zoomTrigger);
    expect(screen.getByRole('menuitem', { name: '50%' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '200%' })).toBeTruthy();
  });

  it('enters and exits in-tab presentation from the present menu', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /in this tab/i }));

    await waitFor(() => {
      expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /exit fullscreen/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /exit fullscreen/i }));
    await waitFor(() => {
      expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeNull();
    });
  });

  it('keeps in-tab presentation off when fullscreen request fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    const requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')));
    const previewHost = container.querySelector('.viewer-body');
    expect(previewHost).toBeTruthy();
    Object.defineProperty(previewHost!, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /fullscreen/i }));

    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalled();
    });
    expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeNull();
    expect(screen.queryByRole('button', { name: /exit fullscreen/i })).toBeNull();
  });

  it('requests fullscreen without entering in-tab presentation when fullscreen succeeds', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    const requestFullscreen = vi.fn(() => Promise.resolve());
    const previewHost = container.querySelector('.viewer-body');
    expect(previewHost).toBeTruthy();
    Object.defineProperty(previewHost!, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /fullscreen/i }));

    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalled();
    });
    expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeNull();
    expect(screen.queryByRole('button', { name: /exit fullscreen/i })).toBeNull();
  });

  it('opens the rendered preview in a new tab from the present menu', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    const openMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', openMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /new tab/i }));

    expect(openMock).toHaveBeenCalledWith(
      '/api/live-artifacts/la_1/preview?projectId=proj_1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.queryByRole('button', { name: /exit fullscreen/i })).toBeNull();
  });

  it('renders the toolbar Open link as an external preview link', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    const openLink = await screen.findByRole('link', { name: /^open$/i });
    expect(openLink.getAttribute('href')).toBe('/api/live-artifacts/la_1/preview?projectId=proj_1');
    expect(openLink.getAttribute('target')).toBe('_blank');
    expect(openLink.getAttribute('rel')).toContain('noreferrer');
    expect(openLink.getAttribute('rel')).toContain('noopener');
    expect(openLink.getAttribute('tabindex')).not.toBe('-1');
  });

  it('takes the toolbar Open link out of the tab order outside preview mode', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    const openLink = await screen.findByRole('link', { name: /^open$/i });
    expect(openLink.getAttribute('tabindex')).not.toBe('-1');

    fireEvent.click(screen.getByRole('button', { name: /code/i }));

    await waitFor(() => {
      expect(container.querySelector('.ghost-link')?.getAttribute('tabindex')).toBe('-1');
    });
  });

  it('restores the toolbar Open link to the tab order when returning to preview mode', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await screen.findByRole('link', { name: /^open$/i });

    fireEvent.click(screen.getByRole('button', { name: /code/i }));

    await waitFor(() => {
      expect(container.querySelector('.ghost-link')?.getAttribute('tabindex')).toBe('-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^open$/i }).getAttribute('tabindex')).not.toBe('-1');
    });
  });

  it('preserves the live preview iframe when switching away from preview and back', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await screen.findByRole('link', { name: /^open$/i });

    const previewFrame = container.querySelector('[data-testid="live-artifact-preview-frame"]');
    expect(previewFrame).toBeTruthy();
    expect(container.querySelector('.live-artifact-preview-layer')?.getAttribute('data-active')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /code/i }));

    await waitFor(() => {
      expect(container.querySelector('.live-artifact-preview-layer')?.getAttribute('data-active')).toBe('false');
    });
    expect(container.querySelector('[data-testid="live-artifact-preview-frame"]')).toBe(previewFrame);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(container.querySelector('.live-artifact-preview-layer')?.getAttribute('data-active')).toBe('true');
    });
    expect(container.querySelector('[data-testid="live-artifact-preview-frame"]')).toBe(previewFrame);
  });

  it('closes the present menu on Escape without tearing down the viewer', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    expect(screen.getByRole('menuitem', { name: /new tab/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /new tab/i })).toBeNull();
    });
    expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
  });
});

describe('LiveArtifactRefreshHistoryPanel', () => {
  it('renders a human-readable status instead of raw JSON when no history exists', () => {
    const markup = renderToStaticMarkup(
      <LiveArtifactRefreshHistoryPanel
        liveArtifact={baseLiveArtifact({ refreshStatus: 'never' })}
        fallbackRefreshStatus="never"
        isRunning={false}
        sessionEvents={[]}
      />,
    );

    // Status badge with tone, not JSON
    expect(markup).toContain('live-artifact-refresh-panel');
    expect(markup).toContain('data-testid="live-artifact-refresh-status-badge"');
    expect(markup).toContain('Not refreshable');
    expect(markup).toContain('Last refreshed');
    expect(markup).toContain('Never');
    expect(markup).toContain('No refresh activity yet in this session');
    // Raw JSON is available but tucked inside a collapsed <details>, not exposed as the primary view.
    expect(markup).toContain('<details');
    expect(markup).toContain('Advanced debug metadata');
    const detailsIndex = markup.indexOf('<details');
    const rawJsonIndex = markup.search(/<pre class="viewer-source">\s*\{/);
    expect(detailsIndex).toBeGreaterThanOrEqual(0);
    expect(rawJsonIndex).toBeGreaterThan(detailsIndex);
  });

  it('surfaces running state and a session timeline with duration + source counts', () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      <LiveArtifactRefreshHistoryPanel
        liveArtifact={baseLiveArtifact({
          refreshStatus: 'succeeded',
          lastRefreshedAt: new Date(now - 45_000).toISOString(),
        })}
        fallbackRefreshStatus="succeeded"
        isRunning
        sessionEvents={[
          { id: 1, phase: 'started', at: now - 5_000 },
          {
            id: 2,
            phase: 'succeeded',
            at: now - 1_200,
            durationMs: 3_800,
            refreshedSourceCount: 2,
          },
        ]}
      />,
    );

    // isRunning wins over persisted `succeeded`
    expect(markup).toContain('Refreshing');
    // Both timeline rows are present
    expect(markup).toContain('Started');
    expect(markup).toContain('Succeeded');
    // Source count + duration are humanized (3.8s), not raw ms
    expect(markup).toContain('2 sources updated');
    expect(markup).toContain('3.8s');
  });

  // Lefarcen review on PR #1300: the existing renderToStaticMarkup
  // assertions above can't prove that the panel actually routes its
  // strings through i18n, because the no-provider fallback returns
  // English no matter what locale the rest of the app is set to. This
  // test wraps the panel in `I18nProvider initial="zh-CN"` and pins
  // the Chinese rendering of the strings issue #1254 was filed for:
  // the badge descriptor, the hero label + empty state, the session
  // section header + hint, the empty-timeline copy, the persisted
  // section + its empty copy, started / succeeded event labels, the
  // pluralised source-count line, the document-source labels, and the
  // advanced debug summary. If a future change drops `t()` off any
  // of those callsites, this test catches it before the user sees
  // the mixed-language regression.
  it('renders Chinese strings end-to-end when wrapped in I18nProvider initial="zh-CN"', () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      <I18nProvider initial="zh-CN">
        <LiveArtifactRefreshHistoryPanel
          liveArtifact={baseLiveArtifact({
            refreshStatus: 'succeeded',
            // Real lastRefreshedAt + non-empty session events so the
            // relative-time path also runs under zh-CN; the lefarcen
            // P1 review specifically called out that the formerly
            // hardcoded `Xs ago` / `Xm ago` strings would still leak
            // English under a Chinese UI without this.
            lastRefreshedAt: new Date(now - 45_000).toISOString(),
            document: {
              format: 'html_template_v1',
              templatePath: 'template.html',
              generatedPreviewPath: 'index.html',
              dataPath: 'data.json',
              dataJson: { title: 'Launch Metrics' },
              sourceJson: {
                type: 'connector_tool',
                toolName: 'design-files.list',
                input: {},
                refreshPermission: 'none',
                connector: {
                  connectorId: 'figma',
                  toolName: 'design-files.list',
                  accountLabel: 'figma:acct-1',
                },
              },
            },
          })}
          fallbackRefreshStatus="succeeded"
          isRunning={false}
          sessionEvents={[
            { id: 1, phase: 'started', at: now - 5_000 },
            {
              id: 2,
              phase: 'succeeded',
              at: now - 1_200,
              durationMs: 3_800,
              refreshedSourceCount: 1,
            },
          ]}
          persistedEvents={[]}
        />
      </I18nProvider>,
    );

    // Hero
    expect(markup).toContain('上次刷新');
    // Session activity section
    expect(markup).toContain('会话活动');
    expect(markup).toContain('本标签页打开期间观察到的事件');
    // Event labels + pluralised source count for n === 1
    expect(markup).toContain('已开始');
    expect(markup).toContain('已成功');
    expect(markup).toContain('已更新 1 个数据源');
    // Persisted history section + empty copy
    expect(markup).toContain('持久化刷新记录');
    expect(markup).toContain('尚无持久化的刷新记录。');
    // Document source section
    expect(markup).toContain('文档来源');
    expect(markup).toContain('已配置的数据源');
    expect(markup).toContain('类型');
    expect(markup).toContain('工具');
    expect(markup).toContain('连接器');
    // Advanced debug metadata
    expect(markup).toContain('高级调试元数据');
    // English label that previously leaked through must NOT appear
    // (mixed-language is exactly the regression issue #1254 filed for).
    expect(markup).not.toContain('Last refreshed');
    expect(markup).not.toContain('Session activity');
    expect(markup).not.toContain('Persisted refresh history');
    expect(markup).not.toContain('Document source');
    expect(markup).not.toContain('Advanced debug metadata');
    // Relative-time output must be Chinese, not English. The lefarcen
    // P1 review pointed out that formatRelativeTime was hardcoding
    // English units (`Xs ago`), so a 45s-old hero metric would still
    // read `45s ago` even with every label translated. Assert against
    // the Chinese past-tense suffix `前` and rule out the English
    // suffixes the legacy function emitted.
    expect(markup).toContain('前');
    expect(markup).not.toContain(' ago');
    expect(markup).not.toContain('from now');
    expect(markup).not.toMatch(/\b\d+s ago\b/);
    expect(markup).not.toMatch(/\b\d+m ago\b/);
  });

  it('renders the zh-CN empty hero ("从未") when lastRefreshedAt is missing', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initial="zh-CN">
        <LiveArtifactRefreshHistoryPanel
          liveArtifact={baseLiveArtifact({ refreshStatus: 'never', lastRefreshedAt: undefined })}
          fallbackRefreshStatus="never"
          isRunning={false}
          sessionEvents={[]}
        />
      </I18nProvider>,
    );

    expect(markup).toContain('上次刷新');
    expect(markup).toContain('从未');
    expect(markup).not.toContain('Last refreshed');
    expect(markup).not.toContain('>Never<');
  });
});
