import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';
import * as PptxGenJSModule from 'pptxgenjs';
import { injectDeckStageFallback } from '@open-design/contracts/runtime/deck-stage-fallback';
import type { DesktopRenderSlidesInput } from '@open-design/sidecar-proto';

// pptxgenjs ships a default-export class, but its NodeNext typings resolve the
// default to the module namespace (no construct signature). At runtime the ESM
// build's default IS the class, so reach it and re-type as a constructor.
type PptxInstance = InstanceType<typeof import('pptxgenjs').default>;
const PptxGenJS = PptxGenJSModule.default as unknown as { new (): PptxInstance };

import { readProjectFile } from './projects.js';

export interface BuildDeckRenderInputOptions {
  daemonUrl: string;
  // Explicit page-vs-deck signal (the web knows whether the artifact is a deck).
  deck?: boolean;
  // When true, render an editable .pptx (native shapes/text via dom-to-pptx)
  // instead of screenshot images.
  editable?: boolean;
  fileName: string;
  index?: number;
  // Directory the desktop renderer writes the rendered images into (returned as
  // file paths) instead of base64 data URLs — keeps large images off the IPC.
  // Project metadata. Imported-folder projects keep their workspace under
  // `metadata.baseDir`; without it readProjectFile falls back to
  // `<data>/projects/:id` and 404s for those projects (see resolveProjectDir).
  metadata?: Record<string, unknown> | null;
  outputDir?: string;
  pageImageFormat?: 'png' | 'jpeg';
  projectId: string;
  projectsRoot: string;
  sourceHtml?: string;
  stitch?: boolean;
  width?: number;
  height?: number;
  // Page mode only: split a long non-deck page into one image per viewport
  // (multi-page PDF). Ignored when the artifact renders as a deck.
  paginate?: boolean;
  title?: string;
}

export interface DeckRenderRequest {
  defaultFilename: string;
  input: DesktopRenderSlidesInput;
  title: string;
}

/**
 * Reads a deck HTML file and prepares the {@link DesktopRenderSlidesInput} the
 * desktop renderer needs. Mirrors {@link buildDesktopPdfExportInput} in
 * pdf-export.ts: same `<base href>` derivation so the rendered deck resolves
 * its relative CSS/JS/image assets through the daemon's `/raw/` route.
 */
export async function buildDeckRenderInput(
  options: BuildDeckRenderInputOptions,
): Promise<DeckRenderRequest> {
  const html = options.sourceHtml ?? (await readProjectFile(
    options.projectsRoot,
    options.projectId,
    options.fileName,
    options.metadata ?? undefined,
  )).buffer.toString('utf8');
  const title = displayTitle(options.title, options.fileName);
  return {
    defaultFilename: safeDisplayFilename(title, 'deck'),
    title,
    input: {
      baseHref: rawBaseHref(options.daemonUrl, options.projectId, options.fileName),
      html: injectDeckStageFallback(html),
      ...(options.deck == null ? {} : { deck: options.deck }),
      ...(options.editable == null ? {} : { editable: options.editable }),
      ...(options.index == null ? {} : { index: options.index }),
      ...(options.outputDir == null ? {} : { outputDir: options.outputDir }),
      ...(options.pageImageFormat == null ? {} : { pageImageFormat: options.pageImageFormat }),
      ...(options.stitch == null ? {} : { stitch: options.stitch }),
      ...(options.paginate == null ? {} : { paginate: options.paginate }),
      ...(options.width == null ? {} : { width: options.width }),
      ...(options.height == null ? {} : { height: options.height }),
    },
  };
}

export interface SlideImage {
  buffer: Buffer;
  jpeg: boolean;
}

/**
 * Decodes the `data:image/(png|jpeg);base64,...` URLs the desktop renderer
 * returns into raw image buffers tagged with their format. Rejects anything that
 * is not a base64 PNG/JPEG data URL so a malformed renderer response surfaces as
 * an export failure rather than a corrupt file.
 */
/**
 * Reads the image files the desktop renderer wrote (the `outputDir` handoff)
 * into raw buffers tagged with their format (by extension). The companion to
 * {@link decodeSlideDataUrls} for the file-path path, which avoids shuttling
 * base64 image bytes through the JSON IPC channel for large images.
 */
