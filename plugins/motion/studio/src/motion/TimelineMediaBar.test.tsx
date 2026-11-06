// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TimelineMediaBar } from './TimelineMediaBar';
import { TimelineReadOnlyContext } from '../player/components/timelineReadOnly';
import type { TimelineState } from '../player/components/TimelineProvider';
import type { TimelineElement } from '../player/store/playerStore';
import { usePlayerStore } from '../player/store/playerStore';
import { I18nProvider } from '../i18n/I18n';
import { projectMediaPath, selectedMedia } from './timelineMediaSelection';
import { ArtifactViewActive } from './ArtifactViewState';

const hooks = vi.hoisted(() => ({ state: {} as TimelineState, open: vi.fn() }));
vi.mock('../player/components/TimelineProvider', () => ({ useTimelineContext: () => ({ state: hooks.state }) }));
vi.mock('./MediaGatewayContext', () => ({ useMediaGateway: () => ({ openGenerator: hooks.open, generationOpen: false }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let viewport: HTMLDivElement;
const clip = { id: 'image', key: 'main:image', tag: 'img', src: 'assets/original.png', label: 'Forest', start: 2, duration: 6, track: 1 } as TimelineElement;
beforeEach(() => {
  hooks.open.mockReset(); usePlayerStore.getState().reset();
  const host = document.createElement('div'); host.dataset.motionStudio = ''; document.body.append(host); root = createRoot(host);
  const timeline = document.createElement('div'); timeline.dataset.studioTimeline = ''; document.body.append(timeline);
  viewport = document.createElement('div'); timeline.append(viewport); viewport.scrollLeft = 40;
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 500, width: 800, height: 300 } as DOMRect);
  vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({ top: 460 } as DOMRect);
  hooks.state = { timelineReady: true, elements: [clip], selectedElementId: clip.key!, sessionEpoch: 1,
    canvas: { scrollRef: { current: viewport }, pps: 100, contentOrigin: 80 }, overlays: {} } as TimelineState;
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); usePlayerStore.getState().reset(); });
async function render(readOnly = false) { await act(async () => root.render(<I18nProvider initialLocale="en"><TimelineReadOnlyContext.Provider value={readOnly ? () => {} : null}><TimelineMediaBar /></TimelineReadOnlyContext.Provider></I18nProvider>)); }
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(b => b.textContent === label)!; }

it('opens image editing from the selected clip with the original media and exact timing, and supports dismiss/reopen', async () => {
  await render(); expect(document.body.textContent).toContain('2.0–8.0s');
  const prompt = document.querySelector('input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(prompt, 'make it sunset'); prompt.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('Edit image').click());
  expect(hooks.open).toHaveBeenCalledWith(expect.objectContaining({ intent: 'edit', prompt: 'make it sunset', modality: 'image', placement: { start: 2, duration: 6, track: 1 }, selection: expect.objectContaining({ path: 'assets/original.png', key: 'main:image' }) }));
  await act(async () => prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('aside')).toBeNull();
  await act(async () => viewport.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 300, clientY: 550 })));
  expect(document.querySelector('aside')).not.toBeNull();
  await render(true); expect(document.querySelector('aside')).toBeNull();
});

it('range takes priority over a selected clip; ruler activation uses zoom and scroll coordinates without a selection', async () => {
  hooks.state.overlays = { ...hooks.state.overlays, showPopover: true, rangeSelection: { start: 8, end: 5, anchorX: 0, anchorY: 0 } };
  await render(); expect(button('Edit image')).toBeUndefined();
  await act(async () => button('Generate media').click());
  expect(hooks.open).toHaveBeenLastCalledWith(expect.objectContaining({ placement: { start: 5, duration: 3, track: 0 }, selection: undefined }));
  hooks.state.overlays.showPopover = false; hooks.state.selectedElementId = null;
  await render(); expect(document.querySelector('aside')).toBeNull();
  await act(async () => viewport.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 440, clientY: 505 })));
  expect(document.body.textContent).toContain('3.0–6.0s');
  await act(async () => button('Generate media').click());
  expect(hooks.open).toHaveBeenLastCalledWith(expect.objectContaining({ placement: { start: 3, duration: 3, track: 0 } }));
  await act(async () => usePlayerStore.setState({ isPlaying: true })); expect(document.querySelector('aside')).toBeNull();
});

it('reference selection resolves project media and rejects remote or locked media', () => {
  expect(projectMediaPath('/api/projects/demo/preview/assets/a%20b.png?v=2')).toBe('assets/a b.png');
  expect(projectMediaPath('../assets/a%20b.png', 'scenes/intro.html')).toBe('assets/a b.png');
  expect(projectMediaPath('https://example.com/a.png')).toBeNull();
  expect(projectMediaPath('../outside.png')).toBeNull();
  expect(selectedMedia({ ...clip, timelineLocked: true })).toBeUndefined();
});

it('removes the portalled media actions while the owning Viewer is hidden and restores them with the Viewer', async () => {
  const renderActive = async (active: boolean) => act(async () => root.render(<I18nProvider initialLocale="en"><ArtifactViewActive.Provider value={active}><TimelineMediaBar /></ArtifactViewActive.Provider></I18nProvider>));
  await renderActive(true);
  expect(document.querySelector('.motion-timeline-media-bar')).not.toBeNull();
  await renderActive(false);
  expect(document.querySelector('.motion-timeline-media-bar')).toBeNull();
  await renderActive(true);
  expect(document.querySelector('.motion-timeline-media-bar')).not.toBeNull();
});
