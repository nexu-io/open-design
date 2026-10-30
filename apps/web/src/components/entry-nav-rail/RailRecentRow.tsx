// One row of the nav rail's 最近浏览过 list: the project name, a hover preview
// that floats out to the right of the rail, and a ⋮ menu.
//
// The preview reuses the SAME cover decision the projects grid renders
// (`lib/project-cover-cache`): the grid resolves a cover per (workspace,
// project, version) and stores it in a process-wide LRU, so a rail row usually
// has one already and paints instantly. When the cache misses — the user landed
// on a surface that never rendered the grid — the row resolves it once on hover
// with the cheap half of the grid's pipeline (files read + `selectProjectFileCover`)
// and writes the result back through the same key, so the grid inherits it too.
// Deliberately NOT ported: the grid's HEAD probe, deck-document preload and
// design-system special cases. Those exist to avoid a broken <img> in a large
// visible card; here a cover that fails to load simply falls back to the tinted
// glyph the same component already draws.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ProjectDisplayStatus, WorkspaceCollabContext } from '@open-design/contracts';

import { useT } from '../../i18n';
import { RemixIcon } from '../RemixIcon';
import { Icon } from '../Icon';
import { RailRecentItem } from './RailRecentItem';
import { exportProjectAsZip } from '../../runtime/exports';
import { shareProjectToTeam } from '../../state/projectShareRequest';
import { fetchProjectFiles } from '../../providers/registry';
import { workspaceIdentityCacheKey } from '../../collab/workspace-identity';
import {
  getProjectCoverSnapshot,
  projectCoverSnapshotKey,
  setProjectCoverSnapshot,
} from '../../lib/project-cover-cache';
import {
  projectCoverUrl,
  selectProjectFileCover,
  type ProjectCoverOverride,
} from '../project-cover';
import type { Project } from '../../types';

/** `undefined` = not resolved yet; `null` = resolved, this project has none. */
type CoverState = ProjectCoverOverride | null | undefined;

/**
 * Which row currently owns a popup, and which one (per product: 两个弹窗互斥
 * 原则 — one at a time).
 *
 * It has to be module-level rather than per-row state: the preview and the menu
 * are both PORTALLED to <body>, and a menu opened on row A stayed on screen
 * while row B painted its preview beside it, because neither row could see the
 * other's state. One claim arbitrates both kinds across every row, so opening
 * anything closes whatever was open.
 */
export type PopupClaim = { rowId: string; kind: 'preview' | 'menu' } | null;
let popupClaim: PopupClaim = null;
export const popupClaimListeners = new Set<() => void>();

export function currentPopupClaim(): PopupClaim {
  return popupClaim;
}

export function claimPopup(next: PopupClaim) {
  popupClaim = next;
  for (const listener of popupClaimListeners) listener();
}

/** Release only if this row still holds it — a later claim must not be undone
 *  by an earlier row's pointer-leave arriving afterwards. */
export function releasePopup(rowId: string, kind: 'preview' | 'menu') {
  if (popupClaim?.rowId === rowId && popupClaim.kind === kind) claimPopup(null);
}

/** Gap between the rail's right edge and the popup that hangs off it (per
 *  product: 预览的卡片左边的间距大一点). The rows are full-bleed inside the rail
 *  panel, so this is measured from the ROW's right edge — which is the panel's —
 *  and the content column starts 12px past it. 24 therefore clears the rail by a
 *  visible margin and still reads as attached to the row rather than floating
 *  loose over the page. */
export const POPUP_GAP_PX = 24;

/**
 * The ⋮ mark (supplied artwork; Remix's `more-2-line`). Inlined rather than
 * added to the shared icon set: no `IconName` maps to that glyph today, and
 * this is the only place it appears.
 */
export function MoreDotsMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M12 3C11.175 3 10.5 3.675 10.5 4.5C10.5 5.325 11.175 6 12 6C12.825 6 13.5 5.325 13.5 4.5C13.5 3.675 12.825 3 12 3ZM12 18C11.175 18 10.5 18.675 10.5 19.5C10.5 20.325 11.175 21 12 21C12.825 21 13.5 20.325 13.5 19.5C13.5 18.675 12.825 18 12 18ZM12 10.5C11.175 10.5 10.5 11.175 10.5 12C10.5 12.825 11.175 13.5 12 13.5C12.825 13.5 13.5 12.825 13.5 12C13.5 11.175 12.825 10.5 12 10.5Z" />
    </svg>
  );
}

/**
 * Menu marks (supplied artwork). Inlined for the same reason as the ⋮ above:
 * neither glyph exists in the shared icon set — `pencil`/`trash` are close but
 * not these drawings, and product asked for these.
 */
