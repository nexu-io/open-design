// The project-cover PIPELINE: how one project's cover decision is resolved,
// verified and (for decks) preloaded — the half of the projects grid's cover
// work that is pure and shareable.
//
// It lived inside `RecentProjectsStrip.tsx` (`loadProjectCover`, the deck
// cover cache, the design-system special cases) until the rail's hover
// preview needed the SAME decision for the same project (OPEND-2766: 最近项目
// 除图片类型外 hover 预览无法展示实际内容). The grid keeps its scheduling —
// the visibility sentinel, the bounded cover queue, the abort/generation
// bookkeeping — and calls in here for the decision; the hover preview calls
// in here once per (workspace, project, version) on a cache miss and writes
// the result back through `lib/project-cover-cache`, so whichever surface
// resolves first, the other inherits it.
//
// What a resolution does, in order:
// 1. `/files` read → `selectProjectFileCover` picks index.html / newest html,
//    else newest image, else newest video (design-system projects instead
//    read brand.json and their logo).
// 2. An `html` cover is VERIFIED before it is trusted: a deck's document is
//    fetched and parsed into its cover-slide srcDoc (cached per URL, see
//    `loadDeckCover`); any other document is HEAD-probed. A verified-missing
//    file is an authoritative "no cover" (cacheable); a network failure is
//    transient (`undefined`) and must not be cached.

import type { WorkspaceCollabContext } from '@open-design/contracts';

import { isDesignSystemProject } from '../components/design-system-project';
import {
  coverFromProjectFile,
  projectCoverUrl,
  selectProjectFileCover,
  type ProjectCoverOverride,
} from '../components/project-cover';
import { workspaceProjectHeaders } from '../collab/workspace-identity';
import { fetchProjectFiles, fetchProjectFileText } from '../providers/registry';
import type { Project, ProjectFile } from '../types';

export const DECK_PREVIEW_WIDTH = 1280;
export const DECK_PREVIEW_HEIGHT = 720;
// Deck covers are fetched once per artifact URL and shared by every card that
// points at it: the parsed srcDoc is cached, and concurrent mounts join the
// same in-flight request instead of re-fetching.
const deckCoverCache = new Map<string, string>();
const deckCoverInflight = new Map<string, Promise<string>>();

/** The parsed cover-slide document for a deck URL, when a resolve already
 *  fetched it. Synchronous so a card can paint from it on first render. */
export function getCachedDeckCover(src: string): string | undefined {
  return deckCoverCache.get(src);
}

/**
 * Resolves one project's cover decision. Returns:
 * - a cover override when the project has a renderable cover,
 * - `null` as the *authoritative* "this project has no cover" answer
 *   (safe to snapshot until the project version changes), and
 * - `undefined` for transient outcomes (abort, network failure) that must
 *   not be cached or written into state.
 */
export async function resolveProjectCover(
  project: Project,
  signal: AbortSignal,
  requestWorkspaceContext: WorkspaceCollabContext | null,
  freshFiles = false,
): Promise<ProjectCoverOverride | null | undefined> {
  // Catalog-only Team projects intentionally have no local directory until
  // the first open materializes them. Probing `/files` here can only produce
  // a noisy 404. This is transient rather than an authoritative no-cover
  // decision: hydration can clear the stamp without changing id/updatedAt,
  // at which point coverFetchKey starts the first real scan.
  if (project.metadata?.sharedProjectPlaceholderAt != null) return undefined;
  const designSystemProject = isDesignSystemProject(project);
  if (project.metadata?.entryFile && !designSystemProject) return null;
  let files: Awaited<ReturnType<typeof fetchProjectFiles>>;
  try {
    files = await fetchProjectFiles(project.id, {
      signal,
      workspaceContext: requestWorkspaceContext,
      ...(freshFiles ? { fresh: true } : {}),
    });
  } catch {
    return undefined;
  }
  if (signal.aborted) return undefined;
  if (designSystemProject) {
    return (await findDesignSystemCover(
      project.id,
      files,
      signal,
      requestWorkspaceContext,
    )) ?? null;
  }
  const cover = selectProjectFileCover(files);
  if (cover?.kind !== 'html') return cover;

  const src = projectCoverUrl(
    project.id,
    cover.name,
    cover.mtime,
    requestWorkspaceContext,
  );
  const diagnostic = `${project.id}:${cover.name}`;
  if (project.metadata?.kind === 'deck') {
    try {
      await loadDeckCover(src, signal, requestWorkspaceContext);
      return signal.aborted ? undefined : cover;
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return undefined;
      console.warn('[project-cover] failed to load HTML cover:', diagnostic, err);
      return undefined;
    }
  }

  try {
    const response = await fetch(src, {
      method: 'HEAD',
      cache: 'no-store',
      signal,
      ...(requestWorkspaceContext
        ? { headers: workspaceProjectHeaders(requestWorkspaceContext) }
        : {}),
    });
    if (signal.aborted) return undefined;
    if (response.ok || response.status === 304) return cover;
    console.warn(
      `[project-cover] HTML cover unavailable (${response.status} ${response.statusText}):`,
      diagnostic,
    );
    // The server answered: the cover file is not readable. That decision is
    // cacheable; the card renders its glyph until the project changes.
    return null;
  } catch (err) {
    if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return undefined;
    console.warn('[project-cover] failed to verify HTML cover:', diagnostic, err);
    return undefined;
  }
}

