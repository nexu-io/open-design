// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MediaGatewayProvider, useMediaGateway } from './MediaGatewayContext';
import { MotionTimelineMedia } from './MotionTimelineMedia';
import { usePlayerStore } from '../player/store/playerStore';
import { I18nProvider } from '../i18n/I18n';
import type { GenerationJob, Model } from './gatewayClient';
import { MediaGenerator } from './MediaGenerator';
import { ArtifactViewActive } from './ArtifactViewState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; document.body.innerHTML = ''; usePlayerStore.getState().reset(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const model: Model = { id: 'codex:image-generation', provider: 'codex', modelId: 'image-generation', label: 'Codex Image', modality: 'image', source: 'builtin', mode: 'text-to-image' };
function Trigger() { const gateway = useMediaGateway(); return <button onClick={() => gateway?.openGenerator()}>Open generator</button>; }
function button(text: string) { const found = Array.from(document.querySelectorAll('button')).find(el => el.textContent === text); if (!found) throw new Error('Missing ' + text); return found; }
function type(selector: string, value: string) { const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!; Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }

it('generates through the shared API, shows only completed output, and places it at the selected range with failure reporting', async () => {
  vi.useFakeTimers(); usePlayerStore.setState({ timelineProjectId: 'native-project', rangeSelection: { t0: 2, t1: 7 } });
  const place = vi.fn().mockResolvedValue(undefined);
  const jobs: GenerationJob[] = []; let submitted: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('models/capabilities')) return Response.json({ providers: [{ id: 'codex', available: true }], agents: [], routes: {}, capabilities: [] });
    if (url.includes('/models?')) return Response.json({ models: [model], nextOffset: null });
    if (url.endsWith('project/status')) return Response.json({ projectId: 'workspace-project' });
    if (url.endsWith('/generations') && init?.method === 'POST') {
      submitted = JSON.parse(init.body as string);
      const job = { id: 'job-1', projectId: 'workspace-project', state: 'queued', prompt: 'a forest', model, modality: 'image', parameters: {}, createdAt: 1, updatedAt: 1, requestHash: 'hash', assets: [] } as GenerationJob;
      jobs.push(job); return Response.json({ job });
    }
    if (url.includes('/generations?')) return Response.json({ jobs });
    throw new Error('Unexpected request ' + url);
  }));
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const render = (timeline: boolean) => <I18nProvider initialLocale="en"><MediaGatewayProvider><Trigger />{timeline && <MotionTimelineMedia projectId="native-project" compositionId="main" disabled={false} onAssetDrop={place} />}</MediaGatewayProvider></I18nProvider>;
  await act(async () => root!.render(render(true)));
  await act(async () => button('Open generator').click());
  await act(async () => type('textarea[aria-label="Describe your media"]', 'a forest'));
  await act(async () => button('Generate').click());
  expect(submitted).toMatchObject({ projectId: 'workspace-project', model: model.id, modality: 'image', parameters: { aspect_ratio: '16:9' }, usage: { compositionId: 'main' } });
  expect(String(submitted?.idempotencyKey)).toMatch(/-0$/);
  expect(document.body.textContent).not.toContain('Place on timeline');
  jobs[0] = { ...jobs[0], state: 'completed', assets: [{ path: 'assets/generated/one.png', bytes: 1000, mimeType: 'image/png' }, { path: 'assets/generated/two.png', bytes: 1000, mimeType: 'image/png' }] };
  await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
  await act(async () => button('Place on timeline').click());
  expect(place).toHaveBeenCalledWith('assets/generated/one.png', { start: 2, track: 0 }, 5, true);
  await act(async () => root!.render(render(false)));
  await act(async () => button('Place on timeline').click());
  expect(place).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('The composition changed.');
});