/** 新建会话's speech-bubble mark for the rail's create row. */
export function NewConversationMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden focusable="false">
      <path d="M2 8.99374C2 5.68349 4.67654 3 8.00066 3H15.9993C19.3134 3 22 5.69478 22 8.99374V21H8.00066C4.68659 21 2 18.3052 2 15.0063V8.99374ZM20 19V8.99374C20 6.79539 18.2049 5 15.9993 5H8.00066C5.78458 5 4 6.78458 4 8.99374V15.0063C4 17.2046 5.79512 19 8.00066 19H20ZM14 11H16V13H14V11ZM8 11H10V13H8V11Z" />
    </svg>
  );
}

export function RenameMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18.5293 15.3193C18.7058 14.8934 19.2942 14.8934 19.4707 15.3193L19.7236 15.9307C20.1556 16.9735 20.9615 17.8062 21.9746 18.2568L22.6914 18.5762C23.1022 18.7589 23.1022 19.3564 22.6914 19.5391L21.9326 19.877C20.9449 20.3163 20.1534 21.1194 19.7139 22.1279L19.4668 22.6934C19.2863 23.1075 18.7136 23.1075 18.5332 22.6934L18.2861 22.1279C17.8466 21.1194 17.0551 20.3163 16.0674 19.877L15.3076 19.5391C14.8974 19.3562 14.8974 18.759 15.3076 18.5762L16.0254 18.2568C17.0385 17.8062 17.8444 16.9735 18.2764 15.9307L18.5293 15.3193ZM16.4346 3.21193C16.8251 2.82141 17.4591 2.82141 17.8496 3.21193L20.6777 6.04103C21.0681 6.43157 21.0682 7.06464 20.6777 7.45509L7.24219 20.8897H3V16.6475L16.4346 3.21193ZM5 17.4756V18.8897H6.41406L15.7275 9.57618L14.3135 8.16212L5 17.4756ZM15.7275 6.74806L17.1426 8.16212L18.5566 6.74806L17.1426 5.334L15.7275 6.74806Z" />
    </svg>
  );
}

export function DeleteMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M20 7V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V7H2V5H22V7H20ZM6 7V20H18V7H6ZM11 9H13V11H11V9ZM11 12H13V14H11V12ZM11 15H13V17H11V15ZM7 2H17V4H7V2Z" />
    </svg>
  );
}