export async function loadDeckCover(
  src: string,
  signal?: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<string> {
  const cached = deckCoverCache.get(src);
  if (cached) return cached;
  if (signal) {
    const response = await fetch(src, {
      signal,
      ...(workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : {}),
    });
    if (!response.ok) throw new Error(`Failed to load project cover: ${response.status}`);
    const parsed = deckPreviewSrcDoc(await response.text());
    if (!signal.aborted) deckCoverCache.set(src, parsed);
    return parsed;
  }
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

export function deckPreviewSrcDoc(html: string): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '');
  const withCoverSlide = markFirstDeckPage(withoutScripts);
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
    /* Scripts normally fit fixed-stage decks at runtime. Static covers remove
       those scripts, so normalize both named wrappers as well as the direct
       slide parent instead of letting an outer transform move slide 1 away. */
    .deck-shell,
    .deck-stage,
    :where(body *):has(> [data-od-cover-slide]) {
      position: absolute !important;
      inset: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      display: block !important;
      margin: 0 !important;
      overflow: hidden !important;
      transform: none !important;
      transform-origin: 0 0 !important;
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
    [data-od-cover-slide] {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
    }
    [data-od-cover-slide] > *,
    [data-od-cover-slide] [data-anim],
    [data-od-cover-slide] .reveal {
      animation: none !important;
      transition: none !important;
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      clip-path: none !important;
    }
    .slide:not([data-od-cover-slide]),
    section[data-slide]:not([data-od-cover-slide]),
    section[data-screen-label]:not([data-od-cover-slide]),
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
    #hint,
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
  return injectBefore(withCoverSlide, '</head>', style);
}

function markFirstDeckPage(html: string): string {
  // The cover document is already inert after script removal. Parse it as HTML
  // so examples inside comments and raw-text elements cannot impersonate a slide.
  if (typeof DOMParser === 'undefined') return html;
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return html;
  }
  const page = parsed.querySelector('.slide')
    ?? parsed.querySelector('[data-slide]')
    ?? parsed.querySelector('[data-screen-label]');
  if (!page) return html;
  const activeClasses = ['active', 'is-active'];
  for (const activeClass of activeClasses) {
    page.classList.add(activeClass);
  }
  if (page.getAttribute('aria-hidden')?.toLowerCase() === 'true') {
    page.setAttribute('aria-hidden', 'false');
  }
  page.removeAttribute('hidden');
  page.setAttribute('data-od-cover-slide', '');
  const doctype = parsed.doctype && typeof XMLSerializer !== 'undefined'
    ? new XMLSerializer().serializeToString(parsed.doctype)
    : '';
  return `${doctype}${parsed.documentElement.outerHTML}`;
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
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

export async function findDesignSystemCover(
  projectId: string,
  files: ProjectFile[],
  signal?: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ProjectCoverOverride | null> {
  const knownFiles = new Map(files.map((file) => [file.path ?? file.name, file]));
  const brandCover = await designSystemCoverFromBrandJson(
    projectId,
    knownFiles,
    signal,
    workspaceContext,
  );
  if (signal?.aborted) return null;
  if (brandCover) return brandCover;

  const logo = findDesignSystemLogoFile(files);
  if (!logo) return null;
  return coverFromProjectFile(logo, 'logo');
}

async function designSystemCoverFromBrandJson(
  projectId: string,
  knownFiles: ReadonlyMap<string, ProjectFile>,
  signal?: AbortSignal,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<ProjectCoverOverride | null> {
  const raw = await fetchProjectFileText(projectId, 'brand.json', {
    cache: 'no-store',
    signal,
    workspaceContext,
  });
  if (signal?.aborted) return null;
  if (!raw) return null;
  let brand: unknown;
  try {
    brand = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!brand || typeof brand !== 'object') return null;
  const root = brand as Record<string, unknown>;
  const imagery = root.imagery && typeof root.imagery === 'object'
    ? root.imagery as Record<string, unknown>
    : null;
  const samples = Array.isArray(imagery?.samples) ? imagery.samples : [];
  const samplePaths = samples
    .filter((sample): sample is Record<string, unknown> => Boolean(sample && typeof sample === 'object'))
    .sort((a, b) => imageSampleRank(a.kind) - imageSampleRank(b.kind))
    .map((sample) => typeof sample.file === 'string' ? sample.file : null)
    .filter((file): file is string => Boolean(file));
  const image = samplePaths.find((file) => knownFiles.has(file) && isRasterOrSvgImage(file));
  if (image) return coverFromProjectFile(knownFiles.get(image)!, 'image');

  const logo = root.logo && typeof root.logo === 'object' ? root.logo as Record<string, unknown> : null;
  const alternates = Array.isArray(logo?.alternates) ? logo.alternates : [];
  const logoCandidates = [
    typeof logo?.primary === 'string' ? logo.primary : null,
    ...alternates,
  ];
  const nonFaviconLogo = logoCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' &&
      knownFiles.has(candidate) &&
      isRasterOrSvgImage(candidate) &&
      !/(^|\/)favicon[-.]/iu.test(candidate),
  );
  if (nonFaviconLogo) return coverFromProjectFile(knownFiles.get(nonFaviconLogo)!, 'logo');
  if (typeof logo?.primary === 'string' && knownFiles.has(logo.primary) && isRasterOrSvgImage(logo.primary)) {
    return coverFromProjectFile(knownFiles.get(logo.primary)!, 'logo');
  }
  return null;
}

function imageSampleRank(kind: unknown): number {
  if (kind === 'cover') return 0;
  if (kind === 'hero') return 1;
  return 2;
}

function isRasterOrSvgImage(path: string): boolean {
  return /\.(svg|png|jpe?g|webp|gif)$/iu.test(path);
}
