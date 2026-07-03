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
import type {
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  SkillSummary,
} from '@open-design/contracts';
import { useI18n, useT } from '../i18n';
import type { Locale } from '../i18n/types';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import { ComposerPluginPreview } from './ComposerPluginPreview';
import { localizePluginTitle } from './plugins-home/localization';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { resolveFlyoutSide } from './composer-flyout-placement';
import { Icon, type IconName } from './Icon';

const PLUS_MENU_MARGIN = 12;
const PLUS_MENU_GAP = 8;
const PLUS_MENU_WIDTH = 208;
const PLUS_MENU_FLYOUT_WIDTH = 260;
// The Plugins flyout is wider than the others because it carries a
// side-by-side hover-preview column. This MUST match the rendered width of
// `.plus-menu__flyout--plugins` in styles/home/plus-menu.css — over-reserving
// here makes medium-width panes wrongly fall back to the contained layout and
// silently drop the preview column.
const PLUS_MENU_PLUGIN_FLYOUT_WIDTH = 466;
const PLUS_MENU_SKILL_FLYOUT_WIDTH = 430;
const PLUS_MENU_TOOLBOX_FLYOUT_WIDTH = 320;
const PLUS_MENU_PREFERRED_MIN_HEIGHT = 180;
const PLUS_MENU_FLYOUT_MAX_HEIGHT = 320;
export type PlusMenuPlacementPreference = 'auto' | 'down' | 'up';
type PlusMenuFlyoutPlacement = 'right' | 'left' | 'contained';
type PlusMenuFlyoutVerticalPlacement = 'down' | 'up';
export type PlusMenuSubmenu = 'connectors' | 'plugins' | 'skills' | 'mcp' | 'toolbox';

// Analytics mapping for the submenu flyouts: which resource list each
// submenu carries. `toolbox` is intentionally absent — the project composer
// tracks it separately as `design_toolbox_open`.
export const PLUS_SUBMENU_RESOURCE_KIND = {
  connectors: 'connector',
  plugins: 'plugin',
  skills: 'skill',
  mcp: 'mcp',
} as const;
type PlusMenuPopupStyle = CSSProperties & Record<'--plus-menu-flyout-max-height', string>;

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

