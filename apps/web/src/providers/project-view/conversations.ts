// Transport home for conversation CRUD: list/create/rename/delete a
// project's conversations. These already live as shared best-effort/throwing
// transport in `state/projects` (consumed by several other components too);
// this file narrows them to what the project-view slice's port needs so the
// slice itself never imports `state/projects` directly.
import {
  createConversation as createConversationTransport,
  deleteConversation as deleteConversationTransport,
  listConversations as listConversationsTransport,
  patchConversation as patchConversationTransport,
} from '../../state/projects';
import type { ChatSessionMode } from '@open-design/contracts';
import type { ChatMessage, Conversation } from '../../types';

/** List a project's conversations. Best-effort: resolves `[]` on failure. */
export async function listConversations(projectId: string): Promise<Conversation[]> {
  return listConversationsTransport(projectId);
}

/** Create a conversation, optionally seeded from a fork point. Best-effort:
 *  resolves `null` on failure. Forwards only the arguments actually
 *  supplied (not `undefined` padding) so callers that assert on the
 *  underlying transport's call arity see the same shape as before this
 *  adapter existed. */
export async function createConversation(
  projectId: string,
  title?: string,
  opts?: {
    seedFromConversationId?: string | null;
    forkAfterMessageId?: string | null;
    sessionMode?: ChatSessionMode;
    seedMessages?: ChatMessage[];
  },
): Promise<Conversation | null> {
  if (opts !== undefined) return createConversationTransport(projectId, title, opts);
  if (title !== undefined) return createConversationTransport(projectId, title);
  return createConversationTransport(projectId);
}

/** Patch a conversation (title/sessionMode/etc). Best-effort: resolves
 *  `null` on failure. */
export async function patchConversation(
  projectId: string,
  conversationId: string,
  patch: Partial<Conversation>,
): Promise<Conversation | null> {
  return patchConversationTransport(projectId, conversationId, patch);
}

/** Delete a conversation. Resolves `false` on failure. */
export async function deleteConversation(
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  return deleteConversationTransport(projectId, conversationId);
}
