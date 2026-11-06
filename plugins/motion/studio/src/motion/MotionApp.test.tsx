// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { resolveWorkspaceProject } from './MotionApp';

vi.mock('../App', () => ({ StudioApp: () => null }));
const id = '11111111-1111-1111-1111-111111111111';
afterEach(() => vi.unstubAllGlobals());
it('restores the bookmarked project on the server before letting the editor mount', async () => {
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/projects') ? { activeId: 'project', projects: [{ id }, { id: 'project' }] } : url.endsWith('/status') ? { projectId: 'project', revision: 'new-revision' } : { projectId: id })));
  vi.stubGlobal('fetch', fetcher);
  await resolveWorkspaceProject(id, new AbortController().signal);
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/motion-api/projects', '/motion-api/project/status', `/motion-api/projects/${id}/open`]);
  expect(JSON.parse((fetcher.mock.calls[2] as unknown as [string, RequestInit])[1].body as string)).toEqual({ expectedRevision: 'new-revision', expectedProjectId: 'project' });
});
it('invalid, deleted and conflicting links cannot silently open a different project', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ activeId: 'project', projects: [{ id: 'project' }] })));
  vi.stubGlobal('fetch', fetcher);
  await expect(resolveWorkspaceProject('../escape', new AbortController().signal)).rejects.toThrow('项目链接无效');
  expect(fetcher).not.toHaveBeenCalled();
  await expect(resolveWorkspaceProject(id, new AbortController().signal)).rejects.toThrow('项目不存在');
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ error: '正在切换' }), { status: 409 }));
  await expect(resolveWorkspaceProject('project', new AbortController().signal)).rejects.toThrow('正在切换');
});
it('an already selected bookmark does not issue a mutation', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ activeId: id, projects: [{ id }] })));
  vi.stubGlobal('fetch', fetcher);
  await resolveWorkspaceProject(id, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledOnce();
});
