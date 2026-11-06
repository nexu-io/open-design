import { expect, it } from 'vitest';
import { browserGeometry, browserReducer as reduce, browserUrl, initialBrowser } from './artifactBrowser';
import type { SessionArtifact } from '../../../shared/session';

const artifacts: SessionArtifact[] = [1, 2].map(i => ({ id: `artifact-${i}`, projectId: `project-${i}`, kind: 'motion-project', title: `Motion ${i}` }));
const initial = () => initialBrowser(artifacts, 'project-1');
it('closing either surface always leaves a usable surface and can restore both', () => {
  let state = reduce(initial(), { type: 'conversation', open: false });
  expect(state.conversationOpen).toBe(false);
  state = reduce(state, { type: 'browser', open: false });
  expect(state.conversationOpen).toBe(true);
  expect(state.browserOpen).toBe(false);
  state = reduce(state, { type: 'conversation', open: false });
  expect(state.conversationOpen).toBe(true);
  state = reduce(state, { type: 'browser', open: true });
  expect(state.browserOpen && state.conversationOpen).toBe(true);
});
it('closing the last tab returns to conversation; a new tab restores the browser', () => {
  let state = reduce(reduce(initial(), { type: 'conversation', open: false }), { type: 'close', id: 'artifact-1' });
  expect(state).toMatchObject({ tabs: [], activeId: null, browserOpen: false, conversationOpen: true });
  state = reduce(state, { type: 'new', id: 'new' });
  expect(state).toMatchObject({ activeId: 'new', browserOpen: true });
});
it('opens a second artifact in a new tab without duplicating existing artifacts', () => {
  let state = reduce(initial(), { type: 'new', id: 'new' });
  state = reduce(state, { type: 'artifact', artifactId: 'artifact-2', id: 'unused' });
  expect(state.tabs).toHaveLength(2);
  expect(state.activeId).toBe('new');
  state = reduce(state, { type: 'artifact', artifactId: 'artifact-1', id: 'duplicate' });
  expect(state.tabs).toHaveLength(2);
  expect(state.activeId).toBe('artifact-1');
  state = reduce(state, { type: 'close', id: 'artifact-1' });
  expect(state.activeId).toBe('new');
});
it('refresh restores hidden surfaces, web tabs and width for the same conversation', () => {
  let state = reduce(initial(), { type: 'new', id: 'web' });
  state = reduce(state, { type: 'navigate', url: 'https://example.org/' });
  state = reduce(state, { type: 'width', value: 400 });
  state = reduce(state, { type: 'browser', open: false });
  expect(initialBrowser(artifacts, 'project-1', JSON.stringify(state))).toEqual(state);
  const reopened = initialBrowser(artifacts, 'project-2', JSON.stringify(state), true);
  expect(reopened.browserOpen).toBe(true);
  expect(reopened.tabs.find(tab => tab.id === reopened.activeId)).toMatchObject({ artifactId: 'artifact-2' });
});
it('navigating from a Motion artifact preserves its tab and stores redirects on the correct web tab', () => {
  let state = reduce(initial(), { type: 'navigate', url: 'baidu.com', id: 'web' });
  expect(state.tabs).toHaveLength(2);
  expect(state.tabs[0]).toMatchObject({ kind: 'artifact', artifactId: 'artifact-1' });
  state = reduce(state, { type: 'activate', id: 'artifact-1' });
  state = reduce(state, { type: 'page', id: 'web', url: 'https://www.baidu.com/', title: '百度' });
  expect(state.activeId).toBe('artifact-1');
  expect(state.tabs[1]).toMatchObject({ url: 'https://www.baidu.com/', title: '百度' });
});
it('rejects unsafe addresses and strips corrupt or foreign persisted tabs', () => {
  for (const address of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:secret@example.org']) expect(() => browserUrl(address)).toThrow();
  expect(browserUrl('example.org/docs')).toBe('https://example.org/docs');
  const state = initialBrowser(artifacts, 'project-1', JSON.stringify({ tabs: [{ id: 'a', kind: 'artifact', artifactId: 'foreign' }, { id: 'x', kind: 'web', url: 'javascript:1' }], conversationOpen: false, browserOpen: false }));
  expect(state.tabs).toHaveLength(0);
  expect(state.conversationOpen).toBe(true);
});
it('keeps the visible native artifact aligned with the resolved URL after stale preferences', () => {
  const saved = reduce(initial(), { type: 'artifact', artifactId: 'artifact-2', id: 'two' });
  const state = initialBrowser(artifacts, 'project-1', JSON.stringify(saved));
  expect(state.tabs.find(tab => tab.id === state.activeId)).toMatchObject({ artifactId: 'artifact-1' });
});
it('never produces an empty narrow viewport across surface transitions', () => {
  for (const width of [390, 768, 1024, 1440]) {
    let state = initial();
    for (const action of [{ type: 'conversation', open: false }, { type: 'browser', open: false }, { type: 'browser', open: true }, { type: 'conversation', open: true }, { type: 'surface', value: 'browser' }] as const) {
      state = reduce(state, action);
      const view = browserGeometry(width, state);
      expect(view.showBrowser || view.showConversation).toBe(true);
      if (width < 900) expect(view.showBrowser && view.showConversation).toBe(false);
    }
  }
});
