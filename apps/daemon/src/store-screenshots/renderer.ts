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
import type { ProjectStorage } from '../storage/project-storage.js';
import type { StoreScreenshotAssetIndex } from './persistence.js';

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

export type StoreScreenshotRenderErrorCode =
  | 'ASSET_LOOKUP_REQUIRED'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_OWNER_MISMATCH'
  | 'UNSAFE_ASSET_PATH'
  | 'ASSET_FILE_MISSING'
  | 'INVALID_ASSET';

export class StoreScreenshotRenderError extends Error {
  constructor(
    readonly code: StoreScreenshotRenderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreScreenshotRenderError';
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
  projectStorage?: ProjectStorage;
  lookupAsset?: (assetId: string) => Promise<StoreScreenshotAssetIndex | null>;
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

function assertSafeAssetPath(relativePath: string): void {
  const segments = relativePath.split('/');
  if (
    relativePath.length === 0
    || relativePath.startsWith('/')
    || relativePath.includes('\\')
    || !relativePath.startsWith('store-screenshots/assets/')
    || segments.some((segment) => (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9._-]+$/.test(segment)
    ))
  ) {
    throw new StoreScreenshotRenderError(
      'UNSAFE_ASSET_PATH',
      'Store screenshot asset path is not a safe project-relative asset path',
    );
  }
}

function expectedMime(format: string | undefined): StoreScreenshotAssetIndex['mime'] | null {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return null;
}

async function readReferencedAsset(
  document: StoreScreenshotDocument,
  assetId: string,
  options: StoreScreenshotExportOptions,
): Promise<{
  index: StoreScreenshotAssetIndex;
  body: Buffer;
}> {
  if (!options.projectStorage || !options.lookupAsset) {
    throw new StoreScreenshotRenderError(
      'ASSET_LOOKUP_REQUIRED',
      `Store screenshot asset ${assetId} requires project storage and an asset lookup`,
    );
  }
  const index = await options.lookupAsset(assetId);
  if (!index) {
    throw new StoreScreenshotRenderError(
      'ASSET_NOT_FOUND',
      `Store screenshot asset ${assetId} was not found`,
    );
  }
  if (
    index.id !== assetId
    || index.projectId !== document.projectId
    || index.documentId !== document.id
  ) {
    throw new StoreScreenshotRenderError(
      'ASSET_OWNER_MISMATCH',
      `Store screenshot asset ${assetId} is not owned by the current document`,
    );
  }
  assertSafeAssetPath(index.relativePath);
  let body: Buffer;
  try {
    body = await options.projectStorage.readFile(document.projectId, index.relativePath);
  } catch {
    throw new StoreScreenshotRenderError(
      'ASSET_FILE_MISSING',
      `Store screenshot asset file is missing for ${assetId}`,
    );
  }
  try {
    const decoder = sharp(body, {
      failOn: 'error',
      limitInputPixels: true,
    });
    const metadata = await decoder.metadata();
    await decoder.clone().toBuffer();
    if (
      expectedMime(metadata.format) !== index.mime
      || metadata.width !== index.width
      || metadata.height !== index.height
      || sha256(body) !== index.contentHash
    ) {
      throw new Error('metadata mismatch');
    }
  } catch {
    throw new StoreScreenshotRenderError(
      'INVALID_ASSET',
      `Store screenshot asset bytes or metadata are invalid for ${assetId}`,
    );
  }
  return { index, body };
}

function pageFor(document: StoreScreenshotDocument, pageId: string) {
  const page = document.pages.find(({ id }) => id === pageId);
  if (!page) throw new Error(`PAGE_NOT_FOUND:${pageId}`);
  return page;
}

async function resizedOverlay(
  body: Buffer,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
  radius: number,
): Promise<Buffer> {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
  ) {
    throw new StoreScreenshotRenderError(
      'INVALID_ASSET',
      'Store screenshot asset placement has invalid dimensions',
    );
  }
  let image = sharp(body, { failOn: 'error' }).resize(width, height, {
    fit,
    position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (radius > 0) {
    const normalizedRadius = Math.min(radius, width / 2, height / 2);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<rect width="${width}" height="${height}" rx="${normalizedRadius.toFixed(2)}" fill="#fff"/>`
      + '</svg>',
    );
    image = image.composite([{ input: mask, blend: 'dest-in' }]);
  }
  return image
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function assetComposites(
  document: StoreScreenshotDocument,
  pageId: string,
  platform: StorePlatform,
  options: StoreScreenshotExportOptions,
): Promise<Array<{ input: Buffer; left: number; top: number; blend: 'over' }>> {
  const page = pageFor(document, pageId);
  const derivedPage = deriveStoreScreenshotPage(document, pageId, platform);
  const composites: Array<{
    input: Buffer;
    left: number;
    top: number;
    blend: 'over';
  }> = [];
  const cache = new Map<string, Promise<{ index: StoreScreenshotAssetIndex; body: Buffer }>>();
  const resolve = (assetId: string) => {
    const existing = cache.get(assetId);
    if (existing) return existing;
    const pending = readReferencedAsset(document, assetId, options);
    cache.set(assetId, pending);
    return pending;
  };

  if (page.screenshotAssetId) {
    const { body } = await resolve(page.screenshotAssetId);
    const { width, height } = derivedPage.size;
    const screenshotWidth = Math.round(width * 0.8 * derivedPage.transform.scale);
    const screenshotHeight = Math.round(height * 0.54 * derivedPage.transform.scale);
    const baseX = derivedPage.template.devicePlacement === 'right'
      ? width - screenshotWidth - width * 0.06
      : (width - screenshotWidth) / 2;
    const baseY = height - screenshotHeight - height * 0.07;
    const position = derivedPage.screenshotAsset?.position ?? { x: 0, y: 0 };
    composites.push({
      input: await resizedOverlay(
        body,
        screenshotWidth,
        screenshotHeight,
        'cover',
        derivedPage.template.screenshotRadius,
      ),
      left: Math.round(baseX + position.x + derivedPage.transform.x),
      top: Math.round(baseY + position.y + derivedPage.transform.y),
      blend: 'over',
    });
  }

  if (page.logoAssetId) {
    const { body } = await resolve(page.logoAssetId);
    const logoAsset = document.assets.find(({ id }) => id === page.logoAssetId);
    const { width, height } = derivedPage.size;
    const scale = logoAsset?.scale ?? 1;
    const logoWidth = Math.round(width * 0.18 * scale);
    const logoHeight = Math.round(height * 0.04 * scale);
    const position = logoAsset?.position ?? { x: 0, y: 0 };
    composites.push({
      input: await resizedOverlay(body, logoWidth, logoHeight, 'contain', 0),
      left: Math.round(width * 0.1 + position.x),
      top: Math.round(height * 0.04 + position.y),
      blend: 'over',
    });
  }
  return composites;
}

export async function renderStoreScreenshotPage(
  document: StoreScreenshotDocument,
  pageId: string,
  platform: StorePlatform,
  options: StoreScreenshotExportOptions = {},
): Promise<Buffer> {
  const derivedPage = deriveStoreScreenshotPage(document, pageId, platform);
  const svg = compileStoreScreenshotSvg(derivedPage);
  const composites = await assetComposites(document, pageId, platform, options);
  const pipeline = sharp(Buffer.from(svg));
  if (composites.length > 0) pipeline.composite(composites);
  const png = await pipeline
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
      const body = await renderStoreScreenshotPage(document, page.id, platform, options);
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
