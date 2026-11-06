import { expect, it } from 'vitest';
import { requestedProject, validWorkspaceProject, projectHref } from './workspaceRouting';

it('distinguishes home from query links and MCP hash links without opening unknown routes', () => {
  expect(requestedProject('', '')).toBeNull();
  expect(requestedProject('?panel=connections', '')).toBeNull();
  expect(requestedProject('', '#project/project?comp=compositions%2Ffirst.html')).toBe('project');
  expect(requestedProject('?project=project', '')).toBe('project');
  expect(requestedProject('', '#project/%2e%2e')).toBe('');
  expect(requestedProject('?project=', '')).toBe('');
  expect(validWorkspaceProject('../files')).toBe(false);
  expect(validWorkspaceProject('missing')).toBe(false);
  expect(validWorkspaceProject('project')).toBe(true);
  const id = '11111111-1111-1111-1111-111111111111';
  expect(validWorkspaceProject(id)).toBe(true);
  const url = new URL(projectHref(id), 'http://localhost');
  expect(requestedProject(url.search, url.hash)).toBe(id);
});
