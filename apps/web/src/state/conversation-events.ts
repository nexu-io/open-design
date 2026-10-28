/** Window event fired after a conversation changes projects, so every rail
 *  list holding either project's conversations can re-read them. */
export const CONVERSATION_MOVED_EVENT = 'od:conversation-moved';

export interface ConversationMovedDetail {
  conversationId: string;
  fromProjectId: string;
  toProjectId: string;
}
