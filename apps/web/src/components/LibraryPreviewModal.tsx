// OD Library — full-size, kind-aware asset preview.
//
// The grid only shows a thumbnail; this modal renders the asset for real:
//   image   → contained <img>
//   video   → <video controls autoplay loop>
//   html /
//   design-system → sandboxed <iframe> (scripts run so captured pages / CSS+JS
//             animations actually move, but it sits in an opaque origin and
//             cannot reach the daemon — matches the rest of the app's
//             untrusted-HTML rendering)
//   font    → live specimen (alphabet + sizes) via an injected @font-face
//   color   → large swatch + the resolved value
//   text    → the raw text in a <pre>
//   url     → the captured link with an open-in-new-tab affordance
//
// Plus a metadata bar (kind / source / dimensions / size / date / tags) and
// prev/next navigation so the user can flip through the grid without closing.
//
// Copy is intentionally inline (not yet i18n-keyed), matching LibrarySection.

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { LibraryAsset } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { libraryAssetElementUrl, libraryAssetFigmaUrl, libraryAssetRawUrl } from '../providers/registry';
import { modalOverlay, modalContent } from '../motion';
import {
  KindIcon,
  SOURCE_LABELS,
  assetTitle,
  badgeKind,
  colorOf,
  elementMetaOf,
  fontFamilyFor,
  formatBytes,
  formatDate,
  kindLabel,
  kindTint,
  originProjectId,
  primarySource,
} from './LibraryAssetMeta';
import styles from './LibraryPreviewModal.module.css';

interface Props {
  asset: LibraryAsset;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onOpenProject?: (projectId: string, fileName?: string) => void;
  /** Turn a captured `html` asset into a new editable OD project (html only). */
  onEditAsPage?: (assetId: string) => Promise<void>;
}

/** Fetch an asset's raw bytes as text (for text / color / url kinds). */
function useRawText(rawUrl: string, enabled: boolean) {
  const [state, setState] = useState<{ text: string | null; loading: boolean; error: boolean }>({
    text: null,
    loading: enabled,
    error: false,
  });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ text: null, loading: true, error: false });
    fetch(rawUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!cancelled) setState({ text, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ text: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [rawUrl, enabled]);
  return state;
}

function FontSpecimen({ asset, rawUrl }: { asset: LibraryAsset; rawUrl: string }) {
  const family = fontFamilyFor(asset.id);
  return (
    <div className={styles.fontStage}>
      {/* Self-contained @font-face so the specimen works even outside the grid. */}
      <style>{`@font-face{font-family:"${family}";src:url("${rawUrl}");font-display:swap;}`}</style>
      <div className={styles.fontSpecimen} style={{ fontFamily: `"${family}", sans-serif` }}>
        <p className={styles.fontHuge}>Ag</p>
        <p className={styles.fontRow}>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
        <p className={styles.fontRow}>abcdefghijklmnopqrstuvwxyz</p>
        <p className={styles.fontRow}>0123456789 &amp; ! ? @ # $ %</p>
        <p className={styles.fontPangram}>The quick brown fox jumps over the lazy dog.</p>
        <p className={styles.fontPangramSm}>The quick brown fox jumps over the lazy dog.</p>
      </div>
    </div>
  );
}

