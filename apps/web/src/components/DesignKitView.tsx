// DesignKitView — the shared brand.html-style kit layout.
//
// Renders a normalized DesignKit (see runtime/design-kit.ts) as the full module
// stack — cover, identity, logo, typography, palette, voice, imagery & layout,
// images, design-system kit, and assets — exactly matching the rendered
// brand.html. Every design-system surface (Brands tab, Design Systems list
// preview, in-project Design System tab) feeds this one component so they look
// identical regardless of whether the data came from brand.json or a parsed
// DESIGN.md.
//
// DESIGN.md stays the editable text contract, but this view exposes it through
// direct module actions instead of a separate Visualize / Edit / Source block.
// Empty modules expose upload affordances when the backing kit is writable.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Textarea } from '@open-design/components';
import type { DesignSystemEditClickProps } from '@open-design/contracts/analytics';
import { useT } from '../i18n';
import { openExternalUrl, projectRawUrl } from '../providers/registry';
import { buildSrcdoc } from '../runtime/srcdoc';
import {
  fontStack,
  isLightHex,
  type DesignKit,
  type KitFont,
} from '../runtime/design-kit';
import type { KitUploadModule } from '../runtime/kit-upload';
import { Icon, type IconName } from './Icon';
import { KitErrorBoundary } from './KitErrorBoundary';
import styles from './BrandPreviewCard.module.css';

const IMAGE_CAP = 8;
const DESIGN_KIT_PREVIEW_SANDBOX = 'allow-scripts allow-popups';

type DesignMdModuleId = 'identity' | 'typography' | 'palette' | 'voice' | 'imageryLayout' | 'designSystem';

interface DesignMdModuleSpec {
  id: DesignMdModuleId;
  label: string;
  heading: string;
  keywords: string[];
  includePreamble?: boolean;
}

type DesignMdEditTarget =
  | { kind: 'all' }
  | { kind: 'module'; module: DesignMdModuleSpec };
export type DesignKitEditFocusModule = 'logo';
export interface DesignKitEditFocusRequest {
  module: DesignKitEditFocusModule;
  nonce: number;
}

// ── Logo with fallback chain ────────────────────────────────────────
// Brand stage (`/api/brands/:id/logo`) when a brandId is known, else an explicit
// logoSrc, then Google's favicon for the domain, then a monogram letter.
type LogoStage = 'brand' | 'custom' | 'favicon' | 'letter';

interface KitLogoProps {
  /** Legacy alias for `brandId` (Brands list rows pass `id`). */
  id?: string;
  brandId?: string;
  logoSrc?: string | null;
  host?: string;
  name: string;
  faviconSize: number;
  className?: string;
  fallbackClassName?: string;
}

export function BrandLogo({
  id,
  brandId,
  logoSrc,
  host,
  name,
  faviconSize,
  className,
  fallbackClassName,
}: KitLogoProps) {
  const bid = brandId ?? id;
  const first: LogoStage = bid ? 'brand' : logoSrc ? 'custom' : host ? 'favicon' : 'letter';
  const [stage, setStage] = useState<LogoStage>(first);
  useEffect(() => {
    setStage(first);
  }, [first, bid, logoSrc, host]);

  const src =
    stage === 'brand' && bid
      ? `/api/brands/${encodeURIComponent(bid)}/logo`
      : stage === 'custom' && logoSrc
        ? logoSrc
        : stage === 'favicon' && host
          ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${faviconSize}`
          : null;

  if (!src) {
    return (
      <span className={fallbackClassName} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() =>
        setStage((s) =>
          s === 'brand' ? (logoSrc ? 'custom' : host ? 'favicon' : 'letter') : s === 'custom' ? 'favicon' : 'letter',
        )
      }
    />
  );
}

interface BrandFontManifestFile {
  family: string;
  weight: string;
  style: string;
  file: string;
  format: string;
}

// Load real typefaces so specimens render for real: append any Google Fonts
// stylesheets the kit declares, and inject self-hosted @font-face from the
// project's fonts/manifest.json. Both are best-effort and torn down on change.
export function useBrandFonts(
  projectId: string | undefined,
  fonts: { googleFontsUrl?: string }[],
): void {
  const googleUrls = useMemo(() => {
    const urls = fonts
      .map((f) => f.googleFontsUrl)
      .filter((u): u is string => Boolean(u && /^https:\/\/fonts\.googleapis\.com\//i.test(u)));
    return Array.from(new Set(urls));
  }, [fonts]);

  useEffect(() => {
    const links = googleUrls.map((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      return link;
    });
    return () => {
      for (const link of links) link.remove();
    };
  }, [googleUrls]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let styleEl: HTMLStyleElement | null = null;
    void (async () => {
      try {
        const resp = await fetch(projectRawUrl(projectId, 'fonts/manifest.json'), {
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { files?: BrandFontManifestFile[] };
        const files = Array.isArray(data?.files) ? data.files : [];
        if (cancelled || files.length === 0) return;
        const css = files
          .map((f) => {
            const url = projectRawUrl(projectId, `fonts/${f.file}`);
            return [
              '@font-face {',
              `  font-family: '${f.family.replace(/'/g, '')}';`,
              `  src: url('${url}') format('${f.format}');`,
              `  font-weight: ${f.weight};`,
              `  font-style: ${f.style};`,
              '  font-display: swap;',
              '}',
            ].join('\n');
          })
          .join('\n');
        styleEl = document.createElement('style');
        styleEl.dataset.brandFonts = projectId;
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
      } catch {
        // A missing/malformed manifest is expected for some systems.
      }
    })();
    return () => {
      cancelled = true;
      if (styleEl) styleEl.remove();
    };
  }, [projectId]);
}

interface BrandTokenSubset {
  colorPrimary?: string;
  colorPrimaryBg?: string;
  colorPrimaryHover?: string;
  colorPrimaryActive?: string;
  fontSize?: number;
  borderRadius?: number;
}

export interface KitDesignMdActions {
  body: string;
  onSave?: (value: string) => void | Promise<void>;
  onOpenFile?: () => void;
  saving?: boolean;
  canEdit?: boolean;
}

/** A single entry in the sticky header's "More" overflow dropdown. */
export interface HeaderMenuAction {
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Toggles render with checkbox semantics + a trailing check when active. */
  active?: boolean;
}

export type DesignKitActionFeedbackTone = 'success' | 'error' | 'loading';

export interface DesignKitViewProps {
  kit: DesignKit;
  variant?: 'panel' | 'compact';
  /** Rendered next to the title (status badges). */
  badgeSlot?: ReactNode;
  /** Rendered on the header's right (primary action buttons). */
  actionsSlot?: ReactNode;
  /**
   * Overflow actions folded into the sticky header's "More" dropdown, shown
   * after the kit's own DESIGN.md actions. Only used when `stickyHeader`.
   */
  headerMenuActions?: HeaderMenuAction[];
  /** Rendered directly under the header (notices / errors). */
  noticeSlot?: ReactNode;
  /** Rendered above the modules (e.g. publish / default card). */
  topSlot?: ReactNode;
  /** Keep the identity and action row reachable while the panel scrolls. */
  stickyHeader?: boolean;
  /**
   * Show the showcase/logo cover above the header. Defaults to true; the
   * read-only Design Systems manager hides it as redundant.
   */
  showCover?: boolean;
  /**
   * Opens a full, scrollable preview when the user clicks the hover button
   * over the showcase cover. When omitted, the cover falls back to a built-in
   * scrollable modal of the same showcase HTML. Lets the Design Systems list
   * route the hover button to its richer "Preview full system" modal.
   */
  onPreviewCover?: () => void;
  designMd?: KitDesignMdActions;
  onUploadModule?: (module: KitUploadModule, file: File) => void;
  onColorChange?: (index: number, hex: string) => void | Promise<void>;
  onColorReset?: (index: number) => void | Promise<void>;
  onDeleteLogo?: (index: number) => void | Promise<void>;
  onDeleteImage?: (index: number) => void | Promise<void>;
  onRefresh?: () => void;
  onDownload?: () => void;
  onImport?: () => void;
  onReset?: () => void;
  onEditClick?: (
    element: DesignSystemEditClickProps['element'],
    module: DesignSystemEditClickProps['module'],
  ) => void;
  uploading?: KitUploadModule | null;
  actionBusy?: string | null;
  onActionFeedback?: (tone: DesignKitActionFeedbackTone, message: string) => void;
  editFocusRequest?: DesignKitEditFocusRequest | null;
  dataTestId?: string;
}