function getPlusMenuStyle(
  anchor: HTMLElement,
  placementPreference: PlusMenuPlacementPreference,
): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || PLUS_MENU_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
  const width = Math.min(PLUS_MENU_WIDTH, Math.max(0, viewportWidth - PLUS_MENU_MARGIN * 2));
  const left = Math.min(
    Math.max(PLUS_MENU_MARGIN, rect.left),
    Math.max(PLUS_MENU_MARGIN, viewportWidth - PLUS_MENU_MARGIN - width),
  );
  const spaceAbove = rect.top - PLUS_MENU_MARGIN - PLUS_MENU_GAP;
  const spaceBelow = viewportHeight - rect.bottom - PLUS_MENU_MARGIN - PLUS_MENU_GAP;

  const upStyle = {
    left,
    top: 'auto',
    bottom: Math.max(PLUS_MENU_MARGIN, viewportHeight - rect.top + PLUS_MENU_GAP),
    width,
    maxHeight: Math.max(0, spaceAbove),
  } satisfies CSSProperties;
  const downStyle = {
    left,
    top: Math.max(PLUS_MENU_MARGIN, rect.bottom + PLUS_MENU_GAP),
    bottom: 'auto',
    width,
    maxHeight: Math.max(0, spaceBelow),
  } satisfies CSSProperties;

  if (placementPreference === 'down') {
    return downStyle;
  }
  if (placementPreference === 'up') {
    return upStyle;
  }

  if (spaceAbove >= PLUS_MENU_PREFERRED_MIN_HEIGHT || spaceAbove >= spaceBelow) {
    return {
      ...upStyle,
    };
  }

  return {
    ...downStyle,
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

function getFlyoutWidth(submenu: PlusMenuSubmenu | null): number {
  if (submenu === 'plugins') return PLUS_MENU_PLUGIN_FLYOUT_WIDTH;
  if (submenu === 'skills') return PLUS_MENU_SKILL_FLYOUT_WIDTH;
  if (submenu === 'toolbox') return PLUS_MENU_TOOLBOX_FLYOUT_WIDTH;
  return PLUS_MENU_FLYOUT_WIDTH;
}

export interface ComposerPlusMenuProps {
  /** Connector context options shown under the "Connectors" submenu. */
  connectors: ConnectorDetail[];
  onPickConnector: (connector: ConnectorDetail) => void;
  /** Opens the connector integration surface; omit to hide the add row. */
  onAddConnector?: () => void;

  /** Installed plugin options shown under the "Plugins" submenu. */
  plugins: InstalledPluginRecord[];
  onPickPlugin: (plugin: InstalledPluginRecord) => void;
  /** Opens the plugin registry; omit to hide the add row. */
  onAddPlugin?: () => void;

  /** Enabled MCP servers shown under the "MCP" submenu. */
  mcpServers: McpServerConfig[];
  onPickMcp: (server: McpServerConfig) => void;
  /** Opens MCP settings; omit to hide the add row. */
  onAddMcp?: () => void;

  /** Available skills shown under the "Skills" submenu. */
  skills?: SkillSummary[];
  onPickSkill?: (skill: SkillSummary) => void;

  /** Triggers file attachment (opens the native picker). */
  onAttachFiles: () => void;
  attachLoading?: boolean;

  /** Opens the reference-project picker. */
  onReferenceProject?: () => void;

  /** Opens a native folder picker and stages the folder as local code context. */
  onLinkLocalCode?: () => void;

  /** Opens the "Select from library" picker; omit to hide the row. */
  onSelectFromLibrary?: () => void;

  /** Opens the "Import from Figma" dialog (offline .fig decode or a Figma
   *  URL → webpage); omit to hide the row. */
  onImportFigma?: () => void;
  /** Opens the "how to download a .fig" guide. */
  onShowFigmaHelp?: () => void;
  /** Opens the design-system picker/surface. */
  onOpenDesignSystems?: () => void;

  /**
   * Optional "Design toolbox" row, rendered LAST. Only the project composer
   * passes this; the home composer omits it. The returned node is shown in a
   * right-side flyout reusing the same submenu styling.
   */
  renderToolbox?: (close: () => void) => ReactNode;
  toolboxLabel?: string;

  /** Test id for the trigger button. */
  triggerTestId?: string;

  /**
   * Notified when the menu opens. The project composer uses this to latch its
   * lazy plugin / MCP / connector fetches, so the Plugins / Connectors / MCP
   * submenus aren't empty when the "+" menu is the first thing clicked on a
   * cold composer.
   */
  onOpen?: () => void;

  /**
   * Notified when a submenu flyout actually opens (the active submenu
   * changes; repeated hovers over the same open row don't re-fire). Callers
   * use it for analytics; `toolbox` is reported too, and the project
   * composer filters it out because its panel tracks its own open.
   */
  onSubmenuOpen?: (submenu: PlusMenuSubmenu) => void;

  /**
   * Notified once per submenu-open session when the user starts typing in
   * that flyout's search box. Carries which list was searched, never the
   * query text.
   */
  onSearchUsed?: (submenu: 'plugins' | 'skills' | 'mcp') => void;

  /**
   * Home opens below the trigger like Claude Design's project picker, while
   * the bottom project composer opens upward so it stays attached to the chat
   * bar. `auto` preserves the older viewport-driven fallback for tests and
   * any future neutral surface.
   */
  placementPreference?: PlusMenuPlacementPreference;
}

function pluginMatches(
  plugin: InstalledPluginRecord,
  needle: string,
  localizedTitle: string,
): boolean {
  if (!needle) return true;
  // Match the localized title too, so a Chinese search hits a plugin whose
  // raw `title` is English but whose `title_i18n` is the displayed name.
  return `${localizedTitle} ${plugin.title} ${plugin.id}`.toLowerCase().includes(needle);
}

function mcpMatches(server: McpServerConfig, needle: string): boolean {
  if (!needle) return true;
  return `${server.label ?? ''} ${server.id}`.toLowerCase().includes(needle);
}

function menuSkillMatches(
  skill: SkillSummary,
  needle: string,
  localizedName: string,
  localizedDescription: string,
): boolean {
  if (!needle) return true;
  return [
    localizedName,
    localizedDescription,
    skill.id,
    skill.name,
    skill.description,
    skill.mode,
    skill.category ?? '',
    ...(skill.triggers ?? []),
  ].join(' ').toLowerCase().includes(needle);
}

/**
 * The composer "+" menu shared between the home hero and the project chat
 * composer. Owns its own open / submenu / search state; callers supply the
 * data lists and pick/add handlers. Pass `renderToolbox` to append the
 * project-only design-toolbox row.
 */
export function ComposerPlusMenu({
  connectors,
  onPickConnector,
  onAddConnector,
  plugins,
  onPickPlugin,
  onAddPlugin,
  skills = [],
  onPickSkill,
  mcpServers,
  onPickMcp,
  onAddMcp,
  onAttachFiles,
  attachLoading,
  onReferenceProject,
  onLinkLocalCode,
  onSelectFromLibrary,
  onImportFigma,
  onShowFigmaHelp,
  onOpenDesignSystems,
  renderToolbox,
  toolboxLabel,
  triggerTestId,
  onOpen,
  onSubmenuOpen,
  onSearchUsed,
  placementPreference = 'auto',
}: ComposerPlusMenuProps) {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<PlusMenuSubmenu | null>(null);
  const [query, setQuery] = useState('');
  // Id of the plugin row the preview column is mirroring. Defaults to the
  // first filtered row (see `hoveredPlugin`) so the panel is never blank
  // while the menu is open.
  const [hoveredPluginId, setHoveredPluginId] = useState<string | null>(null);
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [flyoutPlacement, setFlyoutPlacement] = useState<PlusMenuFlyoutPlacement>('right');
  const [flyoutVerticalPlacement, setFlyoutVerticalPlacement] = useState<PlusMenuFlyoutVerticalPlacement>('down');
  const [flyoutMaxHeight, setFlyoutMaxHeight] = useState(PLUS_MENU_FLYOUT_MAX_HEIGHT);
  const [flyoutStyle, setFlyoutStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether onSearchUsed already fired for the current submenu-open session.
  const searchUsedRef = useRef(false);

  // The plugin and MCP flyouts share one `query`, but it is scoped to whichever
  // submenu is open. Reset it whenever the active submenu changes so a stale
  // plugin search (e.g. "deck") never filters the MCP list — which would
  // otherwise show the empty state even when servers exist.
  useEffect(() => {
    setQuery('');
    setHoveredPluginId(null);
    setHoveredSkillId(null);
    searchUsedRef.current = false;
  }, [submenu]);

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
      setSubmenu(null);
      submenuCloseTimer.current = null;
    }, 200);
  }

  function close() {
    cancelSubmenuClose();
    setOpen(false);
    setSubmenu(null);
  }

  function updateFlyoutGeometry(row: HTMLDivElement | null, nextSubmenu: PlusMenuSubmenu | null) {
    const anchor = triggerRef.current;
    const flyoutWidth = getFlyoutWidth(nextSubmenu);
    const placement = anchor ? getFlyoutPlacement(anchor, flyoutWidth) : 'right';
    setFlyoutPlacement(placement);

    if (!row) {
      setFlyoutVerticalPlacement('down');
      setFlyoutMaxHeight(PLUS_MENU_FLYOUT_MAX_HEIGHT);
      setFlyoutStyle(null);
      return;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    const rowRect = row.getBoundingClientRect();
    const downSpace = viewportHeight - (rowRect.top - 5) - PLUS_MENU_MARGIN;
    const upSpace = rowRect.bottom + 5 - PLUS_MENU_MARGIN;
    const verticalPlacement =
      downSpace >= PLUS_MENU_FLYOUT_MAX_HEIGHT || downSpace >= upSpace ? 'down' : 'up';
    const maxHeight = Math.max(
      120,
      Math.min(
        PLUS_MENU_FLYOUT_MAX_HEIGHT,
        verticalPlacement === 'up' ? upSpace : downSpace,
      ),
    );
    setFlyoutVerticalPlacement(verticalPlacement);
    setFlyoutMaxHeight(maxHeight);

    if (placement === 'contained') {
      setFlyoutStyle(null);
      return;
    }

    const sideStyle =
      placement === 'left'
        ? {
            left: Math.max(
              PLUS_MENU_MARGIN,
              rowRect.left - PLUS_MENU_GAP - flyoutWidth,
            ),
          }
        : {
            left: Math.min(
              Math.max(PLUS_MENU_MARGIN, rowRect.right + PLUS_MENU_GAP),
              Math.max(PLUS_MENU_MARGIN, viewportWidth - PLUS_MENU_MARGIN - flyoutWidth),
            ),
          };
    const verticalStyle =
      verticalPlacement === 'up'
        ? {
            top: 'auto',
            bottom: Math.max(PLUS_MENU_MARGIN, viewportHeight - rowRect.bottom + 5),
          }
        : {
            top: Math.max(PLUS_MENU_MARGIN, rowRect.top - 5),
            bottom: 'auto',
          };

    setFlyoutStyle({
      ...sideStyle,
      ...verticalStyle,
      width: Math.min(flyoutWidth, Math.max(0, viewportWidth - PLUS_MENU_MARGIN * 2)),
      maxHeight,
    });
  }

  function openSubmenu(
    next: PlusMenuSubmenu,
    row: HTMLDivElement | null,
  ) {
    cancelSubmenuClose();
    updateFlyoutGeometry(row, next);
    if (submenu !== next) onSubmenuOpen?.(next);
    setSubmenu(next);
  }

  function handleQueryChange(value: string) {
    if (
      !searchUsedRef.current &&
      value.trim() &&
      (submenu === 'plugins' || submenu === 'skills' || submenu === 'mcp')
    ) {
      searchUsedRef.current = true;
      onSearchUsed?.(submenu);
    }
    setQuery(value);
  }

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
      return;
    }
    const updateMenuPosition = () => {
      const anchor = triggerRef.current;
      if (!anchor) return;
      setMenuStyle(getPlusMenuStyle(anchor, placementPreference));
      const activeRow = popupRef.current?.querySelector<HTMLDivElement>('.plus-menu__submenu-row.is-open') ?? null;
      updateFlyoutGeometry(activeRow, submenu);
    };

    updateMenuPosition();
    const popup = popupRef.current;
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    popup?.addEventListener('scroll', updateMenuPosition);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      popup?.removeEventListener('scroll', updateMenuPosition);
    };
  }, [open, submenu, placementPreference]);

  const needle = query.trim().toLowerCase();
  const filteredPlugins = needle
    ? plugins.filter((p) => pluginMatches(p, needle, localizePluginTitle(locale, p)))
    : plugins;
  const filteredSkills = needle
    ? skills.filter((skill) =>
        menuSkillMatches(
          skill,
          needle,
          localizeSkillName(locale, skill),
          localizeSkillDescription(locale, skill),
        ),
      )
    : skills;
  const filteredMcp = needle
    ? mcpServers.filter((s) => mcpMatches(s, needle))
    : mcpServers;
  // The preview mirrors the hovered row, falling back to the first visible
  // plugin so the panel is populated the moment the submenu opens. When a
  // search prunes the hovered row out of view, the fallback re-anchors it.
  const hoveredPlugin = useMemo(() => {
    if (submenu !== 'plugins' || filteredPlugins.length === 0) return null;
    return (
      filteredPlugins.find((p) => p.id === hoveredPluginId) ?? filteredPlugins[0]
    );
  }, [submenu, filteredPlugins, hoveredPluginId]);
  const hoveredSkill = useMemo(() => {
    if (submenu !== 'skills' || filteredSkills.length === 0) return null;
    return (
      filteredSkills.find((skill) => skill.id === hoveredSkillId) ??
      filteredSkills[0]
    );
  }, [submenu, filteredSkills, hoveredSkillId]);
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
        className={`icon-btn plus-menu__trigger od-tooltip${open ? ' is-active' : ''}`}
        data-testid={triggerTestId}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          onOpen?.();
          setOpen(true);
        }}
        title={t('homeHero.addMenu')}
        data-tooltip={t('homeHero.addMenu')}
        aria-label={t('homeHero.addMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="plus" size={16} />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popupRef}
          className={`plus-menu__popup plus-menu__popup--flyout-${flyoutPlacement} plus-menu__popup--flyout-y-${flyoutVerticalPlacement}`}
          role="menu"
          style={popupStyle}
        >
          <PlusMenuGroup label={t('chat.plus.group.files')}>
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
              name={attachLoading ? 'spinner' : 'attach'}
              size={14}
              className="plus-menu__item-icon"
            />
            <span>{t('chat.plus.attachFiles')}</span>
          </button>
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
              <Icon name="folder" size={14} className="plus-menu__item-icon" />
              <span>{t('chat.plus.referenceProject')}</span>
            </button>
          ) : null}
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
              <Icon name="layers-filled" size={14} className="plus-menu__item-icon" />
              <span>{t('chat.selectFromLibrary')}</span>
            </button>
          ) : null}
          </PlusMenuGroup>

          {onLinkLocalCode ? (
            <PlusMenuGroup label={t('chat.plus.group.code')}>
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
                <Icon name="folder" size={14} className="plus-menu__item-icon" />
                <span>{t('chat.plus.linkLocalCode')}</span>
              </button>
            </PlusMenuGroup>
          ) : null}

          {(onImportFigma || onOpenDesignSystems) ? (
            <PlusMenuGroup label={t('chat.plus.group.designs')}>
          {onImportFigma ? (
            <div className="plus-menu__split-row" role="none">
              <button
                type="button"
                role="menuitem"
                className="plus-menu__item plus-menu__split-main"
                data-testid="composer-plus-figma"
                onClick={() => {
                  close();
                  onImportFigma();
                }}
              >
                <Icon name="upload" size={14} className="plus-menu__item-icon" />
                <span>{t('chat.plus.uploadFig')}</span>
              </button>
              {onShowFigmaHelp ? (
                <button
                  type="button"
                  className="plus-menu__learn"
                  data-testid="composer-plus-figma-help"
                  onClick={() => {
                    close();
                    onShowFigmaHelp();
                  }}
                >
                  {t('chat.plus.learnHow')}
                </button>
              ) : null}
            </div>
          ) : null}
          {onOpenDesignSystems ? (
            <button
              type="button"
              role="menuitem"
              className="plus-menu__item"
              data-testid="composer-plus-design-system"
              onClick={() => {
                close();
                onOpenDesignSystems();
              }}
            >
              <Icon name="blocks" size={14} className="plus-menu__item-icon" />
              <span>{t('chat.plus.designSystem')}</span>
            </button>
          ) : null}
            </PlusMenuGroup>
          ) : null}

          <PlusMenuGroup label={t('chat.plus.group.other')} hideLabel>
          <PlusSubmenuRow
            label={t('chat.plus.connectors')}
            icon="link"
            open={submenu === 'connectors'}
            testId="composer-plus-connectors"
            onOpen={(row) => openSubmenu('connectors', row)}
            onClose={scheduleCloseSubmenu}
            flyoutStyle={flyoutStyle}
          >
            <div className="plus-menu__list">
              {connectors.length === 0 ? (
                <div className="plus-menu__empty">{t('homeHero.noConnectors')}</div>
              ) : (
                connectors.map((connector) => (
                  <button
                    key={connector.id}
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    // Keep focus on the editor so the pick handler's
                    // insertMention lands at the caret, not the draft end.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      close();
                      onPickConnector(connector);
                    }}
                  >
                    <Icon name="link" size={14} className="plus-menu__item-icon" />
                    <span>{connector.name}</span>
                  </button>
                ))
              )}
            </div>
            {onAddConnector ? (
              <>
                <div className="plus-menu__divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="plus-menu__item"
                  onClick={() => {
                    close();
                    onAddConnector();
                  }}
                >
                  <Icon name="plus" size={14} className="plus-menu__item-icon" />
                  <span>{t('homeHero.addConnectors')}</span>
                </button>
              </>
            ) : null}
          </PlusSubmenuRow>
          <PlusSubmenuRow
            label={t('chat.plus.plugins')}
            icon="sparkles"
            open={submenu === 'plugins'}
            testId="composer-plus-plugins"
            onOpen={(row) => openSubmenu('plugins', row)}
            onClose={scheduleCloseSubmenu}
            flyoutStyle={flyoutStyle}
            flyoutClassName={
              filteredPlugins.length > 0 ? 'plus-menu__flyout--plugins' : undefined
            }
          >
            <div className="plus-menu__plugin-pane">
              <div className="plus-menu__plugin-main">
                <div className="plus-menu__search">
                  <Icon name="search" size={13} />
                  <input
                    value={query}
                    onChange={(event) => handleQueryChange(event.target.value)}
                    placeholder={t('entry.navPlugins')}
                    aria-label={t('entry.navPlugins')}
                  />
                </div>
                <div className="plus-menu__list">
                  {filteredPlugins.length === 0 ? (
                    <div className="plus-menu__empty">{t('homeHero.noPlugins')}</div>
                  ) : (
                    filteredPlugins.map((plugin) => (
                      <button
                        key={plugin.id}
                        type="button"
                        role="menuitem"
                        className={`plus-menu__item${
                          plugin.id === hoveredPlugin?.id ? ' is-previewed' : ''
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHoveredPluginId(plugin.id)}
                        onFocus={() => setHoveredPluginId(plugin.id)}
                        onClick={() => {
                          close();
                          onPickPlugin(plugin);
                        }}
                      >
                        <Icon name="sparkles" size={14} className="plus-menu__item-icon" />
                        <span>{localizePluginTitle(locale, plugin)}</span>
                      </button>
                    ))
                  )}
                </div>
                {onAddPlugin ? (
                  <>
                    <div className="plus-menu__divider" />
                    <button
                      type="button"
                      role="menuitem"
                      className="plus-menu__item"
                      onClick={() => {
                        close();
                        onAddPlugin();
                      }}
                    >
                      <Icon name="plus" size={14} className="plus-menu__item-icon" />
                      <span>{t('homeHero.addPlugin')}</span>
                    </button>
                  </>
                ) : null}
              </div>
              {hoveredPlugin ? (
                <ComposerPluginPreview record={hoveredPlugin} locale={locale} />
              ) : null}
            </div>
          </PlusSubmenuRow>
          {onPickSkill ? (
            <PlusSubmenuRow
              label={t('settings.skills')}
              icon="sparkles"
              open={submenu === 'skills'}
              testId="composer-plus-skills"
              onOpen={(row) => openSubmenu('skills', row)}
              onClose={scheduleCloseSubmenu}
              flyoutStyle={flyoutStyle}
              flyoutClassName={
                filteredSkills.length > 0 ? 'plus-menu__flyout--skills' : undefined
              }
            >
              <div className="plus-menu__skill-pane">
                <div className="plus-menu__skill-main">
                  <div className="plus-menu__search">
                    <Icon name="search" size={13} />
                    <input
                      value={query}
                      onChange={(event) => handleQueryChange(event.target.value)}
                      placeholder={t('settings.skills')}
                      aria-label={t('settings.skills')}
                    />
                  </div>
                  <div className="plus-menu__list">
                    {filteredSkills.length === 0 ? (
                      <div className="plus-menu__empty">{t('examples.emptyNoSkills')}</div>
                    ) : (
                      filteredSkills.map((skill) => {
                        const label = localizeSkillName(locale, skill);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            role="menuitem"
                            className={`plus-menu__item${
                              skill.id === hoveredSkill?.id ? ' is-previewed' : ''
                            }`}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setHoveredSkillId(skill.id)}
                            onFocus={() => setHoveredSkillId(skill.id)}
                            onClick={() => {
                              close();
                              onPickSkill(skill);
                            }}
                          >
                            <Icon name="sparkles" size={15} className="plus-menu__item-icon" />
                            <span>{label}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                {hoveredSkill ? (
                  <ComposerSkillPreview skill={hoveredSkill} locale={locale} />
                ) : null}
              </div>
            </PlusSubmenuRow>
          ) : null}
          <PlusSubmenuRow
            label={t('chat.plus.mcp')}
            icon="link"
            open={submenu === 'mcp'}
            testId="composer-plus-mcp"
            onOpen={(row) => openSubmenu('mcp', row)}
            onClose={scheduleCloseSubmenu}
            flyoutStyle={flyoutStyle}
          >
            <div className="plus-menu__search">
              <Icon name="search" size={13} />
              <input
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="MCP"
                aria-label="MCP"
              />
            </div>
            <div className="plus-menu__list">
              {filteredMcp.length === 0 ? (
                <div className="plus-menu__empty">{t('homeHero.noMcp')}</div>
              ) : (
                filteredMcp.map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    role="menuitem"
                    className="plus-menu__item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      close();
                      onPickMcp(server);
                    }}
                  >
                    <Icon name="link" size={14} className="plus-menu__item-icon" />
                    <span>{server.label || server.id}</span>
                  </button>
                ))
              )}
            </div>
            {onAddMcp ? (
              <>
                <div className="plus-menu__divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="plus-menu__item"
                  onClick={() => {
                    close();
                    onAddMcp();
                  }}
                >
                  <Icon name="plus" size={14} className="plus-menu__item-icon" />
                  <span>{t('homeHero.addMcp')}</span>
                </button>
              </>
            ) : null}
          </PlusSubmenuRow>
          {renderToolbox ? (
            <PlusSubmenuRow
              label={toolboxLabel ?? t('chat.designToolbox.tooltip')}
              icon="lightbulb"
              open={submenu === 'toolbox'}
              onOpen={(row) => openSubmenu('toolbox', row)}
              onClose={scheduleCloseSubmenu}
              flyoutStyle={flyoutStyle}
            >
              {renderToolbox(close)}
            </PlusSubmenuRow>
          ) : null}
          </PlusMenuGroup>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function PlusMenuGroup({
  label,
  hideLabel = false,
  children,
}: {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="plus-menu__group" role="group" aria-label={label}>
      {hideLabel ? null : <div className="plus-menu__group-label">{label}</div>}
      {children}
    </div>
  );
}

function ComposerSkillPreview({
  skill,
  locale,
}: {
  skill: SkillSummary;
  locale: Locale;
}) {
  const title = localizeSkillName(locale, skill);
  const description = localizeSkillDescription(locale, skill) || skill.description;
  const triggers = skill.triggers?.filter(Boolean) ?? [];
  return (
    <div className="plus-menu__preview plus-menu__skill-preview" aria-live="polite">
      <div className="plus-menu__preview-meta">
        <div className="plus-menu__preview-title-row">
          <span className="plus-menu__preview-title">{title}</span>
          <span className="plus-menu__preview-kind">{skill.mode}</span>
        </div>
        {description ? (
          <p className="plus-menu__preview-desc">{description}</p>
        ) : null}
        <div className="plus-menu__skill-preview-meta">
          <span>{skill.source === 'user' ? 'User skill' : 'Built-in skill'}</span>
          {skill.category ? <span>{skill.category}</span> : null}
          {skill.surface ? <span>{skill.surface}</span> : null}
        </div>
        {triggers.length > 0 ? (
          <div className="plus-menu__skill-preview-triggers" aria-label="Skill triggers">
            {triggers.slice(0, 4).map((trigger) => (
              <span key={trigger}>{trigger}</span>
            ))}
          </div>
        ) : null}
        {skill.examplePrompt ? (
          <p className="plus-menu__skill-preview-example">
            {skill.examplePrompt}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PlusSubmenuRow({
  label,
  icon,
  open,
  onOpen,
  onClose,
  flyoutStyle,
  flyoutClassName,
  testId,
  children,
}: {
  label: string;
  icon: IconName;
  open: boolean;
  onOpen: (row: HTMLDivElement | null) => void;
  onClose: () => void;
  flyoutStyle?: CSSProperties | null;
  /** Extra class on the flyout, e.g. the wide plugins-preview variant. */
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
        <Icon name={icon} size={14} className="plus-menu__item-icon" />
        <span>{label}</span>
        <Icon name="chevron-right" size={13} className="plus-menu__chevron" />
      </button>
      {open ? (
        <div
          className={`plus-menu__flyout${flyoutClassName ? ` ${flyoutClassName}` : ''}`}
          role="menu"
          style={flyoutStyle ?? undefined}
          onMouseEnter={() => onOpen(rowRef.current)}
          onMouseLeave={onClose}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
