import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { projectRawUrl } from '../providers/registry';
import type { TodoItem } from '../runtime/todos';
import type { ChatAttachment, ChatMessage, Conversation, ProjectFile } from '../types';
import { AssistantMessage } from './AssistantMessage';
import { ChatComposer, type ChatComposerHandle } from './ChatComposer';
import { Icon } from './Icon';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

// Featured starter prompts shown on the empty chat. Clicking one fills
// the composer (does not auto-send) so users can tweak before sending.
// Each prompt is intentionally dense — it should showcase ambitious
// layout, typographic, and information-design moves rather than a
// generic landing page.
const EXAMPLE_PROMPT_KEYS: Array<{
  icon: string;
  titleKey: keyof Dict;
  tagKey: keyof Dict;
  promptKey: keyof Dict;
}> = [
  {
    icon: '▤',
    titleKey: 'chat.example1Title',
    tagKey: 'chat.example1Tag',
    promptKey: 'chat.example1Prompt',
  },
  {
    icon: '▦',
    titleKey: 'chat.example2Title',
    tagKey: 'chat.example2Tag',
    promptKey: 'chat.example2Prompt',
  },
  {
    icon: '◈',
    titleKey: 'chat.example3Title',
    tagKey: 'chat.example3Tag',
    promptKey: 'chat.example3Prompt',
  },
];

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  projectId: string | null;
  projectFiles: ProjectFile[];
  // Names that exist in the project folder. Tool cards and chips use this
  // set to decide whether a path can be opened as a tab.
  projectFileNames?: Set<string>;
  onEnsureProject: () => Promise<string | null>;
  onSend: (prompt: string, attachments: ChatAttachment[]) => void;
  onStop: () => void;
  // Click-to-open chain: passes a basename up to ProjectView, which sets
  // FileWorkspace's openRequest. Tool cards, attachment chips, and
  // produced-file chips all call this.
  onRequestOpenFile?: (name: string) => void;
  initialDraft?: string;
  // Question-form submissions become a normal user message; the parent
  // routes that text through onSend (no attachments).
  onSubmitForm?: (text: string) => void;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  // Header "+" button — kicks off ProjectView's create-conversation flow.
  onNewConversation?: () => void;
  // Conversation list that used to live in the topbar. The chat tab now
  // owns the list so users can browse + switch conversations without
  // leaving the pane.
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, title: string) => void;
  // Composer settings/CLI button forwards to here. The dialog lives in App
  // (it owns the AppConfig lifecycle) so we just pass the open trigger.
  onOpenSettings?: () => void;
}

type Tab = 'chat' | 'comments';

