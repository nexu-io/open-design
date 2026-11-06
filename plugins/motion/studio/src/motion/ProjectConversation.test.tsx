// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18n';
import { HomeComposer, ProjectConversation } from './ProjectConversation';

const state = vi.hoisted(() => ({ create: vi.fn(), disabled: false, open: vi.fn() }));
vi.mock('./WorkspaceFrame', () => ({ useWorkspaceChrome: () => ({ workspace: { startSession: state.create, status: { projectId: 'project' } }, switchingDisabled: state.disabled, openConnections: state.open, openLibrary: state.open }) }));
let root: Root, container: HTMLDivElement, fetcher: ReturnType<typeof vi.fn>;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); state.disabled = false;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const projectId = url.split('/')[3];
    const message = init?.body ? JSON.parse(init.body as string) : { id: 'saved', content: projectId === 'project' ? 'Original request' : 'Second request' };
    return new Response(JSON.stringify({ id: projectId, artifacts: [{ id: 'artifact', kind: 'motion-project', projectId, title: 'First' }], messages: [{ ...message, role: 'user', createdAt: Date.now() }] }));
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(id = 'project') { await act(async () => root.render(<I18nProvider initialLocale="en"><ProjectConversation key={id} sessionId={id} onOpenArtifact={vi.fn()} /></I18nProvider>)); }
function type(value: string) {
  const input = container.querySelector<HTMLTextAreaElement>('.motion-composer textarea')!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function submit() { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }

it('keeps per-session drafts and messages isolated, with an session-scoped Agent handoff', async () => {
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  await mount(); type('Unsent first draft');
  await act(async () => { container.querySelector<HTMLButtonElement>('.motion-conversation-message button')!.click(); });
  expect(clipboard.mock.calls[0][0]).toContain('?session=project&project=project#project/project');
  expect(container.querySelector<HTMLTextAreaElement>('.motion-manual-copy')!.value).toContain('Original request');
  await mount('second');
  expect(container.textContent).toContain('Second request');
  expect(container.textContent).not.toContain('Original request');
  expect(container.querySelector<HTMLTextAreaElement>('.motion-composer textarea')!.value).toBe('');
  type('Second draft'); await mount();
  expect(container.querySelector<HTMLTextAreaElement>('.motion-composer textarea')!.value).toBe('Unsent first draft');
});
it('preserves failed requests and retries with the same message identity before clearing the draft', async () => {
  await mount(); type('Make it shorter');
  const success = fetcher.getMockImplementation()!;
  fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('offline');
  expect(localStorage.getItem('motion.conversation.draft.v1:project')).toBe('Make it shorter');
  fetcher.mockImplementation(success); await submit();
  const writes = fetcher.mock.calls.filter(call => call[1]?.method === 'POST');
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  expect(container.querySelector<HTMLTextAreaElement>('.motion-composer textarea')!.value).toBe('');
  expect(container.textContent).toContain('Make it shorter');
});
it('creates a session from the home request and blocks empty or unavailable submissions', async () => {
  await act(async () => root.render(<I18nProvider initialLocale="en"><HomeComposer onClear={vi.fn()} /></I18nProvider>));
  await submit(); expect(state.create).not.toHaveBeenCalled();
  type('A product launch'); await submit(); expect(state.create).toHaveBeenCalledWith('A product launch', undefined);
  expect(localStorage.getItem('motion.home.draft.v1')).toBe('A product launch');
  state.disabled = true;
  await act(async () => root.render(<I18nProvider initialLocale="en"><HomeComposer onClear={vi.fn()} /></I18nProvider>));
  await submit(); expect(state.create).toHaveBeenCalledTimes(1);
});
it('submits a selected Motion template with the request instead of opening it during selection', async () => {
  const template = { id: 'product-promo', title: 'Product Promo' } as any;
  await act(async () => root.render(<I18nProvider initialLocale="en"><HomeComposer template={template} onClear={vi.fn()} /></I18nProvider>));
  expect(state.create).not.toHaveBeenCalled();
  expect(container.querySelector('select')!.textContent).toBe('Motion');
  expect(container.querySelector('.motion-selected-template')!.textContent).toContain('Product Promo');
  type('A 12 second launch'); await submit();
  expect(state.create).toHaveBeenCalledWith('A 12 second launch', 'product-promo');
});
