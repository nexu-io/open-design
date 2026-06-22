// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { fetchProjectFiles, projectFileUrl } from '../providers/registry';
import type { DesignSystemSummary, Project, ProjectDisplayStatus, ProjectFile } from '../types';
import { Icon } from './Icon';
import { STATUS_LABEL_KEYS } from './DesignsTab';
import { isDesignSystemProject, isPublishedDesignSystemProject } from './design-system-project';

interface Props {
  projects: Project[];
  /** Used only to show a "Published" status for design-system projects whose
   *  backing system is published (independent of the project's run status). */
  designSystems?: DesignSystemSummary[];
  /** Retained for call-site compatibility; the strip skips rendering
   *  while the list is loading so we never need a loading state. */
  loading?: boolean;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  limit?: number;
}

const EMPTY_DESIGN_SYSTEMS: DesignSystemSummary[] = [];

const DECK_PREVIEW_WIDTH = 1280;
const DECK_PREVIEW_HEIGHT = 720;
const deckCoverCache = new Map<string, string>();
const deckCoverInflight = new Map<string, Promise<string>>();

export function RecentProjectsStrip({
  projects,
  designSystems = EMPTY_DESIGN_SYSTEMS,
  onOpen,
  onViewAll,
  limit = 6,
}: Props) {
  const t = useT();
  const recent = useMemo(
    () => [...projects]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit),
    [projects, limit],
  );
  const [coverByProject, setCoverByProject] = useState<
    Record<string, { kind: 'html' | 'image' | 'video' | 'logo'; name: string } | null>
  >({});

  useEffect(() => {
    let cancelled = false;
    if (recent.length === 0) {
      setCoverByProject({});
      return;
    }

    void Promise.all(
      recent.map(async (project) => {
        const designSystemProject = isDesignSystemProject(project);
        if (project.metadata?.entryFile && !designSystemProject) return [project.id, null] as const;
        let files: Awaited<ReturnType<typeof fetchProjectFiles>>;
        try {
          files = await fetchProjectFiles(project.id);
        } catch {
          return [project.id, null] as const;
        }
        if (designSystemProject) {
          const logo = findDesignSystemLogoFile(files);
          if (logo) {
            return [
              project.id,
              { kind: 'logo' as const, name: logo.path ?? logo.name },
            ] as const;
          }
          return [project.id, null] as const;
        }
        const html =
          files.find((file) => (file.path ?? file.name) === 'index.html') ??
          files
            .filter((file) => file.kind === 'html')
            .sort((a, b) => b.mtime - a.mtime)[0];
        if (html) {
          return [
            project.id,
            { kind: 'html' as const, name: html.path ?? html.name },
          ] as const;
        }
        const image = files
          .filter((file) => file.kind === 'image')
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (image) {
          return [
            project.id,
            { kind: 'image' as const, name: image.path ?? image.name },
          ] as const;
        }
        const video = files
          .filter((file) => file.kind === 'video')
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (video) {
          return [
            project.id,
            { kind: 'video' as const, name: video.path ?? video.name },
          ] as const;
        }
        return [project.id, null] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setCoverByProject(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [recent]);

  // First-run home shouldn't reserve space for an empty "Recent
  // projects" rail — the dashed empty box just adds visual noise
  // above the plugin gallery. We also skip rendering during the
  // load window so the section doesn't pop in and then collapse;
  // the prompt hero is enough chrome on its own.
  if (recent.length === 0) {
    return null;
  }

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      <header className="recent-projects__head">
        <h2 className="recent-projects__title">{t('recentProjects.title')}</h2>
        <button
          type="button"
          className="recent-projects__view-all"
          onClick={onViewAll}
          data-testid="recent-projects-view-all"
        >
          <span>{t('recentProjects.viewAll')}</span>
          <Icon name="chevron-right" size={12} />
        </button>
      </header>
      <div className="recent-projects__row" role="list">
        {recent.map((project) => {
          const cover = projectCover(project, coverByProject[project.id] ?? null);
          const designSystemProject = isDesignSystemProject(project);
          const status: ProjectDisplayStatus = project.status?.value ?? 'not_started';
          const publishedDesignSystem = isPublishedDesignSystemProject(project, designSystems);
          const isActive =
            !publishedDesignSystem &&
            (status === 'running' || status === 'queued' || status === 'awaiting_input');
          return (
            <button
              key={project.id}
              type="button"
              role="listitem"
              className={`recent-projects__card${designSystemProject ? ' is-design-system-project' : ''}`}
              onClick={() => onOpen(project.id)}
              title={project.name}
              data-project-id={project.id}
            >
              <div
                className={`recent-projects__card-thumb recent-projects__card-thumb-${cover.kind}`}
                style={cover.style}
                aria-hidden
              >
                {(cover.kind === 'image' || cover.kind === 'logo') && cover.src ? (
                  <img
                    className="recent-projects__thumb-media"
                    src={cover.src}
                    alt=""
                    loading="lazy"
                  />
                ) : cover.kind === 'video' && cover.src ? (
                  <video
                    className="recent-projects__thumb-media"
                    src={cover.src}
                    muted
                    preload="metadata"
                    playsInline
                  />
                ) : cover.kind === 'html' && cover.src ? (
                  <RecentProjectHtmlThumb
                    src={cover.src}
                    deckCoverOnly={project.metadata?.kind === 'deck'}
                  />
                ) : (
                  <span className="recent-projects__card-glyph">{cover.initial}</span>
                )}
              </div>
              <div className="recent-projects__card-meta">
                <div className="design-card-tag-row">
                  {designSystemProject ? (
                    <DesignSystemProjectTag />
                  ) : (
                    <ProjectTag category={projectCategory(project)} />
                  )}
                </div>
                <div className="recent-projects__card-name">{project.name}</div>
                <div className="recent-projects__card-time">
                  <span
                    className={`recent-projects__card-status recent-projects__card-status-${publishedDesignSystem ? 'published' : status}`}
                  >
                    {isActive ? (
                      <span className="recent-projects__card-status-dot" aria-hidden />
                    ) : null}
                    {publishedDesignSystem ? t('designs.status.published') : statusLabel(status, t)}
                  </span>
                  <span className="recent-projects__card-sep" aria-hidden>·</span>
                  {relativeTime(project.updatedAt, t)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecentProjectHtmlThumb({
  src,
  deckCoverOnly,
}: {
  src: string;
  deckCoverOnly: boolean;
}) {
  if (!deckCoverOnly) {
    return (
      <iframe
        className="recent-projects__thumb-iframe"
        src={src}
        title=""
        loading="lazy"
        sandbox="allow-scripts"
        tabIndex={-1}
      />
    );
  }

  return <DeckCoverThumb src={src} />;
}

function DeckCoverThumb({ src }: { src: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(() => deckCoverCache.get(src) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = deckCoverCache.get(src);
    if (cached) {
      setSrcDoc(cached);
      return;
    }
    setSrcDoc(null);
    loadDeckCover(src)
      .then((next) => {
        if (!cancelled) setSrcDoc(next);
      })
      .catch(() => {
        if (cancelled) return;
        setSrcDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / DECK_PREVIEW_WIDTH, rect.height / DECK_PREVIEW_HEIGHT));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="recent-projects__deck-frame"
      style={{ '--recent-deck-scale': scale } as CSSProperties}
      aria-hidden
    >
      {srcDoc ? (
        <iframe
          className="recent-projects__deck-iframe"
          srcDoc={srcDoc}
          title=""
          loading="lazy"
          sandbox=""
          tabIndex={-1}
        />
      ) : (
        <span className="recent-projects__deck-cover-loading" aria-hidden />
      )}
    </div>
  );
}

async function loadDeckCover(src: string): Promise<string> {
  const cached = deckCoverCache.get(src);
  if (cached) return cached;
  const existing = deckCoverInflight.get(src);
  if (existing) return existing;
  const run = fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load project cover: ${res.status}`);
      return res.text();
    })
    .then((html) => {
      const parsed = deckPreviewSrcDoc(html);
      deckCoverCache.set(src, parsed);
      deckCoverInflight.delete(src);
      return parsed;
    })
    .catch((error) => {
      deckCoverInflight.delete(src);
      throw error;
    });
  deckCoverInflight.set(src, run);
  return run;
}

function deckPreviewSrcDoc(html: string): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
  const style = `<style id="od-recent-deck-real-preview">
    html,
    body {
      margin: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
    }
    body {
      display: block !important;
      scroll-snap-type: none !important;
    }
    .slide,
    section[data-slide],
    section[data-screen-label] {
      position: absolute !important;
      inset: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      flex: none !important;
      scroll-snap-align: none !important;
    }
    .slide:not(:first-of-type),
    section[data-slide]:not(:first-of-type),
    section[data-screen-label]:not(:first-of-type),
    .deck-counter,
    .deck-controls,
    .deck-hint,
    .deck-page-controls,
    .deck-pager,
    .deck-progress,
    .deck-nav,
    .deck-navigation,
    .page-controls,
    .page-flip-controls,
    .page-nav,
    .page-navigation,
    .pagination-control,
    .pagination-controls,
    #deck-prev,
    #deck-next,
    #deck-cur,
    #deck-total,
    [data-deck-controls],
    [data-page-controls],
    [data-pagination],
    [aria-label="Previous slide"],
    [aria-label="Next slide"],
    [aria-label="Deck navigation"],
    [aria-label="Page navigation"],
    [aria-label="Pagination"],
    nav[aria-label*="page" i],
    nav[aria-label*="pagination" i] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>`;
  return injectBefore(withoutScripts, '</head>', style);
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function statusLabel(
  status: ProjectDisplayStatus,
  t: ReturnType<typeof useT>,
): string {
  return t(STATUS_LABEL_KEYS[status]);
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}

function projectCover(
  project: Project,
  override: { kind: 'html' | 'image' | 'video' | 'logo'; name: string } | null,
): {
  kind: 'image' | 'video' | 'html' | 'logo' | 'fallback';
  src?: string;
  style: CSSProperties;
  initial: string;
} {
  let h = 0;
  for (let i = 0; i < project.id.length; i += 1) {
    h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  const style: CSSProperties = {
    background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
  };
  const trimmed = project.name.trim();
  const initial = (trimmed ? Array.from(trimmed)[0]! : '?').toUpperCase();
  if (override) {
    return {
      kind: override.kind,
      src: projectFileUrl(project.id, override.name),
      style,
      initial,
    };
  }
  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry) {
    const src = projectFileUrl(project.id, entry);
    if (meta?.kind === 'image') return { kind: 'image', src, style, initial };
    if (meta?.kind === 'video') return { kind: 'video', src, style, initial };
    if (/\.html?$/i.test(entry)) return { kind: 'html', src, style, initial };
  }
  return { kind: 'fallback', style, initial };
}

type ProjectCategory = 'prototype' | 'live-artifact' | 'slide' | 'media' | 'brand';

function projectCategory(project: Project): ProjectCategory {
  const meta = project.metadata;
  if (meta?.intent === 'live-artifact' || project.skillId === 'live-artifact') {
    return 'live-artifact';
  }
  if (meta?.kind === 'deck') return 'slide';
  if (meta?.kind === 'brand') return 'brand';
  if (meta?.kind === 'image' || meta?.kind === 'video' || meta?.kind === 'audio') {
    return 'media';
  }
  return 'prototype';
}

function ProjectTag({ category }: { category: ProjectCategory }) {
  const t = useT();
  const label =
    category === 'live-artifact'
      ? t('designs.tagLiveArtifact')
      : category === 'slide'
        ? t('designs.tagSlide')
        : category === 'brand'
          ? 'Brand'
        : category === 'media'
          ? t('designs.tagMedia')
          : t('designs.tagPrototype');
  return <span className={`design-card-tag tag-${category}`}>{label}</span>;
}

function DesignSystemProjectTag() {
  return <span className="design-card-tag tag-design-system">Design System</span>;
}

function findDesignSystemLogoFile(files: ProjectFile[]): ProjectFile | null {
  const logoCandidates = files
    .filter((file) => file.type !== 'dir')
    .filter((file) => {
      const name = file.path ?? file.name;
      return file.kind === 'image' || /\.(svg|png|jpe?g|webp|gif)$/iu.test(name);
    });
  return (
    logoCandidates.find((file) => (file.path ?? file.name).toLowerCase() === 'assets/logo.svg') ??
    logoCandidates.find((file) => /(^|\/)(logo|wordmark|brand-mark|brandmark|mark|icon|favicon)[^/]*\.(svg|png|jpe?g|webp|gif)$/iu.test(file.path ?? file.name)) ??
    null
  );
}
