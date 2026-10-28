import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { Conversation, Project } from '../../types';
import {
  deleteConversation,
  listConversations,
  listMessages,
  moveConversation,
  patchConversation,
} from '../../state/projects';
import { CONVERSATION_MOVED_EVENT } from '../../state/conversation-events';
import { exportAsMd } from '../../runtime/exports';
import { workspaceIdentityCacheKey } from '../../collab/workspace-identity';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { RailConversationModel } from './RailConversationTree';
import { RailConversationRow } from './RailConversationRow';
import { acceptsMovedConversations, CONVERSATION_MOVE_FAILED_EVENT } from './conversationDrag';
import styles from './RailConversationTree.module.css';
import sectionStyles from './RailRecentSection.module.css';

const STORAGE_KEY = 'od.entry.railRecentOpen';

/** A flat conversation list. Project folders remain in the separate Projects section. */
export function RailConversationsSection({ projects, moveTargets, context, model, onOpenConversation }: {
  projects: Project[];
  /** The Projects section's folders — what 移动到 offers. Defaults to `projects`. */
  moveTargets?: Project[];
  context?: WorkspaceCollabContext | null;
  model?: RailConversationModel | null;
  onOpenConversation?: (projectId: string, conversationId: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const listId = useId();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
  });
  const [showAll, setShowAll] = useState(false);
  const [retry, setRetry] = useState(0);
  const identity = workspaceIdentityCacheKey(context);
  const contextRef = useRef(context);
  contextRef.current = context;
  const projectIds = JSON.stringify([...new Set(projects.map(project => project.id))].sort());
  const liveProjectId = model?.projectId;
  const [loaded, setLoaded] = useState<{ identity: string; items: Conversation[] }>({ identity, items: [] });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moveFailed, setMoveFailed] = useState(false);

  // Any move — from this list, a folder drop, or the live project — changes
  // which project owns a row, so re-read rather than patch every cache.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => setRetry(value => value + 1);
    const showFailure = () => {
      setMoveFailed(true);
      clearTimeout(timer);
      timer = setTimeout(() => setMoveFailed(false), 4000);
    };
    window.addEventListener(CONVERSATION_MOVED_EVENT, refresh);
    window.addEventListener(CONVERSATION_MOVE_FAILED_EVENT, showFailure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(CONVERSATION_MOVED_EVENT, refresh);
      window.removeEventListener(CONVERSATION_MOVE_FAILED_EVENT, showFailure);
    };
  }, []);

  // Keep the outgoing live project's rows during the route/model handoff.
  useEffect(() => {
    if (!model || model.conversationsLoading) return;
    setLoaded(previous => ({
      identity,
      items: [
        ...(previous.identity === identity ? previous.items.filter(item => item.projectId !== model.projectId) : []),
        ...model.conversations.map(item => ({ ...item, projectId: model.projectId })),
      ],
    }));
  }, [identity, liveProjectId, model?.conversations, model?.conversationsLoading]);

  useEffect(() => {
    if (!model?.activeConversationId) return;
    setOpen(true);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* Storage is optional. */ }
  }, [model?.activeConversationId]);
  useEffect(() => { setShowAll(false); }, [identity]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const ids = (JSON.parse(projectIds) as string[]).filter(id => id !== liveProjectId);
    const workspaceContext = contextRef.current;
    const items: Conversation[] = [];
    const refreshedProjects = new Set<string>();
    let cursor = 0;
    let hadFailure = false;
    setLoading(true);
    setFailed(false);
    // Bound requests when a workspace contains many projects. Reads use the
    // existing scoped/coalesced API; no new conversation storage is introduced.
    async function worker() {
      while (!cancelled && cursor < ids.length) {
        const projectId = ids[cursor++]!;
        try {
          const conversations = await listConversations(projectId, { workspaceContext, throwOnError: true });
          refreshedProjects.add(projectId);
          items.push(...conversations.map(conversation => ({ ...conversation, projectId })));
        } catch { hadFailure = true; }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker)).then(() => {
      if (cancelled) return;
      // Replace successful reads only; a background refresh must not blank the
      // sidebar or discard cached conversations when one project is offline.
      setLoaded(previous => ({
        identity,
        items: [
          ...(previous.identity === identity ? previous.items.filter(item => !refreshedProjects.has(item.projectId)) : []),
          ...items,
        ],
      }));
      setFailed(hadFailure);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, projectIds, identity, liveProjectId, retry]);

  const allowedProjects = new Set(projects.map(project => project.id));
  const items = [
    ...(loaded.identity === identity ? loaded.items.filter(item => allowedProjects.has(item.projectId) && (item.projectId !== liveProjectId || model?.conversationsLoading)) : []),
    ...(model && !model.conversationsLoading ? model.conversations.map(item => ({ ...item, projectId: model.projectId })) : []),
  ].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const visible = showAll ? items : items.slice(0, 12);
  const active = items.find(item => item.projectId === model?.projectId && item.id === model?.activeConversationId);
  if (!showAll && active && !visible.includes(active)) visible[visible.length - 1] = active;

  type Row = Conversation & { projectId: string };
  const isLive = (item: Row) => model?.projectId === item.projectId;
  // The live project owns its list in ProjectView; other projects' rows live
  // only in this section's cache, so those are patched in place.
  function patchCached(item: Row, next: Conversation | null) {
    setLoaded(previous => previous.identity !== identity ? previous : {
      identity,
      items: next
        ? previous.items.map(entry => entry.projectId === item.projectId && entry.id === item.id ? { ...entry, ...next, projectId: item.projectId } : entry)
        : previous.items.filter(entry => !(entry.projectId === item.projectId && entry.id === item.id)),
    });
  }
  async function renameConversation(item: Row, title: string) {
    if (isLive(item)) return void model?.onRename?.(item.id, title);
    patchCached(item, { ...item, title });
    const updated = await patchConversation(item.projectId, item.id, { title }, contextRef.current);
    if (!updated) setRetry(value => value + 1);
  }
  async function removeConversation(item: Row) {
    if (isLive(item)) return void model?.onDelete?.(item.id);
    if (await deleteConversation(item.projectId, item.id, contextRef.current)) patchCached(item, null);
  }
  async function exportConversation(item: Row) {
    const title = item.title || t('chat.untitledConversation');
    const messages = await listMessages(item.projectId, item.id, contextRef.current);
    const body = messages
      .filter(message => message.content.trim())
      .map(message => `## ${message.role === 'user' ? 'User' : message.agentName || 'Assistant'}\n\n${message.content.trim()}`)
      .join('\n\n');
    exportAsMd(`# ${title}\n\n${body}\n`, title);
  }
  const liveActionsReady = (item: Row) => !isLive(item) || Boolean(model?.onRename);
  const projectById = new Map(projects.map(project => [project.id, project]));
  const folderTargets = (moveTargets ?? projects).filter(acceptsMovedConversations);
  // Team conversations, and the live project's when it is read-only, stay put.
  const canMove = (item: Row) => {
    const source = projectById.get(item.projectId);
    return Boolean(source && acceptsMovedConversations(source)) && (!isLive(item) || Boolean(model?.onMove));
  };
  async function relocateConversation(item: Row, targetProjectId: string) {
    const moved = isLive(item)
      ? await model?.onMove?.(item.id, targetProjectId)
      : Boolean(await moveConversation(item.projectId, item.id, targetProjectId, contextRef.current));
    if (!moved) window.dispatchEvent(new Event(CONVERSATION_MOVE_FAILED_EVENT));
  }

  return <div className="entry-nav-rail__recent">
    <button type="button" className="entry-nav-rail__recent-head" aria-expanded={open} aria-controls={listId}
      data-testid="entry-nav-conversations-toggle" onClick={() => {
        setOpen(!open);
        try { localStorage.setItem(STORAGE_KEY, String(!open)); } catch { /* Storage is optional. */ }
      }}>
      <span className="entry-nav-rail__recent-title">{t('chat.conversationsHeading')}</span>
      <span className="entry-nav-rail__recent-chevron" aria-hidden><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></span>
    </button>
    <div className={`accordion-collapsible${open ? ' open' : ''}`} inert={!open} aria-hidden={!open || undefined}>
      <div className="accordion-collapsible-inner">
        <ul id={listId} className="entry-nav-rail__recent-list" aria-label={t('chat.conversationsHeading')}>
          {moveFailed ? <li className={styles.status} role="status">{t('chat.moveConversationFailed')}</li> : null}
          {visible.map(conversation => <li key={`${conversation.projectId}:${conversation.id}`}>
            <RailConversationRow
              rowId={`conversation:${conversation.projectId}:${conversation.id}`}
              title={conversation.title}
              selected={model?.activeConversationId === conversation.id}
              onOpen={() => model?.projectId === conversation.projectId
                ? model.onSelect(conversation.id)
                : void onOpenConversation?.(conversation.projectId, conversation.id)}
              onRename={liveActionsReady(conversation) ? title => void renameConversation(conversation, title) : undefined}
              onExport={() => void exportConversation(conversation)}
              onDelete={liveActionsReady(conversation) ? () => void removeConversation(conversation) : undefined}
              moveTargets={canMove(conversation) ? folderTargets.filter(project => project.id !== conversation.projectId) : undefined}
              onMove={canMove(conversation) ? targetProjectId => void relocateConversation(conversation, targetProjectId) : undefined}
              dragItem={canMove(conversation) ? { projectId: conversation.projectId, conversationId: conversation.id } : undefined}
            />
          </li>)}
          {loading && items.length === 0 ? <li className={styles.status}>{t('common.loading')}</li> : null}
          {failed ? <li><Button className={styles.conversation} onClick={() => setRetry(value => value + 1)}>{t('preview.retry')}</Button></li> : null}
        </ul>
        {items.length > 12 ? <Button variant="ghost" className={sectionStyles.toggle} onClick={() => setShowAll(!showAll)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M5 10C3.9 10 3 10.9 3 12C3 13.1 3.9 14 5 14C6.1 14 7 13.1 7 12C7 10.9 6.1 10 5 10ZM19 10C17.9 10 17 10.9 17 12C17 13.1 17.9 14 19 14C20.1 14 21 13.1 21 12C21 10.9 20.1 10 19 10ZM12 10C10.9 10 10 10.9 10 12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12C14 10.9 13.1 10 12 10Z" />
          </svg>
          {showAll ? t('chat.input.collapse') : t('recentProjects.viewAll')}
        </Button> : null}
      </div>
    </div>
  </div>;
}
