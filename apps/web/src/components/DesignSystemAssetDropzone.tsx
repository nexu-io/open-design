// Rich "Add files" zone for the design-system creation flow.
//
// Replaces the generic text-only DropZone for the assets row with a real,
// tactile surface:
//   - drag & drop  (directory-aware; the parent reads the DataTransfer)
//   - click to browse
//   - paste (Cmd/Ctrl+V image/file content from the clipboard)
//   - gated "Select from library" affordance when the Library UI is visible
//   - a thumbnail grid with remove + click-to-enlarge preview
//
// Every staged file is previewable — not just images. The grid renders a
// type-appropriate thumbnail (image, font sample, video poster, HTML mini
// render, or a typed glyph) and clicking any tile opens a kind-aware lightbox
// (image, PDF, HTML, video, audio, font specimen, or a text snippet).
//
// The component is presentational over `files: File[]` (the parent's
// `assetFileObjects`); all staging/dedup/limits live in the parent so the
// generic upload path and this one stay in lockstep.

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import { Icon, type IconName } from './Icon';
import styles from './DesignSystemAssetDropzone.module.css';

interface Props {
  /** Currently staged asset File objects (the parent's `assetFileObjects`). */
  files: File[];
  /** Flat files chosen via click or paste; the parent filters + stages them. */
  onAddFiles: (files: File[]) => void;
  /** A native drop — the parent reads it (directory-aware) then stages. */
  onDrop: (dataTransfer: DataTransfer) => void;
  /** Remove one staged file (matched by reference). */
  onRemove: (file: File) => void;
  /** Open the "Select from library" picker. */
  onSelectFromLibrary?: () => void;
}

// The preview families we can render meaningfully in-browser. Anything else
// falls back to a typed glyph + filename so it still reads as a real file
// (not a blank "FILE" box) and still opens a name/size card in the lightbox.
type FileKind =
  | 'image'
  | 'font'
  | 'pdf'
  | 'html'
  | 'video'
  | 'audio'
  | 'slides'
  | 'text'
  | 'other';

const KIND_BY_EXT: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  svg: 'image', avif: 'image', bmp: 'image', ico: 'image', apng: 'image',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font', eot: 'font',
  pdf: 'pdf',
  html: 'html', htm: 'html',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  ppt: 'slides', pptx: 'slides', key: 'slides', odp: 'slides',
  txt: 'text', md: 'text', markdown: 'text', json: 'text', csv: 'text',
  css: 'text', js: 'text', jsx: 'text', ts: 'text', tsx: 'text',
  xml: 'text', yml: 'text', yaml: 'text', toml: 'text',
};

function extOf(file: File): string {
  return (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? '').toLowerCase();
}

function fileKind(file: File): FileKind {
  const type = file.type.toLowerCase();
  const ext = extOf(file);
  // MIME first (it's authoritative when present), then extension as the
  // fallback for files the browser typed as application/octet-stream.
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'text/html') return 'html';
  if (type.startsWith('font/')) return 'font';
  if (type.startsWith('text/')) return 'text';
  return KIND_BY_EXT[ext] ?? 'other';
}

// Kinds we can render straight from an object URL (blob:). Fonts also need a
// URL (FontFace loads from one); text is read with FileReader instead.
function needsObjectUrl(kind: FileKind): boolean {
  return (
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'pdf' ||
    kind === 'html' ||
    kind === 'font'
  );
}

const GLYPH_ICON: Record<FileKind, IconName> = {
  image: 'image',
  font: 'file',
  pdf: 'file',
  html: 'file-code',
  video: 'play',
  audio: 'volume',
  slides: 'present',
  text: 'file-code',
  other: 'file',
};

/** Object URL for a file preview, or null where unavailable (e.g. jsdom). */
function createPreviewUrl(file: File): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function revokePreviewUrl(url: string): void {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    /* no-op */
  }
}

