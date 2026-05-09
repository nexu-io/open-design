import { Fragment, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { projectRawUrl } from '../providers/registry';
import type { TodoItem } from '../runtime/todos';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ChatMessage, Conversation, PreviewComment, ProjectFile, ProjectMetadata } from '../types';
import { dayKey, dayLabel, exactDateTime, messageTime, relativeTimeLong } from '../utils/chatTime';
import { commentsToAttachments, simplePositionLabel } from '../comments';
import { AssistantMessage } from './AssistantMessage';
import {
  ChatComposer,
  type ChatComposerHandle,
  type ChatSendMeta,
} from './ChatComposer';
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
  previewComments?: PreviewComment[];
  attachedComments?: PreviewComment[];
  onAttachComment?: (comment: PreviewComment) => void;
  onDetachComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onSend: (prompt: string, attachments: ChatAttachment[], commentAttachments: ChatCommentAttachment[], meta?: ChatSendMeta) => void;
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
  // Same dialog, but landing on the External MCP tab. Forwarded to the
  // composer's `/mcp` slash and MCP picker button.
  onOpenMcpSettings?: () => void;
  // Optional pet wiring forwarded straight through to ChatComposer's
  // /pet button. When omitted the composer hides the button entirely.
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  researchAvailable?: boolean;
  onCollapse?: () => void;
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
  previewComments = [],
  attachedComments = [],
  onAttachComment,
  onDetachComment,
  onDeleteComment,
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
  onOpenMcpSettings,
  petConfig,
  onAdoptPet,
  onTogglePet,
  onOpenPetSettings,
  projectMetadata,
  onProjectMetadataChange,
  researchAvailable,
  onCollapse,
}: Props) {
  const t = useT();
  const logRef = useRef<HTMLDivElement | null>(null);
  const historyWrapRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const didInitialScrollRef = useRef(false);
  // Tracks whether the user is glued close enough to the bottom that
  // streamed content should auto-follow. Distinct from the jump-button
  // state below, which uses a wider threshold (120px) so the affordance
  // stays visible for short scroll-ups. Auto-follow needs the tighter
  // 80px cutoff: scrolling ~90px up is an intentional pause that
  // shouldn't be yanked back the moment the next chunk streams in.
  const pinnedToBottomRef = useRef(true);
  const scrolledToFormRef = useRef<Set<string>>(new Set());
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
    // A new conversation should land at the bottom (its own initial
    // scroll), not inherit the previous conversation's saved position.
    savedChatScrollRef.current = null;
    scrolledToFormRef.current = new Set();
  }, [activeConversationId]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || didInitialScrollRef.current || messages.length === 0) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user sees the form first.
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const assistantEls = el.querySelectorAll('.msg.assistant');
        const lastAssistantEl = assistantEls[assistantEls.length - 1];
        const formEl = lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]');
        if (formEl && !scrolledToFormRef.current.has(formEl.dataset.formId!)) {
          scrolledToFormRef.current.add(formEl.dataset.formId!);
          formEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          pinnedToBottomRef.current = false;
          setScrolledFromBottom(true);
          return;
        }
        // Already handled by the auto-scroll effect — don't bottom-scroll.
        if (formEl) return;
      }
      // Initial-load bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that flip pinnedToBottomRef to false.
      el.scrollTop = el.scrollHeight;
      setScrolledFromBottom(false);
      pinnedToBottomRef.current = true;
    });
    // `tab` is in the deps so that switching conversations while
    // Comments is open doesn't strand the new conversation at scrollTop:
    // 0. The activeConversationId-reset effect above clears
    // didInitialScrollRef while the chat-log is unmounted; this effect
    // then re-runs when the user returns to Chat and the element is
    // available, scrolling the new conversation to its initial bottom.
  }, [activeConversationId, messages.length, tab]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // Auto-scroll only when the user was already pinned near the bottom,
    // so a scrollback session reading earlier output isn't yanked to the
    // latest message. We key off the pre-content `pinnedToBottomRef`
    // (a ref so it doesn't itself re-fire this effect on scroll) instead
    // of recomputing distance from the just-grown scrollHeight: a single
    // streamed chunk can add 100+ px in one render, which made the
    // post-content distance check skip auto-scroll even when the user
    // was glued to the bottom. We deliberately use the tighter 80px
    // cutoff tracked by the ref (not the wider 120px jump-button
    // threshold) so a deliberate ~90px scroll-up isn't snapped back the
    // next time content streams in. Issue #983.
    if (pinnedToBottomRef.current) {
      // If the last assistant message contains a question form, scroll to
      // the form instead of the bottom, so the user lands on the form.
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg?.content.includes('<question-form')) {
        const assistantEls = el.querySelectorAll('.msg.assistant');
        const lastAssistantEl = assistantEls[assistantEls.length - 1];
        const formEl = lastAssistantEl?.querySelector<HTMLElement>('[data-form-id]');
        if (formEl && !scrolledToFormRef.current.has(formEl.dataset.formId!)) {
          scrolledToFormRef.current.add(formEl.dataset.formId!);
          formEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          pinnedToBottomRef.current = false;
          setScrolledFromBottom(true);
          return;
        }
        // Form tag in content but the DOM element isn't ready yet (partial
        // stream) — skip bottom-scroll to avoid a jarring jump that gets
        // undone when the form finishes rendering.
        if (streaming) return;
      }
      // Streaming bottom-pin must be instant — smooth scrollTo emits
      // intermediate scroll events that flip pinnedToBottomRef to false,
      // breaking auto-follow for subsequent chunks.
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, error, streaming]);

  // Saved chat-log scroll state, preserved across tab switches. The
  // chat-log <div> is conditionally rendered so it unmounts when the
  // user switches to Comments. On remount it would default to
  // scrollTop: 0 and the initial-bottom-scroll effect skips because
  // didInitialScrollRef is already true. We capture either the absolute
  // scrollTop or a "pinned to bottom" flag while Chat is visible, so
  // bottom-followers stay pinned even when new messages stream in
  // off-tab. Issue #790.
  const savedChatScrollRef = useRef<
    { pinnedToBottom: true } | { pinnedToBottom: false; scrollTop: number } | null
  >(null);
  useEffect(() => {
    if (tab !== 'chat') return;
    const el = logRef.current;
    if (!el) return;

    // Restore previously-saved position on remount. Defer to the next
    // frame so the conditional <> contents finish layout before the
    // scrollTop write lands.
    const saved = savedChatScrollRef.current;
    if (saved !== null) {
      requestAnimationFrame(() => {
        const target = logRef.current;
        if (!target) return;
        if (saved.pinnedToBottom) {
          target.scrollTop = target.scrollHeight;
        } else {
          target.scrollTop = saved.scrollTop;
        }
        // Resync the jump-to-latest affordance with the restored
        // position. Without this, a user who left Chat ~60px from the
        // bottom and returns to find new messages stacked underneath
        // would land hundreds of pixels above the latest turn while
        // scrolledFromBottom remained false until they scrolled.
        const distance =
          target.scrollHeight - target.scrollTop - target.clientHeight;
        setScrolledFromBottom(distance > 120);
        pinnedToBottomRef.current = distance < 80;
      });
    }

    function snapshot(target: HTMLDivElement) {
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      savedChatScrollRef.current =
        distance < 50
          ? { pinnedToBottom: true }
          : { pinnedToBottom: false, scrollTop: target.scrollTop };
    }

    function onScroll() {
      const target = logRef.current;
      if (!target) return;
      snapshot(target);
      const distance =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      setScrolledFromBottom(distance > 120);
      pinnedToBottomRef.current = distance < 80;
    }
    el.addEventListener('scroll', onScroll);
    return () => {
      // Capture final scroll state before unmount; the ref normally
      // tracks via onScroll, but programmatic scrolls or layout shifts
      // right before unmount can leave it stale.
      snapshot(el);
      el.removeEventListener('scroll', onScroll);
    };
  }, [tab]);

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
            aria-selected={tab === 'comments'}
            className={`chat-header-tab${tab === 'comments' ? ' active' : ''}`}
            onClick={() => setTab('comments')}
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
          {onCollapse ? (
            <button
              type="button"
              className="icon-only"
              data-testid="chat-collapse"
              title={t('workspace.focusMode')}
              aria-label={t('workspace.focusMode')}
              onClick={onCollapse}
            >
              <Icon name="chevron-left" size={15} />
            </button>
          ) : null}
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
              {messages.map((m, i) => {
                const showDaySeparator = shouldShowDaySeparator(messages[i - 1], m);
                const messageStreaming =
                  m.role === 'assistant' &&
                  ((streaming && m.id === lastAssistantId) || isActiveRunStatus(m.runStatus));
                return (
                  <Fragment key={m.id}>
                    {showDaySeparator ? <DaySeparator ts={messageTime(m)} /> : null}
                    {m.role === 'user' ? (
                      <UserMessage
                        message={m}
                        projectId={projectId}
                        projectFileNames={projectFileNames}
                        onRequestOpenFile={onRequestOpenFile}
                        t={t}
                      />
                    ) : (
                      <AssistantMessage
                        message={m}
                        streaming={messageStreaming}
                        projectId={projectId}
                        projectFileNames={projectFileNames}
                        onRequestOpenFile={onRequestOpenFile}
                        isLast={m.id === lastAssistantId}
                        nextUserContent={nextUserContentByAssistantId.get(m.id)}
                        onSubmitForm={(text) => {
                          pinnedToBottomRef.current = true;
                          scrolledToFormRef.current = new Set();
                          onSubmitForm?.(text);
                        }}
                        onContinueRemainingTasks={
                          m.id === lastAssistantId && onContinueRemainingTasks
                            ? (todos) => onContinueRemainingTasks(m, todos)
                            : undefined
                        }
                      />
                    )}
                  </Fragment>
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
            commentAttachments={commentsToAttachments(attachedComments)}
            onRemoveCommentAttachment={onDetachComment}
            onSend={(prompt, attachments, commentAttachments, meta) => {
              pinnedToBottomRef.current = true;
              scrolledToFormRef.current = new Set();
              onSend(prompt, attachments, commentAttachments, meta);
            }}
            onStop={onStop}
            onOpenSettings={onOpenSettings}
            onOpenMcpSettings={onOpenMcpSettings}
            petConfig={petConfig}
            onAdoptPet={onAdoptPet}
            onTogglePet={onTogglePet}
            onOpenPetSettings={onOpenPetSettings}
            researchAvailable={researchAvailable}
            projectMetadata={projectMetadata}
            onProjectMetadataChange={onProjectMetadataChange}
          />
        </>
      ) : null}
      {tab === 'comments' ? (
        <CommentsPanel
          comments={previewComments}
          attachedComments={attachedComments}
          onAttach={onAttachComment}
          onDetach={onDetachComment}
          onDelete={onDeleteComment}
          t={t}
        />
      ) : null}
    </div>
  );
}

