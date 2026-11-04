// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

const { recordComposerGeometry } = vi.hoisted(() => ({ recordComposerGeometry: vi.fn() }));
vi.mock('../../src/components/BoardComposerPopover', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/components/BoardComposerPopover')>();
  return { ...actual, BoardComposerPopover: (props: Parameters<typeof actual.BoardComposerPopover>[0]) => {
    recordComposerGeometry(props);
    return <actual.BoardComposerPopover {...props} />;
  } };
});

let sequence = 0;
let canvas: DOMRect;
let canvasBorder: number;
let bodyWidth: number | undefined;
let frameOffset: { x: number; y: number };
const position = { x: 0, y: 476.992, width: 436, height: 34.5 };

beforeEach(() => {
  recordComposerGeometry.mockClear();
  canvas = new DOMRect(537, 140, 189, 690);
  frameOffset = { x: 0, y: 0 };
  bodyWidth = undefined;
  canvasBorder = 0;
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.viewer-body')) return new DOMRect(canvas.left, canvas.top, bodyWidth ?? canvas.width, canvas.height);
    if (this.matches('.comment-preview-canvas, .comment-frame-clip, #projection-comments, [data-testid="comment-preview-layout"]')) return canvas;
    if (this instanceof HTMLIFrameElement) {
      return this.dataset.odActive === 'false'
        ? new DOMRect(-1200, -900, canvas.width, canvas.height)
        : new DOMRect(canvas.left + canvasBorder + frameOffset.x, canvas.top + canvasBorder + frameOffset.y, canvas.width, canvas.height);
    }
    return original.call(this);
  });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

async function setup(transport: 'url' | 'srcdoc', scale: number) {
  if (transport === 'srcdoc') window.history.replaceState(null, '', '/?forceInline=1');
  // The existing measurement bridge rounds its intrinsic width to 199px.
  if (scale !== 1 && scale !== .5 && scale !== .75) bodyWidth = 199 * scale;
  const name = `projection-${++sequence}.html`;
  const file: ProjectFile = { name, path: name, type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
  const view = render(<><div id="projection-comments" /><FileViewer projectId="projection" projectKind="prototype"
    file={file} commentPortalId="projection-comments" liveHtml='<html><body><h2 data-od-id="title">Target</h2></body></html>' /></>);
  const canvasNode = screen.getByTestId('comment-preview-canvas');
  Object.defineProperties(canvasNode, { clientLeft: { configurable: true, value: canvasBorder }, clientTop: { configurable: true, value: canvasBorder } });
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  expect(frame.dataset.odRenderMode).toBe(transport === 'url' ? 'url-load' : 'srcdoc');
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 726 });
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const dispatch = async (data: object) => act(async () => {
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }));
  });
  // Obtain fractional desktop auto-fit through its real measurement response,
  // without mocking the projection or supplying a transform to the component.
  if (scale !== 1 && scale !== .5 && scale !== .75) {
    fireEvent.load(frame);
    await waitFor(() => expect(post.mock.calls.some(([data]) => data?.type === 'od:preview-content-size-request')).toBe(true));
    const request = post.mock.calls.map(([data]) => data).filter(data => data?.type === 'od:preview-content-size-request').at(-1);
    await dispatch({ type: 'od:preview-content-size', measurementId: request.measurementId, generation: request.generation,
      documentEpoch: request.documentEpoch, scrollWidth: canvas.width / scale, clientWidth: canvas.width });
    await waitFor(() => expect(screen.getByRole('button', { name: '95%' })).toBeInTheDocument());
  } else if (scale !== 1) {
    fireEvent.click(screen.getByRole('button', { name: '100%' }));
    fireEvent.click(screen.getByRole('menuitem', { name: `${scale * 100}%` }));
  }
  if (transport === 'url') await dispatch({ type: 'od:url-selection-bridge-ready', href: frame.src });
  fireEvent.click(screen.getByTestId('board-mode-toggle'));
  const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  expect(activeFrame.dataset.odRenderMode).toBe(transport === 'url' ? 'url-load' : 'srcdoc');
  const target = { type: 'od:comment-target', filePath: name, elementId: 'title', selector: '[data-od-id="title"]',
    label: 'Title', text: 'Target', htmlHint: '<h2>', position };
  await act(async () => { window.dispatchEvent(new MessageEvent('message', { source: activeFrame.contentWindow, data: target })); });
  const clip = view.container.querySelector('.comment-frame-clip')!;
  return { ...view, frame: activeFrame, clip };
}

