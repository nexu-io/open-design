import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { ChatPane } from '../ChatPane';
import type {
  AgentInfo,
  AppConfig,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  ChatMessageFeedbackChange,
  Conversation,
  ProjectFile,
} from '../../types';
import type { ChatSessionMode } from '@open-design/contracts';
import type { ChatSendMeta } from '../ChatComposer';
import { useConversationChat } from './useConversationChat';
import styles from './SideChatTab.module.css';

export interface ActiveConversationChatState {
  conversationId: string;
  messages: ChatMessage[];
  streaming: boolean;
  loading?: boolean;
  sendDisabled?: boolean;
  queuedItems?: Array<{
    id: string;
    prompt: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
  }>;
  error: string | null;
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  onRetry?: (assistantMessage: ChatMessage) => void;
  onStop: () => void;
  onSubmitForm?: (text: string) => void;
  onRemoveQueuedSend?: (id: string) => void;
  // Editing a queued send replaces its full payload (prompt + attachments +
  // comment attachments + meta), matching ChatPane's QueuedSendUpdate, not just
  // the prompt string. Structural shape kept inline so this tab stays decoupled
  // from ChatPane's private interface.
  onUpdateQueuedSend?: (
    id: string,
    update: {
      prompt: string;
      attachments: ChatAttachment[];
      commentAttachments: ChatCommentAttachment[];
      meta?: ChatSendMeta;
    },
  ) => void;
  onReorderQueuedSends?: (orderedIds: string[]) => void;
  onSendQueuedNow?: (id: string) => void;
  onAssistantFeedback?: (
    assistantMessage: ChatMessage,
    change: ChatMessageFeedbackChange,
  ) => void;
}

interface Props {
  projectId: string;
  /** The conversation this side chat is bound to (the `chat:<id>` tab id). */
  conversationId: string;
  /** Live app config + agent map + locale, threaded from ProjectView so the
   *  side chat runs against the same agent selection as the primary chat. */
  config: AppConfig;
  agentsById: Map<string, AgentInfo>;
  locale: string;
  /** Project files for the composer's @-mention picker and produced-file chips. */
  projectFiles: ProjectFile[];
  projectFileNames?: Set<string>;
  /** Conversation list + selection callbacks, shared with the header menu so a
   *  side chat is just another conversation the user can browse/switch. */
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  onSessionModeChange?: (id: string, mode: ChatSessionMode) => void;
  onNewConversation?: () => void;
  /** Live ProjectView state for the primary conversation when this tab mirrors it. */
  activeConversationChat?: ActiveConversationChatState;
  /** Forward produced-file / tool-card open requests to the workspace. */
  onRequestOpenFile?: (name: string) => void;
}

// A ChatPane mounted as a workspace tab, bound to a single (usually
// context-seeded) conversation. Keyed by `${projectId}:${conversationId}` at
// the call site so switching the bound conversation fully resets composer and
// scroll state.
export function SideChatTab({
  projectId,
  conversationId,
  config,
  agentsById,
  locale,
  projectFiles,
  projectFileNames,
  conversations,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onSessionModeChange,
  onNewConversation,
  activeConversationChat,
  onRequestOpenFile,
}: Props) {
  const t = useT();
  const sessionMode =
    conversations.find((conversation) => conversation.id === conversationId)?.sessionMode
    ?? 'design';
  const chat = useConversationChat(projectId, conversationId, {
    config,
    agentsById,
    locale,
    sessionMode,
  });
  const controlledChat =
    activeConversationChat?.conversationId === conversationId
      ? activeConversationChat
      : null;

  return (
    <div className={styles.sideChat} data-testid="side-chat-tab">
      <div className={styles.banner} data-testid="side-chat-context-banner">
        <span className={styles.bannerIcon} aria-hidden>
          <Icon name="comment" size={14} />
        </span>
        <span>{t('workspace.sideChatContextBanner')}</span>
      </div>
      <div className={styles.pane}>
        <ChatPane
	          messages={controlledChat?.messages ?? chat.messages}
	          streaming={controlledChat?.streaming ?? chat.streaming}
	          loading={controlledChat?.loading ?? chat.loading}
	          sendDisabled={controlledChat?.sendDisabled}
          queuedItems={controlledChat?.queuedItems}
          onRemoveQueuedSend={controlledChat?.onRemoveQueuedSend}
          onUpdateQueuedSend={controlledChat?.onUpdateQueuedSend}
          onReorderQueuedSends={controlledChat?.onReorderQueuedSends}
          onSendQueuedNow={controlledChat?.onSendQueuedNow}
          error={controlledChat ? controlledChat.error : chat.error}
          projectId={projectId}
          sessionMode={sessionMode}
          onSessionModeChange={(mode) => onSessionModeChange?.(conversationId, mode)}
          projectFiles={projectFiles}
          projectFileNames={projectFileNames}
          onEnsureProject={async () => projectId}
          onSend={controlledChat?.onSend ?? chat.onSend}
          onRetry={controlledChat?.onRetry ?? chat.onRetry}
          onStop={controlledChat?.onStop ?? chat.onStop}
          onSubmitForm={(text) => {
            if (controlledChat?.onSubmitForm) controlledChat.onSubmitForm(text);
            else chat.onSend(text, [], []);
          }}
          onAssistantFeedback={controlledChat?.onAssistantFeedback}
          onRequestOpenFile={onRequestOpenFile}
          conversations={conversations}
          activeConversationId={conversationId}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onNewConversation={onNewConversation}
          researchAvailable={config.mode === 'daemon'}
        />
      </div>
    </div>
  );
}
