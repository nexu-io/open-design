// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MotionTimelineMedia } from './MotionTimelineMedia';
import { usePlayerStore } from '../player/store/playerStore';
import type { TimelineElement } from '../player/store/playerStore';
import type { DomEditSelection } from '../components/editor/domEditing';
import { applyPatchByTarget, type PatchOperation } from '../utils/sourcePatcher';
import { I18nProvider } from '../i18n/I18n';
import type { TimelineMediaTarget } from './MediaGatewayContext';
import { selectedMedia } from './timelineMediaSelection';

const hooks = vi.hoisted(() => ({ target: null as TimelineMediaTarget | null, build: vi.fn(), commit: vi.fn(), bind: vi.fn() }));
vi.mock('./MediaGatewayContext', () => ({ useMediaGateway: () => ({ bindTimeline: hooks.bind }) }));
vi.mock('../contexts/DomEditContext', () => ({ useDomEditActionsContextOptional: () => ({ buildDomSelectionForTimelineElement: hooks.build, handleDomAttributeBatchCommit: hooks.commit }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; usePlayerStore.getState().reset(); vi.clearAllMocks(); });

it('replaces only the captured image src through native editing and rejects stale source/composition targets', async () => {
  const element = { id: 'forest', key: 'scene:forest', tag: 'img', src: 'assets/original.png', sourceFile: 'scenes/intro.html', start: 2, duration: 6, track: 0 } as TimelineElement;
  usePlayerStore.setState({ elements: [element], selectedElementId: element.key });
  const captured = selectedMedia(element)!;
  const image = document.createElement('img'); image.setAttribute('src', '/api/projects/p/preview/assets/original.png');
  const selection = { id: 'forest', tagName: 'img', sourceFile: 'scenes/intro.html', element: image } as unknown as DomEditSelection;
  hooks.build.mockResolvedValue(selection);
  const original = '<img id="forest" class="clip" data-start="2" data-duration="6" style="transform:scale(1.1)" src="../assets/original.png"><script>tl.to("#forest",{scale:1.2,duration:6});</script>';
  let source = original;
  hooks.commit.mockImplementation(async (_selection: DomEditSelection, ops: PatchOperation[], options: { validateContent: (html: string) => void }) => {
    options.validateContent(source);
    for (const op of ops) source = applyPatchByTarget(source, { id: 'forest' }, op);
    return true;
  });
  hooks.bind.mockImplementation(target => { hooks.target = target; });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const render = (compositionId: string) => <I18nProvider initialLocale="en"><MotionTimelineMedia projectId="p" compositionId={compositionId} disabled={false} /></I18nProvider>;
  await act(async () => root.render(render('main')));
  const target = hooks.target!;
  await target.replace!('assets/generated/sunset.png', captured);
  expect(source).toBe(original.replace('../assets/original.png', '../assets/generated/sunset.png'));
  expect(hooks.commit).toHaveBeenCalledTimes(1);
  // The native timeline still has the old snapshot: disk-level guard must refuse a second replacement.
  await expect(target.replace!('assets/generated/second.png', captured)).rejects.toThrow('original image changed');
  source = original; image.setAttribute('src', '/api/projects/p/preview/assets/another.png');
  await expect(target.replace!('assets/generated/third.png', captured)).rejects.toThrow('original image changed');
  expect(source).toBe(original);
  await act(async () => root.render(render('another')));
  await expect(target.replace!('assets/generated/last.png', captured)).rejects.toThrow('composition changed');
});
