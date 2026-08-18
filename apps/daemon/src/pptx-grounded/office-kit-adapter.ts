import {
  duplicateSlideAt, findSlidePlaceholders, getPresentationTheme, getSlideLayout,
  getSlideLayoutName, getSlideLayoutPartName, getSlideLayoutType, getSlideSize,
  getSlideText, getSlideTitle, getSlides, loadPresentation, savePresentation,
  setShapeText, validatePresentation, type ValidationIssue,
} from '@office-kit/pptx';
import { renderSlideToRgba } from '@office-kit/pptx-preview/node';
import JSZip from 'jszip';
import path from 'node:path';
import { groundedPptxProcessWork } from './capacity.js';
import { GroundedPptxClientInputError, GroundedPptxPayloadTooLargeError } from './errors.js';

export const GROUNDED_PPTX_LIMITS = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxEntries: 5_000,
  maxUncompressedBytes: 500 * 1024 * 1024,
  maxSlides: 500,
  maxRenderWidth: 1_920,
  maxSlideDimension: 100_000_000,
  maxAspectRatio: 8,
  maxRenderPixels: 4_000_000,
  maxPngBytes: 16 * 1024 * 1024,
  maxMutationOutputBytes: 50 * 1024 * 1024,
} as const;

interface PackageLimits { maxCompressedBytes?: number; maxEntries?: number; maxUncompressedBytes?: number }
interface CountingZipStream {
  on(event: 'data', callback: (chunk: Uint8Array) => void): CountingZipStream;
  on(event: 'error', callback: (error: Error) => void): CountingZipStream;
  on(event: 'end', callback: () => void): CountingZipStream;
  pause(): void;
  resume(): void;
  terminate(error: Error): void;
}

export function assertGroundedPptxSlideCount(count: number, maximum = GROUNDED_PPTX_LIMITS.maxSlides): void {
  if (count === 0) throw new GroundedPptxClientInputError('PPTX must contain at least one slide');
  if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
    throw new GroundedPptxPayloadTooLargeError('PPTX slide count exceeds limit');
  }
}

async function validatePackage(bytes: Uint8Array | ArrayBuffer, limits: PackageLimits = {}): Promise<void> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.byteLength > (limits.maxCompressedBytes ?? GROUNDED_PPTX_LIMITS.maxCompressedBytes)) {
    throw new GroundedPptxPayloadTooLargeError('PPTX compressed size exceeds limit');
  }
  const zip = await JSZip.loadAsync(input);
  const entries = Object.values(zip.files);
  if (entries.length > (limits.maxEntries ?? GROUNDED_PPTX_LIMITS.maxEntries)) {
    throw new GroundedPptxPayloadTooLargeError('PPTX package has too many entries');
  }
  let expanded = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    await new Promise<void>((resolve, reject) => {
      const stream = (entry as unknown as { internalStream(type: string): CountingZipStream })
        .internalStream('uint8array');
      let settled = false;
      let terminating = false;
      let terminationError: Error | null = null;
      stream.terminate = (error: Error) => {
        terminationError = error;
        const worker = (stream as unknown as { _worker: { error(cause: Error): void } })._worker;
        setTimeout(() => worker.error(error), 0);
      };
      stream.on('data', (chunk: Uint8Array) => {
        if (settled || terminating) return;
        expanded += chunk.byteLength;
        if (expanded > (limits.maxUncompressedBytes ?? GROUNDED_PPTX_LIMITS.maxUncompressedBytes)) {
          terminating = true;
          stream.terminate(new GroundedPptxPayloadTooLargeError('PPTX package expanded size exceeds limit'));
        }
      });
      stream.on('error', (error: Error) => { if (!settled) { settled = true; reject(error); } });
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        if (terminationError) reject(terminationError);
        else resolve();
      });
      stream.resume();
    });
  }
}

export async function validateGroundedPptxPackage(bytes: Uint8Array | ArrayBuffer, limits: PackageLimits = {}): Promise<void> {
  return validatePackage(bytes, limits);
}

async function loadBoundedPresentation(bytes: Uint8Array | ArrayBuffer) {
  await validatePackage(bytes);
  const presentation = await loadPresentation(bytes);
  assertGroundedPptxSlideCount(getSlides(presentation).length);
  return presentation;
}