function expectProjection(scale: number) {
  const box = screen.getByTestId('comment-target-overlay');
  const globalTop = canvas.top + canvasBorder + Number.parseFloat(box.style.top);
  const globalLeft = canvas.left + canvasBorder + Number.parseFloat(box.style.left);
  // CSS clipping may trim the element, but its visible bounds must use the
  // active frame's viewport origin, not the surrounding canvas origin.
  expect(globalTop).toBeCloseTo(canvas.top + canvasBorder + frameOffset.y + position.y * scale, 3);
  expect(globalLeft).toBeCloseTo(Math.max(canvas.left + canvasBorder, canvas.left + canvasBorder + frameOffset.x + position.x * scale), 3);
  expect(Number.parseFloat(box.style.height)).toBeCloseTo(position.height * scale, 3);
  const right = Math.min(canvas.width, frameOffset.x + (position.x + position.width) * scale);
  const left = Math.max(0, frameOffset.x + position.x * scale);
  expect(Number.parseFloat(box.style.width)).toBeCloseTo(right - left, 3);
}

it.each(['url', 'srcdoc'] as const)('%s: projects the narrow fractional-scale target after clip scrolling without another snapshot', async transport => {
  const scale = .951087;
  const { clip } = await setup(transport, scale);
  expectProjection(scale);
  frameOffset.y = -35.5;
  Object.defineProperty(clip, 'scrollTop', { configurable: true, value: 35.5 });
  fireEvent.scroll(clip);
  await waitFor(() => expectProjection(scale));
});

it.each(['url', 'srcdoc'] as const)('%s: keeps a wide unscrolled frame aligned', async transport => {
  canvas = new DOMRect(8, 140, 718, 690);
  await setup(transport, 1);
  expectProjection(1);
});

it.each([.5, .75, 1])('projects horizontal and vertical clip movement once at scale %s', async scale => {
  canvas = new DOMRect(80, 100, 500, 690);
  const { clip } = await setup('srcdoc', scale);
  expectProjection(scale);
  frameOffset = { x: -24, y: -47 };
  Object.defineProperties(clip, { scrollLeft: { configurable: true, value: 24 }, scrollTop: { configurable: true, value: 47 } });
  fireEvent.scroll(clip);
  await waitFor(() => expectProjection(scale));
});

it('ignores the retained inactive iframe when measuring the active document', async () => {
  const { container } = await setup('srcdoc', 1);
  const inactive = container.querySelector('iframe[data-od-active="false"]');
  expect(inactive).not.toBeNull();
  fireEvent.scroll(inactive!);
  expectProjection(1);
});


it.each(['url', 'srcdoc'] as const)('%s: uses the bordered canvas padding origin exactly once', async transport => {
  canvas = new DOMRect(80, 100, 500, 690);
  canvasBorder = 1;
  const { clip, frame, container } = await setup(transport, 1);
  expectProjection(1);
  const expectPortalProjection = () => {
    const host = container.querySelector<HTMLElement>('[data-testid="comment-preview-layout"]')!;
    const frameRect = frame.getBoundingClientRect(), hostRect = host.getBoundingClientRect();
    const props = recordComposerGeometry.mock.calls.map(([props]) => props).filter(props => props.commenting).at(-1);
    expect(props.offset).toEqual({ x: frameRect.left - hostRect.left + host.scrollLeft, y: frameRect.top - hostRect.top + host.scrollTop });
  };
  expectPortalProjection();
  frameOffset = { x: -24, y: -35.5 };
  fireEvent.scroll(clip);
  await waitFor(() => { expectProjection(1); expectPortalProjection(); });
});

it('remeasures a retained srcdoc frame after Code hides it and Preview restores it', async () => {
  const { frame } = await setup('srcdoc', 1);
  expectProjection(1);
  fireEvent.click(screen.getByRole('tab', { name: 'Code' }));
  expect(frame.dataset.odActive).toBe('false');
  frameOffset = { x: -12, y: -35.5 };
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  expect(screen.getByTestId('artifact-preview-frame')).toBe(frame);
  expect(frame.dataset.odActive).toBe('true');
  // No new target report, load, scroll or ResizeObserver notification occurs.
  await waitFor(() => expectProjection(1));
});
