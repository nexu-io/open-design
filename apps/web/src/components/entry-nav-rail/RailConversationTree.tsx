import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { Conversation, Project } from '../../types';
import { createConversation, listConversations, moveConversation } from '../../state/projects';
import {
  CONVERSATION_CREATED_EVENT,
  CONVERSATION_MOVED_EVENT,
  type ConversationCreatedDetail,
  type ConversationMovedDetail,
} from '../../state/conversation-events';
import { workspaceIdentityCacheKey } from '../../collab/workspace-identity';
import { useI18n } from '../../i18n';
import { NewConversationMark, RailRecentRow } from './RailRecentRow';
import { navigate } from '../../router';
import { requestNewProjectFromRail } from '../entryRailBridge';
import {
  acceptsMovedConversations,
  draggedConversation,
  endConversationDrag,
  reportConversationMoveFailed,
  startConversationDrag,
} from './conversationDrag';
import styles from './RailConversationTree.module.css';

export interface RailConversationModel {
  projectId: string;
  conversations: Conversation[];
  conversationsLoading?: boolean;
  activeConversationId: string | null;
  creating: boolean;
  newConversationPlacement?: { id: string; afterId: string | null } | null;
  onCreate: () => Promise<void>;
  onSelect: (id: string) => void;
  /** Row menu actions for the live project; keeps its conversation state in sync. */
  onRename?: (id: string, title: string) => void | Promise<unknown>;
  onDelete?: (id: string) => void | Promise<unknown>;
  /** Moves a live-project conversation; resolves false when the move failed. */
  onMove?: (id: string, targetProjectId: string) => Promise<boolean>;
}