export interface GroundedSlidePreview { index: number; width: number; height: number; png: Uint8Array }
export interface DuplicateSlideMutation {
  op: 'duplicateSlide'; sourceIndex: number; insertAt: number;
  replacements: Array<{ placeholder: string; text: string }>;
}
export type GroundedMutation = DuplicateSlideMutation;
export interface GroundedMutationResult { bytes: Uint8Array; validationIssues: ReadonlyArray<ValidationIssue> }
export interface GroundedPresentationStructure {
  slideCount: number;
  slideSize: { width: number; height: number; type?: string };
  theme: { name: string; colorScheme: Record<string, string> };
  slides: Array<{ index: number; title: string | null; text: string; layout: { name: string; type: string | null; partName: string } | null }>;
}

export async function inspectGroundedPresentation(bytes: Uint8Array | ArrayBuffer): Promise<GroundedPresentationStructure> {
  return groundedPptxProcessWork.run(async () => {
    const presentation = await loadBoundedPresentation(bytes);
    const slideSize = getSlideSize(presentation);
    if (slideSize === null) throw new Error('PPTX presentation has no slide size');
    const theme = getPresentationTheme(presentation);
    if (theme === null) throw new Error('PPTX presentation has no theme');
    const { name, ...colorScheme } = theme;
    const slides = getSlides(presentation).map((slide, index) => {
      const layout = getSlideLayout(slide);
      return {
        index, title: getSlideTitle(slide), text: getSlideText(slide),
        layout: layout === null ? null : {
          name: getSlideLayoutName(layout), type: getSlideLayoutType(layout), partName: getSlideLayoutPartName(layout),
        },
      };
    });
    return {
      slideCount: slides.length,
      slideSize: { width: slideSize.width, height: slideSize.height, ...(slideSize.type === undefined ? {} : { type: slideSize.type }) },
      theme: { name, colorScheme }, slides,
    };
  });
}

function expectedRenderHeight(width: number, height: number, renderWidth: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      width > GROUNDED_PPTX_LIMITS.maxSlideDimension || height > GROUNDED_PPTX_LIMITS.maxSlideDimension) {
    throw new GroundedPptxPayloadTooLargeError('PPTX slide dimensions exceed limit');
  }
  if (Math.max(width / height, height / width) > GROUNDED_PPTX_LIMITS.maxAspectRatio) {
    throw new GroundedPptxPayloadTooLargeError('PPTX slide aspect ratio exceeds limit');
  }
  const outputHeight = Math.ceil(renderWidth * height / width);
  if (!Number.isSafeInteger(outputHeight) || renderWidth * outputHeight > GROUNDED_PPTX_LIMITS.maxRenderPixels) {
    throw new GroundedPptxPayloadTooLargeError('PPTX preview pixel count exceeds limit');
  }
  return outputHeight;
}

/** Rasterizes only the requested slide through the internal Office-Kit adapter. */
export async function renderGroundedSlide(
  bytes: Uint8Array | ArrayBuffer, index: number, options: { width?: number } = {},
): Promise<GroundedSlidePreview> {
  if (!Number.isInteger(index) || index < 0) throw new Error('slide index is out of bounds');
  const width = options.width ?? 1_280;
  if (!Number.isInteger(width) || width < 1 || width > GROUNDED_PPTX_LIMITS.maxRenderWidth) {
    throw new GroundedPptxPayloadTooLargeError('render width exceeds limit');
  }
  return groundedPptxProcessWork.run(async () => {
    const presentation = await loadBoundedPresentation(bytes);
    const slide = getSlides(presentation)[index];
    if (!slide) throw new Error('slide index is out of bounds');
    const slideSize = getSlideSize(presentation);
    if (slideSize === null) throw new Error('PPTX presentation has no slide size');
    const outputHeight = expectedRenderHeight(slideSize.width, slideSize.height, width);
    const { image, png } = renderSlideToRgba(presentation, slide, { width });
    if (image.width !== width || image.height !== outputHeight || image.width * image.height > GROUNDED_PPTX_LIMITS.maxRenderPixels) {
      throw new GroundedPptxPayloadTooLargeError('PPTX renderer dimensions exceed limit');
    }
    if (png.byteLength > GROUNDED_PPTX_LIMITS.maxPngBytes) {
      throw new GroundedPptxPayloadTooLargeError('PPTX preview PNG size exceeds limit');
    }
    return { index, width: image.width, height: image.height, png };
  });
}

