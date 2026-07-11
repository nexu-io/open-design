// Transport home for conversation-message CRUD and preview-comment listing.
// `listMessages`/`saveMessage` already live as shared best-effort transport in
// `state/projects` (consumed by several other components too); `fetchPreviewComments`
// lives in the daemon registry. This file narrows them to what the
// project-view slice's port needs so the slice itself never imports those
// modules directly.
import {
  listMessages as listMessagesTransport,
  saveMessage as saveMessageTransport,
  type SaveMessageOptions,
} from '../../state/projects';
import { fetchPreviewComments as fetchPreviewCommentsTransport } from '../registry';
import type { ChatMessage, PreviewComment } from '../../types';

/** List a conversation's messages. Best-effort: resolves `[]` on failure. */
export async function listMessages(
  projectId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  return listMessagesTransport(projectId, conversationId);
}

/** Persist a single message. Best-effort: never rejects. */
export async function saveMessage(
  projectId: string,
  conversationId: string,
  message: ChatMessage,
  options?: SaveMessageOptions,
): Promise<void> {
  return saveMessageTransport(projectId, conversationId, message, options);
}

/** List a conversation's preview comments. Best-effort: resolves `[]` on failure. */
export async function fetchPreviewComments(
  projectId: string,
  conversationId: string,
): Promise<PreviewComment[]> {
  return fetchPreviewCommentsTransport(projectId, conversationId);
}
