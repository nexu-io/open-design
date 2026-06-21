import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import {
  exportAsHtml,
  exportAsImage,
  exportAsPdf,
  exportAsZip,
  captureHostIframeSnapshot,
  openSandboxedPreviewInNewTab,
  requestPreviewSnapshot,
} from '../runtime/exports';
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
  // Set when the underlying surface ships no HTML preview at all (its
  // `od.preview.type` is `image`, `markdown`, etc.). The modal renders
  // a calm "no shipped preview" placeholder instead of the loading or
  // error states — fetching `/api/skills/:id/example` (or the symmetric
  // plugin route) returns 404 today and the resulting "Couldn't load
  // this example." copy is misleading. `kind` carries the raw
  // preview-type token so copy can be shaped per kind ("markdown
  // document", "image asset", …). `noun` carries the surface kind so
  // the placeholder reads with the right word — "skill" on the Skills
  // tab, "plugin" on Community/Plugins cards, "template" on
  // design-template (deck) cards. Mutually exclusive with `html` and
  // `error`. Issues #897, #2840, #3216.
  unavailable?: { kind: string; noun?: 'skill' | 'plugin' | 'template' } | null;
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
export interface PreviewPrimaryActionMenuItem {
  label: string;
  description?: string;
  onClick: () => void;
  testId?: string;
}

export interface PreviewPrimaryAction {
  label: string;
  onClick: () => void;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  testId?: string;
  // When present, the primary button becomes a split button: clicking the
  // main face still runs `onClick`, while a caret toggle opens this menu of
  // secondary variants (e.g. "Use plugin" vs "Use with query"). Mirrors the
  // plugin-card use-menu so the modal offers the same affordance.
  menu?: PreviewPrimaryActionMenuItem[];
}

export interface PreviewShareTarget {
  title?: string;
  description?: string;
  url?: string | null;
}

type SocialSharePlatform =
  | 'x'
  | 'reddit'
  | 'facebook'
  | 'linkedin'
  | 'instagram'
  | 'xiaohongshu';

// Every clickable item inside the merged Share popover — social intents,
// copy actions and file exports. Callers receive these verbatim as
// analytics `element` values (already snake_case).
export type PreviewSharePopoverItem =
  | SocialSharePlatform
  | 'copy_link'
  | 'copy_share_text'
  | 'pdf'
  | 'zip'
  | 'html'
  | 'image'
  | 'open_in_new_tab';

const SOCIAL_SHARE_PLATFORMS: Array<{
  platform: SocialSharePlatform;
  labelKey:
    | 'preview.shareToX'
    | 'preview.shareToReddit'
    | 'preview.shareToFacebook'
    | 'preview.shareToLinkedIn'
    | 'preview.shareToInstagram'
    | 'preview.shareToXiaohongshu';
  mark: string;
  mode: 'intent' | 'copy-open';
  entryUrl?: string;
}> = [
  { platform: 'x', labelKey: 'preview.shareToX', mark: 'X', mode: 'intent' },
  { platform: 'reddit', labelKey: 'preview.shareToReddit', mark: 'R', mode: 'intent' },
  { platform: 'facebook', labelKey: 'preview.shareToFacebook', mark: 'f', mode: 'intent' },
  { platform: 'linkedin', labelKey: 'preview.shareToLinkedIn', mark: 'in', mode: 'intent' },
  {
    platform: 'instagram',
    labelKey: 'preview.shareToInstagram',
    mark: 'IG',
    mode: 'copy-open',
    entryUrl: 'https://www.instagram.com/',
  },
  {
    platform: 'xiaohongshu',
    labelKey: 'preview.shareToXiaohongshu',
    mark: '小',
    mode: 'copy-open',
    entryUrl: 'https://www.xiaohongshu.com/',
  },
];

