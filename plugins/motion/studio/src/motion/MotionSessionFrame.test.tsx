// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18n';
import { MotionSessionFrame } from './MotionSessionFrame';
import { browserKey } from './artifactBrowser';

const state = vi.hoisted(() => ({ wait: vi.fn(async () => {}), open: vi.fn(async () => true), blocked: false }));
const artifacts = [{ id: 'one', kind: 'motion-project', projectId: 'project', title: 'First motion' }, { id: 'two', kind: 'motion-project', projectId: 'second', title: 'Second motion' }];
vi.mock('./WorkspaceFrame', () => ({ WorkspaceMenuButton: () => <button className="motion-workspace-menu">Sidebar</button>, useWorkspaceChrome: () => ({ beforeViewChange: state.wait, switchingDisabled: state.blocked, workspace: { session: { id: 'session', title: 'My conversation', artifacts }, openSession: state.open } }) }));
vi.mock('./ProjectConversation', () => ({ ProjectConversation: () => <div>Conversation messages</div> }));
let root: Root, container: HTMLDivElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  history.replaceState(null, '', '/');
  vi.clearAllMocks(); localStorage.clear(); state.blocked = false; state.wait.mockResolvedValue(); state.open.mockResolvedValue(true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200 } as DOMRect);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => root.render(<I18nProvider initialLocale="en"><MotionSessionFrame sessionId="session" projectId="project"><div data-editor>Native editor</div></MotionSessionFrame></I18nProvider>)); }
async function click(label: string) { await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()); }
it('puts the whole editor in its browser tab, closes to free conversation and restores the same editor', async () => {
  await mount(); const editor = container.querySelector('[data-editor]');
  expect(container.querySelector('.motion-conversation-header > .motion-workspace-menu')).not.toBeNull();
  expect(container.querySelector('.motion-browser-tabbar > .motion-workspace-menu')).toBeNull();
  expect(container.querySelector('.motion-artifact-browser')!.contains(editor)).toBe(true);
  await click('Close browser');
  expect(container.querySelector<HTMLElement>('.motion-artifact-browser')!.hidden).toBe(true);
  expect(container.querySelector('.motion-conversation')!.getAttribute('data-full')).toBe('true');
  expect(container.querySelector('[data-editor]')).toBe(editor);
  expect(container.querySelector('.motion-artifact-editor')!.hasAttribute('inert')).toBe(true);
  const shortcut = vi.fn(); window.addEventListener('keydown', shortcut);
  container.querySelector('.motion-conversation')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  window.removeEventListener('keydown', shortcut);
  expect(shortcut).not.toHaveBeenCalled();
  await click('Open browser'); await click('Expand browser');
  expect(container.querySelector('.motion-browser-tabbar > .motion-workspace-menu')).not.toBeNull();
  expect(container.querySelector<HTMLElement>('.motion-conversation')!.hidden).toBe(true);
  await click('Show conversation');
  expect(container.querySelector<HTMLElement>('.motion-conversation')!.hidden).toBe(false);
});
it('does not close the browser until pending saves complete, and preserves it on failure', async () => {
  await mount(); let finish!: () => void;
  state.wait.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click('Close browser');
  expect(container.querySelector<HTMLElement>('.motion-artifact-browser')!.hidden).toBe(false);
  await act(async () => finish());
  await click('Open browser');
  state.wait.mockRejectedValueOnce(new Error('Save failed'));
  await click('Close browser');
  expect(container.querySelector<HTMLElement>('.motion-artifact-browser')!.hidden).toBe(false);
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('Save failed');
});
it('closing the active artifact switches to the adjacent artifact through the server', async () => {
  localStorage.setItem(browserKey('session'), JSON.stringify({ tabs: [{ id: 'two', kind: 'artifact', artifactId: 'two' }, { id: 'one', kind: 'artifact', artifactId: 'one' }], activeId: 'one' }));
  await mount(); await click('Close First motion');
  expect(state.open).toHaveBeenCalledWith('session', 'second');
  expect(JSON.parse(localStorage.getItem(browserKey('session'))!).tabs).toEqual([{ id: 'two', kind: 'artifact', artifactId: 'two' }]);
});
it('failed cross-artifact switches retain the original tabs and persisted preference', async () => {
  await mount(); const before = localStorage.getItem(browserKey('session'));
  state.open.mockResolvedValueOnce(false);
  await click('New tab');
  const withNew = localStorage.getItem(browserKey('session'));
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.motion-browser-new button')].find(el => el.textContent?.includes('Second motion'))!.click());
  expect(localStorage.getItem(browserKey('session'))).toBe(withNew);
  expect(withNew).not.toBe(before);
  expect(container.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe('New tab');
});
it('closing all tabs leaves the conversation available with a new browser entry', async () => {
  await mount(); await click('Expand browser'); await click('Close First motion');
  expect(container.querySelector<HTMLElement>('.motion-conversation')!.hidden).toBe(false);
  await click('Open browser');
  expect(container.querySelector('.motion-browser-new')).not.toBeNull();
});
it('embed=1 shows only the viewer without changing the full-workspace browser preference', async () => {
  const preference = JSON.stringify({ tabs: [{ id: 'one', kind: 'artifact', artifactId: 'one' }], activeId: 'one', browserOpen: false, conversationOpen: true });
  localStorage.setItem(browserKey('session'), preference);
  history.replaceState(null, '', '/?embed=1');
  await mount();
  expect(container.querySelector<HTMLElement>('.motion-conversation')!.hidden).toBe(true);
  expect(container.querySelector<HTMLElement>('.motion-artifact-browser')!.hidden).toBe(false);
  expect(container.querySelector<HTMLElement>('.motion-browser-tabbar')!.hidden).toBe(true);
  expect(container.querySelector<HTMLElement>('.motion-browser-address')!.hidden).toBe(true);
  expect(container.querySelector('[data-editor]')).not.toBeNull();
  expect(localStorage.getItem(browserKey('session'))).toBe(preference);
});

it('switches narrow conversation and browser panes from their own headers while keeping the editor mounted', async () => {
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ width: 600 } as DOMRect);
  await mount(); const editor = container.querySelector('[data-editor]');
  expect(container.querySelector<HTMLElement>('.motion-conversation')!.hidden).toBe(true);
  await click('Show conversation');
  expect(container.querySelector<HTMLElement>('.motion-conversation')!.hidden).toBe(false);
  expect(container.querySelector<HTMLElement>('.motion-artifact-browser')!.hidden).toBe(true);
  await click('Open browser');
  expect(container.querySelector<HTMLElement>('.motion-artifact-browser')!.hidden).toBe(false);
  expect(container.querySelector('[data-editor]')).toBe(editor);
});
