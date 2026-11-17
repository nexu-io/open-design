// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { notifyProjectShareHistoryChanged } from '../../src/components/share/share-publication-events';
import { REMIX_ICON_PATHS } from '../../src/components/remix-icon-paths';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({ focus: vi.fn(), restoreDraft: vi.fn(), setDraft: vi.fn() }));
    return <output data-testid="composer" />;
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['unpublished', 'published', 'stopped', 'unknown', 'loading', 'error'])(
  'OPEND-3854: ChatPane shows static Share and never reads card status (%s)',
  async (state) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/share-state')) return new Response(null, { status: 204 });
      if (state === 'loading') return new Promise<Response>(() => {});
      if (state === 'error') throw new Error('offline');
      if (state === 'unknown') return new Response(null, { status: 503 });
      return Response.json({ projectId: 'project-1', bindingExists: state !== 'unpublished',
        hasEverShared: state !== 'unpublished', publications: state === 'unpublished' ? [] : [
          { sourceFilePath: 'result.html', slug: 'result', status: state === 'stopped' ? 'stopped' : 'active' },
        ] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const statusRequests = () => fetchMock.mock.calls.filter(([url]) => /\/(share-state|public-share-state|publish-public)(?:\?|$)/.test(String(url)));
    const onArtifactShare = vi.fn();
    const onRequestOpenFile = vi.fn();
    const file = { name: 'result.html', size: 128, mtime: 1, kind: 'html' as const, mime: 'text/html' };
    const message: ChatMessage = {
      id: 'result', role: 'assistant', content: 'Done.', createdAt: 1,
      runStatus: 'succeeded', startedAt: 1, endedAt: 2,
      events: [{ kind: 'artifact_focus', show: ['result.html'] }], producedFiles: [file],
    };
    const props = { projectKindForTracking: 'prototype' as const, messages: [message], streaming: false,
      error: null, projectId: 'project-1', projectFiles: [file], projectMetadata: { kind: 'prototype' as const },
      onEnsureProject: async () => 'project-1', onSend: vi.fn(), onStop: vi.fn(),
      conversations: [], activeConversationId: null, onSelectConversation: vi.fn(), onDeleteConversation: vi.fn(),
      onArtifactShare, onRequestOpenFile };
    const view = render(<ChatPane {...props} />);
    await act(async () => {});
    const share = screen.getByTestId('artifact-card-publish-result.html');
    expect(share).toHaveTextContent(/^Share$/);
    expect(share).toHaveAccessibleName('Share');
    expect(share).toBeEnabled();
    expect(share.querySelector('path')).toHaveAttribute('d', REMIX_ICON_PATHS['share-forward-line']);
    expect(share.querySelector('[role="status"]')).toBeNull();
    expect(statusRequests()).toHaveLength(0);

    // Share receipts, rerenders and project changes must not start status reads.
    await act(async () => { notifyProjectShareHistoryChanged('project-1'); });
    view.rerender(<ChatPane {...props} />);
    expect(share).toHaveTextContent(/^Share$/);
    fireEvent.click(share);
    expect(onArtifactShare).toHaveBeenCalledExactlyOnceWith('result.html', share.getAttribute('data-artifact-anchor'));
    expect(onRequestOpenFile).not.toHaveBeenCalled();
    view.rerender(<ChatPane {...props} projectId="project-2" />);
    await act(async () => { notifyProjectShareHistoryChanged('project-2'); });
    expect(screen.getByTestId('artifact-card-publish-result.html')).toHaveTextContent(/^Share$/);
    expect(statusRequests()).toHaveLength(0);
  },
);
