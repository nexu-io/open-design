// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18n';
import { MotionHistoryPanel } from './MotionHistoryPanel';

const shell = vi.hoisted(() => ({
  projectId: 'project', waitForPendingDomEditSaves: vi.fn<() => Promise<void>>(),
  writeBlockedReason: null as string | null, renderQueue: { isRendering: false },
}));
vi.mock('../contexts/StudioContext', () => ({ useStudioShellContext: () => shell }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let entries: Array<{ id: string; label: string; startedAt: number; endedAt: number; pinned: boolean; undone: boolean; who: { kind: string; name: string }; files: Array<{ path: string; before: string; after: string }> }>;
let calls: Array<{ path: string; body?: Record<string, unknown> }>;
let restoreError: boolean;
const onRestored = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  shell.waitForPendingDomEditSaves.mockResolvedValue();
  shell.writeBlockedReason = null; shell.renderQueue.isRendering = false;
  entries = ['first', 'second'].map((id, index) => ({ id, label: `${id} edit`, startedAt: 1000 + index, endedAt: 1000 + index,
    pinned: false, undone: false, who: { kind: 'person', name: 'You' }, files: [{ path: 'index.html', before: 'a', after: 'b' }] }));
  calls = []; restoreError = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('/api/projects/project/history', '');
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    if (path === '/restore' && restoreError) return new Response(JSON.stringify({ error: 'Version is no longer kept' }), { status: 409 });
    if (path === '/pin') entries.find(entry => entry.id === body.entryId)!.pinned = body.pinned;
    return new Response(JSON.stringify(path ? { ok: true } : { entries }));
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...container.querySelectorAll('button')].find(el => el.textContent?.includes(text))!;
const click = async (text: string) => { await act(async () => button(text).click()); };
const render = async () => { await act(async () => root.render(<I18nProvider initialLocale="zh-CN"><MotionHistoryPanel onRestored={onRestored} /></I18nProvider>)); };

it('keeps the current version only after native saves and a checkpoint finish', async () => {
  await render();
  await click('保留当前版本');
  expect(shell.waitForPendingDomEditSaves).toHaveBeenCalledOnce();
  expect(calls.filter(call => call.body)).toEqual([
    { path: '/checkpoint', body: {} }, { path: '/pin', body: { entryId: 'second', pinned: true } },
  ]);
  expect(container.textContent).toContain('已保留当前版本');
});

it('restores the selected version with the native API and reloads only after success', async () => {
  await render(); await click('first edit'); await click('恢复此版本');
  expect(shell.waitForPendingDomEditSaves).toHaveBeenCalledOnce();
  expect(calls.filter(call => call.body)).toEqual([
    { path: '/checkpoint', body: {} }, { path: '/restore', body: { point: 'first' } },
  ]);
  expect(onRestored).toHaveBeenCalledOnce();
});

it('does not replace the project when pending edits fail to save', async () => {
  shell.waitForPendingDomEditSaves.mockRejectedValue(new Error('Save conflict'));
  await render(); await click('first edit'); await click('恢复此版本');
  expect(calls.filter(call => call.body)).toEqual([]);
  expect(onRestored).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Save conflict');
});

it('shows native restore refusals and keeps the current editor open', async () => {
  restoreError = true;
  await render(); await click('first edit'); await click('恢复此版本');
  expect(onRestored).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Version is no longer kept');
});

it('blocks restoring and pinning during a render', async () => {
  shell.renderQueue.isRendering = true;
  await render(); await click('first edit');
  for (const text of ['恢复此版本', '保留此版本', '保留当前版本']) expect(button(text).disabled).toBe(true);
});
