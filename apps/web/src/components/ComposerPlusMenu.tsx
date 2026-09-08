import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { SkillSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { useI18n, useT } from '../i18n';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import { resolveFlyoutSide } from './composer-flyout-placement';
import { Icon, type IconName } from './Icon';

const PLUS_MENU_MARGIN = 12;
const PLUS_MENU_GAP = 8;
const PLUS_MENU_WIDTH = 190;
const PLUS_MENU_FLYOUT_WIDTH = 360;
const PLUS_MENU_FLYOUT_MAX_HEIGHT = 320;
// Fallback "does the menu fit?" budget used only until the popup has been
// measured (first layout pass). Once `contentHeight` is known the real stack
// height drives the flip decision instead of this approximation.
const PLUS_MENU_MIN_HEIGHT = 260;
export type PlusMenuPlacementPreference = 'auto' | 'down' | 'up';
type PlusMenuFlyoutPlacement = 'right' | 'left' | 'contained';
type PlusMenuFlyoutVerticalPlacement = 'down' | 'up';
type PlusMenuVerticalPlacement = 'down' | 'up';
export type PlusMenuSubmenu = 'skills' | 'workingDir';

// Analytics mapping for the submenu flyouts: which resource list each
// submenu carries. `workingDir` is intentionally absent — its flyout carries
// actions, not an attachable resource list.
export const PLUS_SUBMENU_RESOURCE_KIND = {
  skills: 'skill',
} as const;
type PlusMenuPopupStyle = CSSProperties & Record<'--plus-menu-flyout-max-height', string>;

/** Last path segment for the working-dir recent rows (mirrors WorkingDirPicker). */
function dirBasename(dir: string): string {
  return dir.split(/[/\\]/).filter(Boolean).pop() ?? dir;
}

function getFlyoutBoundary(anchor: HTMLElement): Pick<DOMRect, 'left' | 'right'> {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
  const viewportBounds = { left: PLUS_MENU_MARGIN, right: viewportWidth - PLUS_MENU_MARGIN };
  const boundary = anchor.closest('.split-chat-slot, .pane');
  if (!boundary) return viewportBounds;

  const rect = boundary.getBoundingClientRect();
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right) || rect.right <= rect.left) {
    return viewportBounds;
  }

  return {
    left: Math.max(PLUS_MENU_MARGIN, rect.left),
    right: Math.min(viewportWidth - PLUS_MENU_MARGIN, rect.right),
  };
}

/**
 * Which side of the trigger the popup opens on.
 *
 * The surface states a preference (home drops down like Claude Design's
 * project picker, the project composer rises so it stays attached to the chat
 * bar), but a preference is not a mandate: the popup uses `overflow: visible`
 * so a stack taller than the room on the preferred side spills off-screen with
 * no way to scroll it back in. Whenever the preferred side cannot hold the
 * measured content and the opposite side has more room, flip.
 */
function resolvePlusMenuVerticalPlacement(
  spaceAbove: number,
  spaceBelow: number,
  preference: PlusMenuPlacementPreference,
  requiredHeight: number,
): PlusMenuVerticalPlacement {
  const preferred: PlusMenuVerticalPlacement = preference === 'up' ? 'up' : 'down';
  const preferredSpace = preferred === 'up' ? spaceAbove : spaceBelow;
  const otherSpace = preferred === 'up' ? spaceBelow : spaceAbove;
  if (preferredSpace >= requiredHeight) return preferred;
  if (otherSpace > preferredSpace) return preferred === 'up' ? 'down' : 'up';
  return preferred;
}

function getPlusMenuStyle(
  anchor: HTMLElement,
  placementPreference: PlusMenuPlacementPreference,
  contentHeight: number | null,
): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || PLUS_MENU_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
  const width = Math.min(PLUS_MENU_WIDTH, Math.max(0, viewportWidth - PLUS_MENU_MARGIN * 2));
  const left = Math.min(
    Math.max(PLUS_MENU_MARGIN, rect.left),
    Math.max(PLUS_MENU_MARGIN, viewportWidth - PLUS_MENU_MARGIN - width),
  );
  const spaceBelow = viewportHeight - rect.bottom - PLUS_MENU_MARGIN - PLUS_MENU_GAP;
  const spaceAbove = rect.top - PLUS_MENU_MARGIN - PLUS_MENU_GAP;
  const requiredHeight = contentHeight ?? PLUS_MENU_MIN_HEIGHT;

  if (
    resolvePlusMenuVerticalPlacement(spaceAbove, spaceBelow, placementPreference, requiredHeight)
      === 'up'
  ) {
    return {
      left,
      top: 'auto',
      bottom: Math.max(PLUS_MENU_MARGIN, viewportHeight - rect.top + PLUS_MENU_GAP),
      width,
      maxHeight: Math.max(0, spaceAbove),
    };
  }

  return {
    left,
    top: Math.max(PLUS_MENU_MARGIN, rect.bottom + PLUS_MENU_GAP),
    bottom: 'auto',
    width,
    maxHeight: Math.max(0, spaceBelow),
  };
}

