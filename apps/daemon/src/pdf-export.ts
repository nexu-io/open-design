import path from 'node:path';

import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';

import { resolveViteDistHtmlEntry } from './html-export-source.js';
import { readProjectFile, resolveProjectFilePath } from './projects.js';

export interface BuildDesktopPdfExportInputOptions {
  daemonUrl: string;
  deck?: boolean;
  fileName: string;
  projectId: string;
  projectsRoot: string;
  title?: string;
}

export async function buildDesktopPdfExportInput(
  options: BuildDesktopPdfExportInputOptions,
): Promise<DesktopExportPdfInput> {
  const file = await readProjectFile(options.projectsRoot, options.projectId, options.fileName);
  const exportSource = await resolvePdfExportSource(
    options,
    file.buffer.toString('utf8'),
  );
  const title = displayTitle(options.title, options.fileName);
  return {
    baseHref: rawBaseHref(options.daemonUrl, options.projectId, exportSource.fileName),
    deck: options.deck === true,
    defaultFilename: `${safeFilename(title, 'artifact')}.pdf`,
    html: exportSource.html,
    title,
  };
}

async function resolvePdfExportSource(
  options: BuildDesktopPdfExportInputOptions,
  html: string,
): Promise<{ html: string; fileName: string }> {
  const viteDistEntry = await resolveViteDistHtmlEntry({
    html,
    projectId: options.projectId,
    projectsRoot: options.projectsRoot,
    readProjectFile,
    relPath: options.fileName,
    resolveProjectFilePath,
  });
  if (!viteDistEntry) return { html, fileName: options.fileName };
  return { html: viteDistEntry.html, fileName: viteDistEntry.relPath };
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
