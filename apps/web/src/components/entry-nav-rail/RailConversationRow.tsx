// One row of the rail's 对话 list: the conversation title plus the same ⋮ menu
// (重命名 / 导出 / 删除) the project rows carry (per product: 和项目一样), and
// 移动到 — a flyout of the rail's project folders. The row also drags onto
// those folders (see ./conversationDrag).
//
// Shares RailRecentRow's module-level popup claim, so a conversation menu and a
// project menu / preview stay mutually exclusive across both sections.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';

import { useI18n } from '../../i18n';
import type { Project } from '../../types';
import { RemixIcon } from '../RemixIcon';
import { endConversationDrag, startConversationDrag, type DraggedConversation } from './conversationDrag';
import {
  claimPopup,
  currentPopupClaim,
  DeleteMark,
  MoreDotsMark,
  popupClaimListeners,
  POPUP_GAP_PX,
  releasePopup,
  RenameMark,
  type PopupClaim,
} from './RailRecentRow';
import styles from './RailConversationTree.module.css';

export function RailConversationRow({
  rowId,
  title,
  selected,
  onOpen,
  onRename,
  onExport,
  onDelete,
  moveTargets,
  onMove,
  dragItem,
}: {
  /** Unique across every rail row (projects included) — keys the popup claim. */
  rowId: string;
  title: string | null | undefined;
  selected: boolean;
  onOpen: () => void;
  onRename?: (title: string) => void;
  onExport?: () => void;
  onDelete?: () => void;
  /** Folders 移动到 offers, already excluding this row's own project. */
  moveTargets?: Project[];
  onMove?: (targetProjectId: string) => void;
  /** Set when the row may be dragged onto a project folder. */
  dragItem?: DraggedConversation;
}) {
  const { t } = useI18n();
  const displayTitle = title || t('chat.untitledConversation');
  const [claim, setClaim] = useState<PopupClaim>(currentPopupClaim);
  useEffect(() => {
    const listener = () => setClaim(currentPopupClaim());
    popupClaimListeners.add(listener);
    return () => { popupClaimListeners.delete(listener); };
  }, []);
  const menuOpen = claim?.rowId === rowId && claim.kind === 'menu';
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // Rows near the rail's foot have no room below for the folder list, so the
  // flyout grows upward from the 移动到 item instead.
  const [moveFlyUp, setMoveFlyUp] = useState(false);
  const moveFlyoutRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!moveOpen) {
      setMoveFlyUp(false);
      return;
    }
    const rect = moveFlyoutRef.current?.getBoundingClientRect();
    if (rect && rect.bottom > window.innerHeight - 8) setMoveFlyUp(true);
  }, [moveOpen]);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (currentPopupClaim()?.rowId === rowId) claimPopup(null);
  }, [rowId]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function close() {
      releasePopup(rowId, 'menu');
      setConfirmingDelete(false);
      setMoveOpen(false);
    }
    function onDocPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen, rowId]);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  function commitRename() {
    const next = draftTitle.trim();
    setRenaming(false);
    if (!next || next === (title ?? '')) return;
    onRename?.(next);
  }

  return (
    <div
      ref={rootRef}
      className={`entry-nav-rail__recent-row ${styles.conversationRow}`}
      draggable={Boolean(dragItem) && !renaming}
      onDragStart={dragItem ? (event) => {
        claimPopup(null);
        startConversationDrag(event, dragItem);
      } : undefined}
      onDragEnd={dragItem ? endConversationDrag : undefined}
    >
      {renaming ? (
        <input
          ref={renameInputRef}
          className="entry-nav-rail__recent-rename"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitRename();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraftTitle(title ?? '');
              setRenaming(false);
            }
          }}
          aria-label={t('designs.menuRename')}
        />
      ) : (
        <Button
          className={`${styles.conversation}${selected ? ` ${styles.selected}` : ''}`}
          aria-current={selected ? 'page' : undefined}
          onClick={onOpen}
        >
          <span className={styles.conversationIcon} aria-hidden><RemixIcon name="message-3-line" size={16} /></span>
          <span>{displayTitle}</span>
        </Button>
      )}
      {!renaming && (onRename || onExport || onDelete || onMove) ? (
        <button
          type="button"
          className="entry-nav-rail__recent-more"
          aria-label={t('designs.menuMore')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-testid="entry-nav-conversation-more"
          onClick={(event) => {
            event.stopPropagation();
            setConfirmingDelete(false);
            setMoveOpen(false);
            const rect = rootRef.current?.getBoundingClientRect();
            if (rect) setMenuAnchor({ top: rect.top + rect.height / 2, left: rect.right + POPUP_GAP_PX });
            if (menuOpen) releasePopup(rowId, 'menu');
            else claimPopup({ rowId, kind: 'menu' });
          }}
        >
          <MoreDotsMark />
        </button>
      ) : null}
      {menuOpen && menuAnchor && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          className="entry-nav-rail__recent-menu"
          role="menu"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
        >
          {onRename ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                releasePopup(rowId, 'menu');
                setDraftTitle(title ?? '');
                setRenaming(true);
              }}
            >
              <RenameMark />
              <span>{t('designs.menuRename')}</span>
            </button>
          ) : null}
          {onMove ? (
            <div
              className={styles.moveItem}
              onMouseEnter={() => setMoveOpen(true)}
              onMouseLeave={() => setMoveOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={moveOpen}
                data-testid="entry-nav-conversation-move"
                onClick={() => setMoveOpen((value) => !value)}
              >
                <RemixIcon name="folder-transfer-line" size={14} />
                <span>{t('chat.moveConversationTo')}</span>
                <span className={styles.moveChevron} aria-hidden><RemixIcon name="arrow-right-s-line" size={14} /></span>
              </button>
              {moveOpen ? (
                <div ref={moveFlyoutRef} className={`${styles.moveFlyout}${moveFlyUp ? ` ${styles.moveFlyoutUp}` : ''}`}>
                  <div className={`entry-nav-rail__recent-menu ${styles.moveMenu}`} role="menu" aria-label={t('chat.moveConversationTo')}>
                    {moveTargets && moveTargets.length > 0 ? moveTargets.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        role="menuitem"
                        title={project.name}
                        onClick={() => {
                          releasePopup(rowId, 'menu');
                          setMoveOpen(false);
                          onMove(project.id);
                        }}
                      >
                        <RemixIcon name="folder-line" size={14} />
                        <span className={styles.moveName}>{project.name}</span>
                      </button>
                    )) : <span className={styles.moveEmpty}>{t('chat.moveConversationNoTargets')}</span>}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {onExport ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                releasePopup(rowId, 'menu');
                onExport();
              }}
            >
              <RemixIcon name="download-line" size={14} />
              <span>{t('preview.exportMenu')}</span>
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className={confirmingDelete ? 'is-danger' : undefined}
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  return;
                }
                releasePopup(rowId, 'menu');
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              <DeleteMark />
              <span>{confirmingDelete ? t('designs.renameSave') : t('designs.menuDelete')}</span>
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
