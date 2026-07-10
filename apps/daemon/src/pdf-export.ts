import path from 'node:path';

import type {
  DesktopExportArtifactFormat,
  DesktopExportArtifactImageFormat,
  DesktopExportArtifactInput,
  DesktopExportPdfInput,
} from '@open-design/sidecar-proto';

import { readProjectFile } from './projects.js';

export interface BuildDesktopPdfExportInputOptions {
  daemonUrl: string;
  deck?: boolean;
  fileName: string;
  // See BuildDeckRenderInputOptions.metadata: imported-folder projects resolve
  // their workspace via metadata.baseDir, else readProjectFile 404s.
  metadata?: Record<string, unknown> | null;
  projectId: string;
  projectsRoot: string;
  sourceHtml?: string;
  title?: string;
}

export async function buildDesktopPdfExportInput(
  options: BuildDesktopPdfExportInputOptions,
): Promise<DesktopExportPdfInput> {
  const html = options.sourceHtml ?? (await readProjectFile(
    options.projectsRoot,
    options.projectId,
    options.fileName,
    options.metadata ?? undefined,
  )).buffer.toString('utf8');
  const title = displayTitle(options.title, options.fileName);
  return {
    baseHref: rawBaseHref(options.daemonUrl, options.projectId, options.fileName),
    deck: options.deck === true,
    defaultFilename: `${safeFilename(title, 'artifact')}.pdf`,
    html,
    title,
  };
}

export interface BuildDesktopArtifactExportInputOptions {
  daemonUrl: string;
  deck?: boolean;
  fileName: string;
  format: DesktopExportArtifactFormat;
  imageFormat?: DesktopExportArtifactImageFormat;
  // See BuildDeckRenderInputOptions.metadata: imported-folder projects resolve
  // their workspace via metadata.baseDir, else readProjectFile 404s.
  metadata?: Record<string, unknown> | null;
  projectId: string;
  projectsRoot: string;
  sourceHtml?: string;
  title?: string;
  width?: number;
  height?: number;
}

export async function buildDesktopArtifactExportInput(
  options: BuildDesktopArtifactExportInputOptions,
): Promise<DesktopExportArtifactInput> {
  const html = options.sourceHtml ?? (await readProjectFile(
    options.projectsRoot,
    options.projectId,
    options.fileName,
    options.metadata ?? undefined,
  )).buffer.toString('utf8');
  const title = displayTitle(options.title, options.fileName);
  return {
    baseHref: rawBaseHref(options.daemonUrl, options.projectId, options.fileName),
    deck: options.deck === true,
    format: options.format,
    html,
    title,
    ...(options.imageFormat ? { imageFormat: options.imageFormat } : {}),
    ...(options.width ? { width: options.width } : {}),
    ...(options.height ? { height: options.height } : {}),
  };
}

function displayTitle(title: string | undefined, fileName: string): string {
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  const base = path.posix.basename(fileName);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base || 'artifact';
}

function rawBaseHref(daemonUrl: string, projectId: string, fileName: string): string {
  const dir = path.posix.dirname(fileName.replace(/^\/+/, ''));
  const safeProjectId = encodeURIComponent(projectId);
  const rawBase = `${daemonUrl.replace(/\/+$/, '')}/api/projects/${safeProjectId}/raw/`;
  if (!dir || dir === '.') return rawBase;
  return `${rawBase}${encodePathSegments(dir)}/`;
}

function encodePathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function safeFilename(name: string, fallback: string): string {
  const slug = (name || fallback)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}