function getFlyoutPlacement(
  anchor: HTMLElement,
  flyoutWidth: number = PLUS_MENU_FLYOUT_WIDTH,
): PlusMenuFlyoutPlacement {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
  const boundary = getFlyoutBoundary(anchor);
  const menuWidth = Math.min(PLUS_MENU_WIDTH, Math.max(0, viewportWidth - PLUS_MENU_MARGIN * 2));
  const menuLeft = Math.min(
    Math.max(PLUS_MENU_MARGIN, rect.left),
    Math.max(PLUS_MENU_MARGIN, viewportWidth - PLUS_MENU_MARGIN - menuWidth),
  );
  return resolveFlyoutSide({
    menuLeft,
    menuWidth,
    flyoutWidth,
    gap: PLUS_MENU_GAP,
    boundaryLeft: boundary.left,
    boundaryRight: boundary.right,
  });
}

export interface ComposerPlusMenuProps {
  workspaceContext?: WorkspaceCollabContext | null;
  /**
   * Accepted for API compatibility but no longer rendered as a "+" submenu:
   * skills are picked through the composer's `@` mention popover on both the
   * home hero and the project composer, so a second surface here only made the
   * menu taller than the viewport.
   */
  skills?: SkillSummary[];
  onPickSkill?: (skill: SkillSummary) => void;

  /** Triggers file attachment (opens the native picker). */
  onAttachFiles: () => void;
  attachLoading?: boolean;

  /** Opens the reference-project picker. */
  onReferenceProject?: () => void;

  /** Opens a native folder picker and stages the folder as local code context. */
  onLinkLocalCode?: () => void;

  /**
   * Working-directory submenu (project composer only): mirrors the Home
   * composer's WorkingDirPicker — pick a folder, re-pick a recent one, or
   * clear the current binding. The whole row renders only when
   * `onPickWorkingDir` is provided; Home keeps its own footer picker.
   */
  workingDir?: string | null;
  recentWorkingDirs?: string[];
  onPickWorkingDir?: () => void;
  onSelectRecentWorkingDir?: (dir: string) => void;
  onClearWorkingDir?: () => void;

  /** Opens the "Select from library" picker; omit to hide the row. */
  onSelectFromLibrary?: () => void;

  /** Opens the "Import from Figma" dialog (offline .fig decode or a Figma
   *  URL → webpage); omit to hide the row. */
  onImportFigma?: () => void;
  /**
   * Accepted for API compatibility but no longer rendered. The "查看方法"
   * (.fig download guide) row was removed from this menu: the "+" menu is a
   * list of things to ATTACH to the message, and a help article is not one of
   * them — it pushed a documentation detour into the middle of the attach
   * flow. The Figma import row itself stays.
   */
  onShowFigmaHelp?: () => void;
  /**
   * Accepted for API compatibility but no longer rendered: both callers
   * implement it by clicking the design-system trigger that already sits in
   * the same composer footer, so the row duplicated a visible control.
   */
  onOpenDesignSystems?: () => void;


  /** Test id for the trigger button. */
  triggerTestId?: string;

  /**
   * Optional visible label beside the "+". Given one, the trigger stops being
   * a lone disc and renders as a text control (Home's accessory row, where it
   * sits next to the working-directory picker); left off, it stays the bare
   * icon button the project composer uses.
   */
  triggerLabel?: string;

  /** Notified when the menu opens. */
  onOpen?: () => void;

  /**
   * Notified when a submenu flyout actually opens (the active submenu
   * changes; repeated hovers over the same open row don't re-fire). Callers
   * use it for analytics; `toolbox` is reported too, and the project
   * composer filters it out because its panel tracks its own open.
   */
  onSubmenuOpen?: (submenu: PlusMenuSubmenu) => void;

  /**
   * Home opens below the trigger like Claude Design's project picker, while
   * the bottom project composer opens upward so it stays attached to the chat
   * bar. `auto` leaves the side entirely to the fit check. In every mode the
   * preference yields when the content cannot fit on that side.
   */
  placementPreference?: PlusMenuPlacementPreference;

