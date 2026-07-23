import { useCallback, useEffect, useRef, useState } from 'react';
import { projectFileUrl } from '../providers/registry';
import type { ProjectFile } from '../types';
import { parseDeckThumbnails, type ParsedDeckThumbnails } from '../runtime/deck-thumbnail-parser';
import { DeckSlideThumbnail } from './DeckSlideThumbnail';

export type ProjectCoverKind = 'html' | 'image' | 'video' | 'logo';

export interface ProjectCoverOverride {
  kind: ProjectCoverKind;
  name: string;
  mtime?: number;
}

export function coverFromProjectFile(
  file: ProjectFile,
  kind: ProjectCoverKind = file.kind as ProjectCoverKind,
): ProjectCoverOverride | null {
  if (kind !== 'html' && kind !== 'image' && kind !== 'video' && kind !== 'logo') return null;
  return { kind, name: file.path ?? file.name, mtime: file.mtime };
}

export function selectProjectFileCover(files: ProjectFile[]): ProjectCoverOverride | null {
  const html =
    files.find((file) => (file.path ?? file.name) === 'index.html') ??
    files
      .filter((file) => file.kind === 'html')
      .sort((a, b) => b.mtime - a.mtime)[0];
  if (html) return coverFromProjectFile(html, 'html');

  const image = files
    .filter((file) => file.kind === 'image')
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (image) return coverFromProjectFile(image, 'image');

  const video = files
    .filter((file) => file.kind === 'video')
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (video) return coverFromProjectFile(video, 'video');

  return null;
}

