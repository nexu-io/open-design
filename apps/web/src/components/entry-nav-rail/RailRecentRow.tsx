import { reportProjectFailure } from '../../observability/experience-diagnostics';
// One row of the nav rail's 最近项目 list: the project name, a hover preview
// that floats out to the right of the rail, and a ⋮ menu.
//
// The preview card and the cover decision behind it live in
// `ProjectHoverPreview.tsx`, shared with the chat project switcher so both
// surfaces show one and the same card for a project (OPEND-2694).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ProjectDisplayStatus, WorkspaceCollabContext } from '@open-design/contracts';

import { useT } from '../../i18n';
import { Icon } from '../Icon';
import {
  hasCompletionNotice,
  hasRunStatusGlyph,
  ProjectCompletionDot,
  ProjectFolderGlyph,
  ProjectRunStatusIcon,
} from '../ProjectRunStatusIcon';
import { STATUS_LABEL_KEYS } from '../../state/projectRunStatus';
import type { Project } from '../../types';
import type { ProjectMoveErrorKind } from '../project-actions/useWorkspaceProjectMove';
import { ProjectHoverPreviewCard, useProjectHoverCover } from './ProjectHoverPreview';

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
type PopupClaim = { rowId: string; kind: 'preview' | 'menu' } | null;
let popupClaim: PopupClaim = null;
const popupClaimListeners = new Set<() => void>();

function claimPopup(next: PopupClaim) {
  popupClaim = next;
  for (const listener of popupClaimListeners) listener();
}

/** Release only if this row still holds it — a later claim must not be undone
 *  by an earlier row's pointer-leave arriving afterwards. */
function releasePopup(rowId: string, kind: 'preview' | 'menu') {
  if (popupClaim?.rowId === rowId && popupClaim.kind === kind) claimPopup(null);
}

/**
 * Open (or close) one row's ⋮ menu from outside the row. The menu is where a
 * row reports the progress and the failure of a move to the team space — the
 * same readout the project cards keep in THEIR menu — but the confirm dialog
 * that precedes the move has already dismissed it, so the section re-opens it
 * once the request is on its way. The row measures its own anchor when the
 * claim lands (see `useLayoutEffect` in `RailRecentRow`).
 */
export function openRailRecentRowMenu(rowId: string) {
  claimPopup({ rowId, kind: 'menu' });
}
export function closeRailRecentRowMenu(rowId: string) {
  releasePopup(rowId, 'menu');
}

/** Gap between the rail's right edge and the popup that hangs off it (per
 *  product: 预览的卡片左边的间距大一点). The rows are full-bleed inside the rail
 *  panel, so this is measured from the ROW's right edge — which is the panel's —
 *  and the content column starts 12px past it. 24 therefore clears the rail by a
 *  visible margin and still reads as attached to the row rather than floating
 *  loose over the page. */
const POPUP_GAP_PX = 24;

