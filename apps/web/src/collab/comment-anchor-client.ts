import type { AnchorWriteBack } from '../comments';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceProjectHeaders } from './workspace-identity';

export interface PersistCommentAnchorArgs {
  projectId: string;
  conversationId: string;
  writeBack: AnchorWriteBack;
  fetch?: typeof fetch;
  baseUrl?: string;
  workspaceContext?: WorkspaceCollabContext | null;
}

/**
 * Persist a single comment anchor transition through the daemon anchor route
 * . Only the durable `lost` capture flows here (see
 * {@link planLostAnchorWriteBacks}); the server COALESCEs lastGoodPosition so a
 * repeated write is a no-op. Rejections are the caller's to swallow — a failed
 * durability write must never break rendering.
 */
export async function persistCommentAnchor(args: PersistCommentAnchorArgs): Promise<void> {
  const fetchImpl = args.fetch ?? globalThis.fetch.bind(globalThis);
  const base = args.baseUrl ?? '';
  const url =
    `${base}/api/projects/${encodeURIComponent(args.projectId)}` +
    `/conversations/${encodeURIComponent(args.conversationId)}` +
    `/comments/${encodeURIComponent(args.writeBack.commentId)}/anchor`;
  const response = await fetchImpl(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(args.workspaceContext ? workspaceProjectHeaders(args.workspaceContext) : {}),
    },
    body: JSON.stringify({
      anchorState: args.writeBack.anchorState,
      lastGoodPosition: args.writeBack.lastGoodPosition,
    }),
  });
  if (!response.ok) throw new Error(`persist comment anchor failed: ${response.status}`);
}

export interface PersistCommentAnchorsArgs {
  projectId: string;
  conversationId: string;
  writeBacks: AnchorWriteBack[];
  fetch?: typeof fetch;
  baseUrl?: string;
  workspaceContext?: WorkspaceCollabContext | null;
  onError?: (error: unknown, writeBack: AnchorWriteBack) => void;
}

/** Persist a batch; one failure does not abort the rest. */
export async function persistCommentAnchors(args: PersistCommentAnchorsArgs): Promise<void> {
  for (const writeBack of args.writeBacks) {
    try {
      await persistCommentAnchor({
        projectId: args.projectId,
        conversationId: args.conversationId,
        writeBack,
        ...(args.fetch ? { fetch: args.fetch } : {}),
        ...(args.baseUrl !== undefined ? { baseUrl: args.baseUrl } : {}),
        ...(args.workspaceContext ? { workspaceContext: args.workspaceContext } : {}),
      });
    } catch (error) {
      args.onError?.(error, writeBack);
    }
  }
}