function CommentsPanel({
  comments,
  attachedComments,
  onAttach,
  onDetach,
  onDelete,
  t,
}: {
  comments: PreviewComment[];
  attachedComments: PreviewComment[];
  onAttach?: (comment: PreviewComment) => void;
  onDetach?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  t: TranslateFn;
}) {
  const attachedIds = new Set(attachedComments.map((comment) => comment.id));
  const saved = comments.filter((comment) => !attachedIds.has(comment.id));
  return (
    <div className="comments-panel" data-testid="comments-panel">
      <CommentSection
        title={t('chat.comments.attached')}
        empty={t('chat.comments.emptyAttached')}
        comments={attachedComments}
        actionLabel={t('chat.comments.remove')}
        onAction={(comment) => onDetach?.(comment.id)}
        attached
      />
      <CommentSection
        title={t('chat.comments.saved')}
        empty={t('chat.comments.emptySaved')}
        comments={saved}
        actionLabel={t('chat.comments.add')}
        onAction={(comment) => onAttach?.(comment)}
        secondaryActionLabel={t('chat.comments.remove')}
        onSecondaryAction={(comment) => onDelete?.(comment.id)}
      />
      {saved.length > 0 ? (
        <div className="comments-footer">
          <button
            type="button"
            className="primary"
            onClick={() => saved.forEach((comment) => onAttach?.(comment))}
          >
            {t('chat.comments.addAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CommentSection({
  title,
  empty,
  comments,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  attached,
}: {
  title: string;
  empty: string;
  comments: PreviewComment[];
  actionLabel: string;
  onAction: (comment: PreviewComment) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (comment: PreviewComment) => void;
  attached?: boolean;
}) {
  return (
    <section className="comments-section">
      <h3>{title}</h3>
      {comments.length === 0 ? (
        <p className="comments-empty">{empty}</p>
      ) : (
        comments.map((comment) => (
          <article
            key={comment.id}
            className={`comment-card${attached ? ' attached' : ''}`}
            data-testid={`comment-card-${comment.elementId}`}
          >
            <div className="comment-card-top">
              <strong>{comment.elementId}</strong>
              <div className="comment-card-actions">
                {secondaryActionLabel && onSecondaryAction ? (
                  <button
                    type="button"
                    className="comment-card-action danger"
                    onClick={() => onSecondaryAction(comment)}
                  >
                    {secondaryActionLabel}
                  </button>
                ) : null}
                <button type="button" className="comment-card-action" onClick={() => onAction(comment)}>
                  {actionLabel}
                </button>
              </div>
            </div>
            <p>{comment.note}</p>
            <div className="comment-card-meta">
              <span>{comment.id}</span>
              <span>{comment.filePath}</span>
              <span>{comment.label}</span>
              <span>{simplePositionLabel(comment.position)}</span>
            </div>
          </article>
        ))
      )}
    </section>
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
  const commentAttachments = message.commentAttachments ?? [];
  return (
    <div className="msg user">
      <div className="role">
        <span>{t('chat.you')}</span>
        <MessageTimestamp message={message} t={t} />
      </div>
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
      {commentAttachments.length > 0 ? (
        <div className="user-attachments comment-history-attachments">
          {commentAttachments.map((a) => (
            <span key={a.id} className="user-attachment staged-comment">
              <span className="staged-name">
                <strong>{a.elementId}</strong>
                <span>{a.comment}</span>
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {message.content ? <div className="user-text">{message.content}</div> : null}
    </div>
  );
}

function DaySeparator({ ts }: { ts: number | undefined }) {
  if (!ts) return null;
  return (
    <div className="chat-day-separator" role="separator">
      <time dateTime={new Date(ts).toISOString()}>{dayLabel(ts)}</time>
    </div>
  );
}

function MessageTimestamp({ message, t }: { message: ChatMessage; t: TranslateFn }) {
  const ts = messageTime(message);
  if (!ts) return null;
  return (
    <time className="msg-time" dateTime={new Date(ts).toISOString()} title={exactDateTime(ts)}>
      {relativeTimeLong(ts, t)}
    </time>
  );
}

function shouldShowDaySeparator(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  const currTime = messageTime(curr);
  if (!currTime) return false;
  const prevTime = prev ? messageTime(prev) : undefined;
  if (!prevTime) return true;
  return dayKey(prevTime) !== dayKey(currTime);
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