export function assertGroundedPptxMutationOutput(bytes: Uint8Array, maximum = GROUNDED_PPTX_LIMITS.maxMutationOutputBytes): void {
  if (bytes.byteLength > maximum) throw new GroundedPptxPayloadTooLargeError('PPTX mutation output size exceeds limit');
}

function xmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)) attributes[match[1]!] = match[3]!;
  return attributes;
}

function relationships(xml: string): Array<Record<string, string>> {
  return [...xml.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].map((match) => xmlAttributes(match[0]));
}

async function assertMutationSourcesHaveSupportedRelationships(
  bytes: Uint8Array | ArrayBuffer,
  mutations: ReadonlyArray<GroundedMutation>,
): Promise<void> {
  const zip = await JSZip.loadAsync(bytes);
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string');
  const presentationRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
  if (!presentationXml || !presentationRelsXml) {
    throw new GroundedPptxClientInputError('unsupported PPTX slide relationship graph');
  }
  const targets = new Map(relationships(presentationRelsXml).map((item) => [item.Id, item.Target]));
  const slideParts = [...presentationXml.matchAll(/<p:sldId\b[^>]*\/?\s*>/g)].map((match) => {
    const id = xmlAttributes(match[0])['r:id'];
    const target = id ? targets.get(id) : undefined;
    if (!target) throw new GroundedPptxClientInputError('unsupported PPTX slide relationship graph');
    return path.posix.normalize(path.posix.join('ppt', target));
  });
  for (const mutation of mutations) {
    const sourcePart = slideParts[mutation.sourceIndex];
    if (!sourcePart) continue;
    const relsPath = path.posix.join(
      path.posix.dirname(sourcePart), '_rels', `${path.posix.basename(sourcePart)}.rels`,
    );
    const relsXml = await zip.file(relsPath)?.async('string');
    if (!relsXml) throw new GroundedPptxClientInputError('unsupported PPTX slide relationship graph');
    for (const relationship of relationships(relsXml)) {
      if (relationship.TargetMode === 'External') continue;
      const kind = relationship.Type?.split('/').at(-1) ?? 'unknown';
      if (kind !== 'slideLayout' && kind !== 'image') {
        throw new GroundedPptxClientInputError(`unsupported slide relationship for duplication: ${kind}`);
      }
    }
    slideParts.splice(mutation.insertAt, 0, sourcePart);
  }
}

export async function applyGroundedMutations(
  bytes: Uint8Array | ArrayBuffer, mutations: ReadonlyArray<GroundedMutation>,
): Promise<GroundedMutationResult> {
  return groundedPptxProcessWork.run(async () => {
    const presentation = await loadBoundedPresentation(bytes);
    await assertMutationSourcesHaveSupportedRelationships(bytes, mutations);
    for (const mutation of mutations) {
      const slides = getSlides(presentation);
      const source = slides[mutation.sourceIndex];
      if (source === undefined) throw new GroundedPptxClientInputError(`duplicateSlide sourceIndex ${mutation.sourceIndex} is out of bounds`);
      if (mutation.insertAt < 0 || mutation.insertAt > slides.length) throw new GroundedPptxClientInputError(`duplicateSlide insertAt ${mutation.insertAt} is out of bounds`);
      const duplicate = duplicateSlideAt(presentation, mutation.insertAt, source);
      assertGroundedPptxSlideCount(getSlides(presentation).length);
      for (const replacement of mutation.replacements) {
        const matches = findSlidePlaceholders(duplicate, replacement.placeholder);
        if (matches.length !== 1) throw new GroundedPptxClientInputError(`placeholder ${JSON.stringify(replacement.placeholder)} resolved to ${matches.length} shapes`);
        setShapeText(matches[0]!, replacement.text);
      }
    }
    const validationIssues = validatePresentation(presentation);
    const output = await savePresentation(presentation);
    assertGroundedPptxMutationOutput(output);
    const reloaded = await loadBoundedPresentation(output);
    return { bytes: output, validationIssues: [...validationIssues, ...validatePresentation(reloaded)] };
  });
}
