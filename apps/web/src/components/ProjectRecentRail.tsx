import { useEffect, useRef, useState, type Ref, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Project } from '../types';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { RailRecentSection } from './EntryNavRail';
import { RailConversationsSection } from './entry-nav-rail/RailConversationsSection';
import { RailNewConversation, RailNewProject, type RailConversationModel } from './entry-nav-rail/RailConversationTree';
import { navigate } from '../router';
import { Icon } from './Icon';
import styles from './ProjectRecentRail.module.css';
import recentSectionStyles from './entry-nav-rail/RailRecentSection.module.css';
import { ProjectSearchModal } from './ProjectSearchModal';
import { ENTRY_RAIL_TOGGLE_EVENT, ENTRY_RAIL_STATE_EVENT, RAIL_OPEN_STORAGE_KEY, readStoredRailOpen } from './entryRailBridge';

const RAIL_WIDTH_STORAGE_KEY = 'od.entry.railWidth';
const RAIL_WIDTH_DEFAULT = 236;
const RAIL_WIDTH_MIN = 200;
const RAIL_WIDTH_MAX = 420;
// Leave a small buffer below the readable width before snapping fully closed.
const RAIL_COLLAPSE_THRESHOLD = RAIL_WIDTH_MIN - 40;

function clampRailWidth(value: number): number {
  return Number.isFinite(value)
    ? Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, Math.round(value)))
    : RAIL_WIDTH_DEFAULT;
}

function readRailWidth(): number {
  try {
    return clampRailWidth(Number(localStorage.getItem(RAIL_WIDTH_STORAGE_KEY) || RAIL_WIDTH_DEFAULT));
  } catch { return RAIL_WIDTH_DEFAULT; }
}

export function ProjectRecentRail({ projects, context, onOpen, onRename, onDelete, conversationModel, controlsHostRef, onNewConversation }: {
  projects: Project[];
  onNewConversation?: () => void;
  controlsHostRef?: Ref<HTMLDivElement>;
  conversationModel?: RailConversationModel | null;
  context: WorkspaceCollabContext | null;
  onOpen: (id: string) => Promise<boolean> | Promise<void> | boolean | void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => Promise<boolean | void> | boolean | void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(readStoredRailOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [width, setWidth] = useState(readRailWidth);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);
  const railRef = useRef<HTMLElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  function updateWidth(nextWidth: number, commit = true) {
    const next = clampRailWidth(nextWidth);
    widthRef.current = next;
    // The adjacent app is a flex child, so changing the rail's width moves and
    // resizes it in the same frame. Avoid rerendering every project row on each
    // pointer event; commit React state when the drag ends instead.
    if (railRef.current) railRef.current.style.width = `${next}px`;
    if (actionsRef.current) actionsRef.current.style.width = `${next - 8}px`;
    if (commit) setWidth(next);
  }

  function saveWidth() {
    try { localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(widthRef.current)); }
    catch { /* Keep the adjusted width for this session. */ }
  }

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: widthRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextWidth = drag.startWidth + event.clientX - drag.startX;
    if (nextWidth < RAIL_COLLAPSE_THRESHOLD) {
      // Collapsing must not replace the width used when the rail reopens.
      updateWidth(drag.startWidth, false);
      endResize(event);
      setOpen(false);
      return;
    }
    updateWidth(nextWidth, false);
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setResizing(false);
    setWidth(widthRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    saveWidth();
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const adjustment = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (!adjustment && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    updateWidth(event.key === 'Home' ? RAIL_WIDTH_MIN : event.key === 'End' ? RAIL_WIDTH_MAX : widthRef.current + adjustment);
    saveWidth();
  }
  useEffect(() => {
    const toggle = () => setOpen(value => !value);
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener(ENTRY_RAIL_TOGGLE_EVENT, toggle);
    window.addEventListener('keydown', shortcut);
    return () => {
      window.removeEventListener(ENTRY_RAIL_TOGGLE_EVENT, toggle);
      window.removeEventListener('keydown', shortcut);
    };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(RAIL_OPEN_STORAGE_KEY, String(open)); } catch { /* Storage may be unavailable. */ }
    window.dispatchEvent(new CustomEvent(ENTRY_RAIL_STATE_EVENT, { detail: { open } }));
  }, [open]);
  return (<>
    <aside ref={railRef} id="project-recent-rail" className="project-recent-rail" data-open={open} style={{ width: open ? width : 0 }} aria-label={t('chat.conversationsHeading')}>
      <div ref={actionsRef} className="project-recent-rail__actions entry-nav-rail__search-row" style={{ width: open ? width - 8 : 72 }}>
        <button type="button" className="entry-nav-rail__search" aria-label={t('common.search')} title={t('common.search')} onClick={() => setSearchOpen(true)}>
          <Icon name="search" size={16} />
        </button>
        <button type="button" className="entry-nav-rail__collapse" aria-label={t(open ? 'entry.navCollapse' : 'entry.navExpand')} title={t(open ? 'entry.navCollapse' : 'entry.navExpand')} aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <Icon name={open ? 'layout-left' : 'layout-right'} size={16} />
        </button>
      </div>
      {open ? <div className="entry-nav-rail__panel">
        <div className="entry-nav-rail__group">
          <div className={recentSectionStyles.fixedAction}>
            <RailNewConversation onClick={onNewConversation ?? (() => navigate({ kind: 'home', view: 'home' }))} />
            <RailNewProject />
          </div>
          <RailRecentSection
            section="personal"
            scrollable
            afterList={<RailConversationsSection projects={projects} context={context} model={conversationModel}
              onOpenConversation={async (projectId, conversationId) => {
                if (await onOpen(projectId) !== false) navigate({ kind: 'project', projectId, conversationId, fileName: null });
              }} />}
            conversationModel={conversationModel}
            onOpenConversation={async (projectId, conversationId) => {
              if (await onOpen(projectId) !== false) navigate({ kind: 'project', projectId, conversationId, fileName: null });
            }}
            projects={projects}
            workspaceContext={context}
            onOpen={async (id) => { await onOpen(id); }}
            onRename={onRename}
            onDelete={onDelete}
            label={t('entry.navProjects')}
          />
        </div>
        <div ref={controlsHostRef} className={styles.footer} data-testid="project-rail-footer" />
      </div> : null}
      {searchOpen ? <ProjectSearchModal
        projects={projects}
        conversations={conversationModel?.conversations}
        currentConversationProjectId={conversationModel?.projectId}
        onOpenConversation={conversationModel?.onSelect}
        workspaceContext={context}
        onOpenProject={async (id) => { await onOpen(id); }}
        onClose={() => setSearchOpen(false)}
      /> : null}
    </aside>
    {open ? <div
      className={`project-recent-rail__resizer${resizing ? ' is-resizing' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('chat.conversationsHeading')}
      aria-controls="project-recent-rail"
      aria-valuemin={RAIL_WIDTH_MIN}
      aria-valuemax={RAIL_WIDTH_MAX}
      aria-valuenow={width}
      tabIndex={0}
      data-testid="project-recent-rail-resizer"
      onPointerDown={beginResize}
      onPointerMove={moveResize}
      onPointerUp={endResize}
      onPointerCancel={endResize}
      onKeyDown={resizeWithKeyboard}
    /> : null}
  </>);
}
