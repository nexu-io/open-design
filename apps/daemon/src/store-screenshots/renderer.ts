import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import sharp from 'sharp';
import {
  compileStoreScreenshotSvg,
  deriveStoreScreenshotPage,
  platformSpecs,
  type StorePlatform,
  type StoreScreenshotDocument,
  type StoreScreenshotTemplateId,
} from '@launch-studio/store-screenshot';

export interface StoreScreenshotExportIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  platform?: StorePlatform;
  pageId?: string;
}

export class StoreScreenshotExportValidationError extends Error {
  constructor(readonly issues: StoreScreenshotExportIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.name = 'StoreScreenshotExportValidationError';
  }
}

export interface StoreScreenshotExportManifestFile {
  order: number;
  fileName: string;
  width: number;
  height: number;
  sha256: string;
  sourcePageId: string;
  templateId: StoreScreenshotTemplateId;
}

export interface StoreScreenshotExportManifest {
  schemaVersion: 1;
  documentId: string;
  documentVersion: number;
  exportedAt: string;
  platforms: Partial<Record<StorePlatform, {
    ruleVersion: 1;
    targetSize: {
      width: number;
      height: number;
    };
    pageCount: number;
  }>>;
  files: StoreScreenshotExportManifestFile[];
  errors: StoreScreenshotExportIssue[];
  warnings: StoreScreenshotExportIssue[];
}

export interface StoreScreenshotExportEntry {
  fileName: string;
  body: Buffer;
  sha256: string;
}

export interface StoreScreenshotExport {
  files: string[];
  entries: StoreScreenshotExportEntry[];
  manifest: StoreScreenshotExportManifest;
  manifestBody: Buffer;
  zip: Buffer;
}

export interface StoreScreenshotExportOptions {
  now?: () => Date;
  onRendered?: (completed: number, total: number) => void | Promise<void>;
}

const PLATFORM_ORDER: readonly StorePlatform[] = ['appStore', 'googlePlay'];
const PLATFORM_DIRECTORY: Record<StorePlatform, string> = {
  appStore: 'app-store',
  googlePlay: 'google-play',
};

function normalizePlatforms(platforms: readonly StorePlatform[]): StorePlatform[] {
  const requested = new Set(platforms);
  return PLATFORM_ORDER.filter((platform) => requested.has(platform));
}

function visiblePages(
  document: StoreScreenshotDocument,
  platform: StorePlatform,
) {
  return [...document.pages]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .filter((page) => !(page.overrides[platform]?.hidden ?? page.hidden ?? false));
}

function validatePlatformCounts(
  document: StoreScreenshotDocument,
  platforms: readonly StorePlatform[],
): StoreScreenshotExportIssue[] {
  const issues: StoreScreenshotExportIssue[] = [];
  for (const platform of platforms) {
    const pageCount = visiblePages(document, platform).length;
    const { min, max } = platformSpecs[platform].pageCount;
    if (pageCount < min || pageCount > max) {
      issues.push({
        severity: 'error',
        code: 'PAGE_COUNT_OUT_OF_RANGE',
        message: `${platform} requires ${min} to ${max} visible screenshots`,
        platform,
      });
    }
  }
  return issues;
}

function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function assertSafeZipPath(fileName: string): void {
  const segments = fileName.split('/');
  if (
    fileName.length === 0
    || fileName.startsWith('/')
    || fileName.includes('\\')
    || segments.some((segment) => (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9._-]+$/.test(segment)
    ))
  ) {
    throw new Error(`Unsafe store screenshot ZIP path: ${fileName}`);
  }
}

export async function renderStoreScreenshotPage(
  document: StoreScreenshotDocument,
  pageId: string,
  platform: StorePlatform,
): Promise<Buffer> {
  const derivedPage = deriveStoreScreenshotPage(document, pageId, platform);
  const svg = compileStoreScreenshotSvg(derivedPage);
  const png = await sharp(Buffer.from(svg))
    .flatten({ background: derivedPage.colors.background })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const metadata = await sharp(png).metadata();
  if (
    metadata.width !== derivedPage.size.width
    || metadata.height !== derivedPage.size.height
    || metadata.format !== 'png'
    || metadata.channels !== 3
  ) {
    throw new Error(
      `Rendered PNG metadata mismatch for ${platform}/${pageId}: `
      + `${metadata.width ?? '?'}x${metadata.height ?? '?'} `
      + `${metadata.format ?? '?'} channels=${metadata.channels ?? '?'}`,
    );
  }
  return png;
}

export async function exportStoreScreenshots(
  document: StoreScreenshotDocument,
  requestedPlatforms: readonly StorePlatform[],
  options: StoreScreenshotExportOptions = {},
): Promise<StoreScreenshotExport> {
  const platforms = normalizePlatforms(requestedPlatforms);
  if (platforms.length === 0) {
    throw new StoreScreenshotExportValidationError([{
      severity: 'error',
      code: 'PLATFORM_REQUIRED',
      message: 'At least one store screenshot platform is required',
    }]);
  }
  const issues = validatePlatformCounts(document, platforms);
  const errors = issues.filter(({ severity }) => severity === 'error');
  const warnings = issues.filter(({ severity }) => severity === 'warning');
  if (errors.length > 0) {
    throw new StoreScreenshotExportValidationError(issues);
  }

  const total = platforms.reduce(
    (sum, platform) => sum + visiblePages(document, platform).length,
    0,
  );
  const entries: StoreScreenshotExportEntry[] = [];
  const manifestFiles: StoreScreenshotExportManifestFile[] = [];
  const manifestPlatforms: StoreScreenshotExportManifest['platforms'] = {};
  let completed = 0;

  for (const platform of platforms) {
    const pages = visiblePages(document, platform);
    const size = platformSpecs[platform].size;
    manifestPlatforms[platform] = {
      ruleVersion: 1,
      targetSize: { ...size },
      pageCount: pages.length,
    };
    for (const [index, page] of pages.entries()) {
      const fileName = `${PLATFORM_DIRECTORY[platform]}/${String(index + 1).padStart(2, '0')}.png`;
      assertSafeZipPath(fileName);
      const body = await renderStoreScreenshotPage(document, page.id, platform);
      const digest = sha256(body);
      entries.push({ fileName, body, sha256: digest });
      manifestFiles.push({
        order: manifestFiles.length + 1,
        fileName,
        width: size.width,
        height: size.height,
        sha256: digest,
        sourcePageId: page.id,
        templateId: page.templateId,
      });
      completed += 1;
      await options.onRendered?.(completed, total);
    }
  }

  const manifest: StoreScreenshotExportManifest = {
    schemaVersion: 1,
    documentId: document.id,
    documentVersion: document.version,
    exportedAt: (options.now?.() ?? new Date()).toISOString(),
    platforms: manifestPlatforms,
    files: manifestFiles,
    errors,
    warnings,
  };
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.fileName, entry.body, {
      binary: true,
      createFolders: false,
      date: new Date(manifest.exportedAt),
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }
  zip.file('manifest.json', manifestBody, {
    binary: true,
    createFolders: false,
    date: new Date(manifest.exportedAt),
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const zipBody = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const files = [...entries.map(({ fileName }) => fileName), 'manifest.json'];
  for (const fileName of files) assertSafeZipPath(fileName);

  return {
    files,
    entries,
    manifest,
    manifestBody,
    zip: zipBody,
  };
}

export function createStoreScreenshotRenderer() {
  return {
    renderPage: renderStoreScreenshotPage,
    exportStoreScreenshots,
  };
}
