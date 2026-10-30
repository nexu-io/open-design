/** Window event fired after a conversation changes projects, so every rail
 *  list holding either project's conversations can re-read them. */
export const CONVERSATION_MOVED_EVENT = 'od:conversation-moved';

export interface ConversationMovedDetail {
  conversationId: string;
  fromProjectId: string;
  toProjectId: string;
}

/** Window event fired after a conversation is created outside the open
 *  project's own chat (the rail's 新建会话 on a project's Home page), so the
 *  rail lists holding that project's conversations re-read them. */
export const CONVERSATION_CREATED_EVENT = 'od:conversation-created';

export interface ConversationCreatedDetail {
  conversationId: string;
  projectId: string;
}