  /**
   * External open request (e.g. the next-step card's quick-access pills).
   * Bumping `nonce` opens the menu exactly as if the "+" trigger was clicked;
   * `submenu` additionally pre-opens that flyout. `null` never opens.
   */
  openRequest?: { nonce: number; submenu?: PlusMenuSubmenu } | null;
}

/**
 * The composer "+" menu shared between the home hero and the project chat
 * composer. Owns its own open / submenu / search state; callers supply the
 * data lists and pick/add handlers.
 */
export function ComposerPlusMenu({
  workspaceContext = null,
  onAttachFiles,
  attachLoading,
  onReferenceProject,
  onLinkLocalCode,
  workingDir,
  recentWorkingDirs,
  onPickWorkingDir,
  onSelectRecentWorkingDir,
  onClearWorkingDir,
  onSelectFromLibrary,
  onImportFigma,
  triggerTestId,
  triggerLabel,
  onOpen,
  onSubmenuOpen,
  placementPreference = 'auto',
  openRequest,
}: ComposerPlusMenuProps) {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<PlusMenuSubmenu | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [flyoutPlacement, setFlyoutPlacement] = useState<PlusMenuFlyoutPlacement>('right');
  const [flyoutVerticalPlacement, setFlyoutVerticalPlacement] = useState<PlusMenuFlyoutVerticalPlacement>('down');
  const [flyoutMaxHeight, setFlyoutMaxHeight] = useState(PLUS_MENU_FLYOUT_MAX_HEIGHT);
  // Natural (unclamped) height of the row stack, measured from the rendered
  // popup. Drives the flip decision so a menu that outgrows the room under the
  // trigger opens upward instead of spilling off the viewport bottom.
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current);
  }, []);

  // Hover intent: side flyouts have a small visual gap from the parent row, so
  // closing immediately on row mouseleave makes diagonal cursor movement feel
  // broken. Defer close briefly; entering the flyout cancels the pending close.
  function cancelSubmenuClose() {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  }

  function scheduleCloseSubmenu() {
    cancelSubmenuClose();
    submenuCloseTimer.current = setTimeout(() => {
      submenuCloseTimer.current = null;
      // Typing into a flyout's search box narrows its list, which reflows rows
      // out from under a stationary cursor — the browser then synthesizes a
      // `mouseleave` on the flyout even though the pointer never moved. Honoring
      // that close would yank the search box away mid-search, making the entry
      // impossible to pick. Keep the submenu open
      // while its own search input still owns focus; the outside-click / Escape
      // handlers remain the deliberate ways to dismiss it.
      const active = document.activeElement;
      if (active && popupRef.current?.contains(active) && active.tagName === 'INPUT') {
        return;
      }
      setSubmenu(null);
    }, 200);
  }

  function close() {
    cancelSubmenuClose();
    setOpen(false);
    setSubmenu(null);
  }

  function updateFlyoutGeometry(row: HTMLDivElement | null) {
    if (!row) {
      setFlyoutVerticalPlacement('down');
      setFlyoutMaxHeight(PLUS_MENU_FLYOUT_MAX_HEIGHT);
      return;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
    const rowRect = row.getBoundingClientRect();
    const downSpace = viewportHeight - (rowRect.top - 5) - PLUS_MENU_MARGIN;
    const upSpace = rowRect.bottom + 5 - PLUS_MENU_MARGIN;
    const verticalPlacement =
      downSpace >= PLUS_MENU_FLYOUT_MAX_HEIGHT || downSpace >= upSpace ? 'down' : 'up';
    setFlyoutVerticalPlacement(verticalPlacement);
    setFlyoutMaxHeight(
      Math.max(
        120,
        Math.min(
          PLUS_MENU_FLYOUT_MAX_HEIGHT,
          verticalPlacement === 'up' ? upSpace : downSpace,
        ),
      ),
    );
  }

  function openSubmenu(
    next: PlusMenuSubmenu,
    row: HTMLDivElement | null,
  ) {
    cancelSubmenuClose();
    updateFlyoutGeometry(row);
    if (submenu !== next) onSubmenuOpen?.(next);
    setSubmenu(next);
  }

  // External open request (quick-access pills): replay the trigger-click open,
  // then pre-open the requested flyout. Keyed on nonce so a repeat click
  // re-opens after a close. No row anchor exists yet, so the flyout geometry
  // falls back to the default down placement.
  const lastOpenRequestNonceRef = useRef(0);
  useEffect(() => {
    if (!openRequest || openRequest.nonce === lastOpenRequestNonceRef.current) return;
    lastOpenRequestNonceRef.current = openRequest.nonce;
    cancelSubmenuClose();
    onOpen?.();
    setOpen(true);
    if (openRequest.submenu) openSubmenu(openRequest.submenu, null);
    // openSubmenu / cancelSubmenuClose are hoisted per-render function
    // declarations; the nonce ref is the real change detector here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (submenu) {
        setSubmenu(null);
        return;
      }
      close();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, submenu]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      setContentHeight(null);
      return;
    }
    const updateMenuPosition = () => {
      const anchor = triggerRef.current;
      if (!anchor) return;
      // Measure only while no flyout is open: in the contained layout the
      // flyout joins the popup's flow, and feeding that back into the flip
      // decision would let opening a submenu re-place the whole menu.
      const popup = popupRef.current;
      let measured = contentHeight;
      if (popup && !submenu) {
        // `overflow: visible` means scrollHeight reports the full stack even
        // when maxHeight is already clipping it. A zero reading means "not
        // laid out yet" (jsdom never lays out), so keep the static budget.
        const next = popup.scrollHeight > 0 ? popup.scrollHeight : null;
        measured = next;
        if (next !== contentHeight) setContentHeight(next);
      }
      setMenuStyle(getPlusMenuStyle(anchor, placementPreference, measured));
      setFlyoutPlacement(getFlyoutPlacement(anchor, PLUS_MENU_FLYOUT_WIDTH));
      const activeRow = popupRef.current?.querySelector<HTMLDivElement>('.plus-menu__submenu-row.is-open') ?? null;
      updateFlyoutGeometry(activeRow);
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, submenu, placementPreference, contentHeight]);

  const popupStyle = menuStyle
    ? ({
        ...menuStyle,
        '--plus-menu-flyout-max-height': `${flyoutMaxHeight}px`,
      } satisfies PlusMenuPopupStyle)
    : undefined;

  return (
    <div className="plus-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-btn plus-menu__trigger${triggerLabel ? ' plus-menu__trigger--labeled' : ' od-tooltip'}${open ? ' is-active' : ''}`}
        data-testid={triggerTestId}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          onOpen?.();
          setOpen(true);
        }}
        // The hover bubble is the unlabeled trigger's only affordance; once the
        // label is on screen it would just repeat (and contradict) it.
        {...(triggerLabel
          ? {}
          : { title: t('homeHero.addMenu'), 'data-tooltip': t('homeHero.addMenu') })}
        aria-label={triggerLabel ?? t('homeHero.addMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {/* `od-icon` is what the stylesheet keys the 45° pivot off, so the bare
            disc's glyph reads as a close × while the menu is open. The labeled
            variant opts out of that pivot — its label already says what the
            control does, and a tilted paperclip says nothing. */}
        <Icon name="attach" size={16} className="od-icon" />
        {triggerLabel ? (
          <span className="plus-menu__trigger-label">{triggerLabel}</span>
        ) : null}
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popupRef}
          className={`plus-menu__popup plus-menu__popup--flyout-${flyoutPlacement} plus-menu__popup--flyout-y-${flyoutVerticalPlacement}`}
          role="menu"
          style={popupStyle}
        >
          <button
            type="button"
            role="menuitem"
            className="plus-menu__item"
            data-testid="composer-plus-attach"
            disabled={attachLoading}
            onClick={() => {
              close();
              onAttachFiles();
            }}
          >
            <Icon
              name={attachLoading ? 'spinner' : 'plus'}
              size={15}
              className="plus-menu__item-icon"
            />
            <span>{t('chat.attachAria')}</span>
          </button>
          {LIBRARY_UI_VISIBLE && onSelectFromLibrary ? (
            <button
              type="button"
              role="menuitem"
              className="plus-menu__item"
              data-testid="composer-plus-library"
              onClick={() => {
                close();
                onSelectFromLibrary();
              }}
            >
              <Icon name="layers-filled" size={15} className="plus-menu__item-icon" />
              <span>{t('chat.selectFromLibrary')}</span>
            </button>
          ) : null}
          {onImportFigma ? (
            <button
              type="button"
              role="menuitem"
              className="plus-menu__item"
              data-testid="composer-plus-figma"
              onClick={() => {
                close();
                onImportFigma();
              }}
            >
              <Icon name="import" size={15} className="plus-menu__item-icon" />
              <span>{t('chat.importFigma')}</span>
            </button>
          ) : null}
          {/* 附加文件 / 从 Figma 导入 both drop content straight into this
              turn; the working directory below scopes what the agent may read
              on disk for the whole session. Different question, own group.
              Home omits the working-dir row entirely (it keeps its own footer
              picker), so the rule is gated on the group it separates rather
              than trailing the menu with nothing under it. */}
          {onPickWorkingDir || onReferenceProject || onLinkLocalCode ? (
            <div className="plus-menu__divider" role="separator" />
          ) : null}
          {/* Project reference + local code live INSIDE the working-dir group
              below, not as siblings of 附加文件: all three answer the same
              question (what may the agent read besides this thread), and the
              flat list buried 附加文件 — the one thing this menu is named for
              — under them. */}
          {onPickWorkingDir || onReferenceProject || onLinkLocalCode ? (
            <PlusSubmenuRow
              label={t('homeWorkingDir.triggerShort')}
              icon="folder"
              open={submenu === 'workingDir'}
              testId="composer-plus-working-dir"
              onOpen={(row) => openSubmenu('workingDir', row)}
              onClose={scheduleCloseSubmenu}
            >
              <div className="plus-menu__list">
                {onPickWorkingDir ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    data-testid="composer-plus-working-dir-pick"
                    onClick={() => {
                      close();
                      onPickWorkingDir();
                    }}
                  >
                    <Icon name="folder" size={15} className="plus-menu__item-icon" />
                    <span>{workingDir ? t('homeWorkingDir.replace') : t('homeWorkingDir.pick')}</span>
                  </button>
                ) : null}
                {(onPickWorkingDir ? recentWorkingDirs ?? [] : []).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    title={dir}
                    onClick={() => {
                      close();
                      onSelectRecentWorkingDir?.(dir);
                    }}
                  >
                    <Icon name="history" size={15} className="plus-menu__item-icon" />
                    <span>{dirBasename(dir)}</span>
                  </button>
                ))}
                {onPickWorkingDir && workingDir && onClearWorkingDir ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    data-testid="composer-plus-working-dir-clear"
                    onClick={() => {
                      close();
                      onClearWorkingDir();
                    }}
                  >
                    <Icon name="close" size={15} className="plus-menu__item-icon" />
                    <span>{t('homeWorkingDir.clear')}</span>
                  </button>
                ) : null}
                {onPickWorkingDir && (onReferenceProject || onLinkLocalCode) ? (
                  <div className="plus-menu__divider" role="separator" />
                ) : null}
                {onReferenceProject ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    data-testid="composer-plus-reference-project"
                    onClick={() => {
                      close();
                      onReferenceProject();
                    }}
                  >
                    <Icon name="folder" size={15} className="plus-menu__item-icon" />
                    <span>{t('chat.plus.referenceProject')}</span>
                  </button>
                ) : null}
                {onLinkLocalCode ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    data-testid="composer-plus-local-code"
                    onClick={() => {
                      close();
                      onLinkLocalCode();
                    }}
                  >
                    <Icon name="folder" size={15} className="plus-menu__item-icon" />
                    <span>{t('chat.plus.linkLocalCode')}</span>
                  </button>
                ) : null}
              </div>
            </PlusSubmenuRow>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function PlusSubmenuRow({
  label,
  icon,
  open,
  onOpen,
  onClose,
  flyoutClassName,
  testId,
  children,
}: {
  label: string;
  icon: IconName;
  open: boolean;
  onOpen: (row: HTMLDivElement | null) => void;
  onClose: () => void;
  /** Extra class on the flyout for width/layout variants. */
  flyoutClassName?: string;
  testId?: string;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={rowRef}
      className={`plus-menu__submenu-row${open ? ' is-open' : ''}`}
      onMouseEnter={() => onOpen(rowRef.current)}
      onMouseLeave={onClose}
    >
      <button
        type="button"
        role="menuitem"
        className="plus-menu__item plus-menu__parent"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen(rowRef.current))}
      >
        <Icon name={icon} size={15} className="plus-menu__item-icon" />
        <span>{label}</span>
        <Icon name="chevron-right" size={14} className="plus-menu__chevron" />
      </button>
      {open ? (
        <div
          className={`plus-menu__flyout${flyoutClassName ? ` ${flyoutClassName}` : ''}`}
          role="menu"
          onMouseEnter={() => onOpen(rowRef.current)}
          onMouseLeave={onClose}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