function buildSocialShareUrl(
  platform: SocialSharePlatform,
  args: { url: string; title: string; text: string },
): string | null {
  const params = new URLSearchParams();
  switch (platform) {
    case 'x':
      params.set('url', args.url);
      params.set('text', args.text);
      return `https://twitter.com/intent/tweet?${params.toString()}`;
    case 'reddit':
      params.set('url', args.url);
      params.set('title', args.title);
      return `https://www.reddit.com/submit?${params.toString()}`;
    case 'facebook':
      params.set('u', args.url);
      params.set('quote', args.text);
      return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
    case 'linkedin':
      params.set('url', args.url);
      return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`;
    case 'instagram':
    case 'xiaohongshu':
      return null;
  }
  const exhaustive: never = platform;
  return exhaustive;
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
  // Social-share target for the active preview. Callers must pass an explicit
  // recipient-openable URL before the modal exposes copy/social actions.
  shareTarget?: PreviewShareTarget;
  // Optional analytics callbacks. Fires when the user clicks the
  // chrome-level affordances (fullscreen, share trigger, sidebar
  // toggle). Callers wire these to their surface's tracking helper.
  onFullscreenClick?: () => void;
  onShareClick?: () => void;
  onSidebarToggleClick?: (open: boolean) => void;
  // Hide the header sidebar-toggle button (the plugin detail opens its
  // collapsed info panel via the preview-edge handle instead). Other
  // variants — design-system "DESIGN.md", media, scenario — keep it.
  hideSidebarToggle?: boolean;
  // Fires when the user picks any share-popover item — social platforms,
  // "copy_link" / "copy_share_text" and the file exports ("pdf" / "zip" /
  // "html" / "image" / "open_in_new_tab"). Used by callers that want to
  // track popover-level clicks separately from the share trigger.
  onSharePopoverItemClick?: (item: PreviewSharePopoverItem) => void;
}

// A full-screen overlay that renders an iframe of arbitrary HTML, with an
// optional tab bar for multiple views, a merged Share menu, and a Fullscreen
// toggle. Used by both the design-system preview and the example card preview,
// so the two paths feel identical.
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
  shareTarget,
  hideSidebarToggle = false,
  onFullscreenClick,
  onShareClick,
  onSidebarToggleClick,
  onSharePopoverItemClick,
}: Props) {
  const t = useT();
  const initial = initialViewId && views.some((v) => v.id === initialViewId)
    ? initialViewId
    : views[0]?.id ?? '';
  const [activeId, setActiveId] = useState<string>(initial);
  const [templateShareOpen, setTemplateShareOpen] = useState(false);
  const [primaryMenuOpen, setPrimaryMenuOpen] = useState(false);
  const [copyShareFeedback, setCopyShareFeedback] = useState<{
    key: string;
    ok: boolean;
  } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    sidebar?.defaultOpen ?? false,
  );
  const templateShareRef = useRef<HTMLDivElement | null>(null);
  const primaryMenuRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
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

  // Close header popovers on outside click / Escape.
  useEffect(() => {
    if (!templateShareOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (templateShareOpen && !templateShareRef.current?.contains(target)) {
        setTemplateShareOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTemplateShareOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [templateShareOpen]);

  // Same outside-click / Escape dismissal for the primary-action split menu.
  useEffect(() => {
    if (!primaryMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!primaryMenuRef.current?.contains(target)) {
        setPrimaryMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPrimaryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [primaryMenuOpen]);

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
    // Use layout box metrics (clientWidth/Height) rather than
    // getBoundingClientRect: the modal animates in with a CSS
    // `transform: scale()`, and rect width is transform-aware, so an
    // early measure lands a few percent short and the scaler never
    // catches up — leaving a white gutter. clientWidth ignores the
    // ancestor transform and always reports the settled layout width.
    const measure = () => {
      setStageSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    // The first synchronous measure can land before the modal's
    // entrance/layout fully settles, leaving the scaler a few dozen px
    // short of the stage and exposing a white gutter. Re-measure on the
    // next frame so the scaled preview fills the stage edge-to-edge.
    const raf = requestAnimationFrame(measure);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Re-measure when the sidebar opens/closes (the stage width jumps) or
  // the active view changes, so `scale` tracks the current stage width
  // instead of a stale value left over from the previous layout.
  useEffect(() => {
    const el = stageFrameRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      setStageSize({ w: el.clientWidth, h: el.clientHeight });
    });
    return () => cancelAnimationFrame(raf);
  }, [sidebarOpen, activeId]);

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
  const canExportFiles = Boolean(activeHtml);
  const previewShareTitle = shareTarget?.title || exportTitle || title;
  const previewShareUrl = typeof shareTarget?.url === 'string' ? shareTarget.url : '';
  const previewShareText = t('preview.shareTextDefault', { title: previewShareTitle });
  const previewShareCopy = previewShareUrl
    ? `${previewShareText}\n${previewShareUrl}`
    : previewShareText;
  const previewShareUrlDisplay = previewShareUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const socialShareTargets = useMemo(
    () => SOCIAL_SHARE_PLATFORMS.map((item) => ({
      ...item,
      href: item.mode === 'intent' && previewShareUrl
        ? buildSocialShareUrl(item.platform, {
          url: previewShareUrl,
          title: previewShareText,
          text: previewShareText,
        })
        : item.entryUrl ?? '',
    })),
    [previewShareText, previewShareUrl],
  );

  // Always fit the design viewport to the full stage width — scaling up
  // as well as down — so the preview fills the stage edge-to-edge with
  // no letterbox gutter when the sidebar collapses and the stage widens.
  const scale = stageSize.w > 0 ? stageSize.w / designWidth : 1;
  const scalerStyle = useMemo(() => {
    if (stageSize.w === 0) {
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

  async function copyPreviewShare(text: string, key: string): Promise<boolean> {
    if (!text) return false;
    const ok = await copyToClipboard(text);
    setCopyShareFeedback({ key, ok });
    window.setTimeout(() => {
      setCopyShareFeedback((current) => (
        current?.key === key ? null : current
      ));
    }, 1600);
    return ok;
  }

  function openShareDestination(url: string, pendingWindow?: Window | null) {
    if (pendingWindow) {
      pendingWindow.opener = null;
      pendingWindow.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const showTabs = views.length > 1;
  const showTemplateShareMenu = !isCustomView || Boolean(shareTarget?.url);
  const canOpenTemplateShareMenu = canExportFiles || Boolean(previewShareUrl);

  return (
    <div
      className="ds-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} preview`}
    >
      <div
        className={`ds-modal ${fullscreen ? 'ds-modal-fullscreen' : ''}`}
      >
        <header className="ds-modal-header">
          <div className="ds-modal-header-top">
            <div className="ds-modal-title-block">
              <div className="ds-modal-title">{title}</div>
              {subtitle ? (
                <div className="ds-modal-subtitle">{subtitle}</div>
              ) : null}
            </div>
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
                primaryAction.menu && primaryAction.menu.length > 0 ? (
                  <div
                    className="ds-modal-primary-action-group"
                    ref={primaryMenuRef}
                  >
                    <button
                      type="button"
                      className="ds-modal-primary-action ds-modal-primary-action--split"
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
                    <button
                      type="button"
                      className="ds-modal-primary-action ds-modal-primary-action-caret"
                      onClick={() => setPrimaryMenuOpen((v) => !v)}
                      disabled={primaryAction.disabled || primaryAction.busy}
                      aria-haspopup="menu"
                      aria-expanded={primaryMenuOpen}
                      aria-label={`More ways to ${primaryAction.label}`}
                      {...(primaryAction.testId
                        ? { 'data-testid': `${primaryAction.testId}-menu` }
                        : {})}
                    >
                      <Icon name="chevron-down" size={12} />
                    </button>
                    {primaryMenuOpen ? (
                      <div
                        className="share-menu-popover ds-modal-primary-action-popover"
                        role="menu"
                      >
                        {primaryAction.menu.map((item, index) => (
                          <button
                            key={item.testId ?? `${item.label}-${index}`}
                            type="button"
                            role="menuitem"
                            className="share-menu-item ds-modal-primary-action-option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPrimaryMenuOpen(false);
                              item.onClick();
                            }}
                            {...(item.testId
                              ? { 'data-testid': item.testId }
                              : {})}
                          >
                            <span className="ds-modal-primary-action-option__body">
                              <span className="ds-modal-primary-action-option__label">
                                {item.label}
                              </span>
                              {item.description ? (
                                <span className="ds-modal-primary-action-option__desc">
                                  {item.description}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
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
                )
              ) : null}
              {sidebar ? (
                <button
                  className={`ghost ${sidebarOpen ? 'is-active' : ''}${
                    hideSidebarToggle ? ' ds-modal-sidebar-toggle--compact-only' : ''
                  }`}
                  onClick={() => {
                    setSidebarOpen((v) => {
                      const next = !v;
                      onSidebarToggleClick?.(next);
                      return next;
                    });
                  }}
                  aria-pressed={sidebarOpen}
                  title={sidebar.label}
                >
                  {sidebar.label}
                </button>
              ) : null}
              {showTemplateShareMenu ? (
                <div className="share-menu template-share-menu" ref={templateShareRef}>
                  <button
                    className="ghost template-share-trigger"
                    aria-haspopup="menu"
                    aria-expanded={templateShareOpen}
                    onClick={() => {
                      onShareClick?.();
                      setTemplateShareOpen((v) => !v);
                    }}
                    disabled={!canOpenTemplateShareMenu}
                  >
                    <Icon name="share" size={12} />
                    <span>{t('preview.shareMenu')}</span>
                    <Icon name="chevron-down" size={12} />
                  </button>
                  {templateShareOpen ? (
                    <div className="share-menu-popover template-share-popover" role="menu">
                      <div className="template-share-summary">
                        <span className="template-share-summary__eyebrow">
                          {t('preview.shareTemplateBadge')}
                        </span>
                        <strong>{previewShareTitle}</strong>
                        {previewShareUrlDisplay ? (
                          <span>{previewShareUrlDisplay}</span>
                        ) : null}
                      </div>
                      {previewShareUrl ? (
                        <>
                          <section className="template-share-section">
                            <div className="template-share-section__label">
                              {t('preview.shareSocialGroup')}
                            </div>
                            <div className="template-share-platform-grid">
                              {socialShareTargets.map((item) => (
                                <a
                                  key={item.platform}
                                  className={`template-share-platform template-share-platform--${item.platform}`}
                                  role="menuitem"
                                  href={item.href || undefined}
                                  target={item.href ? '_blank' : undefined}
                                  rel={item.href ? 'noreferrer noopener' : undefined}
                                  aria-disabled={item.href ? undefined : 'true'}
                                  tabIndex={item.href ? undefined : -1}
                                  onClick={(event) => {
                                    if (!item.href) {
                                      event.preventDefault();
                                      return;
                                    }
                                    onSharePopoverItemClick?.(item.platform);
                                    if (item.mode === 'copy-open') {
                                      event.preventDefault();
                                      const shareWindow = window.open('about:blank', '_blank');
                                      const feedbackKey = `social-${item.platform}`;
                                      void copyPreviewShare(previewShareCopy, feedbackKey).then((ok) => {
                                        if (!ok || !item.href) {
                                          shareWindow?.close();
                                          return;
                                        }
                                        setTemplateShareOpen(false);
                                        openShareDestination(item.href, shareWindow);
                                      });
                                      return;
                                    }
                                    setTemplateShareOpen(false);
                                  }}
                                >
                                  <span className="template-share-platform__mark">
                                    {item.mark}
                                  </span>
                                  <span>
                                    {copyShareFeedback?.key === `social-${item.platform}`
                                      ? copyShareFeedback.ok
                                        ? t('preview.shareCopied')
                                        : t('preview.shareCopyFailed')
                                      : t(item.labelKey)}
                                  </span>
                                </a>
                              ))}
                            </div>
                          </section>
                          <section className="template-share-section">
                            <div className="template-share-section__label">
                              {t('preview.shareCopyGroup')}
                            </div>
                            <button
                              type="button"
                              className="share-menu-item"
                              role="menuitem"
                              onClick={() => {
                                onSharePopoverItemClick?.('copy_link');
                                void copyPreviewShare(previewShareUrl, 'link');
                              }}
                            >
                              <span className="share-menu-icon">
                                <Icon
                                  name={
                                    copyShareFeedback?.key === 'link'
                                      ? copyShareFeedback.ok
                                        ? 'check'
                                        : 'close'
                                      : 'link'
                                  }
                                  size={14}
                                />
                              </span>
                              <span>
                                {copyShareFeedback?.key === 'link'
                                  ? copyShareFeedback.ok
                                    ? t('preview.shareCopied')
                                    : t('preview.shareCopyFailed')
                                  : t('preview.copyTemplateLink')}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="share-menu-item"
                              role="menuitem"
                              onClick={() => {
                                onSharePopoverItemClick?.('copy_share_text');
                                void copyPreviewShare(previewShareCopy, 'text');
                              }}
                            >
                              <span className="share-menu-icon">
                                <Icon
                                  name={
                                    copyShareFeedback?.key === 'text'
                                      ? copyShareFeedback.ok
                                        ? 'check'
                                        : 'close'
                                      : 'copy'
                                  }
                                  size={14}
                                />
                              </span>
                              <span>
                                {copyShareFeedback?.key === 'text'
                                  ? copyShareFeedback.ok
                                    ? t('preview.shareCopied')
                                    : t('preview.shareCopyFailed')
                                  : t('preview.copyShareText')}
                              </span>
                            </button>
                          </section>
                        </>
                      ) : null}
                      {canExportFiles ? (
                        <section className="template-share-section">
                          <div className="template-share-section__label">
                            {t('preview.shareExportGroup')}
                          </div>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            onClick={() => {
                              onSharePopoverItemClick?.('pdf');
                              setTemplateShareOpen(false);
                              if (activeHtml) {
                                exportAsPdf(activeHtml, exportTitle, { deck: activeDeck });
                              }
                            }}
                          >
                            <span className="share-menu-icon">
                              <Icon name="file" size={14} />
                            </span>
                            <span>{t('common.exportPdf')}</span>
                          </button>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            onClick={() => {
                              onSharePopoverItemClick?.('zip');
                              setTemplateShareOpen(false);
                              if (activeHtml) exportAsZip(activeHtml, exportTitle);
                            }}
                          >
                            <span className="share-menu-icon">
                              <Icon name="download" size={14} />
                            </span>
                            <span>{t('common.exportZip')}</span>
                          </button>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            onClick={() => {
                              onSharePopoverItemClick?.('html');
                              setTemplateShareOpen(false);
                              if (activeHtml) exportAsHtml(activeHtml, exportTitle);
                            }}
                          >
                            <span className="share-menu-icon">
                              <Icon name="file-code" size={14} />
                            </span>
                            <span>{t('common.exportHtml')}</span>
                          </button>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            onClick={async () => {
                              onSharePopoverItemClick?.('image');
                              setTemplateShareOpen(false);
                              const iframe = previewIframeRef.current;
                              if (!iframe) return;
                              const snap =
                                (await captureHostIframeSnapshot(iframe)) ??
                                (await requestPreviewSnapshot(iframe));
                              try {
                                if (snap) {
                                  exportAsImage(snap.dataUrl, exportTitle);
                                } else {
                                  console.warn('[PreviewModal] snapshot capture returned null');
                                  alert(t('common.exportImageFailed'));
                                }
                              } catch (err) {
                                console.warn('[PreviewModal] failed to convert snapshot:', err);
                                alert(t('common.exportImageFailed'));
                              }
                            }}
                          >
                            <span className="share-menu-icon">
                              <Icon name="image" size={14} />
                            </span>
                            <span>{t('common.exportImage')}</span>
                          </button>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            onClick={() => {
                              onSharePopoverItemClick?.('open_in_new_tab');
                              setTemplateShareOpen(false);
                              openInNewTab();
                            }}
                          >
                            <span className="share-menu-icon">
                              <Icon name="external-link" size={14} />
                            </span>
                            <span>{t('preview.openInNewTab')}</span>
                          </button>
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {headerExtras}
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
        </header>
        <div
          className={`ds-modal-stage ${sidebar && sidebarOpen ? 'has-sidebar' : ''}`}
          ref={stageRef}
        >
          <div className="ds-modal-stage-iframe" ref={stageFrameRef}>
            {/* Also render for custom-stage views (media players: image /
                video / audio) — the header no longer carries fullscreen, so
                this hover icon is their only fullscreen affordance. */}
            {!activeUnavailable && !activeError ? (
              <button
                type="button"
                className="ds-modal-stage-fullscreen"
                onClick={() => {
                  onFullscreenClick?.();
                  if (fullscreen) exitFullscreen();
                  else enterFullscreen();
                }}
                title={fullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
                aria-label={fullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {fullscreen ? (
                    <path d="M9 3v6H3M3 9l6-6M15 21v-6h6M21 15l-6 6" />
                  ) : (
                    <path d="M3 9V3h6M3 3l6 6M21 15v6h-6M21 21l-6-6" />
                  )}
                </svg>
              </button>
            ) : null}
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
              // user at "Use this prompt" instead. Issues #897, #2840.
              //
              // `noun` lets the same placeholder read with the right
              // word per surface — Skills tab, Community/Plugins,
              // design-template (deck) cards. Defaults to 'skill' so
              // pre-noun callers keep their existing copy. Issue #3216.
              (() => {
                const nounKey = ((): 'preview.nounSkill' | 'preview.nounPlugin' | 'preview.nounTemplate' => {
                  switch (activeUnavailable.noun) {
                    case 'plugin':
                      return 'preview.nounPlugin';
                    case 'template':
                      return 'preview.nounTemplate';
                    case 'skill':
                    default:
                      return 'preview.nounSkill';
                  }
                })();
                const noun = t(nounKey);
                return (
                  <div
                    className="ds-modal-empty ds-modal-unavailable"
                    data-testid="preview-unavailable"
                  >
                    <div className="ds-modal-unavailable-title">
                      {t('preview.unavailableTitle', { noun })}
                    </div>
                    <div className="ds-modal-unavailable-body">
                      {t('preview.unavailableBody', {
                        kind: activeUnavailable.kind || 'preview',
                        noun,
                      })}
                    </div>
                  </div>
                );
              })()
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
                  ref={previewIframeRef}
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
                onClick={() => {
                  onSidebarToggleClick?.(true);
                  setSidebarOpen(true);
                }}
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
                onClick={() => {
                  onSidebarToggleClick?.(false);
                  setSidebarOpen(false);
                }}
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