it('edits a reference with a supported model, preserves placement and applies only the explicitly chosen result', async () => {
  vi.useFakeTimers(); const replace = vi.fn().mockResolvedValue(undefined); const place = vi.fn();
  const reference = { key: 'image', elementId: 'image', path: 'assets/original.png', src: 'assets/original.png', modality: 'image' as const, label: 'Forest' };
  let submitted: Record<string, unknown> | undefined;
  const jobs: GenerationJob[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('models/capabilities')) return Response.json({ providers: [{ id: 'codex', available: true }, { id: 'fal', available: true }], routes: { image: 'fal:flux' } });
    if (url.includes('/models?')) return Response.json({ models: [{ ...model, supportsImageReference: true }, { ...model, id: 'fal:flux', provider: 'fal', label: 'Flux' }], nextOffset: null });
    if (url.endsWith('project/status')) return Response.json({ projectId: 'project' });
    if (url.endsWith('/generations') && init?.method === 'POST') {
      submitted = JSON.parse(init.body as string);
      const job = { id: 'edited-image', projectId: 'project', state: 'completed', model, prompt: 'golden sunset', reference: { path: reference.path, sha256: 'test', mimeType: 'image/png', bytes: 20 }, assets: [{ path: 'assets/generated/sunset.png', mimeType: 'image/png', bytes: 20 }] } as GenerationJob;
      jobs.push(job); return Response.json({ job });
    }
    if (url.includes('/generations?')) return Response.json({ jobs });
    throw new Error(url);
  }));
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<I18nProvider initialLocale="en"><MediaGenerator request={{ id: 'edit', intent: 'edit', selection: reference, prompt: 'golden sunset', placement: { start: 2, duration: 6, track: 1 }, target: { projectId: 'native', compositionId: 'main', place, replace, currentPlacement: () => ({ start: 2, duration: 6, track: 1 }), importFiles: async () => {} } }} onClose={() => {}} onSettings={() => {}} /></I18nProvider>));
  expect(document.querySelector('select[aria-label="Generation model"]')?.textContent).not.toContain('Flux');
  expect(document.querySelector('input[type="number"]')?.hasAttribute('disabled')).toBe(true);
  await act(async () => button('Generate').click());
  expect(submitted).toMatchObject({ referenceAsset: 'assets/original.png', model: model.id, usage: { compositionId: 'main', elementId: 'image', property: 'src' } });
  expect(place).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  await act(async () => button('Replace selected image').click());
  expect(replace).toHaveBeenCalledExactlyOnceWith('assets/generated/sunset.png', reference);
  expect(place).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('Replaced · undo in timeline');
});

it('hides generation controls with the owning Viewer without losing the unsent prompt or submitting a request', async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('models/capabilities')) return Response.json({ providers: [{ id: 'codex', available: true }], routes: {} });
    if (url.includes('/models?')) return Response.json({ models: [model], nextOffset: null });
    if (url.endsWith('project/status')) return Response.json({ projectId: 'project' });
    if (url.includes('/generations?')) return Response.json({ jobs: [] });
    throw new Error('Unexpected request ' + url);
  });
  vi.stubGlobal('fetch', fetcher);
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const renderActive = async (active: boolean) => act(async () => root!.render(<I18nProvider initialLocale="en"><ArtifactViewActive.Provider value={active}><MediaGatewayProvider><Trigger /></MediaGatewayProvider></ArtifactViewActive.Provider></I18nProvider>));
  await renderActive(true); await act(async () => button('Open generator').click());
  await act(async () => type('textarea[aria-label="Describe your media"]', 'keep this draft'));
  const generator = document.querySelector('.motion-generator')!;
  await renderActive(false);
  expect(generator.closest('[hidden][inert]')).not.toBeNull();
  await renderActive(true);
  expect(generator.closest('[hidden]')).toBeNull();
  expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Describe your media"]')!.value).toBe('keep this draft');
  expect(fetcher.mock.calls.every(([url]) => !url.endsWith('/generations'))).toBe(true);
});
