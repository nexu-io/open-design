export const MAX_FOLDER_ATTACHMENT_FILES = 120;
export const MAX_FOLDER_ATTACHMENT_FILE_BYTES = 1024 * 1024;
export const MAX_FOLDER_ATTACHMENT_TOTAL_BYTES = 24 * 1024 * 1024;

const FOLDER_ATTACHMENT_SKIP_DIRS = new Set([
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.parcel-cache',
  '.ssh',
  '.svn',
  '.turbo',
  '.vercel',
  '.vite',
  '.yarn',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

const FOLDER_ATTACHMENT_SECRET_FILES = new Set([
  '.netrc',
  '.npmrc',
  '.pnpmrc',
  '.pypirc',
  '.yarnrc',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'id_rsa',
]);

interface FolderAttachmentSelection {
  readonly accepted: File[];
  readonly skippedCount: number;
}

function normalizeFolderAttachmentPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

function folderAttachmentRelativePath(file: File): string {
  return normalizeFolderAttachmentPath(file.webkitRelativePath || file.name);
}

function folderAttachmentBaseName(path: string): string {
  return (path.split('/').at(-1) ?? '').toLowerCase();
}

function isFolderAttachmentCredentialPath(relativePath: string): boolean {
  const lowerPath = relativePath.toLowerCase();
  const lowerParts = lowerPath.split('/');
  const baseName = folderAttachmentBaseName(lowerPath);
  if (baseName === '.env' || baseName.startsWith('.env.')) return true;
  if (FOLDER_ATTACHMENT_SECRET_FILES.has(baseName)) return true;
  if (
    baseName.endsWith('.key')
    || baseName.endsWith('.pem')
    || baseName.endsWith('.p12')
    || baseName.endsWith('.pfx')
  ) {
    return true;
  }
  if (baseName === 'credentials' && lowerParts.includes('.aws')) return true;
  return baseName === 'application_default_credentials.json' && lowerParts.includes('gcloud');
}

function shouldSkipFolderAttachmentByPath(relativePath: string): boolean {
  const lowerParts = relativePath.toLowerCase().split('/');
  return lowerParts.some((part) => FOLDER_ATTACHMENT_SKIP_DIRS.has(part))
    || isFolderAttachmentCredentialPath(relativePath);
}

export function selectFolderAttachmentFiles(files: File[]): FolderAttachmentSelection {
  const accepted: File[] = [];
  let totalBytes = 0;
  let skippedCount = 0;

  for (const file of files) {
    const relativePath = folderAttachmentRelativePath(file);
    if (
      !relativePath
      || shouldSkipFolderAttachmentByPath(relativePath)
      || file.size > MAX_FOLDER_ATTACHMENT_FILE_BYTES
      || accepted.length >= MAX_FOLDER_ATTACHMENT_FILES
      || totalBytes + file.size > MAX_FOLDER_ATTACHMENT_TOTAL_BYTES
    ) {
      skippedCount += 1;
      continue;
    }
    accepted.push(file);
    totalBytes += file.size;
  }

  return { accepted, skippedCount };
}

export function formatFolderAttachmentSkippedNotice(skippedCount: number): string {
  const skippedFiles = skippedCount === 1 ? 'file was' : 'files were';
  return `${skippedCount} folder ${skippedFiles} skipped because they matched ignored directories, credential files, or upload limits.`;
}