export function ChatPane({
  messages,
  streaming,
  error,
  projectId,
  projectFiles,
  projectFileNames,
  onEnsureProject,
  onSend,
  onStop,
  onRequestOpenFile,
  initialDraft,
  onSubmitForm,
  onContinueRemainingTasks,
  onNewConversation,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onOpenSettings,
}: Props) {
  const t = useT();
  const logRef = useRef<HTMLDivElement | null>(null);
  const historyWrapRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const didInitialScrollRef = useRef(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [showConvList, setShowConvList] = useState(false);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const hasActiveRunMessage = messages.some(
    (m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus),
  );
  // Map each assistant message id to the user message that follows it
  // (if any) so QuestionFormView can render its locked "answered" state
  // with the user's picks.
  const nextUserContentByAssistantId = (() => {
    const map = new Map<string, string>();
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i]!;
      const next = messages[i + 1]!;
      if (m.role === 'assistant' && next.role === 'user') {
        map.set(m.id, next.content);
      }
    }
    return map;
  })();

  useEffect(() => {
    didInitialScrollRef.current = false;
  }, [activeConversationId]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || didInitialScrollRef.current || messages.length === 0) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setScrolledFromBottom(false);
    });
  }, [activeConversationId, messages.length]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // Auto-scroll only when we're already pinned near the bottom — preserves
    // a user's scrollback position when they're reading earlier output while
    // a new turn streams in.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, error]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    function onScroll() {
      const target = logRef.current;
      if (!target) return;
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      setScrolledFromBottom(distance > 120);
    }
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Close the conversation history dropdown on outside click / Escape.
  useEffect(() => {
    if (!showConvList) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (historyWrapRef.current?.contains(target)) return;
      setShowConvList(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowConvList(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showConvList]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  function jumpToBottom() {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  return (
    <div className="pane">
      <div className="chat-header">
        <div className="chat-header-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            className={`chat-header-tab${tab === 'chat' ? ' active' : ''}`}
            onClick={() => setTab('chat')}
          >
            {t('chat.tabChat')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="chat-header-tab"
            disabled
            title={t('chat.commentsSoon')}
            data-coming-soon="true"
          >
            {t('chat.tabComments')}
          </button>
        </div>
        <div className="chat-header-actions">
          <div
            className={`chat-history-wrap${showConvList ? ' open' : ''}`}
            ref={historyWrapRef}
          >
            <button
              type="button"
              className="icon-only"
              data-testid="conversation-history-trigger"
              title={
                activeConversation?.title
                  ? `${t('chat.conversationsTitle')} · ${activeConversation.title}`
                  : t('chat.conversationsTitle')
              }
              aria-label={t('chat.conversationsAria')}
              aria-haspopup="menu"
              aria-expanded={showConvList}
              onClick={() => setShowConvList((v) => !v)}
            >
              <Icon name="history" size={15} />
              {conversations.length > 1 ? (
                <span className="chat-history-badge">{conversations.length}</span>
              ) : null}
            </button>
            {showConvList ? (
              <div className="chat-history-menu" role="menu" data-testid="conversation-history-menu">
                <div className="chat-history-menu-head">
                  <span className="chat-history-menu-title">
                    {t('chat.conversationsHeading')}
                  </span>
                  {onNewConversation ? (
                    <button
                      type="button"
                      className="chat-history-new"
                      data-testid="conversation-history-new"
                      onClick={() => {
                        onNewConversation();
                        setShowConvList(false);
                      }}
                    >
                      <Icon name="plus" size={11} />
                      <span>{t('chat.new')}</span>
                    </button>
                  ) : null}
                </div>
                <div className="chat-history-list" data-testid="conversation-list">
                  {conversations.length === 0 ? (
                    <div className="chat-history-empty">
                      {t('chat.emptyConversations')}
                    </div>
                  ) : (
                    conversations.map((c) => (
                      <ConversationRow
                        key={c.id}
                        conversation={c}
                        active={c.id === activeConversationId}
                        onSelect={() => {
                          onSelectConversation(c.id);
                          setShowConvList(false);
                        }}
                        onDelete={() => onDeleteConversation(c.id)}
                        onRename={onRenameConversation}
                        t={t}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-only"
            data-testid="new-conversation"
            title={t('chat.newConversationsTitle')}
            aria-label={t('chat.newConversation')}
            onClick={onNewConversation}
            disabled={!onNewConversation}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>
      {tab === 'chat' ? (
        <>
          <div className="chat-log-wrap">
            <div className="chat-log" ref={logRef}>
              {messages.length === 0 ? (
                <div className="chat-empty-wrap">
                  <div className="chat-empty">
                    <span className="chat-empty-title">
                      {t('chat.startTitle')}
                    </span>
                    <span className="chat-empty-hint">
                      {t('chat.startHint')}
                    </span>
                  </div>
                  <div className="chat-examples" role="list">
                    {EXAMPLE_PROMPT_KEYS.map((ex, i) => {
                      const title = t(ex.titleKey);
                      const tag = t(ex.tagKey);
                      const prompt = t(ex.promptKey);
                      return (
                        <button
                          key={ex.titleKey}
                          type="button"
                          role="listitem"
                          className="chat-example"
                          style={{ animationDelay: `${i * 70}ms` }}
                          onClick={() => composerRef.current?.setDraft(prompt)}
                          title={t('chat.fillInputTitle')}
                        >
                          <span className="chat-example-icon" aria-hidden>
                            {ex.icon}
                          </span>
                          <span className="chat-example-body">
                            <span className="chat-example-head">
                              <span className="chat-example-title">{title}</span>
                              <span className="chat-example-tag">{tag}</span>
                            </span>
                            <span className="chat-example-prompt">{prompt}</span>
                          </span>
                          <span className="chat-example-cta" aria-hidden>
                            ↵
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {messages.map((m) => {
                const messageStreaming =
                  m.role === 'assistant' &&
                  ((streaming && m.id === lastAssistantId) || isActiveRunStatus(m.runStatus));
                return m.role === 'user' ? (
                  <UserMessage
                    key={m.id}
                    message={m}
                    projectId={projectId}
                    projectFileNames={projectFileNames}
                    onRequestOpenFile={onRequestOpenFile}
                    t={t}
                  />
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    streaming={messageStreaming}
                    projectId={projectId}
                    projectFileNames={projectFileNames}
                    onRequestOpenFile={onRequestOpenFile}
                    isLast={m.id === lastAssistantId}
                    nextUserContent={nextUserContentByAssistantId.get(m.id)}
                    onSubmitForm={onSubmitForm}
                    onContinueRemainingTasks={
                      m.id === lastAssistantId && onContinueRemainingTasks
                        ? (todos) => onContinueRemainingTasks(m, todos)
                        : undefined
                    }
                  />
                );
              })}
              {error ? <div className="msg error">{error}</div> : null}
            </div>
            {scrolledFromBottom ? (
              <button
                type="button"
                className="chat-jump-btn"
                onClick={jumpToBottom}
                title={t('chat.scrollToLatest')}
              >
                <Icon name="arrow-up" size={12} style={{ transform: 'rotate(180deg)' }} />
                <span>{t('chat.jumpToLatest')}</span>
              </button>
            ) : null}
          </div>
          <ChatComposer
            ref={composerRef}
            projectId={projectId}
            projectFiles={projectFiles}
            streaming={streaming || hasActiveRunMessage}
            initialDraft={initialDraft}
            onEnsureProject={onEnsureProject}
            onSend={onSend}
            onStop={onStop}
            onOpenSettings={onOpenSettings}
          />
        </>
      ) : null}
    </div>
  );
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
  onRename,
  t,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename?: (id: string, title: string) => void;
  t: TranslateFn;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title ?? '');
  const displayTitle =
    conversation.title || t('chat.untitledConversation');
  return (
    <div
      className={`chat-conv-item${active ? ' active' : ''}`}
      data-testid={`conversation-item-${conversation.id}`}
    >
      {editing && onRename ? (
        <input
          autoFocus
          className="chat-conv-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onRename(conversation.id, draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(conversation.id, draft);
              setEditing(false);
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          style={{ flex: 1, padding: '2px 6px', fontSize: 12 }}
        />
      ) : (
        <button
          type="button"
          className="chat-conv-item-name"
          data-testid={`conversation-select-${conversation.id}`}
          style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}
          onClick={onSelect}
          onDoubleClick={() => {
            if (!onRename) return;
            setDraft(conversation.title ?? '');
            setEditing(true);
          }}
        >
          {displayTitle}
        </button>
      )}
      <span className="chat-conv-item-meta">{relTime(conversation.updatedAt, t)}</span>
      <button
        type="button"
        className="chat-conv-item-del"
        data-testid={`conversation-delete-${conversation.id}`}
        title={t('chat.deleteConversation')}
        onClick={(e) => {
          e.stopPropagation();
          if (
            confirm(t('chat.deleteConversationConfirm', { title: displayTitle }))
          ) {
            onDelete();
          }
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

function UserMessage({
  message,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  t,
}: {
  message: ChatMessage;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  t: TranslateFn;
}) {
  const attachments = message.attachments ?? [];
  return (
    <div className="msg user">
      <div className="role">{t('chat.you')}</div>
      {attachments.length > 0 ? (
        <div className="user-attachments">
          {attachments.map((a) => {
            const baseName = a.path.split('/').pop() || a.path;
            const openable =
              !!onRequestOpenFile &&
              (projectFileNames ? projectFileNames.has(baseName) : true);
            const handleOpen = openable
              ? () => onRequestOpenFile?.(baseName)
              : undefined;
            return (
              <button
                type="button"
                key={a.path}
                className={`user-attachment staged-${a.kind}${openable ? ' openable' : ''}`}
                onClick={handleOpen}
                disabled={!openable}
                title={openable ? t('chat.openFile', { name: baseName }) : a.path}
              >
                {a.kind === 'image' && projectId ? (
                  <img src={projectRawUrl(projectId, a.path)} alt={a.name} />
                ) : (
                  <Icon name="file" size={14} />
                )}
                <span className="staged-name">{a.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="user-text">{message.content}</div>
    </div>
  );
}

function relTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.now');
  if (diff < hr) return t('common.minutesShort', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursShort', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysShort', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}
