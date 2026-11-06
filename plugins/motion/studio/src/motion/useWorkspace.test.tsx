// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useWorkspace } from './useWorkspace';

const first = '11111111-1111-1111-1111-111111111111';
const second = '22222222-2222-2222-2222-222222222222';
const status = { revision: 'a'.repeat(64), projectId: first, projectTitle: 'First', exportJob: null };
let workspace: ReturnType<typeof useWorkspace>;
let root: Root;
let container: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
let navigate: ReturnType<typeof vi.spyOn>;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  navigate = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  fetcher = vi.fn(async (url: string, init?: RequestInit) => new Response(JSON.stringify(
    init?.method === 'POST' ? { ...status, projectId: second } : url.endsWith('/projects') ? { activeId: first, projects: [{ id: first, title: 'First' }] } : status,
  )));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(wait: () => Promise<void>, projectId?: string, sessionId?: string) {
  function Harness() { workspace = useWorkspace(wait, projectId, sessionId); return null; }
  await act(async () => root.render(<Harness />));
}
const writes = () => fetcher.mock.calls.filter(call => call[1]?.method === 'POST');

it('waits for saves, deduplicates rapid actions and opens the new project in a new document', async () => {
  let saved!: () => void;
  const pending = new Promise<void>(resolve => { saved = resolve; });
  await mount(() => pending, first);
  let operation!: Promise<boolean>;
  act(() => { operation = workspace.create(); });
  await act(async () => { await workspace.open('projects', second); });
  expect(writes()).toHaveLength(0);
  await act(async () => { saved(); await operation; });
  expect(writes()).toHaveLength(1);
  expect(writes()[0][0]).toBe('/motion-api/projects');
  expect(JSON.parse(writes()[0][1]!.body as string)).toEqual({ expectedRevision: status.revision, expectedProjectId: first });
  expect(navigate).toHaveBeenCalledWith(`/?project=${second}#project/${second}`);
});
it('save failures prevent creating, switching and leaving for home', async () => {
  await mount(async () => { throw new Error('Unsaved edit'); }, first);
  for (const action of [() => workspace.create(), () => workspace.open('projects', second), () => workspace.home()]) {
    await act(action);
    expect(workspace.busy).toBe(false);
    expect(workspace.error).toBe('Unsaved edit');
  }
  expect(writes()).toHaveLength(0);
  expect(navigate).not.toHaveBeenCalled();
});
it('a rejected switch stays in the original session and can be retried', async () => {
  await mount(async () => {}, first);
  fetcher.mockImplementation(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST' ? { error: 'Revision changed' } : status), { status: init?.method === 'POST' ? 409 : 200 }));
  await act(() => workspace.open('projects', second));
  expect(workspace.error).toBe('Revision changed');
  expect(workspace.busy).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});
it('home stays home when another client switches the active project', async () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
  await mount(async () => {});
  expect(workspace.status?.projectId).toBe(first);
  expect(replace).not.toHaveBeenCalled();
  await act(() => workspace.home());
  expect(navigate).toHaveBeenCalledWith('/');
  expect(writes()).toHaveLength(0);
});
it('keeps a home request after failure and clears it only once the project was created with that request', async () => {
  await mount(async () => {});
  localStorage.setItem('motion.home.draft.v1', 'Make a launch video');
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => init?.method === 'POST'
    ? new Response(JSON.stringify({ error: 'Creation failed' }), { status: 503 }) : original(url, init));
  await act(() => workspace.create('Make a launch video'));
  expect(localStorage.getItem('motion.home.draft.v1')).toBe('Make a launch video');
  expect(navigate).not.toHaveBeenCalled();
  fetcher.mockImplementation(original);
  await act(() => workspace.create('Make a launch video'));
  expect(JSON.parse(writes()[1][1]!.body as string).instruction).toBe('Make a launch video');
  expect(localStorage.getItem('motion.home.draft.v1')).toBeNull();
  expect(navigate).toHaveBeenCalledWith(`/?project=${second}#project/${second}`);
});
it('creates the conversation before generating an artifact and retains it when generation fails', async () => {
  await mount(async () => {});
  localStorage.setItem('motion.home.draft.v1', 'New film');
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/design-api/sessions' && init?.method === 'POST') return new Response(JSON.stringify({ sessionId: 'new-session' }));
    if (url.endsWith('/artifacts')) return new Response(JSON.stringify({ error: 'Generation failed' }), { status: 503 });
    return original(url, init);
  });
  await act(() => workspace.startSession('New film', 'product-promo'));
  expect(writes().map(call => call[0])).toEqual(['/design-api/sessions', '/design-api/sessions/new-session/artifacts']);
  expect(navigate).toHaveBeenCalledWith('/?session=new-session');
  expect(localStorage.getItem('motion.home.draft.v1')).toBeNull();
  expect(sessionStorage.getItem('opendesign.session-error:new-session')).toBe('Generation failed');
});
it('activates the viewer when an external Agent produces an artifact for an open empty conversation', async () => {
  const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => url.endsWith('/projects') ? new Response(JSON.stringify({ projects: [], sessions: [{ id: 'conversation', artifacts: [{ id: 'artifact', projectId: first }] }] })) : original(url, init));
  await mount(async () => {}, undefined, 'conversation');
  expect(replace).toHaveBeenCalledWith(`/?session=conversation&project=${first}&openArtifact=1#project/${first}`);
});