function ColorStage({ asset, rawUrl }: { asset: LibraryAsset; rawUrl: string }) {
  const needsText = !asset.palette?.length;
  const { text, loading } = useRawText(rawUrl, needsText);
  const value = colorOf(asset, text);
  if (loading && !value) return <div className={styles.stageNote}>Loading…</div>;
  if (!value) return <div className={styles.stageNote}>No color value available.</div>;
  const swatches = asset.palette?.length ? asset.palette : [value];
  return (
    <div className={styles.colorStage}>
      <div className={styles.colorHero} style={{ background: value }} />
      <div className={styles.colorInfo}>
        <code className={styles.colorValue}>{value}</code>
        {swatches.length > 1 ? (
          <div className={styles.palette}>
            {swatches.map((c, i) => (
              <span key={`${c}-${i}`} className={styles.paletteChip} style={{ background: c }} title={c} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TextStage({ rawUrl }: { rawUrl: string }) {
  const { text, loading, error } = useRawText(rawUrl, true);
  if (loading) return <div className={styles.stageNote}>Loading…</div>;
  if (error) return <div className={styles.stageNote}>Could not load text.</div>;
  return <pre className={styles.textStage}>{text}</pre>;
}

function UrlStage({ asset, rawUrl }: { asset: LibraryAsset; rawUrl: string }) {
  const needsText = !asset.sourceUrl;
  const { text } = useRawText(rawUrl, needsText);
  const href = asset.sourceUrl || (text ?? '').trim();
  if (!href) return <div className={styles.stageNote}>No link available.</div>;
  return (
    <div className={styles.urlStage}>
      <KindIcon kind="url" size={40} className={styles.urlGlyph} />
      <a className={styles.urlValue} href={href} target="_blank" rel="noreferrer">
        {href}
      </a>
      <a className={styles.urlOpen} href={href} target="_blank" rel="noreferrer">
        Open in new tab →
      </a>
    </div>
  );
}

function Stage({ asset }: { asset: LibraryAsset }) {
  const rawUrl = libraryAssetRawUrl(asset.id);
  const title = assetTitle(asset);
  switch (asset.kind) {
    case 'image':
      return <img className={styles.stageImage} src={rawUrl} alt={title} />;
    case 'video':
      return <video className={styles.stageVideo} src={rawUrl} controls autoPlay loop playsInline />;
    case 'design-system':
    case 'html':
      // Opaque-origin sandbox: scripts/animations run, daemon stays unreachable.
      return <iframe className={styles.stageFrame} src={rawUrl} sandbox="allow-scripts" title={title} />;
    case 'font':
      return <FontSpecimen asset={asset} rawUrl={rawUrl} />;
    case 'color':
      return <ColorStage asset={asset} rawUrl={rawUrl} />;
    case 'url':
      return <UrlStage asset={asset} rawUrl={rawUrl} />;
    case 'text':
    default:
      return <TextStage rawUrl={rawUrl} />;
  }
}

/**
 * Element-pick captures carry `metadata.element`; this surfaces the captured
 * element's selector/size beneath the rendered preview. Current clips are
 * self-contained `html` assets (the stage iframe already renders the element),
 * so there is no separate markup to load — the "Show HTML" affordance only
 * appears for legacy `image` screenshots that still have an `.element.html`
 * sidecar (`element.hasHtml`). Inline-styled so it stays self-contained against
 * the modal's stylesheet.
 */
function ElementPanel({ asset }: { asset: LibraryAsset }) {
  const element = elementMetaOf(asset);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { text, loading, error } = useRawText(libraryAssetElementUrl(asset.id), open && Boolean(element?.hasHtml));
  if (!element) return null;
  const dims = element.width && element.height ? `${element.width}×${element.height}` : null;
  const copy = () => {
    if (!text || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  const chipBtn: CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent, #2563eb)',
    background: 'transparent',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    padding: '3px 9px',
    cursor: 'pointer',
  };
  return (
    <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <KindIcon kind="html" size={13} />
        <code style={{ fontSize: 12, color: 'var(--text-strong, #111827)', background: 'var(--subtle, #f3f4f6)', padding: '2px 6px', borderRadius: 6 }}>
          {element.selector || element.tag}
        </code>
        {dims ? <span style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>{dims}</span> : null}
        {element.hasHtml ? (
          <button type="button" style={{ ...chipBtn, marginLeft: 'auto' }} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide HTML' : 'Show HTML'}
          </button>
        ) : null}
      </div>
      {open && element.hasHtml ? (
        loading ? (
          <div className={styles.stageNote}>Loading…</div>
        ) : error ? (
          <div className={styles.stageNote}>Could not load element HTML.</div>
        ) : (
          <div style={{ position: 'relative' }}>
            <button type="button" style={{ ...chipBtn, position: 'absolute', top: 6, right: 6, background: 'var(--panel, #fff)' }} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <pre
              style={{
                maxHeight: 240,
                overflow: 'auto',
                margin: 0,
                padding: '10px 12px',
                background: 'var(--subtle, #f6f7f9)',
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {text}
            </pre>
          </div>
        )
      ) : null}
    </div>
  );
}

export function LibraryPreviewModal({
  asset,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onDelete,
  onOpenProject,
  onEditAsPage,
}: Props) {
  const [editing, setEditing] = useState(false);
  const editAsPage = useCallback(async () => {
    if (!onEditAsPage) return;
    setEditing(true);
    try {
      await onEditAsPage(asset.id);
    } finally {
      setEditing(false);
    }
  }, [onEditAsPage, asset.id]);
  const src = primarySource(asset);
  const projectId = originProjectId(asset);
  const rawUrl = libraryAssetRawUrl(asset.id);
  const title = assetTitle(asset);
  const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;
  const size = formatBytes(asset.size);
  const date = formatDate(asset.capturedAt);
  // Clipper-captured pages carry an OD Figma capture; only then can we export
  // it as Figma import JSON.
  const hasFigmaCapture =
    asset.kind === 'html' && Boolean((asset.metadata as { figmaCapture?: unknown } | undefined)?.figmaCapture);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext();
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const modal = (
    <motion.div
      className={styles.backdrop}
      onClick={onClose}
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="presentation"
    >
      <motion.div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        variants={modalContent}
        initial="hidden"
        animate="visible"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.head}>
          <span className={styles.kindBadge} style={{ ['--kind-tint' as string]: kindTint(badgeKind(asset)) }}>
            <KindIcon kind={badgeKind(asset)} size={13} />
            {kindLabel(badgeKind(asset))}
          </span>
          <span className={styles.headTitle} title={title}>
            {title}
          </span>
          {src ? <span className={styles.headSource}>{SOURCE_LABELS[src]}</span> : null}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close preview">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className={styles.stage}>
          {hasPrev ? (
            <button type="button" className={`${styles.nav} ${styles.navPrev}`} onClick={onPrev} aria-label="Previous asset">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          <div className={styles.stageInner} key={asset.id}>
            <Stage asset={asset} />
          </div>
          {hasNext ? (
            <button type="button" className={`${styles.nav} ${styles.navNext}`} onClick={onNext} aria-label="Next asset">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ) : null}
        </div>

        <ElementPanel asset={asset} />

        <footer className={styles.foot}>
          <div className={styles.facts}>
            {dims ? <span>{dims}</span> : null}
            {size ? <span>{size}</span> : null}
            {asset.mime ? <span>{asset.mime}</span> : null}
            {date ? <span>{date}</span> : null}
            {asset.tags?.slice(0, 4).map((tag) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </div>
          <div className={styles.actions}>
            {asset.kind === 'html' && onEditAsPage ? (
              <Button onClick={() => void editAsPage()} disabled={editing}>
                {editing ? 'Opening…' : 'Edit as page'}
              </Button>
            ) : null}
            {projectId && onOpenProject ? (
              <Button variant="ghost" onClick={() => onOpenProject(projectId)}>
                Open project
              </Button>
            ) : null}
            {asset.sourceUrl ? (
              <a className={styles.linkAction} href={asset.sourceUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            ) : null}
            {hasFigmaCapture ? (
              <a
                className={styles.linkAction}
                href={libraryAssetFigmaUrl(asset.id)}
                download
                title="Download Figma import JSON — rebuild it with the OD Figma Import plugin"
              >
                Download Figma JSON
              </a>
            ) : null}
            <a className={styles.linkAction} href={rawUrl} target="_blank" rel="noreferrer" download>
              Download
            </a>
            <button type="button" className={styles.removeAction} onClick={() => onDelete(asset.id)}>
              Remove
            </button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
