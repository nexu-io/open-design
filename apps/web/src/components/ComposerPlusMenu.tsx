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
} from '@open-design/contracts';
import { useI18n, useT } from '../i18n';
import { ComposerPluginPreview } from './ComposerPluginPreview';
import { localizePluginTitle } from './plugins-home/localization';
import { resolveFlyoutSide } from './composer-flyout-placement';
import { Icon, type IconName } from './Icon';

const PLUS_MENU_MARGIN = 12;
const PLUS_MENU_GAP = 8;
const PLUS_MENU_WIDTH = 190;
const PLUS_MENU_FLYOUT_WIDTH = 360;
// The Plugins flyout is wider than the others because it carries a
// side-by-side hover-preview column. This MUST match the rendered width of
// `.plus-menu__flyout--plugins` in styles/home/plus-menu.css — over-reserving
// here makes medium-width panes wrongly fall back to the contained layout and
// silently drop the preview column.
const PLUS_MENU_PLUGIN_FLYOUT_WIDTH = 466;
const PLUS_MENU_PREFERRED_MIN_HEIGHT = 180;
const PLUS_MENU_FLYOUT_MAX_HEIGHT = 320;
type PlusMenuFlyoutPlacement = 'right' | 'left' | 'contained';
type PlusMenuFlyoutVerticalPlacement = 'down' | 'up';
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

function getPlusMenuStyle(anchor: HTMLElement): CSSProperties {
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

  if (spaceAbove >= PLUS_MENU_PREFERRED_MIN_HEIGHT || spaceAbove >= spaceBelow) {
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

  /** Triggers file attachment (opens the native picker). */
  onAttachFiles: () => void;
  attachLoading?: boolean;

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
  mcpServers,
  onPickMcp,
  onAddMcp,
  onAttachFiles,
  attachLoading,
  renderToolbox,
  toolboxLabel,
  triggerTestId,
  onOpen,
}: ComposerPlusMenuProps) {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<
    'connectors' | 'plugins' | 'mcp' | 'toolbox' | null
  >(null);
  const [query, setQuery] = useState('');
  // Id of the plugin row the preview column is mirroring. Defaults to the
  // first filtered row (see `hoveredPlugin`) so the panel is never blank
  // while the menu is open.
  const [hoveredPluginId, setHoveredPluginId] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [flyoutPlacement, setFlyoutPlacement] = useState<PlusMenuFlyoutPlacement>('right');
  const [flyoutVerticalPlacement, setFlyoutVerticalPlacement] = useState<PlusMenuFlyoutVerticalPlacement>('down');
  const [flyoutMaxHeight, setFlyoutMaxHeight] = useState(PLUS_MENU_FLYOUT_MAX_HEIGHT);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The plugin and MCP flyouts share one `query`, but it is scoped to whichever
  // submenu is open. Reset it whenever the active submenu changes so a stale
  // plugin search (e.g. "deck") never filters the MCP list — which would
  // otherwise show the empty state even when servers exist.
  useEffect(() => {
    setQuery('');
    setHoveredPluginId(null);
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
    next: 'connectors' | 'plugins' | 'mcp' | 'toolbox',
    row: HTMLDivElement | null,
  ) {
    cancelSubmenuClose();
    updateFlyoutGeometry(row);
    setSubmenu(next);
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
      setMenuStyle(getPlusMenuStyle(anchor));
      const flyoutWidth =
        submenu === 'plugins'
          ? PLUS_MENU_PLUGIN_FLYOUT_WIDTH
          : PLUS_MENU_FLYOUT_WIDTH;
      setFlyoutPlacement(getFlyoutPlacement(anchor, flyoutWidth));
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
  }, [open, submenu]);

  const needle = query.trim().toLowerCase();
  const filteredPlugins = needle
    ? plugins.filter((p) => pluginMatches(p, needle, localizePluginTitle(locale, p)))
    : plugins;
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
              size={15}
              className="plus-menu__item-icon"
            />
            <span>{t('chat.attachAria')}</span>
          </button>
          <PlusSubmenuRow
            label={t('connectors.title')}
            icon="link"
            open={submenu === 'connectors'}
            onOpen={(row) => openSubmenu('connectors', row)}
            onClose={scheduleCloseSubmenu}
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
                    <Icon name="link" size={15} className="plus-menu__item-icon" />
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
                  <Icon name="plus" size={15} className="plus-menu__item-icon" />
                  <span>{t('homeHero.addConnectors')}</span>
                </button>
              </>
            ) : null}
          </PlusSubmenuRow>
          <PlusSubmenuRow
            label={t('entry.navPlugins')}
            icon="sparkles"
            open={submenu === 'plugins'}
            onOpen={(row) => openSubmenu('plugins', row)}
            onClose={scheduleCloseSubmenu}
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
                    onChange={(event) => setQuery(event.target.value)}
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
                        <Icon name="sparkles" size={15} className="plus-menu__item-icon" />
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
                      <Icon name="plus" size={15} className="plus-menu__item-icon" />
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
          <PlusSubmenuRow
            label="MCP"
            icon="link"
            open={submenu === 'mcp'}
            onOpen={(row) => openSubmenu('mcp', row)}
            onClose={scheduleCloseSubmenu}
          >
            <div className="plus-menu__search">
              <Icon name="search" size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
                    <Icon name="link" size={15} className="plus-menu__item-icon" />
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
                  <Icon name="plus" size={15} className="plus-menu__item-icon" />
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
            >
              {renderToolbox(close)}
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
  children,
}: {
  label: string;
  icon: IconName;
  open: boolean;
  onOpen: (row: HTMLDivElement | null) => void;
  onClose: () => void;
  /** Extra class on the flyout, e.g. the wide plugins-preview variant. */
  flyoutClassName?: string;
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
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen(rowRef.current))}
      >
        <Icon name={icon} size={15} className="plus-menu__item-icon" />
        <span>{label}</span>
        <Icon name="chevron-right" size={13} className="plus-menu__chevron" />
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