export function RailNewConversation({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  return <Button className={styles.create} onClick={onClick} disabled={disabled}>
    <NewConversationMark />
    <span>{t('entry.newConversation')}</span>
  </Button>;
}

export function RailNewProject() {
  const { t } = useI18n();
  return <Button className={styles.create} onClick={() => {
    requestNewProjectFromRail();
    navigate({ kind: 'home', view: 'home' });
  }}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
      <path d="M12.4142 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H10.4142L12.4142 5ZM4 7V19H20V7H4Z" />
    </svg>
    <span>{t('entry.navNewProject')}</span>
  </Button>;
}

// One in-flight default conversation per project, so folders that read the
// same empty list (remounts, StrictMode) never create two.
const seedingDefaultConversation = new Map<string, Promise<Conversation | null>>();

/** Projects are the only folders; their children are conversation leaves. */
export function RailProjectFolder({ project, context, model, onOpenConversation, onRename, onDuplicate, onDelete }: {
  project: Project;
  context?: WorkspaceCollabContext | null;
  model?: RailConversationModel | null;
  onOpenConversation?: (projectId: string, conversationId: string) => void | Promise<unknown>;
  onRename?: (id: string, name: string) => void;
  onDuplicate?: (id: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
}) {
  const { t } = useI18n();
  const current = model?.projectId === project.id ? model : null;
  const [open, setOpen] = useState(Boolean(current));
  const identity = `${project.id}:${workspaceIdentityCacheKey(context)}`;
  const contextRef = useRef(context);
  contextRef.current = context;
  const [loaded, setLoaded] = useState<{ identity: string; items: Conversation[] } | null>(null);
  const cached = loaded?.identity === identity ? loaded.items : null;
  // Keep the live project's rows when navigation hands ownership back to the
  // folder. Background refresh must not collapse an already populated tree.
  useEffect(() => {
    if (current && !current.conversationsLoading) setLoaded({ identity, items: current.conversations });
  }, [identity, current?.conversations, current?.conversationsLoading]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { if (current?.activeConversationId) setOpen(true); }, [current?.activeConversationId]);
  const [dropActive, setDropActive] = useState(false);
  // The live project's list belongs to ProjectView; every other folder re-reads
  // its own when a move adds or removes one of its conversations, or one is
  // created in it from outside its chat (and opens it, to show the new row).
  useEffect(() => {
    function onMoved(event: Event) {
      const { fromProjectId, toProjectId } = (event as CustomEvent<ConversationMovedDetail>).detail;
      if (fromProjectId === project.id || toProjectId === project.id) setRetry(value => value + 1);
    }
    function onCreated(event: Event) {
      if ((event as CustomEvent<ConversationCreatedDetail>).detail.projectId !== project.id) return;
      setOpen(true);
      setRetry(value => value + 1);
    }
    window.addEventListener(CONVERSATION_MOVED_EVENT, onMoved);
    window.addEventListener(CONVERSATION_CREATED_EVENT, onCreated);
    return () => {
      window.removeEventListener(CONVERSATION_MOVED_EVENT, onMoved);
      window.removeEventListener(CONVERSATION_CREATED_EVENT, onCreated);
    };
  }, [project.id]);
  const acceptsDrop = () => {
    const item = draggedConversation();
    return Boolean(item && item.projectId !== project.id && acceptsMovedConversations(project));
  };
  async function dropConversation() {
    const item = draggedConversation();
    endConversationDrag();
    setDropActive(false);
    if (!item || item.projectId === project.id || !acceptsMovedConversations(project)) return;
    const moved = model?.projectId === item.projectId && model.onMove
      ? await model.onMove(item.conversationId, project.id)
      : Boolean(await moveConversation(item.projectId, item.conversationId, project.id, contextRef.current));
    if (moved) setOpen(true);
    else reportConversationMoveFailed();
  }
  const childDraggable = acceptsMovedConversations(project) && (!current || Boolean(current.onMove));
  useEffect(() => {
    if (!open || current) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void listConversations(project.id, { workspaceContext: contextRef.current, throwOnError: true }).then(async list => {
      // A project never sits empty (per product): one created without a
      // conversation gets its default one here, which opens on the start page.
      // The live project's default comes from ProjectView instead.
      if (list.length === 0) {
        let seeding = seedingDefaultConversation.get(project.id);
        if (!seeding) {
          seeding = createConversation(project.id, undefined, { workspaceContext: contextRef.current })
            .catch(() => null)
            .finally(() => seedingDefaultConversation.delete(project.id));
          seedingDefaultConversation.set(project.id, seeding);
        }
        const fresh = await seeding;
        if (fresh) list = [fresh];
      }
      if (!cancelled) setLoaded({ identity, items: list });
    }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, Boolean(current), project.id, identity, retry]);
  const items = [...(current && !current.conversationsLoading ? current.conversations : cached ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  const placement = current?.newConversationPlacement;
  if (placement?.afterId && placement.id !== placement.afterId) {
    const addedIndex = items.findIndex(item => item.id === placement.id);
    if (addedIndex >= 0 && items.some(item => item.id === placement.afterId)) {
      const [added] = items.splice(addedIndex, 1);
      if (added) items.splice(items.findIndex(item => item.id === placement.afterId) + 1, 0, added);
    }
  }
  return <>
    <div
      className={dropActive ? styles.dropTarget : undefined}
      data-testid="entry-nav-project-drop-target"
      onDragOver={(event) => {
        if (!acceptsDrop()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
      }}
      onDrop={(event) => {
        if (!acceptsDrop()) return;
        event.preventDefault();
        void dropConversation();
      }}
    >
      <RailRecentRow project={project} workspaceContext={context} expanded={open}
        onOpen={() => setOpen(value => !value)} onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />
    </div>
    <div className={`accordion-collapsible${open ? ' open' : ''}`} inert={!open} aria-hidden={!open || undefined}>
      <div className="accordion-collapsible-inner">
        <ul className={styles.children}>
          {!current && loading && !cached ? <li className={styles.status}>{t('common.loading')}</li> : null}
          {!current && error ? <li><Button className={styles.conversation} onClick={() => setRetry(value => value + 1)}>{t('preview.retry')}</Button></li> : null}
          {current || cached || !loading && !error ? items.map(conversation => <li
            key={conversation.id}
            draggable={childDraggable}
            onDragStart={childDraggable ? event => startConversationDrag(event, { projectId: project.id, conversationId: conversation.id }) : undefined}
            onDragEnd={childDraggable ? endConversationDrag : undefined}
          >
            <Button className={`${styles.conversation}${current?.activeConversationId === conversation.id ? ` ${styles.selected}` : ''}`}
              aria-current={current?.activeConversationId === conversation.id ? 'page' : undefined}
              onClick={() => current ? current.onSelect(conversation.id) : void onOpenConversation?.(project.id, conversation.id)}>
              <span>{conversation.title || t('chat.untitledConversation')}</span>
            </Button>
          </li>) : null}
        </ul>
      </div>
    </div>
  </>;
}
