// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18n';
import { HomeTemplates } from './HomeTemplates';

const state = vi.hoisted(() => ({ open: vi.fn(), disabled: false }));
vi.mock('./WorkspaceFrame', () => ({ useWorkspaceChrome: () => ({ workspace: { open: state.open }, switchingDisabled: state.disabled }) }));
const builtin = { id: 'product-promo', kind: 'builtin', title: 'Product Promo', author: 'Hyperframes', description: 'Editable', tags: [], collection: 'builtin' };
const reference = { id: 'hf-moment-M953', kind: 'reference', title: 'Reference', author: 'Creator', description: 'Reference video', tags: [], collection: 'moment' };
let root: Root, container: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
let clipboard: ReturnType<typeof vi.fn>;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  state.disabled = false; vi.clearAllMocks(); vi.useFakeTimers();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  clipboard = vi.fn(async () => {});
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(clipboard);
  fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/integration') ? { previewUrl: 'http://localhost:4173' } : {
    items: url.includes('category=builtin') ? [builtin] : [reference], total: 1, entryTotal: 1, catalogTotal: 2, offset: 0, next: null,
  })));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function render() { await act(async () => { root.render(<I18nProvider initialLocale="zh-CN"><HomeTemplates /></I18nProvider>); }); await act(async () => { await vi.runOnlyPendingTimersAsync(); }); }
const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent === text)!;
it('only editable templates open a new engineering project; references copy their exact Agent instruction', async () => {
  await render();
  expect(container.querySelector('.motion-editable-badge')?.textContent).toBe('可以二次剪辑');
  act(() => button('打开并编辑').click());
  expect(state.open).toHaveBeenCalledWith('templates', 'product-promo');
  act(() => button('精选参考').click());
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  expect(container.querySelector('.motion-editable-badge')).toBeNull();
  await act(async () => button('一键复制').click());
  expect(clipboard).toHaveBeenCalledOnce();
  expect(clipboard.mock.calls[0][0]).toContain('template=hf-moment-M953');
  expect(state.open).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('已复制');
});
it('blocked project actions remain unavailable and denied clipboard access offers a usable instruction', async () => {
  state.disabled = true;
  await render();
  expect(button('打开并编辑').disabled).toBe(true);
  act(() => button('精选参考').click());
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  clipboard.mockRejectedValue(new Error('denied'));
  await act(async () => button('一键复制').click());
  expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('hf-moment-M953');
  expect(state.open).not.toHaveBeenCalled();
});
it('switching filters clears previous results and offers retry on a failed request', async () => {
  await render();
  fetcher.mockImplementation(async (_url: string) => new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
  act(() => button('精选参考').click());
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  expect(container.querySelectorAll('.motion-home-template')).toHaveLength(0);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('offline');
  expect(button('重试')).toBeTruthy();
});