function fileExt(file: File): string {
  return (extOf(file) || 'file').toUpperCase().slice(0, 4);
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A stable key for a staged File (name + size + mtime is collision-safe here). */
function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** CSS-safe, collision-resistant @font-face family name for a staged font. */
function fontFamilyName(file: File, index: number): string {
  const slug = file.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return `od-asset-font-${index}-${slug || 'font'}`;
}

function isEditableTarget(node: EventTarget | null): boolean {
  const el = node as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}

const FONT_SPECIMEN = 'Ag';
const FONT_PANGRAM = 'The quick brown fox jumps over the lazy dog 0123456789';

export function DesignSystemAssetDropzone({
  files,
  onAddFiles,
  onDrop,
  onRemove,
  onSelectFromLibrary,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<File | null>(null);

  // Object URLs for previews. Creation and revocation MUST be paired inside one
  // `files`-keyed effect: the cleanup revokes exactly the URLs its own setup
  // created. This is the StrictMode-safe shape. The previous split — create in a
  // useMemo, revoke in a separate empty-deps cleanup — broke any preview staged
  // at first mount: StrictMode's simulated unmount fired the cleanup and revoked
  // the URLs, then the remount left the memo (deps unchanged) handing back those
  // now-dead blob: links. That is exactly the Library "create design system"
  // hand-off, where assets are present before the user touches the dropzone, so
  // its thumbnails rendered as broken images.
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    const next = new Map<File, string>();
    for (const file of files) {
      if (!needsObjectUrl(fileKind(file))) continue;
      const url = createPreviewUrl(file);
      if (url) next.set(file, url);
    }
    setPreviews(next);
    return () => {
      for (const url of next.values()) revokePreviewUrl(url);
    };
  }, [files]);

  // Load each staged font via the FontFace API so its thumbnail + lightbox can
  // render a real specimen in the brand's typeface. Registered faces are removed
  // on cleanup so re-staging never leaks families into document.fonts.
  const [fontFamilies, setFontFamilies] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
      return undefined;
    }
    let cancelled = false;
    const ready = new Map<File, string>();
    const registered: FontFace[] = [];
    files.forEach((file, index) => {
      if (fileKind(file) !== 'font') return;
      const url = previews.get(file);
      if (!url) return;
      const family = fontFamilyName(file, index);
      try {
        const face = new FontFace(family, `url(${url})`);
        registered.push(face);
        void face
          .load()
          .then((loaded) => {
            if (cancelled) return;
            document.fonts.add(loaded);
            ready.set(file, family);
            setFontFamilies(new Map(ready));
          })
          .catch(() => {
            /* unreadable / unsupported font — falls back to the glyph */
          });
      } catch {
        /* FontFace construction failed — glyph fallback */
      }
    });
    return () => {
      cancelled = true;
      for (const face of registered) {
        try {
          document.fonts.delete(face);
        } catch {
          /* no-op */
        }
      }
    };
  }, [files, previews]);

  // Read a bounded slice of each text-like file for a snippet thumbnail + a
  // scrollable lightbox preview. Capped so a large JSON/CSS never blocks.
  const [texts, setTexts] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    const pending = files.filter((file) => fileKind(file) === 'text');
    if (pending.length === 0) {
      setTexts(new Map());
      return undefined;
    }
    let cancelled = false;
    const next = new Map<File, string>();
    void Promise.all(
      pending.map(async (file) => {
        try {
          const slice = typeof file.slice === 'function' ? file.slice(0, 16 * 1024) : file;
          const text = await slice.text();
          next.set(file, text);
        } catch {
          /* unreadable — lightbox shows the name/size fallback */
        }
      }),
    ).then(() => {
      if (!cancelled) setTexts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [files]);

  // Paste anywhere on the page routes image/file clipboard content into the
  // asset zone — unless focus is in a text field (brand description / notes),
  // where a normal text paste must win.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (pasted.length === 0) return;
      event.preventDefault();
      onAddFiles(pasted);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onAddFiles]);

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return undefined;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setLightbox(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (picked.length > 0) onAddFiles(picked);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    onDrop(event.dataTransfer);
  }

  function handleZoneKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  }

  function renderGlyph(file: File, kind: FileKind) {
    return (
      <span className={styles.glyph} data-kind={kind}>
        <Icon name={GLYPH_ICON[kind]} size={20} />
        <span className={styles.ext}>{fileExt(file)}</span>
      </span>
    );
  }

  function renderThumb(file: File, kind: FileKind) {
    const url = previews.get(file);
    if (kind === 'image' && url) {
      return <img src={url} alt="" className={styles.thumb} loading="lazy" />;
    }
    if (kind === 'video' && url) {
      return (
        <video
          className={styles.thumb}
          src={url}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
        />
      );
    }
    if (kind === 'font') {
      const family = fontFamilies.get(file);
      if (family) {
        return (
          <span className={styles.fontThumb} style={{ fontFamily: `'${family}'` }} aria-hidden>
            {FONT_SPECIMEN}
          </span>
        );
      }
    }
    if (kind === 'html' && url) {
      return (
        <span className={styles.frameThumb} aria-hidden>
          <iframe className={styles.htmlThumb} src={url} title="" sandbox="" tabIndex={-1} />
        </span>
      );
    }
    if (kind === 'text') {
      const snippet = texts.get(file);
      if (snippet && snippet.trim()) {
        return (
          <span className={styles.textThumb} aria-hidden>
            {snippet.slice(0, 360)}
          </span>
        );
      }
    }
    return renderGlyph(file, kind);
  }

  function renderLightbox(file: File, kind: FileKind) {
    const url = previews.get(file);
    if (kind === 'image' && url) {
      return <img src={url} alt={file.name} className={styles.lightboxImg} />;
    }
    if (kind === 'video' && url) {
      return <video src={url} className={styles.lightboxVideo} controls autoPlay playsInline />;
    }
    if (kind === 'audio' && url) {
      return (
        <div className={styles.lightboxAudio}>
          <span className={styles.lightboxAudioIcon}>
            <Icon name="volume" size={34} />
          </span>
          <audio src={url} controls className={styles.lightboxAudioPlayer} />
        </div>
      );
    }
    if (kind === 'pdf' && url) {
      return <iframe src={url} className={styles.lightboxFrame} title={file.name} />;
    }
    if (kind === 'html' && url) {
      return (
        <iframe
          src={url}
          className={styles.lightboxFrame}
          title={file.name}
          sandbox="allow-scripts allow-popups"
        />
      );
    }
    if (kind === 'font') {
      const family = fontFamilies.get(file);
      if (family) {
        return (
          <div className={styles.lightboxFont} style={{ fontFamily: `'${family}'` }}>
            <div className={styles.lightboxFontHero}>{FONT_SPECIMEN}Bb Cc</div>
            <div className={styles.lightboxFontPangram}>{FONT_PANGRAM}</div>
            <div className={styles.lightboxFontScale}>
              <span style={{ fontSize: 13 }}>{FONT_PANGRAM}</span>
              <span style={{ fontSize: 18 }}>{FONT_PANGRAM}</span>
              <span style={{ fontSize: 26 }}>{FONT_PANGRAM}</span>
            </div>
          </div>
        );
      }
    }
    if (kind === 'text') {
      const snippet = texts.get(file);
      if (snippet != null) {
        return <pre className={styles.lightboxText}>{snippet || '(empty file)'}</pre>;
      }
    }
    return (
      <div className={styles.lightboxFallback}>
        <span className={styles.lightboxFallbackGlyph} data-kind={kind}>
          <Icon name={GLYPH_ICON[kind]} size={40} />
        </span>
        <p className={styles.lightboxFallbackName}>{file.name}</p>
        <p className={styles.lightboxFallbackMeta}>
          {fileExt(file)} · {formatBytes(file.size) || '—'}
        </p>
        <p className={styles.lightboxFallbackHint}>No inline preview for this file type.</p>
      </div>
    );
  }

  const lightboxKind = lightbox ? fileKind(lightbox) : null;

  return (
    <div className={styles.root}>
      <div
        className={`${styles.drop}${dragOver ? ` ${styles.dropActive}` : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Add files — drag and drop, paste, or click to browse"
        data-testid="ds-asset-dropzone"
        onClick={openPicker}
        onKeyDown={handleZoneKey}
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className={styles.input}
          onChange={handleInput}
        />
        <span className={styles.dropIcon}>
          <Icon name="upload" size={19} />
        </span>
        <span className={styles.dropTitle}>
          Drag &amp; drop, paste, or <span className={styles.dropLink}>browse</span>
        </span>
        <span className={styles.dropHint}>
          Images, fonts, logos, PDF, slides, HTML — up to 12 MB each
        </span>
      </div>

      {LIBRARY_UI_VISIBLE && onSelectFromLibrary ? (
        <div className={styles.alt}>
          <span className={styles.altText}>or reuse an asset you’ve already saved</span>
          <button
            type="button"
            className={styles.libraryBtn}
            data-testid="ds-asset-library"
            onClick={onSelectFromLibrary}
          >
            <Icon name="layers-filled" size={14} />
            Select from library
          </button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className={styles.grid} aria-label="Staged assets">
          {files.map((file) => {
            const kind = fileKind(file);
            return (
              <li key={fileKey(file)} className={styles.tile}>
                <button
                  type="button"
                  className={styles.tileMain}
                  onClick={() => setLightbox(file)}
                  title={file.name}
                >
                  {renderThumb(file, kind)}
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemove(file)}
                >
                  <Icon name="close" size={12} />
                </button>
                <span className={styles.caption} title={file.name}>
                  {file.name}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {lightbox && lightboxKind
        ? createPortal(
            <div className={styles.lightbox} onClick={() => setLightbox(null)} role="presentation">
              <div
                className={styles.lightboxInner}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={lightbox.name}
              >
                <div className={styles.lightboxStage} data-kind={lightboxKind}>
                  {renderLightbox(lightbox, lightboxKind)}
                </div>
                <div className={styles.lightboxBar}>
                  <span className={styles.lightboxName} title={lightbox.name}>
                    {lightbox.name}
                  </span>
                  <span className={styles.lightboxMeta}>{formatBytes(lightbox.size)}</span>
                  <button
                    type="button"
                    className={styles.lightboxClose}
                    onClick={() => setLightbox(null)}
                    aria-label="Close preview"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