function DesignKitViewInner({
  kit,
  variant = 'panel',
  badgeSlot,
  actionsSlot,
  headerMenuActions,
  noticeSlot,
  topSlot,
  stickyHeader = false,
  showCover = true,
  onPreviewCover,
  designMd,
  onUploadModule,
  onColorChange,
  onColorReset,
  onDeleteLogo,
  onDeleteImage,
  onRefresh,
  onDownload,
  onImport,
  onReset,
  onEditClick,
  uploading,
  actionBusy,
  onActionFeedback,
  editFocusRequest,
  dataTestId = 'design-kit-view',
}: DesignKitViewProps) {
  const t = useT();
  const compact = variant === 'compact';
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const [tokens, setTokens] = useState<BrandTokenSubset | null>(null);
  const [dsTheme, setDsTheme] = useState<'light' | 'dark'>('light');
  const [activeLogo, setActiveLogo] = useState(0);
  const [imagesExpanded, setImagesExpanded] = useState(false);
  // Tracks logo/image srcs that failed to load so we drop them from the view
  // instead of rendering the browser's broken-image glyph. A broken logo then
  // advances to the next candidate (or collapses to the empty state); a broken
  // gallery tile hides itself while preserving the other tiles' delete indices.
  const [brokenSrc, setBrokenSrc] = useState<ReadonlySet<string>>(() => new Set());
  const markBroken = useCallback((src: string) => {
    setBrokenSrc((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [assetPreview, setAssetPreview] = useState<{ url: string; label: string } | null>(null);
  const [designMdOpen, setDesignMdOpen] = useState(false);
  const [designMdDraft, setDesignMdDraft] = useState('');
  const [designMdTarget, setDesignMdTarget] = useState<DesignMdEditTarget>({ kind: 'all' });
  const [stickyHeaderStuck, setStickyHeaderStuck] = useState(false);
  const [colorEditor, setColorEditor] = useState<{ index: number; label: string } | null>(null);
  const [colorDraft, setColorDraft] = useState('#000000');
  const [colorError, setColorError] = useState<string | null>(null);
  const [colorSaving, setColorSaving] = useState(false);
  const [colorOverrides, setColorOverrides] = useState<Record<number, string>>({});
  const [editFocusModule, setEditFocusModule] = useState<DesignKitEditFocusModule | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const designMdInputRef = useRef<HTMLInputElement | null>(null);
  const stickyHeaderRef = useRef<HTMLElement | null>(null);
  const logoSectionRef = useRef<HTMLElement | null>(null);

  useBrandFonts(kit.projectId, kit.fonts);

  const logoCandidates = useMemo(
    () =>
      [kit.logoSrc, ...kit.logoAlternates]
        .filter((c): c is string => Boolean(c))
        .filter((c) => !brokenSrc.has(c)),
    [kit.logoSrc, kit.logoAlternates, brokenSrc],
  );
  const activeLogoSrc = logoCandidates[activeLogo] ?? logoCandidates[0] ?? null;

  useEffect(() => {
    setActiveLogo(0);
    setImagesExpanded(false);
    setLightbox(null);
    setAssetPreview(null);
    setCoverPreviewOpen(false);
    setColorEditor(null);
    setColorError(null);
  }, [kit.designSystemId, kit.brandId]);

  useEffect(() => {
    setColorOverrides({});
  }, [kit.designSystemId, kit.brandId, kit.projectId]);

  useEffect(() => {
    if (!lightbox && !assetPreview && !coverPreviewOpen && !designMdOpen && !colorEditor) return undefined;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setLightbox(null);
      setAssetPreview(null);
      setCoverPreviewOpen(false);
      setDesignMdOpen(false);
      setColorEditor(null);
      setColorError(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [assetPreview, colorEditor, coverPreviewOpen, designMdOpen, lightbox]);

  useEffect(() => {
    if (!stickyHeader) {
      setStickyHeaderStuck(false);
      return undefined;
    }
    const header = stickyHeaderRef.current;
    if (!header) return undefined;
    const scrollParent = header.closest<HTMLElement>('.ds-project-panel');
    const scrollTarget: HTMLElement | Window = scrollParent ?? window;
    const update = () => {
      const headerTop = header.getBoundingClientRect().top;
      // The header pins at the scroll container's content-box top — below any
      // top border/padding — not at its border-box top. Measure that resting
      // offset so the stuck state engages even when the panel carries top
      // padding; otherwise the stuck background never turns on and content
      // scrolls through the still-transparent header.
      let stickyTop = 0;
      let scrollTop = window.scrollY;
      if (scrollParent) {
        const rect = scrollParent.getBoundingClientRect();
        const cs = getComputedStyle(scrollParent);
        stickyTop = rect.top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
        scrollTop = scrollParent.scrollTop;
      }
      const nextStuck = scrollTop > 0 && headerTop <= stickyTop + 1;
      setStickyHeaderStuck((current) => (current === nextStuck ? current : nextStuck));
    };
    update();
    scrollTarget.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scrollTarget.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [stickyHeader]);

  useEffect(() => {
    if (!editFocusRequest || compact) return undefined;
    if (editFocusRequest.module !== 'logo') return undefined;
    const target = logoSectionRef.current;
    setEditFocusModule('logo');
    if (target) {
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    }
    const timer = window.setTimeout(() => setEditFocusModule(null), 8000);
    return () => window.clearTimeout(timer);
  }, [compact, editFocusRequest?.module, editFocusRequest?.nonce]);

  // Engine token chips, when the system dir exists.
  useEffect(() => {
    const url = kit.system?.tokensUrl;
    if (!url) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) return;
        const raw = (await resp.json()) as Record<string, unknown>;
        if (cancelled) return;
        const next: BrandTokenSubset = {};
        if (typeof raw.colorPrimary === 'string') next.colorPrimary = raw.colorPrimary;
        if (typeof raw.colorPrimaryBg === 'string') next.colorPrimaryBg = raw.colorPrimaryBg;
        if (typeof raw.colorPrimaryHover === 'string') next.colorPrimaryHover = raw.colorPrimaryHover;
        if (typeof raw.colorPrimaryActive === 'string') next.colorPrimaryActive = raw.colorPrimaryActive;
        if (typeof raw.fontSize === 'number') next.fontSize = raw.fontSize;
        if (typeof raw.borderRadius === 'number') next.borderRadius = raw.borderRadius;
        setTokens(next.colorPrimary ? next : null);
      } catch {
        // Token chips are decorative.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kit.system?.tokensUrl]);

  const colors = useMemo(
    () => kit.colors.map((color, index) => ({
      ...color,
      hex: colorOverrides[index] ?? color.hex,
    })),
    [colorOverrides, kit.colors],
  );
  const fonts = useMemo<{ font: KitFont; label: string }[]>(() => {
    const out: { font: KitFont; label: string }[] = [];
    if (kit.typography.display) out.push({ font: kit.typography.display, label: 'Display' });
    if (kit.typography.body) out.push({ font: kit.typography.body, label: 'Body' });
    if (kit.typography.mono) out.push({ font: kit.typography.mono, label: 'Mono' });
    return out;
  }, [kit.typography]);

  const voice = kit.voice;
  const imagery = kit.imagery;
  const layout = kit.layout;
  const samples = imagery?.samples ?? [];
  const dsKitUrl = dsTheme === 'dark' ? kit.system?.kitDarkUrl ?? kit.system?.kitUrl : kit.system?.kitUrl;
  const canUpload = Boolean(kit.canUpload && onUploadModule);
  const canEditDesignMd = Boolean(designMd?.canEdit !== false && designMd?.onSave);
  const anyActionBusy = Boolean(actionBusy);
  const designMdModules = useMemo<Record<DesignMdModuleId, DesignMdModuleSpec>>(
    () => ({
      identity: {
        id: 'identity',
        label: t('brandDetail.identity'),
        heading: 'Identity',
        keywords: ['identity', 'overview', 'brand'],
        includePreamble: true,
      },
      typography: {
        id: 'typography',
        label: t('brandDetail.typography'),
        heading: 'Typography',
        keywords: ['typograph', 'type', 'font'],
      },
      palette: {
        id: 'palette',
        label: t('brandDetail.palette'),
        heading: 'Color Palette',
        keywords: ['color', 'palette'],
      },
      voice: {
        id: 'voice',
        label: t('brandDetail.voiceTone'),
        heading: 'Voice & Tone',
        keywords: ['voice', 'tone', 'messaging'],
      },
      imageryLayout: {
        id: 'imageryLayout',
        label: t('brandDetail.imageryLayout'),
        heading: 'Imagery & Layout',
        keywords: ['imagery', 'image', 'photograph', 'illustration', 'layout', 'spacing', 'grid', 'composition'],
      },
      designSystem: {
        id: 'designSystem',
        label: t('brandDetail.designSystem'),
        heading: 'Design System',
        keywords: ['design system', 'component', 'token', 'motion', 'interaction'],
      },
    }),
    [t],
  );

  function uploadElementForModule(module: KitUploadModule): DesignSystemEditClickProps['element'] {
    return module === 'logo' ? 'logo_upload' : module === 'font' ? 'font_upload' : 'image_upload';
  }

  function uploadTrackingModule(module: KitUploadModule): DesignSystemEditClickProps['module'] {
    return module === 'logo' ? 'logo' : module === 'font' ? 'typography' : 'images';
  }

  function designMdTrackingModule(module: DesignMdModuleSpec): DesignSystemEditClickProps['module'] {
    if (module.id === 'typography') return 'typography';
    if (module.id === 'palette') return 'palette';
    if (module.id === 'imageryLayout') return 'images';
    if (module.id === 'designSystem') return 'kit';
    return 'design_md';
  }

  function handleFile(module: KitUploadModule, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && onUploadModule) {
      onActionFeedback?.('loading', t('ds.uploading'));
      onUploadModule(module, file);
    }
  }

  function openInBrowser(event: MouseEvent<HTMLAnchorElement>, url: string) {
    event.preventDefault();
    void openExternalUrl(url);
  }

  function openUrlInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleModuleDragOver(event: DragEvent<HTMLElement>) {
    if (!canUpload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleModuleDrop(module: KitUploadModule, event: DragEvent<HTMLElement>) {
    if (!canUpload || !onUploadModule) return;
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((f) =>
      module === 'font'
        ? /\.(otf|ttf|woff2?)$/i.test(f.name)
        : f.type.startsWith('image/') || /\.svg$/i.test(f.name),
    );
    if (file) {
      onEditClick?.(uploadElementForModule(module), uploadTrackingModule(module));
      onUploadModule(module, file);
    }
  }

  async function pasteImage(module: Exclude<KitUploadModule, 'font'>) {
    if (!canUpload || !onUploadModule || !navigator.clipboard?.read) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const ext = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        onEditClick?.(uploadElementForModule(module), uploadTrackingModule(module));
        onActionFeedback?.('loading', t('ds.uploading'));
        onUploadModule(module, new File([blob], `clipboard-${module}-${Date.now()}.${ext}`, { type: imageType }));
        return;
      }
    } catch {
      // Clipboard image reads are browser-permission dependent.
    }
  }

  function openDesignMdEditor() {
    if (!designMd) return;
    onEditClick?.('design_md_edit', 'design_md');
    setDesignMdTarget({ kind: 'all' });
    setDesignMdDraft(designMd.body);
    setDesignMdOpen(true);
  }

  function openDesignMdModuleEditor(module: DesignMdModuleSpec) {
    if (!designMd) return;
    onEditClick?.('design_md_edit', designMdTrackingModule(module));
    const slice = designMdModuleSlice(designMd.body, module);
    setDesignMdTarget({ kind: 'module', module });
    setDesignMdDraft(slice.text);
    setDesignMdOpen(true);
  }

  async function copyDesignMdText(value: string) {
    if (!value.trim() || !navigator.clipboard?.writeText) {
      onActionFeedback?.('error', t('ds.actionFailed'));
      return;
    }
    try {
      onActionFeedback?.('loading', `${t('ds.copyDesignMd')}...`);
      await navigator.clipboard.writeText(value);
      onActionFeedback?.('success', t('fileViewer.copied'));
    } catch {
      onActionFeedback?.('error', t('ds.actionFailed'));
    }
  }

  async function copyDesignMd() {
    if (!designMd?.body) return;
    onEditClick?.('design_md_copy', 'design_md');
    await copyDesignMdText(designMd.body);
  }

  async function copyDesignMdModule(module: DesignMdModuleSpec) {
    if (!designMd?.body) return;
    const slice = designMdModuleSlice(designMd.body, module);
    onEditClick?.('design_md_copy', designMdTrackingModule(module));
    await copyDesignMdText(slice.text);
  }

  // Core editing shortcuts, active when focus is within the kit (so they never
  // hijack global typing). Plain letter keys only — modifier combos (⌘C copy,
  // etc.) pass through, and inputs/editors/open modals are skipped. Delete is
  // contextual: it only removes the logo when the logo stage itself is focused,
  // so a stray keypress can't destroy an asset. See the "?" hint in the header.
  function handleKitKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (designMdOpen || colorEditor || lightbox || assetPreview) return;
    const key = event.key.toLowerCase();
    if (key === 'e' && canEditDesignMd) {
      event.preventDefault();
      openDesignMdEditor();
    } else if (key === 'c' && designMd?.body) {
      event.preventDefault();
      void copyDesignMd();
    } else if (key === 'u' && canUpload) {
      event.preventDefault();
      onEditClick?.('logo_upload', 'logo');
      logoInputRef.current?.click();
    } else if (key === 'r' && onRefresh) {
      event.preventDefault();
      onEditClick?.('kit_refresh', 'kit');
      onRefresh();
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      onDeleteLogo &&
      activeLogoSrc &&
      target.closest('[data-kit-logo-stage]')
    ) {
      event.preventDefault();
      onEditClick?.('logo_delete', 'logo');
      void onDeleteLogo(activeLogo);
    }
  }

  async function saveDesignMdDraft() {
    if (!designMd?.onSave) return;
    const nextBody = designMdTarget.kind === 'module'
      ? replaceDesignMdModule(designMd.body, designMdTarget.module, designMdDraft)
      : designMdDraft;
    await designMd.onSave(nextBody);
    setDesignMdOpen(false);
  }

  function openColorEditor(index: number) {
    const color = colors[index];
    if (!color) return;
    onEditClick?.('color_edit', 'palette');
    setColorEditor({
      index,
      label: color.name || color.role || `Color ${index + 1}`,
    });
    setColorDraft(normalizeColorInput(color.hex).toUpperCase());
    setColorError(null);
  }

  async function saveColorDraft() {
    if (!colorEditor || !onColorChange) return;
    const nextHex = normalizeEditableHex(colorDraft);
    if (!nextHex) {
      setColorError(t('ds.invalidHexColor'));
      return;
    }
    const previousHex = colors[colorEditor.index]?.hex;
    setColorSaving(true);
    setColorError(null);
    setColorOverrides((current) => ({ ...current, [colorEditor.index]: nextHex }));
    try {
      await onColorChange(colorEditor.index, nextHex);
      setColorEditor(null);
    } catch (err) {
      setColorError(err instanceof Error ? err.message : t('ds.colorSaveFailed'));
      if (previousHex) {
        setColorOverrides((current) => ({ ...current, [colorEditor.index]: previousHex }));
      }
    } finally {
      setColorSaving(false);
    }
  }

  async function resetColorDraft() {
    if (!colorEditor || !onColorReset) return;
    setColorSaving(true);
    setColorError(null);
    try {
      await onColorReset(colorEditor.index);
      setColorOverrides((current) => {
        const next = { ...current };
        delete next[colorEditor.index];
        return next;
      });
      setColorEditor(null);
    } catch (err) {
      setColorError(err instanceof Error ? err.message : t('ds.colorResetFailed'));
    } finally {
      setColorSaving(false);
    }
  }

  async function handleDesignMdUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onEditClick?.('design_md_upload', 'design_md');
    const text = await file.text();
    setDesignMdTarget({ kind: 'all' });
    setDesignMdDraft(text);
    setDesignMdOpen(true);
  }

  function moduleActions(actions: ReactNode) {
    return actions ? <div className={styles.moduleActions}>{actions}</div> : null;
  }

  function moduleActionButton(
    label: string,
    icon: IconName,
    onClick: () => void,
    disabled = false,
    loading = false,
  ) {
    return (
      <button
        type="button"
        className={`${styles.moduleAction} ${loading ? styles.moduleActionLoading : ''}`}
        onClick={onClick}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        title={label}
        aria-label={label}
      >
        <Icon name={loading ? 'spinner' : icon} size={13} />
        <span>{label}</span>
      </button>
    );
  }

  function designMdActionButtons() {
    if (!designMd) return null;
    return (
      <>
        {moduleActionButton(t('ds.copyDesignMd'), 'copy', () => void copyDesignMd(), !designMd.body)}
        {canEditDesignMd
          ? moduleActionButton(t('ds.editDesignMd'), 'edit', openDesignMdEditor, Boolean(designMd.saving || anyActionBusy))
          : designMd.onOpenFile
            ? moduleActionButton(t('ds.openDesignMd'), 'file-text', designMd.onOpenFile)
            : null}
        {canEditDesignMd
          ? moduleActionButton(t('ds.uploadMd'), 'upload', () => designMdInputRef.current?.click(), Boolean(designMd.saving || anyActionBusy))
          : null}
      </>
    );
  }

  function designMdModuleActionButtons(module: DesignMdModuleSpec) {
    if (!designMd) return null;
    const slice = designMdModuleSlice(designMd.body, module);
    const moduleVars = { module: module.label };
    return (
      <>
        {moduleActionButton(t('ds.copyDesignMdModule', moduleVars), 'copy', () => void copyDesignMdModule(module), !slice.text.trim())}
        {canEditDesignMd
          ? moduleActionButton(t('ds.editDesignMdModule', moduleVars), 'edit', () => openDesignMdModuleEditor(module), Boolean(designMd.saving || anyActionBusy))
          : designMd.onOpenFile
            ? moduleActionButton(t('ds.openDesignMdModule', moduleVars), 'file-text', designMd.onOpenFile)
            : null}
      </>
    );
  }

  function uploadAction(module: KitUploadModule) {
    if (!canUpload) return null;
    const busy = uploading === module || actionBusy === `upload:${module}`;
    const label =
      busy
        ? t('ds.uploading')
        : module === 'logo'
          ? t('ds.uploadLogo')
          : module === 'font'
            ? t('ds.uploadFont')
            : t('ds.uploadImage');
    return moduleActionButton(
      label,
      'upload',
      () => {
        onEditClick?.(uploadElementForModule(module), uploadTrackingModule(module));
        (module === 'logo' ? logoInputRef : module === 'font' ? fontInputRef : imageInputRef).current?.click();
      },
      Boolean(uploading || anyActionBusy),
      busy,
    );
  }

  function emptyModule(hint: string, module?: KitUploadModule) {
    return (
      <div className={styles.emptyModule}>
        <span className={styles.emptyModuleText}>{hint}</span>
        {module && canUpload ? (
          <button
            type="button"
            className={styles.uploadBtn}
            disabled={uploading === module || anyActionBusy}
            aria-busy={(uploading === module || actionBusy === `upload:${module}`) || undefined}
            onClick={() => {
              onEditClick?.(uploadElementForModule(module), uploadTrackingModule(module));
              (module === 'logo' ? logoInputRef : module === 'font' ? fontInputRef : imageInputRef).current?.click();
            }}
          >
            {uploading === module || actionBusy === `upload:${module}`
              ? t('ds.uploading')
              : module === 'logo'
                ? t('ds.uploadLogo')
                : module === 'font'
                  ? t('ds.uploadFont')
                : t('ds.uploadImage')}
          </button>
        ) : null}
      </div>
    );
  }

  // Sticky-header overflow menu: DESIGN.md read/edit actions first, then any
  // consumer-supplied actions. Upload/import and full-preview actions stay out
  // of this compact menu so it only contains routine project operations.
  const designMdMenuActions: HeaderMenuAction[] = designMd
    ? [
        ...(canEditDesignMd
          ? [{
              id: 'design-md-edit',
              label: t('ds.editDesignMd'),
              icon: 'edit' as IconName,
              onClick: openDesignMdEditor,
              disabled: Boolean(designMd.saving || anyActionBusy),
              loading: actionBusy === 'design-md-save',
            }]
          : designMd.onOpenFile
            ? [{
                id: 'design-md-open',
                label: t('ds.openDesignMd'),
                icon: 'file-text' as IconName,
                onClick: designMd.onOpenFile,
              }]
            : []),
        {
          id: 'design-md-copy',
          label: t('ds.copyDesignMd'),
          icon: 'copy' as IconName,
          onClick: () => void copyDesignMd(),
          disabled: !designMd.body,
        },
      ]
    : [];
  const headerMenuGroups: HeaderMenuAction[][] = [
    designMdMenuActions,
    headerMenuActions ?? [],
  ];
  const hasHeaderMenu = headerMenuGroups.some((group) => group.length > 0);
  const designMdDialogLabel = designMdTarget.kind === 'module'
    ? t('ds.designMdSectionLabel', { module: designMdTarget.module.label })
    : 'DESIGN.md';

  return (
    <div
      className={[
        styles.previewInner,
        compact ? styles.compact : '',
        stickyHeader ? styles.previewInnerSticky : '',
      ].filter(Boolean).join(' ')}
      data-testid={dataTestId}
      data-variant={variant}
      onKeyDown={handleKitKeyDown}
    >
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*,.svg"
        hidden
        onChange={(e) => handleFile('logo', e)}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile('image', e)}
      />
      <input
        ref={fontInputRef}
        type="file"
        accept=".otf,.ttf,.woff,.woff2"
        hidden
        onChange={(e) => handleFile('font', e)}
      />
      <input
        ref={designMdInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        hidden
        onChange={(e) => void handleDesignMdUpload(e)}
      />

      {showCover ? (
      <div className={styles.cover}>
        {kit.showcaseHtml ? (
          <>
            <span className={styles.coverFrameViewport} aria-hidden>
              <iframe
                className={styles.coverFrame}
                title={`${kit.name} preview`}
                sandbox={DESIGN_KIT_PREVIEW_SANDBOX}
                srcDoc={buildSrcdoc(kit.showcaseHtml)}
                tabIndex={-1}
              />
            </span>
            {!compact ? (
              <button
                type="button"
                className={styles.coverPreviewBtn}
                onClick={() =>
                  onPreviewCover ? onPreviewCover() : setCoverPreviewOpen(true)
                }
                data-testid="design-kit-cover-preview"
                aria-label={t('common.openPreview')}
              >
                <span className={styles.coverPreviewPill}>
                  <ExpandGlyph />
                  {t('common.openPreview')}
                </span>
              </button>
            ) : null}
          </>
        ) : activeLogoSrc ? (
          <button
            type="button"
            className={styles.coverImageButton}
            onClick={() => setLightbox({ src: activeLogoSrc, caption: kit.name })}
            aria-label={`${t('common.openPreview')}: ${kit.name}`}
          >
            <BrandLogo
              brandId={kit.brandId}
              logoSrc={kit.logoSrc}
              host={kit.host}
              name={kit.name}
              faviconSize={128}
              className={styles.coverLogo}
              fallbackClassName={styles.coverLogoFallback}
            />
          </button>
        ) : (
          <BrandLogo
            brandId={kit.brandId}
            logoSrc={kit.logoSrc}
            host={kit.host}
            name={kit.name}
            faviconSize={128}
            className={styles.coverLogo}
            fallbackClassName={styles.coverLogoFallback}
          />
        )}
      </div>
      ) : null}

      <header
        ref={stickyHeader ? stickyHeaderRef : undefined}
        className={[
          styles.previewHead,
          stickyHeader ? styles.previewHeadSticky : '',
          stickyHeaderStuck ? styles.previewHeadStuck : '',
        ].filter(Boolean).join(' ')}
      >
        <div className={styles.previewHeadIdentity}>
          {stickyHeader ? (
            <span className={styles.previewHeadLogo} aria-hidden="true">
              <BrandLogo
                brandId={kit.brandId}
                logoSrc={activeLogoSrc ?? kit.logoSrc}
                host={kit.host}
                name={kit.name}
                faviconSize={40}
                className={styles.previewHeadLogoImage}
                fallbackClassName={styles.previewHeadLogoFallback}
              />
            </span>
          ) : null}
          <div className={styles.previewHeadText}>
            <div className={styles.previewTitleRow}>
              <h2 className={styles.previewName}>{kit.name}</h2>
              {badgeSlot}
            </div>
            {!stickyHeader && kit.tagline ? <p className={styles.previewTagline}>{kit.tagline}</p> : null}
            {!stickyHeader && kit.host && kit.sourceUrl ? (
              <a
                className={styles.previewDomain}
                href={kit.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(event) => openInBrowser(event, kit.sourceUrl!)}
              >
                {kit.host}
                <ExternalGlyph />
              </a>
            ) : null}
          </div>
        </div>
        {stickyHeader ? (
          actionsSlot || hasHeaderMenu ? (
            <div className={styles.previewActions}>
              {actionsSlot}
              <HeaderActionsMenu groups={headerMenuGroups} label={t('designs.menuMore')} />
            </div>
          ) : null
        ) : actionsSlot || (!compact && designMd) ? (
          <div className={styles.previewActions}>
            {!compact ? designMdActionButtons() : null}
            {actionsSlot}
          </div>
        ) : null}
      </header>

      {noticeSlot}
      {topSlot}

      <>
          {kit.description ? (
            <section className={styles.section} aria-label={t('brandDetail.identity')}>
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.identity')}</h3>
                {moduleActions(designMdModuleActionButtons(designMdModules.identity))}
              </div>
              <p className={styles.description}>{kit.description}</p>
            </section>
          ) : null}

          {!compact ? (
            <section
              ref={logoSectionRef}
              className={[
                styles.section,
                editFocusModule === 'logo' ? styles.sectionEditFocus : '',
              ].filter(Boolean).join(' ')}
              data-testid="design-kit-logo-section"
              tabIndex={editFocusModule === 'logo' ? -1 : undefined}
              aria-label={t('brandDetail.logo')}
              onDragOver={handleModuleDragOver}
              onDrop={(event) => handleModuleDrop('logo', event)}
            >
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.logo')}</h3>
                {editFocusModule === 'logo' ? (
                  <span className={styles.editFocusHint}>
                    {t('ds.manualEditModuleHint', { module: t('brandDetail.logo') })}
                  </span>
                ) : null}
                {moduleActions(
                  <>
                    {uploadAction('logo')}
                    {canUpload ? moduleActionButton(t('ds.pasteImage'), 'copy', () => void pasteImage('logo'), Boolean(uploading || anyActionBusy)) : null}
                    {activeLogoSrc && onDeleteLogo
                      ? moduleActionButton(
                          t('ds.deleteLogo'),
                          'trash',
                          () => {
                            onEditClick?.('logo_delete', 'logo');
                            void onDeleteLogo(activeLogo);
                          },
                          Boolean(uploading || anyActionBusy),
                          actionBusy === `delete-logo:${activeLogo}`,
                        )
                      : null}
                  </>,
                )}
              </div>
              {activeLogoSrc ? (
                <>
                  <button
                    type="button"
                    className={`${styles.logoStage} ${styles.logoStageButton}`}
                    data-kit-logo-stage
                    onClick={() => setLightbox({ src: activeLogoSrc, caption: kit.name })}
                    aria-label={`${t('common.openPreview')}: ${kit.name}`}
                  >
                    <img
                      className={styles.logoStageImg}
                      src={activeLogoSrc}
                      alt={kit.name}
                      onError={() => markBroken(activeLogoSrc)}
                    />
                  </button>
                  {logoCandidates.length > 1 ? (
                    <div className={styles.logoThumbs}>
                      {logoCandidates.map((cand, i) => (
                        <button
                          key={cand}
                          type="button"
                          className={`${styles.logoThumb} ${i === activeLogo ? styles.logoThumbActive : ''}`}
                          onClick={() => setActiveLogo(i)}
                          aria-pressed={i === activeLogo}
                        >
                          <img src={cand} alt="" onError={() => markBroken(cand)} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {kit.logoNotes ? <p className={styles.logoNotes}>{kit.logoNotes}</p> : null}
                </>
              ) : (
                emptyModule(t('ds.moduleEmptyLogo'), 'logo')
              )}
            </section>
          ) : null}

          {fonts.length > 0 ? (
            <section
              className={styles.section}
              aria-label={t('brandDetail.typography')}
              onDragOver={handleModuleDragOver}
              onDrop={(event) => handleModuleDrop('font', event)}
            >
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.typography')}</h3>
                {moduleActions(
                  <>
                    {uploadAction('font')}
                    {designMdModuleActionButtons(designMdModules.typography)}
                  </>,
                )}
              </div>
              <div className={styles.fontTiles}>
                {fonts.map(({ font, label }) => (
                  <div key={`tile-${label}-${font.family}`} className={styles.fontTile}>
                    <div className={styles.fontTileAg} style={{ fontFamily: fontStack(font) }}>
                      Ag
                    </div>
                    <div className={styles.fontTileMeta}>
                      <span className={styles.fontTileName}>{font.family}</span>
                      <span className={styles.fontTileRole}>{label}</span>
                    </div>
                  </div>
                ))}
              </div>
              {compact ? null : (
                <div className={styles.fontList}>
                  {fonts.map(({ font, label }) => (
                    <div key={`row-${label}-${font.family}`} className={styles.fontItem}>
                      <div className={styles.fontItemHead}>
                        <span className={styles.fontRole}>{label}</span>
                        <span className={styles.fontFamily}>
                          {font.family}
                          {font.weights.length > 0 ? (
                            <span className={styles.fontWeights}> · {font.weights.join('/')}</span>
                          ) : null}
                        </span>
                      </div>
                      <span className={styles.fontSpecimen} style={{ fontFamily: fontStack(font) }}>
                        {label === 'Mono' ? 'const brand = await extract(url);' : kit.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : !compact && canUpload ? (
            <section
              className={styles.section}
              aria-label={t('brandDetail.typography')}
              onDragOver={handleModuleDragOver}
              onDrop={(event) => handleModuleDrop('font', event)}
            >
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.typography')}</h3>
                {moduleActions(uploadAction('font'))}
              </div>
              {emptyModule(t('ds.moduleEmptyFonts'), 'font')}
            </section>
          ) : null}

          {colors.length > 0 ? (
            <section className={styles.section} aria-label={t('brandDetail.palette')}>
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.palette')}</h3>
                {moduleActions(designMdModuleActionButtons(designMdModules.palette))}
              </div>
              <div className={styles.paletteGrid}>
                {colors.map((c, i) => (
                  <div key={`${c.role}-${c.hex}-${i}`} className={styles.swatch}>
                    <span className={styles.swatchChip} style={{ background: c.hex }}>
                      {onColorChange ? (
                        <button
                          className={styles.swatchPicker}
                          type="button"
                          aria-label={t('ds.editColor', { name: c.name || c.role || t('ds.colorLabel') })}
                          title={t('ds.editColor', { name: c.name || c.role || t('ds.colorLabel') })}
                          onClick={() => openColorEditor(i)}
                        >
                          <Icon name="edit" size={13} />
                        </button>
                      ) : null}
                      <span
                        className={styles.swatchHex}
                        style={{ color: isLightHex(c.hex) ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.9)' }}
                      >
                        {c.hex}
                      </span>
                    </span>
                    <div className={styles.swatchBody}>
                      <span className={styles.swatchName}>{c.name || c.role}</span>
                      {c.role ? <span className={styles.swatchRole}>{c.role}</span> : null}
                      {!compact && c.usage ? <span className={styles.swatchUsage}>{c.usage}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!compact && voice ? (
            <section className={styles.section} aria-label={t('brandDetail.voiceTone')}>
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.voiceTone')}</h3>
                {moduleActions(designMdModuleActionButtons(designMdModules.voice))}
              </div>
              {voice.adjectives.length > 0 ? (
                <div className={styles.pills}>
                  {voice.adjectives.map((adj, i) => (
                    <span key={`${adj}-${i}`} className={styles.pill}>
                      {adj}
                    </span>
                  ))}
                </div>
              ) : null}
              {voice.tone ? <p className={styles.aesthetic}>{voice.tone}</p> : null}
              {voice.messagingPillars.length > 0 ? (
                <ul className={styles.pillars}>
                  {voice.messagingPillars.map((p, i) => (
                    <li key={`pillar-${i}`}>{p}</li>
                  ))}
                </ul>
              ) : null}
              {voice.vocabulary.use.length > 0 || voice.vocabulary.avoid.length > 0 ? (
                <div className={styles.vocab}>
                  {voice.vocabulary.use.length > 0 ? (
                    <div className={styles.vocabCol}>
                      <span className={styles.vocabUse}>{t('brandDetail.useLabel')}</span>
                      <span className={styles.vocabVals}>{voice.vocabulary.use.join(' · ')}</span>
                    </div>
                  ) : null}
                  {voice.vocabulary.avoid.length > 0 ? (
                    <div className={styles.vocabCol}>
                      <span className={styles.vocabAvoid}>{t('brandDetail.avoidLabel')}</span>
                      <span className={styles.vocabVals}>{voice.vocabulary.avoid.join(' · ')}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {!compact && (imagery || layout) ? (
            <section className={styles.section} aria-label={t('brandDetail.imageryLayout')}>
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.imageryLayout')}</h3>
                {moduleActions(designMdModuleActionButtons(designMdModules.imageryLayout))}
              </div>
              {imagery?.style ? <p className={styles.description}>{imagery.style}</p> : null}
              {(imagery?.subjects.length ?? 0) > 0 ? (
                <p className={styles.imageryLine}>
                  <span className={styles.imageryKey}>{t('brandDetail.subjects')}:</span>{' '}
                  {imagery?.subjects.join(', ')}
                </p>
              ) : null}
              {imagery?.treatment ? (
                <p className={styles.imageryLine}>
                  <span className={styles.imageryKey}>{t('brandDetail.treatment')}:</span>{' '}
                  {imagery.treatment}
                </p>
              ) : null}
              {(imagery?.avoid.length ?? 0) > 0 ? (
                <p className={styles.imageryLine}>
                  <span className={styles.imageryKeyAvoid}>{t('brandDetail.avoidLabel')}:</span>{' '}
                  {imagery?.avoid.join(', ')}
                </p>
              ) : null}
              {(layout?.postureRules.length ?? 0) > 0 ? (
                <div className={styles.posture}>
                  <h4 className={styles.subTitle}>{t('brandDetail.layoutPosture')}</h4>
                  <ul className={styles.postureList}>
                    {layout?.postureRules.map((r, i) => (
                      <li key={`posture-${i}`}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {!compact && (samples.length > 0 || canUpload) ? (
            <section
              className={styles.section}
              aria-label={t('brandDetail.images')}
              onDragOver={handleModuleDragOver}
              onDrop={(event) => handleModuleDrop('image', event)}
            >
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.images')}</h3>
                {moduleActions(
                  <>
                    {uploadAction('image')}
                    {canUpload ? moduleActionButton(t('ds.pasteImage'), 'copy', () => void pasteImage('image'), Boolean(uploading || anyActionBusy)) : null}
                    {samples.length > IMAGE_CAP ? (
                      <button
                        type="button"
                        className={styles.sectionAction}
                        onClick={() => setImagesExpanded((v) => !v)}
                      >
                        {imagesExpanded
                          ? t('brandDetail.viewLess')
                          : t('brandDetail.viewMore').replace('{count}', String(samples.length))}
                      </button>
                    ) : null}
                  </>,
                )}
              </div>
              {samples.length > 0 ? (
                <div className={styles.gallery}>
                  {(imagesExpanded ? samples : samples.slice(0, IMAGE_CAP)).map((s, i) => {
                    const sampleIndex = imagesExpanded ? i : i;
                    // Drop tiles whose source 404s/fails so the grid never shows
                    // a broken-image glyph. Returning null keeps the remaining
                    // tiles' indices aligned with the delete handler.
                    if (brokenSrc.has(s.url)) return null;
                    const cap = s.caption || s.kind || kit.name;
                    return (
                      <figure key={`${s.url}-${i}`} className={styles.shot}>
                        <button
                          type="button"
                          className={styles.shotFrame}
                          onClick={() => setLightbox({ src: s.url, caption: cap })}
                          aria-label={cap}
                        >
                          <img src={s.url} alt={cap} loading="lazy" onError={() => markBroken(s.url)} />
                        </button>
                        {onDeleteImage ? (
                          <button
                            type="button"
                            className={`${styles.shotDelete} ${
                              actionBusy === `delete-image:${sampleIndex}` ? styles.shotDeleteLoading : ''
                            }`}
                            onClick={() => {
                              onEditClick?.('image_delete', 'images');
                              void onDeleteImage(sampleIndex);
                            }}
                            disabled={Boolean(uploading || anyActionBusy)}
                            aria-busy={(actionBusy === `delete-image:${sampleIndex}`) || undefined}
                            aria-label={t('ds.deleteImage', { caption: cap })}
                            title={t('ds.deleteImage', { caption: cap })}
                          >
                            <Icon name={actionBusy === `delete-image:${sampleIndex}` ? 'spinner' : 'trash'} size={13} />
                          </button>
                        ) : null}
                        {s.caption || s.kind ? (
                          <figcaption className={styles.shotMeta}>
                            <span className={styles.shotCap}>{s.caption || s.kind}</span>
                            {s.caption && s.kind ? <span className={styles.shotKind}>{s.kind}</span> : null}
                          </figcaption>
                        ) : null}
                      </figure>
                    );
                  })}
                </div>
              ) : (
                emptyModule(t('ds.moduleEmptyImages'), 'image')
              )}
            </section>
          ) : null}

          {!compact && kit.system && dsKitUrl ? (
            <section className={styles.section} aria-label={t('brandDetail.designSystem')}>
              <div className={styles.dsHead}>
                <h3 className={styles.sectionTitle}>{t('brandDetail.designSystem')}</h3>
                {moduleActions(
                  <>
                    {designMdModuleActionButtons(designMdModules.designSystem)}
                    {!stickyHeader && onRefresh
                      ? moduleActionButton(t('ds.refresh'), 'refresh', () => {
                          onEditClick?.('kit_refresh', 'kit');
                          onRefresh();
                        }, anyActionBusy, actionBusy === 'refresh')
                      : null}
                    {!stickyHeader && onDownload
                      ? moduleActionButton(t('ds.download'), 'download', () => {
                          onEditClick?.('kit_download', 'kit');
                          onDownload();
                        }, anyActionBusy, actionBusy === 'download')
                      : null}
                    {!stickyHeader && onImport
                      ? moduleActionButton(t('ds.importFolder'), 'import', () => {
                          onEditClick?.('kit_import', 'kit');
                          onImport();
                        }, anyActionBusy, actionBusy === 'import')
                      : null}
                    {!stickyHeader && onReset
                      ? moduleActionButton(t('ds.reset'), 'reload', () => {
                          onEditClick?.('kit_reset', 'kit');
                          onReset();
                        }, anyActionBusy, actionBusy === 'reset')
                      : null}
                  </>,
                )}
              </div>
              <div className={styles.dsFrameWrap}>
                <div className={styles.dsBar}>
                  <div className={styles.dsTabs}>
                    <button
                      type="button"
                      className={`${styles.dsTab} ${dsTheme === 'light' ? styles.dsTabActive : ''}`}
                      onClick={() => setDsTheme('light')}
                      aria-pressed={dsTheme === 'light'}
                    >
                      {t('brandDetail.themeLight')}
                    </button>
                    {kit.system.kitDarkUrl ? (
                      <button
                        type="button"
                        className={`${styles.dsTab} ${dsTheme === 'dark' ? styles.dsTabActive : ''}`}
                        onClick={() => setDsTheme('dark')}
                        aria-pressed={dsTheme === 'dark'}
                      >
                        {t('brandDetail.themeDark')}
                      </button>
                    ) : null}
                  </div>
                  <span className={styles.dsCap}>system/kit.html</span>
                </div>
                <iframe
                  key={dsKitUrl}
                  className={styles.dsFrame}
                  src={dsKitUrl}
                  loading="lazy"
                  sandbox={DESIGN_KIT_PREVIEW_SANDBOX}
                  title={t('brandDetail.designSystem')}
                />
              </div>
              {tokens?.colorPrimary ? (
                <div className={styles.dsTokens}>
                  <TokenChip label="colorPrimary" hex={tokens.colorPrimary} />
                  {tokens.colorPrimaryBg ? <TokenChip label="colorPrimaryBg" hex={tokens.colorPrimaryBg} /> : null}
                  {tokens.colorPrimaryHover ? (
                    <TokenChip label="colorPrimaryHover" hex={tokens.colorPrimaryHover} />
                  ) : null}
                  {tokens.colorPrimaryActive ? (
                    <TokenChip label="colorPrimaryActive" hex={tokens.colorPrimaryActive} />
                  ) : null}
                  {tokens.fontSize != null ? <ValueChip label="fontSize" value={String(tokens.fontSize)} /> : null}
                  {tokens.borderRadius != null ? (
                    <ValueChip label="borderRadius" value={String(tokens.borderRadius)} />
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {!compact && kit.assets && kit.assets.length > 0 ? (
            <section className={styles.section} aria-label={t('brandDetail.brandAssets')}>
              <h3 className={styles.sectionTitle}>{t('brandDetail.brandAssets')}</h3>
              <div className={styles.assets}>
                {kit.assets.map((a) => (
                  <div
                    role="button"
                    tabIndex={0}
                    key={a.kind}
                    className={styles.asset}
                    onClick={() => setAssetPreview({ url: a.url, label: a.label })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setAssetPreview({ url: a.url, label: a.label });
                      }
                    }}
                  >
                    <div className={styles.assetFrame}>
                      <iframe
                        src={a.url}
                        loading="lazy"
                        tabIndex={-1}
                        aria-hidden="true"
                        sandbox={DESIGN_KIT_PREVIEW_SANDBOX}
                        title={a.label}
                      />
                    </div>
                    <div className={styles.assetMeta}>
                      <span className={styles.assetName}>{a.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>

      {/* Overlays portal to <body> so their z-index resolves in the ROOT
          stacking context. Rendered inline, the DesignKitView host pane traps
          them in a lower stacking context and the chat composer (a root-level
          position:fixed layer) paints over them despite their higher z-index. */}
      {typeof document !== 'undefined'
        ? createPortal(
            <>
              {lightbox ? (
                <div
                  className={styles.lightbox}
                  role="dialog"
                  aria-modal="true"
                  aria-label={lightbox.caption}
                  onClick={() => setLightbox(null)}
                >
                  <button
                    type="button"
                    className={styles.lightboxClose}
                    onClick={() => setLightbox(null)}
                    aria-label={t('newBrand.close')}
                  >
                    <CloseGlyph />
                  </button>
                  <img
                    className={styles.lightboxImg}
                    src={lightbox.src}
                    alt={lightbox.caption}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : null}

              {assetPreview ? (
                <div
                  className={styles.assetModal}
                  role="dialog"
                  aria-modal="true"
                  aria-label={assetPreview.label}
                  onClick={() => setAssetPreview(null)}
                >
                  <div className={styles.assetModalPanel} onClick={(event) => event.stopPropagation()}>
                    <div className={styles.assetModalHeader}>
                      <h3>{assetPreview.label}</h3>
                      <div className={styles.assetModalHeaderActions}>
                        <button
                          type="button"
                          className={styles.moduleAction}
                          onClick={() => openUrlInNewTab(assetPreview.url)}
                        >
                          <Icon name="external-link" size={13} />
                          <span>{t('preview.openInNewTab')}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.assetModalClose}
                          onClick={() => setAssetPreview(null)}
                          aria-label={t('newBrand.close')}
                        >
                          <CloseGlyph />
                        </button>
                      </div>
                    </div>
                    <iframe
                      className={styles.assetModalFrame}
                      src={assetPreview.url}
                      title={assetPreview.label}
                      sandbox={DESIGN_KIT_PREVIEW_SANDBOX}
                    />
                  </div>
                </div>
              ) : null}

              {coverPreviewOpen && kit.showcaseHtml ? (
                <div
                  className={styles.assetModal}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${kit.name} preview`}
                  onClick={() => setCoverPreviewOpen(false)}
                >
                  <div className={styles.assetModalPanel} onClick={(event) => event.stopPropagation()}>
                    <div className={styles.assetModalHeader}>
                      <h3>{kit.name}</h3>
                      <button
                        type="button"
                        className={styles.assetModalClose}
                        onClick={() => setCoverPreviewOpen(false)}
                        aria-label={t('newBrand.close')}
                      >
                        <CloseGlyph />
                      </button>
                    </div>
                    <iframe
                      className={styles.assetModalFrame}
                      data-testid="design-kit-cover-preview-frame"
                      title={`${kit.name} preview`}
                      sandbox={DESIGN_KIT_PREVIEW_SANDBOX}
                      srcDoc={buildSrcdoc(kit.showcaseHtml)}
                    />
                  </div>
                </div>
              ) : null}

              {designMdOpen && designMd ? (
                <div
                  className={styles.assetModal}
                  role="dialog"
                  aria-modal="true"
                  aria-label={designMdDialogLabel}
                  onClick={() => setDesignMdOpen(false)}
                >
                  <div className={`${styles.assetModalPanel} ${styles.designMdModalPanel}`} onClick={(event) => event.stopPropagation()}>
                    <div className={styles.assetModalHeader}>
                      <h3>{designMdTarget.kind === 'module' ? designMdTarget.module.label : 'DESIGN.md'}</h3>
                      <button
                        type="button"
                        className={styles.assetModalClose}
                        onClick={() => setDesignMdOpen(false)}
                        aria-label={t('newBrand.close')}
                      >
                        <CloseGlyph />
                      </button>
                    </div>
                    <Textarea
                      className={styles.designMdTextarea}
                      value={designMdDraft}
                      onChange={(event) => setDesignMdDraft(event.target.value)}
                      rows={20}
                      spellCheck={false}
                      aria-label={designMdDialogLabel}
                    />
                    <div className={styles.designMdModalBar}>
                      <span>
                        {designMdTarget.kind === 'module'
                          ? t('ds.editingModuleHint', { module: designMdTarget.module.label })
                          : t('ds.editingDesignMdHint')}
                      </span>
                      <Button variant="primary" disabled={Boolean(designMd.saving)} onClick={() => void saveDesignMdDraft()}>
                        {designMd.saving ? t('ds.saving') : designMdTarget.kind === 'module' ? t('ds.saveModule') : t('ds.saveDesignMd')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {colorEditor ? (
                <div
                  className={styles.assetModal}
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('ds.editColor', { name: colorEditor.label })}
                  data-testid="design-kit-color-editor"
                  onClick={() => {
                    if (colorSaving) return;
                    setColorEditor(null);
                    setColorError(null);
                  }}
                >
                  <div
                    className={`${styles.assetModalPanel} ${styles.colorModalPanel}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className={styles.assetModalHeader}>
                      <h3>{t('ds.editColor', { name: colorEditor.label })}</h3>
                      <button
                        type="button"
                        className={styles.assetModalClose}
                        onClick={() => {
                          if (colorSaving) return;
                          setColorEditor(null);
                          setColorError(null);
                        }}
                        aria-label={t('newBrand.close')}
                      >
                        <CloseGlyph />
                      </button>
                    </div>
                    <div className={styles.colorModalBody}>
                      <div className={styles.colorModalPreview} style={{ background: normalizeColorInput(colorDraft) }}>
                        <span
                          style={{
                            color: isLightHex(normalizeColorInput(colorDraft))
                              ? 'rgba(0,0,0,.72)'
                              : 'rgba(255,255,255,.9)',
                          }}
                        >
                          {normalizeColorInput(colorDraft).toUpperCase()}
                        </span>
                      </div>
                      <label className={styles.colorModalField}>
                        <span>{t('ds.colorLabel')}</span>
                        <input
                          type="color"
                          value={normalizeColorInput(colorDraft)}
                          onChange={(event) => {
                            setColorDraft(event.target.value.toUpperCase());
                            setColorError(null);
                          }}
                        />
                      </label>
                      <label className={styles.colorModalField}>
                        <span>{t('ds.hexLabel')}</span>
                        <input
                          type="text"
                          value={colorDraft}
                          inputMode="text"
                          autoCapitalize="characters"
                          spellCheck={false}
                          aria-label={t('ds.hexValueLabel')}
                          onChange={(event) => {
                            setColorDraft(event.target.value.toUpperCase());
                            setColorError(null);
                          }}
                        />
                      </label>
                      {colorError ? <p className={styles.colorModalError}>{colorError}</p> : null}
                    </div>
                    <div className={styles.designMdModalBar}>
                      <button
                        type="button"
                        className={styles.moduleAction}
                        disabled={colorSaving || !onColorReset}
                        onClick={() => void resetColorDraft()}
                      >
                        <Icon name={colorSaving ? 'spinner' : 'reload'} size={13} />
                        <span>{colorSaving ? t('ds.saving') : t('ds.reset')}</span>
                      </button>
                      <Button variant="primary" disabled={colorSaving} onClick={() => void saveColorDraft()}>
                        {colorSaving ? t('ds.saving') : t('ds.saveColor')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

// Public entry point: the kit view wrapped in an error boundary so a render
// exception (malformed brand.json, a just-deleted asset, etc.) degrades to a
// recoverable fallback instead of white-screening the whole app.
export function DesignKitView(props: DesignKitViewProps) {
  return (
    <KitErrorBoundary>
      <DesignKitViewInner {...props} />
    </KitErrorBoundary>
  );
}

// Compact "More" overflow dropdown for the sticky header. Renders grouped
// action items (icon + full label) so every action stays legible instead of
// crowding the header as an anonymous icon-only square. Mirrors the
// EntryHelpMenu popover pattern: click-outside + Escape to dismiss.
// Exported so the Design Systems tab can tuck its secondary toolbar actions
// (download / make-default / delete) into the same ⋯ menu.
export function HeaderActionsMenu({
  groups,
  label,
}: {
  groups: HeaderMenuAction[][];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: globalThis.MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const visibleGroups = groups.filter((group) => group.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div className={styles.headerMenu} ref={wrapRef}>
      <button
        type="button"
        className={styles.headerMenuTrigger}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid="design-kit-more-actions"
      >
        <Icon name="more-horizontal" size={16} />
      </button>
      {open ? (
        <div className={styles.headerMenuPopover} role="menu" aria-label={label}>
          {visibleGroups.map((group, groupIndex) => (
            <Fragment key={group[0]?.id ?? groupIndex}>
              {groupIndex > 0 ? <div className={styles.headerMenuDivider} aria-hidden /> : null}
              {group.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role={item.active === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.active === undefined ? undefined : item.active}
                  className={styles.headerMenuItem}
                  disabled={item.disabled || item.loading}
                  aria-busy={item.loading || undefined}
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                >
                  <span className={styles.headerMenuItemIcon} aria-hidden>
                    <Icon name={item.loading ? 'spinner' : item.icon} size={15} />
                  </span>
                  <span className={styles.headerMenuItemLabel}>{item.label}</span>
                  {item.active ? (
                    <span className={styles.headerMenuItemCheck} aria-hidden>
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function normalizeColorInput(hex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return '#000000';
}

function normalizeEditableHex(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toUpperCase();
  }
  return null;
}

interface DesignMdHeadingMatch {
  start: number;
  title: string;
}

interface DesignMdSlice {
  text: string;
  start: number;
  end: number;
  exists: boolean;
}

function designMdModuleSlice(body: string, module: DesignMdModuleSpec): DesignMdSlice {
  const safe = body ?? '';
  const frontmatter = safe.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const contentStart = frontmatter ? frontmatter[0].length : 0;
  const headings = designMdHeadings(safe, contentStart);
  const preambleEnd = headings[0]?.start ?? safe.length;
  const preamble = safe.slice(contentStart, preambleEnd).trim();
  const matchedIndexes = headings
    .map((heading, index) => (designMdHeadingMatches(heading.title, module) ? index : -1))
    .filter((index) => index >= 0);

  if (module.includePreamble && preamble.length > 0) {
    return {
      text: preamble,
      start: contentStart,
      end: preambleEnd,
      exists: true,
    };
  }

  if (matchedIndexes.length > 0) {
    const first = matchedIndexes[0]!;
    const last = matchedIndexes[matchedIndexes.length - 1]!;
    const start = headings[first]!.start;
    const end = headings[last + 1]?.start ?? safe.length;
    return {
      text: safe.slice(start, end).trim(),
      start,
      end,
      exists: true,
    };
  }

  if (module.includePreamble) {
    return {
      text: designMdDefaultModuleText(module, preamble),
      start: contentStart,
      end: preambleEnd,
      exists: false,
    };
  }

  return {
    text: designMdDefaultModuleText(module),
    start: safe.length,
    end: safe.length,
    exists: false,
  };
}

function replaceDesignMdModule(body: string, module: DesignMdModuleSpec, draft: string): string {
  const safe = body ?? '';
  const slice = designMdModuleSlice(safe, module);
  const nextText = normalizeDesignMdModuleDraft(module, draft);
  const before = safe.slice(0, slice.start).trimEnd();
  const after = safe.slice(slice.end).trimStart();
  return [before, nextText, after]
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
    .trimEnd()
    .concat('\n');
}

function designMdHeadings(body: string, startOffset: number): DesignMdHeadingMatch[] {
  return [...body.slice(startOffset).matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => {
    const start = startOffset + (match.index ?? 0);
    return {
      start,
      title: match[1] ?? '',
    };
  });
}

function designMdHeadingMatches(title: string, module: DesignMdModuleSpec): boolean {
  const normalized = title.replace(/^\d+[.)]\s*/, '').trim().toLowerCase();
  return module.keywords.some((keyword) => normalized.includes(keyword));
}

function designMdDefaultModuleText(module: DesignMdModuleSpec, preamble = ''): string {
  if (module.includePreamble) return preamble || `# ${module.heading}\n`;
  return `## ${module.heading}\n\n`;
}

function normalizeDesignMdModuleDraft(module: DesignMdModuleSpec, draft: string): string {
  const trimmed = draft.trim();
  if (module.includePreamble) return trimmed;
  if (!trimmed) return `## ${module.heading}`;
  return /^##\s+/m.test(trimmed) ? trimmed : `## ${module.heading}\n\n${trimmed}`;
}

function TokenChip({ label, hex }: { label: string; hex: string }) {
  return (
    <div className={styles.tok}>
      <span className={styles.tokSwatch} style={{ background: hex }} />
      <span className={styles.tokText}>
        <span className={styles.tokKey}>{label}</span>
        <span className={styles.tokHex}>{hex}</span>
      </span>
    </div>
  );
}

function ValueChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tok}>
      <span className={styles.tokValue}>{value}</span>
      <span className={styles.tokKey}>{label}</span>
    </div>
  );
}

function ExternalGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden>
      <path
        d="M6 3.5h6.5V10M12.5 3.5L6.5 9.5M9 3.5H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExpandGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
      <path
        d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.5 2.5L9 7M2.5 13.5L7 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
