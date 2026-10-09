// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactPublicationContext, ArtifactPublicationProvider } from '../../../src/components/share/ArtifactPublicationContext';
import { notifyProjectShareHistoryChanged } from '../../../src/components/share/share-publication-events';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../../src/collab/workspace-identity';

function PublicationProbe({ name }: { name: string }) {
  const paths = useContext(ArtifactPublicationContext);
  return <span data-testid={name}>{paths === null ? 'unknown' : Array.from(paths).join(',')}</span>;
}

describe('chat artifact publication state', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reads one scoped server history for all cards and revalidates only the changed project after stop', async () => {
    let status: 'active' | 'stopped' = 'active';
    let unavailable = false;
    const fetchHistory = vi.fn(async () => unavailable ? new Response(null, { status: 503 }) : Response.json({
      projectId: 'project-1', bindingExists: true, hasEverShared: true,
      publications: [
        { sourceFilePath: 'pages/one.html', slug: 'one', status },
        { sourceFilePath: 'pages/two.html', slug: 'two', status: 'stopped' },
      ],
    }));
    vi.stubGlobal('fetch', fetchHistory);
    render(<ArtifactPublicationProvider projectId="project-1">
      <PublicationProbe name="first-card" />
      <PublicationProbe name="second-card" />
    </ArtifactPublicationProvider>);

    await waitFor(() => expect(screen.getByTestId('first-card')).toHaveTextContent('pages/one.html'));
    expect(screen.getByTestId('second-card')).toHaveTextContent('pages/one.html');
    expect(screen.getByTestId('first-card')).not.toHaveTextContent('two.html');
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    expect(fetchHistory).toHaveBeenCalledWith('/api/projects/project-1/share-state', expect.objectContaining({ cache: 'no-store' }));

    notifyProjectShareHistoryChanged('another-project');
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    unavailable = true;
    notifyProjectShareHistoryChanged('project-1');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('first-card')).toHaveTextContent('pages/one.html');
    unavailable = false;
    status = 'stopped';
    notifyProjectShareHistoryChanged('project-1');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByTestId('first-card')).toBeEmptyDOMElement());
    expect(screen.getByTestId('second-card')).toBeEmptyDOMElement();
  });

  it('removes a confirmed stopped file even if the follow-up server GET fails', async () => {
    let unavailable = false;
    const fetchHistory = vi.fn(async () => unavailable
      ? new Response(null, { status: 503 })
      : Response.json({ projectId: 'project-1', bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'pages/one.html', slug: 'one', status: 'active' }] }));
    vi.stubGlobal('fetch', fetchHistory);
    render(<ArtifactPublicationProvider projectId="project-1"><PublicationProbe name="card" /></ArtifactPublicationProvider>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('pages/one.html'));
    unavailable = true;
    notifyProjectShareHistoryChanged('project-1', {
      sourceFilePath: 'pages/one.html',
      accountScope: workspaceAccountScopedCacheKey(null),
      generation: currentWorkspaceAccountGeneration(),
    });
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('card')).toBeEmptyDOMElement());
  });

  it('keeps a confirmed stop through a stale active refresh, then accepts a later publish', async () => {
    let nextResponse: ((response: Response) => void) | undefined;
    const active = (status: 'active' | 'stopped' = 'active') => Response.json({ projectId: 'project-1', bindingExists: true, hasEverShared: true,
      publications: [{ sourceFilePath: 'pages/one.html', slug: 'one', status },
        { sourceFilePath: 'pages/other.html', slug: 'other', status: 'active' }] });
    const fetchHistory = vi.fn().mockResolvedValueOnce(active()).mockImplementation(() =>
      new Promise<Response>(resolve => { nextResponse = resolve; }));
    vi.stubGlobal('fetch', fetchHistory);
    render(<ArtifactPublicationProvider projectId="project-1"><PublicationProbe name="card" /></ArtifactPublicationProvider>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('pages/one.html'));
    notifyProjectShareHistoryChanged('project-1', {
      sourceFilePath: 'pages/one.html', accountScope: workspaceAccountScopedCacheKey(null),
      generation: currentWorkspaceAccountGeneration(),
    });
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('card')).not.toHaveTextContent('pages/one.html');
    expect(screen.getByTestId('card')).toHaveTextContent('pages/other.html');
    await act(async () => { nextResponse!(active()); });
    await waitFor(() => expect(screen.getByTestId('card')).not.toHaveTextContent('pages/one.html'));
    for (const receipt of [undefined, {sourceFilePath: 'pages/other.html', accountScope: workspaceAccountScopedCacheKey(null), generation: currentWorkspaceAccountGeneration()}]) {
      await act(async () => { notifyProjectShareHistoryChanged('project-1', undefined, receipt); });
      await act(async () => { nextResponse!(active()); });
      expect(screen.getByTestId('card')).not.toHaveTextContent('pages/one.html');
    }
    notifyProjectShareHistoryChanged('project-1', undefined, {
      sourceFilePath: 'pages/one.html', accountScope: workspaceAccountScopedCacheKey(null),
      generation: currentWorkspaceAccountGeneration(),
    }); // Only a successful publish of this file invalidates its stop receipt.
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(5));
    await act(async () => { nextResponse!(active('stopped')); }); // The publish receipt also wins over a lagging stopped read.
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('pages/one.html'));
  });

  it('ignores stop receipts from a different account, generation or project', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ projectId: 'project-1', bindingExists: true, hasEverShared: true,
      publications: [{ sourceFilePath: 'a.html', slug: 'one', status: 'active' }] })));
    render(<ArtifactPublicationProvider projectId="project-1"><PublicationProbe name="card" /></ArtifactPublicationProvider>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('a.html'));
    for (const [projectId, accountScope, generation] of [
      ['another-project', workspaceAccountScopedCacheKey(null), currentWorkspaceAccountGeneration()],
      ['project-1', 'different-account', currentWorkspaceAccountGeneration()],
      ['project-1', workspaceAccountScopedCacheKey(null), currentWorkspaceAccountGeneration() - 1],
    ] as const) {
      await act(async () => { notifyProjectShareHistoryChanged(projectId, { sourceFilePath: 'a.html', accountScope, generation }); });
      expect(screen.getByTestId('card')).toHaveTextContent('a.html');
    }
  });

  it('never carries a confirmed share into a different project or failed initial read', async () => {
    const fetchHistory = vi.fn(async (url: string) => url.includes('project-1')
      ? Response.json({ projectId: 'project-1', bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'a.html', slug: 'one', status: 'active' }] })
      : new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchHistory);
    const view = render(<ArtifactPublicationProvider projectId="project-1"><PublicationProbe name="card" /></ArtifactPublicationProvider>);
    await waitFor(() => expect(screen.getByTestId('card')).toHaveTextContent('a.html'));
    view.rerender(<ArtifactPublicationProvider projectId="project-2"><PublicationProbe name="card" /></ArtifactPublicationProvider>);
    expect(screen.getByTestId('card')).toHaveTextContent('unknown');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('card')).toHaveTextContent('unknown');
  });
});