export function RailRecentRow({
  project,
  workspaceContext,
  runStatus,
  showLeadingIcon = true,
  expanded,
  selected = false,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  /** The open project, shown as the rail's current item (an empty project
   *  folder has no conversation row to carry that state). */
  selected?: boolean;
  project: Project;
  workspaceContext?: WorkspaceCollabContext | null;
  /** This project's live run status, when it has one (per product: 如果有项目在
   *  进行，这个 icon 换成状态). Drives the leading glyph and nothing else. */
  runStatus?: ProjectDisplayStatus;
  /** Recent history is a flat list; only project folders show a leading glyph. */
  showLeadingIcon?: boolean;
  expanded?: boolean;
  onOpen?: (id: string) => void | Promise<unknown>;
  onRename?: (id: string, name: string) => void;
  onDuplicate?: (id: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<boolean | void> | boolean | void;
}) {
  const t = useT();
  const snapshotKey = projectCoverSnapshotKey(
    workspaceIdentityCacheKey(workspaceContext),
    project.id,
    project.updatedAt,
  );
  const [cover, setCover] = useState<CoverState>(
    () => getProjectCoverSnapshot(snapshotKey)?.cover,
  );
  // Where the portalled preview should sit, measured off the row at hover time.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  // This row's view of the shared claim (see `claimPopup`). Both popups render
  // off it, so "one at a time" holds across rows rather than only within one.
  const [claim, setClaim] = useState<PopupClaim>(popupClaim);
  useEffect(() => {
    const listener = () => setClaim(popupClaim);
    popupClaimListeners.add(listener);
    return () => { popupClaimListeners.delete(listener); };
  }, []);
  const ownsPreview = claim?.rowId === project.id && claim.kind === 'preview';
  const menuOpen = claim?.rowId === project.id && claim.kind === 'menu';
  // The menu opens where the preview would have been (per product), which puts
  // it outside the rail — so it needs its own anchor, frozen at click time.
  // `anchor` cannot serve: it is cleared the moment the pointer leaves the row,
  // which happens on the way to the menu itself.
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  // Delete asks in place rather than through a dialog: the rail is a narrow
  // column and a modal over it to confirm a one-line row is heavier than the
  // action. The menu swaps to a confirm row and the click that destroys is a
  // second, differently-labelled one.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      // A row that leaves (the list re-sorts, the rail closes) must not leave
      // its popup claimed, or nothing else could ever open one.
      if (popupClaim?.rowId === project.id) claimPopup(null);
    };
  }, [project.id]);

  // A newer version of the project (rename, new content) misses the old key, so
  // the row drops back to unresolved and re-reads on the next hover.
  useEffect(() => {
    setCover(getProjectCoverSnapshot(snapshotKey)?.cover);
  }, [snapshotKey]);

  const resolveCover = useCallback(async () => {
    if (getProjectCoverSnapshot(snapshotKey) !== undefined) return;
    // An imported-folder project has no artifact of its own to show.
    if (project.metadata?.entryFile) {
      setProjectCoverSnapshot(snapshotKey, null);
      if (activeRef.current) setCover(null);
      return;
    }
    try {
      const files = await fetchProjectFiles(project.id, { workspaceContext });
      const next = selectProjectFileCover(files);
      setProjectCoverSnapshot(snapshotKey, next);
      if (activeRef.current) setCover(next);
    } catch {
      // Leave it unresolved: a failed read is not an authoritative "no cover",
      // and the next hover should be allowed to try again.
    }
  }, [project.id, project.metadata?.entryFile, snapshotKey, workspaceContext]);

  // Close the menu on an outside click, the way every other rail popover does.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function close() {
      releasePopup(project.id, 'menu');
      setConfirmingDelete(false);
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
    // Its anchor is a snapshot of the row's position, so anything that moves
    // the row (the rail list scrolling, the page behind it) would leave the
    // menu stranded. Dismiss instead of chasing.
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen, project.id]);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  function commitRename() {
    const next = draftName.trim();
    setRenaming(false);
    if (!next || next === project.name) return;
    onRename?.(project.id, next);
  }

  const coverSrc = cover
    ? projectCoverUrl(project.id, cover.name, cover.mtime, workspaceContext)
    : null;
  // `html` covers are documents, not pictures: the grid mounts a sandboxed frame
  // for those. A floating rail preview is not worth a second iframe per hover,
  // so only real media paints here and everything else takes the glyph.
  const showsImage = Boolean(coverSrc && (cover?.kind === 'image' || cover?.kind === 'logo'));
  const showsVideo = Boolean(coverSrc && cover?.kind === 'video');

  return (
    <div
      ref={rootRef}
      className="entry-nav-rail__recent-row"
      onPointerEnter={(event) => {
        // Touch has no hover to leave; the panel would stick until the next tap.
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        // An OPEN MENU OUTRANKS A HOVER (per product: 弹窗和 hover 的预览互斥,
        // and the menu is the one the user asked for by clicking). Without this
        // the two fought: the menu is portalled clear of the rail, so the trip
        // to it re-crossed rows, each of which claimed the slot back for its
        // preview and closed the menu out from under the pointer. A menu now
        // ends only when it is dismissed.
        if (popupClaim?.kind === 'menu') return;
        const rect = event.currentTarget.getBoundingClientRect();
        setAnchor({ top: rect.top + rect.height / 2, left: rect.right + POPUP_GAP_PX });
        claimPopup({ rowId: project.id, kind: 'preview' });
        void resolveCover();
      }}
      onPointerLeave={() => {
        setAnchor(null);
        releasePopup(project.id, 'preview');
      }}
    >
      {renaming ? (
        <input
          ref={renameInputRef}
          className="entry-nav-rail__recent-rename"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitRename();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraftName(project.name);
              setRenaming(false);
            }
          }}
          aria-label={t('designs.menuRename')}
        />
      ) : (
        <RailRecentItem
          name={project.name}
          selected={selected}
          opening={opening}
          expanded={expanded}
          runStatus={runStatus}
          showLeadingIcon={showLeadingIcon}
          onOpen={() => {
            if (!onOpen || opening) return;
            setOpening(true);
            void Promise.resolve().then(() => onOpen(project.id)).finally(() => {
              if (activeRef.current) setOpening(false);
            });
          }}
        />
      )}
      {onRename || onDelete ? (
        <button
          type="button"
          className="entry-nav-rail__recent-more"
          aria-label={t('designs.menuMore')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-testid="entry-nav-recent-more"
          /* Click only (per product: 点击那三个小点之后才展开弹窗). Opening on
             hover put the menu one stray pointer-move away from closing, which
             is what made it impossible to click through to. */
          onClick={(event) => {
            event.stopPropagation();
            setConfirmingDelete(false);
            const rect = rootRef.current?.getBoundingClientRect();
            if (rect) setMenuAnchor({ top: rect.top + rect.height / 2, left: rect.right + POPUP_GAP_PX });
            if (menuOpen) releasePopup(project.id, 'menu');
            else claimPopup({ rowId: project.id, kind: 'menu' });
          }}
        >
          <MoreDotsMark />
        </button>
      ) : null}
      {/* Same slot as the hover preview — beside the row, clear of the rail
          (per product: 弹窗的位置就是预览图的位置). Portalled for the same
          reason the preview is: inside the rail it would sit behind the content
          column whatever its z-index. */}
      {menuOpen && menuAnchor && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          className="entry-nav-rail__recent-menu"
          role="menu"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
          /* The pointer arriving here is what cancels the close the ⋮ scheduled
             when it left; leaving the menu closes it. */
        >
          {onRename ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                releasePopup(project.id, 'menu');
                setDraftName(project.name);
                setRenaming(true);
              }}
            >
              <RenameMark />
              <span>{t('designs.menuRename')}</span>
            </button>
          ) : null}
          {/* Duplicate and Share mirror the open project's header menu (per
              product: 项目里也会有), in the same order and with its glyphs. */}
          {onDuplicate ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                releasePopup(project.id, 'menu');
                void onDuplicate(project.id);
              }}
            >
              <RemixIcon name="file-copy-line" size={14} />
              <span>{t('workspace.copyProject')}</span>
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              releasePopup(project.id, 'menu');
              void shareProjectToTeam(project.id, workspaceContext).then((shared) => {
                // Nothing to share yet: land on the project instead of a dead click.
                if (!shared) void onOpen?.(project.id);
              });
            }}
          >
            <RemixIcon name="share-forward-line" size={14} />
            <span>{t('workspace.shareToTeam')}</span>
          </button>
          {/* Export sits between Rename and Delete (per product: 增加一个导出，
              在删除上边). It is the ONE export a list row can honestly offer:
              the project is not open here, so there is no rendered file to turn
              into a PDF / image / standalone HTML — those four rows in the
              viewer all need a loaded source. The whole-project archive needs
              nothing but the id, so that is what this is.
              Calls the shared runtime helper directly rather than taking an
              `onExport` prop like its neighbours: Rename and Delete mutate
              state the parent owns, while this one is a download — no parent
              has anything to do with it.
              `preview.exportMenu` is the bare word "Export" already translated
              in all 19 locales (导出 / 匯出 / Exporter …); same reasoning as the
              `designs.renameSave` reuse below, rather than a 20th copy of one
              word in every file. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              releasePopup(project.id, 'menu');
              // No file scope: an empty `filePath` leaves `root` off the
              // archive URL, which is what asks for the whole project.
              void exportProjectAsZip({
                projectId: project.id,
                filePath: '',
                fallbackHtml: '',
                fallbackTitle: project.name,
                workspaceContext,
              });
            }}
          >
            {/* The viewer's Export button glyph (per product), from the same
                shared set it uses there — `RemixIcon name="download-line"`,
                sized to this menu's 14px marks. */}
            <RemixIcon name="download-line" size={14} />
            <span>{t('preview.exportMenu')}</span>
          </button>
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
                releasePopup(project.id, 'menu');
                setConfirmingDelete(false);
                void onDelete(project.id);
              }}
            >
              <DeleteMark />
              {/* `designs.renameSave` is the generic confirm word in every
                  locale (确定 / OK) — it just happens to live under the rename
                  dialog. Reused rather than adding a 20th copy of the same
                  string to all 19 locale files. */}
              <span>{confirmingDelete ? t('designs.renameSave') : t('designs.menuDelete')}</span>
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
      {/* The preview hangs OUTSIDE the rail, over the content column — and is
          portalled to <body> to get there. Inside the rail it stayed BEHIND the
          content column no matter its z-index: the column is a positioned,
          backdrop-filtered box and the rail's own z-index traps its children in
          a local stacking context (the same reason the community preview modal
          portals out). Rendered only while hovered, so a rail full of rows never
          holds a dozen idle <img> elements alive. */}
      {anchor && ownsPreview && typeof document !== 'undefined' ? createPortal(
        <div
          className="entry-nav-rail__recent-preview"
          style={{ top: anchor.top, left: anchor.left }}
          aria-hidden
        >
          <div className="entry-nav-rail__recent-preview-plate">
            {showsImage ? (
              <img src={coverSrc ?? ''} alt="" draggable={false} decoding="async" />
            ) : showsVideo ? (
              <video src={coverSrc ?? ''} muted playsInline preload="metadata" />
            ) : (
              <span className="entry-nav-rail__recent-preview-glyph" aria-hidden>
                {(Array.from(project.name.trim())[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>
          {/* The name the row had to ellipsize, given room to wrap — that is
              the whole job of this card. The "last touched" line that used to
              sit under it is gone (per product: 时间去掉，最多两行名称): a hover
              preview answers "which project is this", and the timestamp was
              answering a question nobody had asked it. */}
          <p className="entry-nav-rail__recent-preview-name">{project.name}</p>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
