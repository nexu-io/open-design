import { useEffect, useState } from 'react';
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
  const [failed, setFailed] = useState(false);
  const [parsed, setParsed] = useState<ParsedDeckThumbnails | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setFailed(false);
      setParsed(null);
      setThumbFailed(false);
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    setFailed(false);
    setParsed(null);
    setThumbFailed(false);

    fetch(src, { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (disposed) return;
        if (!response.ok && response.status !== 304) {
          console.warn(
            `[project-cover] deck cover unavailable (${response.status} ${response.statusText}):`,
            diagnostic,
          );
          setFailed(true);
          return;
        }
        return response.text();
      })
      .then((html) => {
        if (disposed || !html) return;
        const result = parseDeckThumbnails(html, src);
        if (!result.renderable || result.slides.length === 0) {
          // Unparseable deck source — fall back to the raw HTML iframe.
          setThumbFailed(true);
          return;
        }
        setParsed(result);
      })
      .catch((err) => {
        if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.warn('[project-cover] failed to fetch deck cover:', diagnostic, err);
        setFailed(true);
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [src, diagnostic]);

  // Source unreachable or no deck markup at all → project glyph.
  if (!src || failed) {
    return <span className={glyphClassName}>{initial}</span>;
  }

  // Deck parsed and renderable → inert first-slide thumbnail (no carousel chrome).
  if (parsed && !thumbFailed) {
    return (
      <DeckSlideThumbnail
        parsed={parsed}
        index={0}
        onError={() => setThumbFailed(true)}
      />
    );
  }

  // Fallback: parse failed or thumbnail errored → raw HTML iframe (current behavior).
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
