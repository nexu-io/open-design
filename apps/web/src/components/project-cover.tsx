import { useEffect, useState } from 'react';
import { projectFileUrl } from '../providers/registry';
import type { ProjectFile } from '../types';

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
