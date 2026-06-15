import nodePath from 'node:path';

export interface ResolveViteDistHtmlEntryOptions {
  html: string;
  maxOwnerBytes?: number;
  metadata?: unknown;
  projectId: string;
  projectsRoot: string;
  readProjectFile: (
    projectsRoot: string,
    projectId: string,
    relPath: string,
    metadata?: unknown,
  ) => Promise<{ buffer: Buffer }>;
  relPath: string;
  resolveProjectFilePath: (
    projectsRoot: string,
    projectId: string,
    relPath: string,
    metadata?: unknown,
  ) => Promise<{ mime: string; size: number }>;
}

export async function resolveViteDistHtmlEntry({
  html,
  maxOwnerBytes,
  metadata,
  projectId,
  projectsRoot,
  readProjectFile,
  relPath,
  resolveProjectFilePath,
}: ResolveViteDistHtmlEntryOptions): Promise<{ html: string; relPath: string } | null> {
  if (!isViteDevHtmlEntry(html)) return null;

  const ownerDir = nodePath.posix.dirname(relPath.replace(/^\/+/, ''));
  const distRelPath = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
  try {
    const distMeta = await resolveProjectFilePath(projectsRoot, projectId, distRelPath, metadata);
    if (typeof maxOwnerBytes === 'number' && distMeta.size > maxOwnerBytes) return null;
    if (!distMeta.mime.startsWith('text/html')) return null;
    const distFile = await readProjectFile(projectsRoot, projectId, distRelPath, metadata);
    return {
      html: rewriteViteDistRootAssetUrls(distFile.buffer.toString('utf8')),
      relPath: distRelPath,
    };
  } catch {
    return null;
  }
}

export function isViteDevHtmlEntry(html: string): boolean {
  return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
}

export function rewriteViteDistRootAssetUrls(html: string): string {
  return html.replace(
    /\b(href|src)\s*=\s*(["'])\/assets\//gi,
    (_match, attr: string, quote: string) => `${attr}=${quote}assets/`,
  );
}
