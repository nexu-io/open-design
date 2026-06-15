// Shared staging filter for folder/codebase selections. Both the design-system
// flow (DesignSystemFlow.tsx) and the chat composer folder-upload input route
// `webkitdirectory` selections through this so neither surface POSTs a raw repo
// subtree (node_modules/.git/dist, oversized blobs, thousands of files) to
// `/api/projects/:id/upload`.

export const MAX_LOCAL_CODE_UPLOAD_FILES = 120;
export const MAX_LOCAL_CODE_FILE_BYTES = 1024 * 1024;

export const LOCAL_CODE_SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

export function normalizeLocalCodePath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

export function localCodeRelativePath(file: File): string {
  const browserPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return normalizeLocalCodePath(browserPath || file.name);
}

export function shouldStageLocalCodeFile(file: File): boolean {
  const relativePath = localCodeRelativePath(file);
  if (!relativePath) return false;
  if (file.size > MAX_LOCAL_CODE_FILE_BYTES) return false;
  const parts = relativePath.split('/');
  return !parts.some((part) => LOCAL_CODE_SKIP_DIRS.has(part));
}

export function dedupeLocalCodeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const next: File[] = [];
  for (const file of files) {
    const key = `${localCodeRelativePath(file)}:${file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

export function selectLocalCodeFiles(files: File[]): File[] {
  return dedupeLocalCodeFiles(files.filter(shouldStageLocalCodeFile)).slice(0, MAX_LOCAL_CODE_UPLOAD_FILES);
}
