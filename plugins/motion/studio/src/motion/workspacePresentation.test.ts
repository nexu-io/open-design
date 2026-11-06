import { expect, it } from 'vitest';
import { preservePresentation, sessionPath, workspacePresentation } from '../../../shared/workspace-url';

it('uses presentation parameters without changing session or artifact identity', () => {
  expect(workspacePresentation('?embed=1')).toEqual({ embedded: true, sidebar: false, conversation: false });
  expect(workspacePresentation('?sidebar=0&conversation=0')).toEqual({ embedded: false, sidebar: false, conversation: false });
  const full = new URL(sessionPath('session', 'project'), 'http://localhost');
  const embedded = new URL(sessionPath('session', 'project', { embedded: true }), 'http://localhost');
  expect(embedded.searchParams.get('project')).toBe(full.searchParams.get('project'));
  expect(embedded.searchParams.get('session')).toBe(full.searchParams.get('session'));
  expect(embedded.searchParams.get('embed')).toBe('1');
  expect(sessionPath('session')).toBe('/?session=session');
});
it('keeps embedding and individual visibility settings through document transitions', () => {
  expect(preservePresentation('/?session=next&project=two#project/two', '?embed=1&session=old')).toBe('/?session=next&project=two&embed=1#project/two');
  expect(preservePresentation('/?session=next', '?sidebar=0&conversation=0')).toBe('/?session=next&sidebar=0&conversation=0');
});
