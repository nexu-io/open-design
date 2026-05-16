import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { exportAsHtml, exportAsPdf, exportAsZip, openSandboxedPreviewInNewTab } from '../runtime/exports';
import { buildSrcdoc } from '../runtime/srcdoc';
import { Icon } from './Icon';

export interface PreviewView {
  id: string;
  label: string;
  // Null means "still loading", undefined means "not yet requested".
  // Both states keep the iframe blank. The parent should react to
  // onView and begin a fetch.
  // Optional only when the view is a custom ReactNode stage —
  // see `custom` below.
  html?: string | null | undefined;
  // When set, the modal renders an error affordance with a Retry
  // button that re-fires onView for this view id, instead of sitting
  // at the loading state forever. Issue #860.
  error?: string | null;
  // Set when the underlying skill ships no HTML preview at all (its
  // `od.preview.type` is `image`, `markdown`, etc.). The modal renders
  // a calm "no shipped preview" placeholder instead of the loading or
  // error states — fetching `/api/skills/:id/example` for those skills
  // returns 404 today and the resulting "Couldn't load this example."
  // copy is misleading. `kind` carries the raw preview-type token so
  // copy can be shaped per kind ("markdown document", "image asset",
  // …). Mutually exclusive with `html` and `error`. Issue #897.
  unavailable?: { kind: string } | null;
  // Deck previews need deck-aware srcdoc/PDF handling so slide navigation and
  // print-all-slides behavior survive the sandboxed export path.
  deck?: boolean;
  // Render an arbitrary ReactNode in the stage instead of building a
  // sandboxed iframe — used by the plugin media detail variant so
  // image / video / audio previews share the same modal chrome
  // (header / tabs / actions / sidebar / fullscreen) as the existing
  // HTML and design-system surfaces. When set, the export share
  // menu is hidden for this view (no document to export) and the
  // fullscreen toggle still applies via the modal's own
  // `ds-modal-fullscreen` class.
  custom?: ReactNode;
}

export interface PreviewSidebar {
  // Header label and toggle button label.
  label: string;
  // Side-pane content — caller renders whatever it likes (markdown source
  // view, swatch grid, etc.). Always optional; when absent the toggle is
  // not shown.
  content: ReactNode;
  // Default open state on first mount. Defaults to false.
  defaultOpen?: boolean;
  // Called whenever the open state changes — useful so the parent can
  // lazy-fetch the side content the first time it is revealed.
  onToggle?: (open: boolean) => void;
  // Stable identity for the side-panel source. When this changes while the
  // sidebar is open, the lazy-load `onToggle` callback re-fires so the parent
  // can prime a fresh fetch — e.g. swapping between design systems while the
  // DESIGN.md panel stays open.
  contentKey?: string | number;
}

// Optional accent CTA rendered on the left side of the action row,
// before Sidebar/Fullscreen/Share. Used by the plugin detail
// wrappers to surface a "Use plugin" action without having to fork
// the whole modal layout. Stays optional so existing callers
// (DesignSystemPreviewModal, ExamplesTab) can keep their current
// chrome unchanged.
export interface PreviewPrimaryAction {
  label: string;
  onClick: () => void;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  testId?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  views: PreviewView[];
  initialViewId?: string;
  // Per-view filename hint for the share menu — receives the active view id
  // so DS can produce e.g. "Airtable — showcase" while Examples stay flat.
  exportTitleFor: (viewId: string) => string;
  // Fired whenever the active view changes — including on first mount with
  // initialViewId. Lets the parent drive lazy fetches without prop drilling
  // a loader callback in.
  onView?: (viewId: string) => void;
  onClose: () => void;
  // Optional split-view companion pane shown to the right of the iframe.
  // Used by the design-system preview to surface the raw DESIGN.md beside
  // the rendered showcase, matching the styles.refero.design layout.
  sidebar?: PreviewSidebar;
  // Logical viewport width the iframe content is rendered at. The iframe is
  // then visually scaled (transform: scale) to fit the actual stage width
  // so squeezing the preview behind a sidebar never reflows the inner page
  // into a half-broken responsive breakpoint. Defaults to 1280 — wide
  // enough that desktop-shaped showcases keep their intended layout.
  designWidth?: number;
  // Accent CTA rendered before the ghost actions (Sidebar / Fullscreen /
  // Share / Close). Plugin detail wrappers use this to expose "Use plugin".
  primaryAction?: PreviewPrimaryAction;
  // Optional extra controls rendered after Share and before the Close
  // button — used by plugin detail wrappers to surface the
  // PluginShareMenu (copy install command / share link / etc.) so the
  // affordance reads consistently across HTML / design-system / media
  // variants.
  headerExtras?: ReactNode;
}