export function projectCoverUrl(projectId: string, name: string, version?: number): string {
  const url = projectFileUrl(projectId, name);
  if (!Number.isFinite(version) || version === undefined || version <= 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(Math.trunc(version)))}`;
}

export function HtmlProjectCoverFrame({
  src,
  initial,
  iframeClassName,
  glyphClassName,
  diagnostic,
}: {
  src: string | undefined;
  initial: string;
  iframeClassName: string;
  glyphClassName: string;
  diagnostic: string;
}) {
  const [failed, setFailed] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!src) {
      setFailed(false);
      setVerified(false);
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    setFailed(false);
    setVerified(false);

    fetch(src, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (disposed) return;
        if (response.ok || response.status === 304) {
          setVerified(true);
          return;
        }
        console.warn(
          `[project-cover] HTML cover unavailable (${response.status} ${response.statusText}):`,
          diagnostic,
        );
        setFailed(true);
      })
      .catch((err) => {
        if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.warn('[project-cover] failed to verify HTML cover:', diagnostic, err);
        setFailed(true);
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [src, diagnostic]);

  if (!src || failed || !verified) {
    return <span className={glyphClassName}>{initial}</span>;
  }

  return (
    <iframe
      className={iframeClassName}
      src={src}
      title=""
      loading="lazy"
      sandbox="allow-scripts"
      tabIndex={-1}
      onError={() => {
        console.warn('[project-cover] failed to load HTML cover:', diagnostic);
        setFailed(true);
      }}
    />
  );
}

// Deck (slide) project cover: render the first slide as inert DOM via
// `DeckSlideThumbnail` so the gallery card shows a clean static preview without
// the deck's carousel nav chrome (prev/next buttons, slide counter) that the
// raw `index.html` iframe would paint. Falls back to the plain HTML iframe
// when the deck source can't be parsed, and to the project glyph when the file
// is unreachable. See issue #2648.
export function DeckProjectCoverFrame({
  src,
  initial,
  iframeClassName,
  glyphClassName,
  diagnostic,
}: {
  src: string | undefined;
  initial: string;
  iframeClassName: string;
  glyphClassName: string;
  diagnostic: string;
}) {
  // Explicit three-state model so the raw-iframe fallback never mounts while
  // the deck GET/parse is still pending. While loading we render the same glyph
  // the card would show for an unknown cover — never `HtmlProjectCoverFrame`,
  // which would fire a redundant HEAD probe and could mount the raw
  // `index.html` iframe (with the carousel chrome this change removes) if that
  // probe resolves before the deck body finishes parsing. The iframe only
  // mounts once parsing or shadow rendering has explicitly failed.
  const [phase, setPhase] = useState<'loading' | 'parsed' | 'fallback'>('loading');
  const [parsed, setParsed] = useState<ParsedDeckThumbnails | null>(null);
  const [shadowFailed, setShadowFailed] = useState(false);
  // Visibility gate: DesignsTab mounts one cover per item without
  // virtualization, so eagerly fetching + DOMParser-parsing every deck's full
  // index.html (including cards far below the fold) is a regression vs the old
  // iframe path, which had loading="lazy" and only a HEAD probe. We defer the
  // full-body fetch until the cover scrolls near the viewport.
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLSpanElement | null>(null);

  // Stable identity so DeckSlideThumbnail's layout-effect (which clears and
  // rebuilds the shadow root when its deps change) doesn't tear down a healthy
  // preview on unrelated parent rerenders. Mirrors DeckThumbnailRail's
  // handleShadowError.
  const handleShadowError = useCallback(() => setShadowFailed(true), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      // No observer available (e.g. jsdom) — fall back to fetching eagerly.
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!src || !visible) {
      if (!src) {
        setPhase('loading');
        setParsed(null);
        setShadowFailed(false);
      }
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    setPhase('loading');
    setParsed(null);
    setShadowFailed(false);

    fetch(src, { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (disposed) return;
        if (!response.ok && response.status !== 304) {
          console.warn(
            `[project-cover] deck cover unavailable (${response.status} ${response.statusText}):`,
            diagnostic,
          );
          setPhase('fallback');
          return;
        }
        return response.text();
      })
      .then((html) => {
        if (disposed) return;
        // Empty body (e.g. a 304 with no body, or a zero-byte 200) means
        // parsing definitively finished with nothing to render — go to the
        // raw-iframe fallback rather than leaving the card stuck in loading.
        if (!html) {
          setPhase('fallback');
          return;
        }
        const result = parseDeckThumbnails(html, src);
        if (!result.renderable || result.slides.length === 0) {
          // Unparseable deck source — fall back to the raw HTML iframe.
          setPhase('fallback');
          return;
        }
        setParsed(result);
        setPhase('parsed');
      })
      .catch((err) => {
        if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.warn('[project-cover] failed to fetch deck cover:', diagnostic, err);
        setPhase('fallback');
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [src, diagnostic, visible]);

  // Before the cover is visible (IntersectionObserver hasn't fired), it stays
  // in the glyph/loading phase — no fetch, no iframe. The glyph span carries
  // the observer ref; once visible flips true the observer disconnects and the
  // fetch effect below takes over, so the ref is only needed on this branch.
  if (!src || !visible || phase === 'loading') {
    return (
      <span ref={hostRef} className={glyphClassName}>
        {initial}
      </span>
    );
  }

  // Deck parsed and shadow rendering hasn't errored → inert first-slide
  // thumbnail (no carousel chrome). If the shadow build later fails, the
  // onError callback flips us to the iframe fallback.
  if (phase === 'parsed' && parsed && !shadowFailed) {
    return (
      // DeckSlideThumbnail scales its shadow canvas to its host div's
      // clientWidth/clientHeight, so the host must fill the card thumb. The
      // shared thumb-iframe classes carry raw-iframe scale transforms that
      // would distort a plain div, so this uses a dedicated fill wrapper.
      <div className="deck-cover-frame" aria-hidden>
        <DeckSlideThumbnail
          parsed={parsed}
          index={0}
          onError={handleShadowError}
        />
      </div>
    );
  }

  // Explicit failure: unparseable source, empty body, fetch error, or
  // shadow-render error → raw HTML iframe (previous behavior).
  return (
    <HtmlProjectCoverFrame
      src={src}
      initial={initial}
      iframeClassName={iframeClassName}
      glyphClassName={glyphClassName}
      diagnostic={diagnostic}
    />
  );
}