export async function readSlideFiles(paths: string[]): Promise<SlideImage[]> {
  return Promise.all(
    paths.map(async (filePath, index) => {
      if (typeof filePath !== 'string' || filePath.length === 0) {
        throw new Error(`slide ${index + 1} has no file path`);
      }
      const buffer = await readFile(filePath);
      return { buffer, jpeg: /\.jpe?g$/i.test(filePath) };
    }),
  );
}

export function decodeSlideDataUrls(urls: string[]): SlideImage[] {
  return urls.map((url, index) => {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(url ?? '');
    if (!match) {
      throw new Error(`slide ${index + 1} is not a base64 PNG/JPEG data URL`);
    }
    return { buffer: Buffer.from(match[2] ?? '', 'base64'), jpeg: match[1] === 'jpeg' };
  });
}

// Standard PowerPoint 16:9 slide is 13.333" x 7.5". We keep 13.333" as the slide
// width and derive the height from the deck's actual aspect ratio, so a 4:3,
// square, or portrait deck gets a correctly-proportioned slide instead of being
// letterboxed into a 16:9 frame.
const PPTX_SLIDE_WIDTH_IN = 13.333;

/**
 * Assembles per-slide images into a screenshot-based .pptx — one full-bleed
 * image per slide. The slide aspect ratio follows the deck's authored size
 * (`opts.aspect` = width/height); falls back to 16:9. The slides are
 * pixel-perfect images (not editable text), the "exactly what you see" export
 * mode. Returns the .pptx bytes.
 */
export async function buildScreenshotPptx(
  images: SlideImage[],
  opts: { title?: string; aspect?: number } = {},
): Promise<Buffer> {
  if (images.length === 0) throw new Error('no slides to export');
  const pptx = new PptxGenJS();
  const aspect = opts.aspect && Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : 16 / 9;
  if (Math.abs(aspect - 16 / 9) < 0.01) {
    pptx.layout = 'LAYOUT_16x9';
  } else {
    const height = Number((PPTX_SLIDE_WIDTH_IN / aspect).toFixed(3));
    pptx.defineLayout({ name: 'OD_DECK', width: PPTX_SLIDE_WIDTH_IN, height });
    pptx.layout = 'OD_DECK';
  }
  pptx.author = 'Open Design';
  if (opts.title) pptx.title = opts.title;
  pptx.subject = 'Screenshot-based PPTX';
  for (const img of images) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `data:image/${img.jpeg ? 'jpeg' : 'png'};base64,${img.buffer.toString('base64')}`,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%',
    });
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/**
 * Assembles per-slide images into a screenshot-based .pdf — one page per slide,
 * each page sized to its image. Pixel-perfect, raster (not selectable text).
 * Full pages render as JPEG (small); deck slides as PNG (crisp).
 */
// pdf-lib page sizes are in PDF points (1/72"), NOT pixels. Sizing a page by the
// captured image's pixel dimensions makes the nominal page size scale with the
// capture's device pixel ratio (a 2x retina capture would yield a page twice as
// large as a 1x one). Instead, normalize each page so its longest side is a
// fixed physical size and its aspect ratio matches the image; the image still
// embeds at full pixel resolution (crisp), only the page's points are sane.
// 960pt = a 16:9 slide of 960x540pt, matching PowerPoint's 16:9 page.
const PDF_PAGE_LONGEST_PT = 960;

export async function buildScreenshotPdf(images: SlideImage[]): Promise<Buffer> {
  if (images.length === 0) throw new Error('no slides to export');
  const pdf = await PDFDocument.create();
  for (const img of images) {
    const image = img.jpeg ? await pdf.embedJpg(img.buffer) : await pdf.embedPng(img.buffer);
    const aspect = image.height > 0 ? image.width / image.height : 1;
    const [width, height] =
      aspect >= 1
        ? [PDF_PAGE_LONGEST_PT, PDF_PAGE_LONGEST_PT / aspect]
        : [PDF_PAGE_LONGEST_PT * aspect, PDF_PAGE_LONGEST_PT];
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function displayTitle(title: string | undefined, fileName: string): string {
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  const base = path.posix.basename(fileName);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base || 'deck';
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

function safeDisplayFilename(name: string, fallback: string): string {
  const stem = (name || fallback)
    .replace(/[\/\\\0-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return stem || fallback;
}
