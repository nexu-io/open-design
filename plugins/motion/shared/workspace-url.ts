export type WorkspacePresentation = { embedded: boolean; sidebar: boolean; conversation: boolean };
export function workspacePresentation(search: string): WorkspacePresentation {
  const query = new URLSearchParams(search), embedded = query.get('embed') === '1';
  return { embedded, sidebar: !embedded && query.get('sidebar') !== '0', conversation: !embedded && query.get('conversation') !== '0' };
}
export function sessionPath(sessionId: string, projectId?: string, options: { openArtifact?: boolean; embedded?: boolean } = {}) {
  const query = new URLSearchParams({ session: sessionId });
  if (projectId) query.set('project', projectId);
  if (options.openArtifact) query.set('openArtifact', '1');
  if (options.embedded) query.set('embed', '1');
  return '/?' + query + (projectId ? '#project/' + encodeURIComponent(projectId) : '');
}
export function preservePresentation(target: string, search: string) {
  const url = new URL(target, 'http://workspace.local'), current = new URLSearchParams(search);
  for (const key of ['embed', 'sidebar', 'conversation']) if (current.has(key)) url.searchParams.set(key, current.get(key)!);
  return url.pathname + url.search + url.hash;
}