// A full-screen overlay that renders an iframe of arbitrary HTML, with an
// optional tab bar for multiple views, a Share menu (PDF / HTML / ZIP /
// open-in-new-tab), and a Fullscreen toggle. Used by both the design-system
// preview and the example card preview, so the two paths feel identical.
export function PreviewModal({
  title,
  subtitle,
  views,
  initialViewId,
  exportTitleFor,
  onView,
  onClose,
  sidebar,
  designWidth = 1280,
  primaryAction,
  headerExtras,
}: Props) {
  const t = useT();
  const initial = initialViewId && views.some((v) => v.id === initialViewId)
    ? initialViewId
    : views[0]?.id ?? '';
  const [activeId, setActiveId] = useState<string>(initial);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    sidebar?.defaultOpen ?? false,
  );
  const shareRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  // Capture the toggle handler in a ref so the lazy-load effect below
  // depends only on sidebarOpen — without this, a new `sidebar` object on
  // every parent render would re-fire the load on each render.
  const sidebarToggleRef = useRef(sidebar?.onToggle);
  sidebarToggleRef.current = sidebar?.onToggle;

  // Tell the parent every time the side pane toggles so it can lazy-load
  // the spec body the first time it is revealed. Also re-fires when
  // `sidebar.contentKey` changes so the parent can prime a fresh fetch when
  // its underlying source swaps (e.g. another design system) while the
  // sidebar stays open. `sidebar` itself is a fresh object on every parent
  // render so we can't depend on it.
  const sidebarContentKey = sidebar?.contentKey;
  useEffect(() => {
    sidebarToggleRef.current?.(sidebarOpen);
  }, [sidebarOpen, sidebarContentKey]);

  // Tell the parent the initial view id so it can prime a fetch. Re-fires on
  // tab change. Guarded against re-firing while the same id is active to
  // avoid noisy effects in the parent.
  useEffect(() => {
    onView?.(activeId);
  }, [activeId, onView]);

  // Close on Escape. If we're in fullscreen, exit fullscreen first instead
  // of dismissing the whole modal in one keystroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fullscreen) {
        setFullscreen(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, fullscreen]);

  // Mirror native fullscreen state into React. Without this, a user in
  // browser fullscreen has to press Esc twice: the first Esc exits the
  // native fullscreen element (consumed by the browser; in some browsers no
  // keydown is delivered) while our `fullscreen` state stays true and the
  // overlay keeps its `ds-modal-fullscreen` class. Listening to
  // fullscreenchange lets one Esc dismiss both layers in lock-step.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Close share popover on outside click / Escape.
  useEffect(() => {
    if (!shareOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareOpen]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Track the iframe stage size so we can render the document at a fixed
  // logical width and visually scale it down to fit. Without this, opening
  // the side panel squeezes the iframe to ~60% width and triggers awkward
  // mid-breakpoint reflows in the showcase HTML.
  // ResizeObserver is missing from jsdom and from some older embedded
  // WebViews — guard the constructor and fall back to a window resize
  // listener so the modal still mounts and just loses element-level
  // resize tracking.
  useEffect(() => {
    const el = stageFrameRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStageSize({ w: r.width, h: r.height });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const activeView = views.find((v) => v.id === activeId) ?? views[0];
  const activeCustom = activeView?.custom ?? null;
  const activeHtml = activeView?.html ?? null;
  const activeError = activeView?.error ?? null;
  const activeUnavailable = activeView?.unavailable ?? null;
  const activeDeck = activeView?.deck ?? false;
  const isCustomView = activeCustom !== null && activeCustom !== undefined;
  const srcDoc = useMemo(
    () => (activeHtml ? buildSrcdoc(activeHtml, { deck: activeDeck }) : ''),
    [activeHtml, activeDeck],
  );
  const exportTitle = exportTitleFor(activeView?.id ?? '');

  // Only down-scale: when the stage is wider than the design viewport we
  // render the iframe at native size instead of upscaling pixels.
  const scale = stageSize.w > 0 ? Math.min(1, stageSize.w / designWidth) : 1;
  const scalerStyle = useMemo(() => {
    if (scale >= 1 || stageSize.w === 0) {
      return {
        width: '100%',
        height: '100%',
        transform: 'none',
      } as const;
    }
    return {
      width: designWidth,
      height: stageSize.h / scale,
      transform: `scale(${scale})`,
    } as const;
  }, [scale, stageSize.w, stageSize.h, designWidth]);

  function openInNewTab() {
    if (!activeHtml) return;
    openSandboxedPreviewInNewTab(activeHtml, exportTitle, { deck: activeDeck });
  }

  function enterFullscreen() {
    const el = stageRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen()
        .then(() => setFullscreen(true))
        .catch(() => setFullscreen(true));
    } else {
      setFullscreen(true);
    }
  }

  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setFullscreen(false);
  }

  const showTabs = views.length > 1;

  return (
    <div className="ds-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${title} preview`}>
      <div className={`ds-modal ${fullscreen ? 'ds-modal-fullscreen' : ''}`}>
        <header className="ds-modal-header">
          <div className="ds-modal-header-top">
            <div className="ds-modal-title-block">
              <div className="ds-modal-title">{title}</div>
              {subtitle ? (
                <div className="ds-modal-subtitle">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="ds-modal-close"
              onClick={onClose}
              title={t('preview.closeTitle')}
              aria-label={t('common.close')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="ds-modal-header-toolbar">
            {showTabs ? (
              <div className="ds-modal-tabs" role="tablist">
                {views.map((v) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={activeId === v.id}
                    className={`ds-modal-tab ${activeId === v.id ? 'active' : ''}`}
                    onClick={() => setActiveId(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="ds-modal-actions">
              {primaryAction ? (
                <button
                  type="button"
                  className="ds-modal-primary-action"
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled || primaryAction.busy}
                  aria-busy={primaryAction.busy ? 'true' : undefined}
                  {...(primaryAction.testId
                    ? { 'data-testid': primaryAction.testId }
                    : {})}
                >
                  {primaryAction.busy
                    ? primaryAction.busyLabel ?? primaryAction.label
                    : primaryAction.label}
                </button>
              ) : null}
              {sidebar ? (
                <button
                  className={`ghost ${sidebarOpen ? 'is-active' : ''}`}
                  onClick={() => setSidebarOpen((v) => !v)}
                  aria-pressed={sidebarOpen}
                  title={sidebar.label}
                >
                  {sidebar.label}
                </button>
              ) : null}
              <button
                className="ghost"
                onClick={fullscreen ? exitFullscreen : enterFullscreen}
                title={
                  fullscreen
                    ? t('common.exitFullscreen')
                    : t('common.fullscreen')
                }
              >
                {fullscreen ? t('preview.exit') : t('preview.fullscreen')}
              </button>
              {isCustomView ? null : (
                <div className="share-menu" ref={shareRef}>
                  <button
                    className="ghost"
                    aria-haspopup="menu"
                    aria-expanded={shareOpen}
                    onClick={() => setShareOpen((v) => !v)}
                    disabled={!activeHtml}
                  >
                    {t('preview.shareMenu')}
                  </button>
                  {shareOpen ? (
                    <div className="share-menu-popover" role="menu">
                      <button
                        type="button"
                        className="share-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setShareOpen(false);
                          if (activeHtml)
                            exportAsPdf(activeHtml, exportTitle, { deck: activeDeck });
                        }}
                      >
                        <span className="share-menu-icon">📄</span>
                        <span>{t('common.exportPdf')}</span>
                      </button>
                      <div className="share-menu-divider" />
                      <button
                        type="button"
                        className="share-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setShareOpen(false);
                          if (activeHtml) exportAsZip(activeHtml, exportTitle);
                        }}
                      >
                        <span className="share-menu-icon">🗜</span>
                        <span>{t('common.exportZip')}</span>
                      </button>
                      <button
                        type="button"
                        className="share-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setShareOpen(false);
                          if (activeHtml) exportAsHtml(activeHtml, exportTitle);
                        }}
                      >
                        <span className="share-menu-icon">🌐</span>
                        <span>{t('common.exportHtml')}</span>
                      </button>
                      <div className="share-menu-divider" />
                      <button
                        type="button"
                        className="share-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setShareOpen(false);
                          openInNewTab();
                        }}
                      >
                        <span className="share-menu-icon">↗</span>
                        <span>{t('preview.openInNewTab')}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
              {headerExtras}
            </div>
          </div>
        </header>
        <div
          className={`ds-modal-stage ${sidebar && sidebarOpen ? 'has-sidebar' : ''}`}
          ref={stageRef}
        >
          <div className="ds-modal-stage-iframe" ref={stageFrameRef}>
            {isCustomView ? (
              // Caller-rendered ReactNode (e.g. plugin media player).
              // The modal still owns chrome (header, sidebar toggle,
              // fullscreen, close) so every plugin variant shares the
              // same layout language.
              <div className="ds-modal-stage-custom">{activeCustom}</div>
            ) : activeUnavailable ? (
              // Skills declared as `image` / `markdown` / etc. ship no
              // HTML preview, so the daemon's `/example` endpoint would
              // 404 into the generic "Couldn't load this example." copy
              // — misleading, since nothing failed: there's just no
              // preview to render. Show a calm placeholder pointing the
              // user at "Use this prompt" instead. Issue #897.
              <div
                className="ds-modal-empty ds-modal-unavailable"
                data-testid="preview-unavailable"
              >
                <div className="ds-modal-unavailable-title">
                  {t('preview.unavailableTitle')}
                </div>
                <div className="ds-modal-unavailable-body">
                  {t('preview.unavailableBody', {
                    kind: activeUnavailable.kind || 'preview',
                  })}
                </div>
              </div>
            ) : activeError ? (
              // Distinct error state so a fetch failure stops looking
              // like an indefinite "Loading…". The Retry button re-fires
              // onView for this view id; the caller is responsible for
              // clearing the error state and re-running the fetch.
              // Issue #860.
              <div className="ds-modal-empty ds-modal-error">
                <div className="ds-modal-error-title">
                  {t('preview.errorTitle')}
                </div>
                <div className="ds-modal-error-body">
                  {t('preview.errorBody')}
                </div>
                {onView && activeView ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onView(activeView.id)}
                  >
                    {t('preview.retry')}
                  </button>
                ) : null}
              </div>
            ) : activeHtml === null || activeHtml === undefined ? (
              <div className="ds-modal-empty">
                {t('preview.loading', {
                  label:
                    activeView?.label.toLowerCase() ?? t('common.preview').toLowerCase(),
                })}
              </div>
            ) : (
              <div className="ds-modal-stage-iframe-scaler" style={scalerStyle}>
                <iframe
                  key={activeView?.id ?? 'view'}
                  title={`${title} ${activeView?.label ?? ''}`}
                  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={srcDoc}
                />
              </div>
            )}
            {sidebar && !sidebarOpen ? (
              <button
                type="button"
                className="ds-modal-stage-handle is-expand"
                onClick={() => setSidebarOpen(true)}
                title={t('preview.showSidebar', { label: sidebar.label })}
                aria-label={t('preview.showSidebar', { label: sidebar.label })}
              >
                <span aria-hidden="true">‹</span>
              </button>
            ) : null}
          </div>
          {sidebar && sidebarOpen ? (
            <aside className="ds-modal-sidebar" aria-label={sidebar.label}>
              <button
                type="button"
                className="ds-modal-stage-handle is-collapse"
                onClick={() => setSidebarOpen(false)}
                title={t('preview.hideSidebar', { label: sidebar.label })}
                aria-label={t('preview.hideSidebar', { label: sidebar.label })}
              >
                <span aria-hidden="true">›</span>
              </button>
              {sidebar.content}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
