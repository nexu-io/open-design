import { describe, expect, it, vi } from 'vitest';
import { planLostAnchorWriteBacks, type CommentAnchorResolution } from '../src/comments.js';
import { persistCommentAnchor, persistCommentAnchors } from '../src/collab/comment-anchor-client.js';
import type { PreviewComment } from '../src/types.js';
import type { WorkspaceCollabContext } from '@open-design/contracts';

const POS = { x: 10, y: 20, width: 30, height: 40 };

function comment(overrides: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'c1',
    filePath: 'index.html',
    elementId: 'pin-1',
    text: 'note',
    position: POS,
    createdAt: 1,
    ...overrides,
  } as PreviewComment;
}

function lost(snapshotPos: { x: number; y: number; width: number; height: number } | null): CommentAnchorResolution {
  return {
    state: 'lost',
    snapshot: snapshotPos
      ? { filePath: 'index.html', elementId: 'pin-1', selector: '', label: '', htmlHint: '', text: 'note', position: snapshotPos }
      : null,
  };
}

describe('planLostAnchorWriteBacks', () => {
  it('captures last-good position the first time a comment is lost', () => {
    const plan = planLostAnchorWriteBacks([{ comment: comment(), resolution: lost(POS) }]);
    expect(plan).toEqual([{ commentId: 'c1', anchorState: 'lost', lastGoodPosition: POS }]);
  });

  it('is idempotent once a lastGoodPosition is already stored', () => {
    const stored = comment({ lastGoodPosition: POS });
    const plan = planLostAnchorWriteBacks([{ comment: stored, resolution: lost(POS) }]);
    expect(plan).toEqual([]);
  });

  it('does not write back anchored / reanchored / stale states', () => {
    const anchored: CommentAnchorResolution = {
      state: 'anchored',
      snapshot: { filePath: 'index.html', elementId: 'pin-1', selector: '', label: '', htmlHint: '', text: 'note', position: POS },
    };
    const stale: CommentAnchorResolution = { ...anchored, state: 'stale' };
    const plan = planLostAnchorWriteBacks([
      { comment: comment(), resolution: anchored },
      { comment: comment({ id: 'c2' }), resolution: stale },
    ]);
    expect(plan).toEqual([]);
  });

  it('skips a lost comment that has no ghost position at all', () => {
    const plan = planLostAnchorWriteBacks([{ comment: comment({ position: undefined }), resolution: lost(null) }]);
    expect(plan).toEqual([]);
  });
});

describe('persistCommentAnchor', () => {
  it('PATCHes the anchor route with the anchor state + last-good position', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, status: 200 }) as unknown as Response);
    await persistCommentAnchor({
      projectId: 'p 1',
      conversationId: 'conv',
      writeBack: { commentId: 'c1', anchorState: 'lost', lastGoodPosition: POS },
      fetch: fetchMock as unknown as typeof fetch,
      workspaceContext: {
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
        workspaceType: 'team',
        role: 'member',
        memberStatus: 'active',
        lifecycleState: 'active',
        permissions: {
          canShareProjects: true,
          canWriteSyncedFiles: true,
        },
      } as WorkspaceCollabContext,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/projects/p%201/conversations/conv/comments/c1/anchor');
    expect(init?.method).toBe('PATCH');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-od-workspace-id')).toBe('workspace-a');
    expect(headers.get('x-od-workspace-member-id')).toBe('member-a');
    expect(JSON.parse(String(init?.body))).toEqual({ anchorState: 'lost', lastGoodPosition: POS });
  });

  it('persistCommentAnchors reports failures without aborting the batch', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const ok = !String(url).includes('/c2/');
      return { ok, status: ok ? 200 : 500 } as unknown as Response;
    });
    const errors: string[] = [];
    await persistCommentAnchors({
      projectId: 'p1',
      conversationId: 'conv',
      writeBacks: [
        { commentId: 'c1', anchorState: 'lost', lastGoodPosition: POS },
        { commentId: 'c2', anchorState: 'lost', lastGoodPosition: POS },
        { commentId: 'c3', anchorState: 'lost', lastGoodPosition: POS },
      ],
      fetch: fetchMock as unknown as typeof fetch,
      onError: (_error, wb) => errors.push(wb.commentId),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(errors).toEqual(['c2']);
  });
});
