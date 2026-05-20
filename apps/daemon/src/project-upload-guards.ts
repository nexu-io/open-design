import { sanitizePath, validateProjectPath } from './projects.js';

const PROJECT_UPLOAD_SKIP_SEGMENTS = new Set([
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.svn',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);
const PROJECT_UPLOAD_SKIP_NAMES = new Set(['.ds_store', 'thumbs.db']);

export class ProjectUploadPathError extends Error {
  code = 'BAD_UPLOAD_PATH';
}

export function projectUploadRelativePaths(raw: unknown, count: number): string[] {
  const values = Array.isArray(raw)
    ? raw
    : raw == null
      ? []
      : [raw];
  return Array.from({ length: count }, (_, index) => {
    const value = values[index];
    return typeof value === 'string' ? value : '';
  });
}

export function resolveProjectUploadRelativePath(raw: string): string | null {
  const normalizedInput = raw.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  if (!normalizedInput) return null;
  let validated: string;
  try {
    validated = validateProjectPath(normalizedInput);
  } catch {
    throw new ProjectUploadPathError('invalid upload path');
  }
  if (isBlockedProjectUploadPath(validated)) {
    throw new ProjectUploadPathError('sensitive or generated folder files are not accepted');
  }
  return sanitizePath(validated);
}

function isBlockedProjectUploadPath(value: string): boolean {
  const parts = value.toLowerCase().split('/').filter(Boolean);
  const leaf = parts[parts.length - 1] ?? '';
  if (leaf === '.env' || leaf.startsWith('.env.')) return true;
  if (PROJECT_UPLOAD_SKIP_NAMES.has(leaf)) return true;
  return parts.some((part) => PROJECT_UPLOAD_SKIP_SEGMENTS.has(part));
}