/**
 * The ⋮ mark (supplied artwork; Remix's `more-2-line`). Inlined rather than
 * added to the shared icon set: no `IconName` maps to that glyph today. Shared
 * with the project switcher's row menu (WorkspaceTabsBar), which is the same
 * menu on another surface.
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
 * not these drawings, and product asked for these. Shared with the switcher's
 * row menu too.
 */
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
  runId,
  ownedBySelf = true,
  shared = false,
  moveToTeamAvailable = false,
  sharing = false,
  shareError = null,
  onOpen,
  onRename,
  onDuplicate,
  onMoveToTeam,
  onDelete,
}: {
  project: Project;
  workspaceContext?: WorkspaceCollabContext | null;
  /** This project's run status, when it has one (per product: 如果有项目在
   *  进行，这个 icon 换成状态). Drives the leading glyph — and, for a finished
   *  run the user has not opened since, the unread dot at the row's end
   *  (OPEND-3133) — and nothing else. */
  runStatus?: ProjectDisplayStatus;
  runId?: string;
  /** The daemon's canMutate is privileged-or-self-created and 403s the rest,
   *  so a row someone else shared keeps its mutations disabled with the same
   *  explanation the project cards give (`recentProjects.ownOnlyMutation`). */
  ownedBySelf?: boolean;
  /** Already in the team space: 转入团队空间 reads 已在团队空间 and is inert. */
  shared?: boolean;
  /** Whether the workspace has a team plane to move into at all; a personal
   *  workspace hides the item entirely rather than offering a 403. */
  moveToTeamAvailable?: boolean;
  /** A move for THIS row is in flight: the item reads 分享中… and is inert. */
  sharing?: boolean;
  /** The last move for THIS row failed; shown under the items until the menu
   *  closes. */
  shareError?: ProjectMoveErrorKind | null;
  onOpen?: (id: string) => void | Promise<unknown>;
  onRename?: (id: string, name: string) => void;
  onDuplicate?: (project: Project) => void;
  onMoveToTeam?: (project: Project) => void;
  /** Asks the SECTION to confirm (OPEND-2797): the row never deletes on its
   *  own — the confirmation is the shared project delete dialog, the same one
   *  the project cards open. */
  onDelete?: (project: Project) => void;
}) {
  const t = useT();
  useEffect(() => {
    if (runStatus) reportProjectFailure({ id: project.id,
      status: { value: runStatus, runId, updatedAt: project.status?.updatedAt } }, 'recent_rail');
  }, [project.id, project.status?.updatedAt, runStatus, runId]);
  const hoverCover = useProjectHoverCover(project, workspaceContext);
  const { resolveCover } = hoverCover;
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The menu opens where the preview would have been (per product), which puts
  // it outside the rail — so it needs its own anchor, frozen when the menu
  // claim lands. `anchor` cannot serve: it is cleared the moment the pointer
  // leaves the row, which happens on the way to the menu itself. Measured in
  // an effect rather than in the ⋮ click so a menu the SECTION opens (to show
  // a move's progress, see `openRailRecentRowMenu`) lands on the row too.
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuAnchor(null);
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setMenuAnchor({ top: rect.top + rect.height / 2, left: rect.right + POPUP_GAP_PX });
  }, [menuOpen]);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    return () => {
      // A row that leaves (the list re-sorts, the rail closes) must not leave
      // its popup claimed, or nothing else could ever open one.
      if (popupClaim?.rowId === project.id) claimPopup(null);
    };
  }, [project.id]);

  // Close the menu on an outside click, the way every other rail popover does.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function close() {
      releasePopup(project.id, 'menu');
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

  const hasMenu = Boolean(onRename || onDuplicate || onDelete || (moveToTeamAvailable && onMoveToTeam));
  const foreignTitle = ownedBySelf ? undefined : t('recentProjects.ownOnlyMutation');

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
        <button
          type="button"
          className="entry-nav-rail__recent-item"
          onClick={() => { void onOpen?.(project.id); }}
          /* No `title`: the OS tooltip it produced opened right where the hover
             preview does and covered it (per product: hover 这的文本的气泡去掉).
             The full name lives in that preview now — a surface we control,
             which can also wrap it instead of ellipsizing. */
          data-testid="entry-nav-recent-item"
        >
          {/* The row's leading glyph, in the SAME column the destinations put
              their icons in, so the rail stays one left edge. A project with a
              LIVE run to report shows that run's status instead of the folder
              (per product: 和项目切换器里的状态对齐) — the very same components
              the workspace tab dropdown leads its rows with
              (`leadGlyphFor` in WorkspaceTabsBar), status and folder alike
              (OPEND-3129), so the two can never tell different stories about
              the same project. A FINISHED run is not a lead glyph: the folder
              stays and the unread dot below says it (OPEND-3133). 16 in an
              18px slot: the box this row always gave the mark. */}
          <span className="entry-nav-rail__recent-icon">
            {runStatus && hasRunStatusGlyph(runStatus) ? (
              <ProjectRunStatusIcon
                status={runStatus}
                size={14}
                label={t(STATUS_LABEL_KEYS[runStatus])}
              />
            ) : (
              <ProjectFolderGlyph size={16} />
            )}
          </span>
          <span className="entry-nav-rail__recent-name">{project.name}</span>
          {/* Completed, unread: the dot at the row's end. The section spends
              it when the row opens the project (`acknowledgeProjectCompletion`
              in the shared run-status store), which is also what drops it from
              the switcher. */}
          {runStatus && hasCompletionNotice(runStatus) ? (
            <ProjectCompletionDot
              className="entry-nav-rail__recent-unread"
              label={t(STATUS_LABEL_KEYS[runStatus])}
              testId="entry-nav-recent-unread"
            />
          ) : null}
        </button>
      )}
      {hasMenu ? (
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
          column whatever its z-index.

          Items, in order: 重命名 / 复制 / 转入团队空间 (team workspaces only) /
          删除 — the product's list for this menu (OPEND-2686, OPEND-2794). No
          导出: a list row has no rendered file to export, and the whole-project
          archive the old item offered is not what this menu is for. */}
      {menuOpen && menuAnchor && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          className="entry-nav-rail__recent-menu"
          role="menu"
          data-testid="entry-nav-recent-menu"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
        >
          {onRename ? (
            <button
              type="button"
              role="menuitem"
              disabled={!ownedBySelf}
              title={foreignTitle}
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
          {onDuplicate ? (
            <button
              type="button"
              role="menuitem"
              disabled={!ownedBySelf}
              title={foreignTitle}
              onClick={() => {
                releasePopup(project.id, 'menu');
                onDuplicate(project);
              }}
            >
              <Icon name="copy" size={14} />
              <span>{t('designs.menuDuplicate')}</span>
            </button>
          ) : null}
          {/* Hidden, not disabled, in a workspace with no team plane: there is
              nowhere to move to, and a disabled 转入团队空间 would name a place
              the workspace cannot have (OPEND-2794: 无可用团队空间时按产品规则
              隐藏). A shared row and a foreign row keep the item and explain
              themselves instead. */}
          {moveToTeamAvailable && onMoveToTeam ? (
            <button
              type="button"
              role="menuitem"
              disabled={sharing || shared || !ownedBySelf}
              title={foreignTitle}
              data-testid="entry-nav-recent-move-to-team"
              onClick={() => {
                releasePopup(project.id, 'menu');
                onMoveToTeam(project);
              }}
            >
              <Icon name="share" size={14} />
              <span>
                {sharing
                  ? t('recentProjects.shareInProgress')
                  : shared
                    ? t('recentProjects.sharedInTeam')
                    : t('recentProjects.moveToTeam')}
              </span>
            </button>
          ) : null}
          {shareError ? (
            <div className="entry-nav-rail__recent-menu-error" role="alert">
              {t(
                shareError === 'unshare'
                  ? 'recentProjects.unshareFailed'
                  : shareError === 'owner-conflict'
                    ? 'recentProjects.shareOwnerConflict'
                    : 'recentProjects.shareFailed',
              )}
            </div>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              disabled={!ownedBySelf}
              title={foreignTitle}
              onClick={() => {
                releasePopup(project.id, 'menu');
                onDelete(project);
              }}
            >
              <DeleteMark />
              <span>{t('designs.menuDelete')}</span>
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
        <ProjectHoverPreviewCard
          project={project}
          cover={hoverCover}
          style={{ top: anchor.top, left: anchor.left }}
        />,
        document.body,
      ) : null}
    </div>
  );
}
