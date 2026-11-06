import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const OVERLAP_THRESHOLD_PX = 2;
const MATERIAL_OVERLAP_RATIO = 0.2;
const RESOURCE_READY_TIMEOUT_MS = 10_000;
const GEOMETRY_STABILITY_FRAMES = 3;
const GEOMETRY_STABILITY_TIMEOUT_MS = 10_000;

export interface DeckLayoutAuditOptions {
  artifactPath: string;
  outputDir: string;
  slideIndex?: number;
  slideLabel?: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextCandidate {
  ownerSelector: string;
  textNodeIndex: number;
  lineIndex: number;
  text: string;
  rect: Rect;
}

interface CollisionIssue {
  type: 'text-collision';
  first: TextCandidate;
  second: TextCandidate;
  overlap: Rect;
}

interface ClippedTextIssue {
  type: 'clipped-text';
  candidate: TextCandidate;
  visibleRect: Rect | null;
  clippedBy: string;
}

interface ActivationIssue {
  type: 'activation-failed';
  slideSelector: string;
}

export type DeckLayoutIssue = CollisionIssue | ClippedTextIssue | ActivationIssue;

export interface DeckSlideAudit {
  index: number;
  selector: string;
  label: string | null;
  candidateCount: number;
  collisionCount: number;
  issues: DeckLayoutIssue[];
  screenshot: string | null;
}

export interface DeckLayoutAuditReport {
  artifact: {
    path: string;
    sha256: string;
  };
  strategy: {
    coordinateSpace: 'canonical-deck-stage-css-pixels';
    tolerancePx: number;
    materialOverlapRatio: number;
  };
  canvas: {
    width: number;
    height: number;
  };
  slideCount: number;
  slides: DeckSlideAudit[];
  summary: {
    passed: boolean;
    issueCount: number;
    collisionCount: number;
    clippedTextCount: number;
    activationFailureCount: number;
    zeroSlideFailureCount: number;
  };
}

interface DeckSnapshot {
  stageTransform: string;
  stageTransformOrigin: string;
  slideActiveStates: boolean[];
}

interface DeckMetadata {
  width: number;
  height: number;
  slides: Array<{
    index: number;
    selector: string;
    label: string | null;
  }>;
}

interface BrowserSlideAudit {
  candidateCount: number;
  issues: DeckLayoutIssue[];
}

const DECK_LAYOUT_AUDIT_STRATEGY: DeckLayoutAuditReport['strategy'] = {
  coordinateSpace: 'canonical-deck-stage-css-pixels',
  tolerancePx: OVERLAP_THRESHOLD_PX,
  materialOverlapRatio: MATERIAL_OVERLAP_RATIO,
};

export async function auditDeckLayout(
  page: Page,
  options: DeckLayoutAuditOptions,
): Promise<DeckLayoutAuditReport> {
  const artifactPath = path.resolve(options.artifactPath);
  const outputDir = path.resolve(options.outputDir);
  const artifactBytes = await readFile(artifactPath);
  const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');

  await mkdir(outputDir, { recursive: true });
  // tsx preserves callback names with this helper when serializing page.evaluate functions.
  await page.evaluate(
    "Object.defineProperty(globalThis, '__name', { value: (target) => target, configurable: true });",
  );
  await waitForRenderableAssets(page);

  const snapshot = await neutralizeDeckAndReadMetadata(page);
  let metadata: DeckMetadata | null = null;

  try {
    await waitForStableGeometry(page);
    metadata = await readDeckMetadata(page);
    assertSupportedCanvas(metadata);
    if (metadata.slides.length === 0) {
      const report = createZeroSlideReport(artifactPath, artifactSha256, metadata);
      await writeAuditReport(outputDir, report);
      return report;
    }
    assertDirectedSlideExists(metadata, options);

    const directedIndexes = resolveDirectedSlideIndexes(metadata, options);
    const slides: DeckSlideAudit[] = [];

    for (const slide of metadata.slides) {
      await activateSlide(page, slide.index);
      await waitForStableGeometry(page);

      const browserAudit = await auditActiveSlide(page, slide.index);
      const shouldCapture =
        browserAudit.issues.length > 0 || directedIndexes.has(slide.index);
      const screenshot = shouldCapture
        ? await captureSlide(page, outputDir, slide)
        : null;

      slides.push({
        ...slide,
        candidateCount: browserAudit.candidateCount,
        collisionCount: browserAudit.issues.filter(
          (issue) => issue.type === 'text-collision',
        ).length,
        issues: browserAudit.issues,
        screenshot,
      });
    }

    const allIssues = slides.flatMap((slide) => slide.issues);
    const report: DeckLayoutAuditReport = {
      artifact: {
        path: artifactPath,
        sha256: artifactSha256,
      },
      strategy: DECK_LAYOUT_AUDIT_STRATEGY,
      canvas: {
        width: metadata.width,
        height: metadata.height,
      },
      slideCount: metadata.slides.length,
      slides,
      summary: {
        passed: allIssues.length === 0,
        issueCount: allIssues.length,
        collisionCount: allIssues.filter((issue) => issue.type === 'text-collision').length,
        clippedTextCount: allIssues.filter((issue) => issue.type === 'clipped-text').length,
        activationFailureCount: allIssues.filter(
          (issue) => issue.type === 'activation-failed',
        ).length,
        zeroSlideFailureCount: 0,
      },
    };

    await writeAuditReport(outputDir, report);
    return report;
  } finally {
    await restoreDeck(page, snapshot);
  }
}

async function waitForRenderableAssets(page: Page): Promise<void> {
  await page.evaluate(async (timeoutMs) => {
    const images = Array.from(document.images);
    const pendingImages = new Map(
      images.map((image, index) => [
        index,
        image.currentSrc || image.src || `<image ${index + 1}>`,
      ]),
    );
    let fontsPending = true;

    const fontsReady = (async () => {
      await document.fonts.ready;
      const failedFonts = Array.from(document.fonts).filter(
        (font) => font.status === 'error',
      );
      if (failedFonts.length > 0) {
        const descriptions = failedFonts
          .map((font) => `${font.family} ${font.style} ${font.weight}`.trim())
          .join(', ');
        throw new Error(
          `Resource readiness failed during font-load: ${descriptions}`,
        );
      }
      fontsPending = false;
    })();

    const imagesReady = Promise.all(
      images.map(async (image, index) => {
        const source = image.currentSrc || image.src || `<image ${index + 1}>`;
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener(
              'error',
              () =>
                reject(
                  new Error(
                    `Resource readiness failed during image-load: ${source}`,
                  ),
                ),
              { once: true },
            );
          });
        }
        if (image.naturalWidth === 0) {
          throw new Error(
            `Resource readiness failed during image-load: ${source}`,
          );
        }
        try {
          await image.decode();
        } catch (error) {
          const detail = error instanceof Error ? `: ${error.message}` : '';
          throw new Error(
            `Resource readiness failed during image-decode: ${source}${detail}`,
          );
        }
        pendingImages.delete(index);
      }),
    );

    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        const pendingStages = [
          ...(fontsPending ? ['fonts'] : []),
          ...(pendingImages.size > 0
            ? [`images (${Array.from(pendingImages.values()).join(', ')})`]
            : []),
        ];
        reject(
          new Error(
            `Resource readiness timed out after ${timeoutMs}ms; pending stages: ${pendingStages.join(', ') || 'unknown'}`,
          ),
        );
      }, timeoutMs);
    });

    try {
      await Promise.race([Promise.all([fontsReady, imagesReady]), timeout]);
    } finally {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    }
  }, RESOURCE_READY_TIMEOUT_MS);
}

async function neutralizeDeckAndReadMetadata(page: Page): Promise<DeckSnapshot> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.deck-stage');
    if (stage == null) {
      throw new Error('Unsupported deck: missing .deck-stage.');
    }

    const slides = Array.from(stage.querySelectorAll<HTMLElement>('.slide'));
    const snapshot = {
      stageTransform: stage.style.transform,
      stageTransformOrigin: stage.style.transformOrigin,
      slideActiveStates: slides.map((slide) => slide.classList.contains('active')),
    };

    stage.style.transform = 'none';
    stage.style.transformOrigin = 'top left';
    return snapshot;
  });
}

async function readDeckMetadata(page: Page): Promise<DeckMetadata> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.deck-stage');
    if (stage == null) {
      throw new Error('Unsupported deck: missing .deck-stage.');
    }

    const stageRect = stage.getBoundingClientRect();
    const slides = Array.from(stage.querySelectorAll<HTMLElement>('.slide'));
    return {
      width: stageRect.width,
      height: stageRect.height,
      slides: slides.map((slide, zeroBasedIndex) => ({
        index: zeroBasedIndex + 1,
        selector: `.deck-stage > .slide:nth-of-type(${zeroBasedIndex + 1})`,
        label: slide.getAttribute('data-screen-label'),
      })),
    };
  });
}

function createZeroSlideReport(
  artifactPath: string,
  artifactSha256: string,
  metadata: DeckMetadata,
): DeckLayoutAuditReport {
  return {
    artifact: {
      path: artifactPath,
      sha256: artifactSha256,
    },
    strategy: DECK_LAYOUT_AUDIT_STRATEGY,
    canvas: {
      width: metadata.width,
      height: metadata.height,
    },
    slideCount: 0,
    slides: [],
    summary: {
      passed: false,
      issueCount: 1,
      collisionCount: 0,
      clippedTextCount: 0,
      activationFailureCount: 0,
      zeroSlideFailureCount: 1,
    },
  };
}

async function writeAuditReport(
  outputDir: string,
  report: DeckLayoutAuditReport,
): Promise<void> {
  await writeFile(
    path.join(outputDir, 'deck-layout-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

function assertSupportedCanvas(metadata: DeckMetadata): void {
  const widthMatches = Math.abs(metadata.width - CANVAS_WIDTH) <= 0.5;
  const heightMatches = Math.abs(metadata.height - CANVAS_HEIGHT) <= 0.5;
  if (!widthMatches || !heightMatches) {
    throw new Error(
      `Unsupported deck canvas ${metadata.width}x${metadata.height}; expected ${CANVAS_WIDTH}x${CANVAS_HEIGHT}.`,
    );
  }
}

function assertDirectedSlideExists(
  metadata: DeckMetadata,
  options: DeckLayoutAuditOptions,
): void {
  if (
    options.slideIndex != null &&
    !metadata.slides.some((slide) => slide.index === options.slideIndex)
  ) {
    throw new Error(
      `Slide index ${options.slideIndex} is out of range; deck has ${metadata.slides.length} slides.`,
    );
  }

  if (
    options.slideLabel != null &&
    !metadata.slides.some((slide) => slide.label === options.slideLabel)
  ) {
    throw new Error(`Slide label not found: ${options.slideLabel}`);
  }
}

function resolveDirectedSlideIndexes(
  metadata: DeckMetadata,
  options: DeckLayoutAuditOptions,
): Set<number> {
  const indexes = new Set<number>();
  if (options.slideIndex != null) {
    indexes.add(options.slideIndex);
  }
  if (options.slideLabel != null) {
    for (const slide of metadata.slides) {
      if (slide.label === options.slideLabel) {
        indexes.add(slide.index);
      }
    }
  }
  return indexes;
}

async function activateSlide(page: Page, oneBasedIndex: number): Promise<void> {
  await page.evaluate((requestedIndex) => {
    const stage = document.querySelector<HTMLElement>('.deck-stage');
    if (stage == null) {
      throw new Error('Unsupported deck: missing .deck-stage.');
    }
    const slides = Array.from(stage.querySelectorAll<HTMLElement>('.slide'));
    for (const [zeroBasedIndex, slide] of slides.entries()) {
      slide.classList.toggle('active', zeroBasedIndex + 1 === requestedIndex);
    }
  }, oneBasedIndex);
}

async function waitForStableGeometry(page: Page): Promise<void> {
  const deadline = Date.now() + GEOMETRY_STABILITY_TIMEOUT_MS;
  let previousSignature: string | null = null;
  let stableFrames = 0;

  while (Date.now() < deadline) {
    const signature = await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const stage = document.querySelector<HTMLElement>('.deck-stage');
      if (stage == null) {
        throw new Error('Unsupported deck: missing .deck-stage.');
      }
      const activeSlide = stage.querySelector<HTMLElement>('.slide.active');
      const elements =
        activeSlide == null
          ? [stage]
          : [stage, activeSlide, ...Array.from(activeSlide.querySelectorAll<HTMLElement>('*'))];
      return JSON.stringify(
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return [
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            style.display,
            style.visibility,
            style.opacity,
          ];
        }),
      );
    });

    stableFrames = signature === previousSignature ? stableFrames + 1 : 1;
    previousSignature = signature;
    if (stableFrames >= GEOMETRY_STABILITY_FRAMES) {
      return;
    }
  }

  throw new Error(
    `Deck geometry did not remain stable for ${GEOMETRY_STABILITY_FRAMES} animation frames within ${GEOMETRY_STABILITY_TIMEOUT_MS}ms.`,
  );
}

async function auditActiveSlide(page: Page, oneBasedIndex: number): Promise<BrowserSlideAudit> {
  return page.evaluate(
    ({ requestedIndex, overlapThreshold, materialOverlapRatio }) => {
      interface BrowserRect {
        x: number;
        y: number;
        width: number;
        height: number;
      }

      interface BrowserCandidate {
        ownerSelector: string;
        textNodeIndex: number;
        lineIndex: number;
        text: string;
        rect: BrowserRect;
      }

      interface CandidateWithVisibleRect {
        candidate: BrowserCandidate;
        visibleRect: BrowserRect;
      }

      const stage = document.querySelector<HTMLElement>('.deck-stage');
      if (stage == null) {
        throw new Error('Unsupported deck: missing .deck-stage.');
      }
      const slides = Array.from(stage.querySelectorAll<HTMLElement>('.slide'));
      const slide = slides[requestedIndex - 1];
      if (slide == null) {
        throw new Error(`Slide index ${requestedIndex} disappeared during audit.`);
      }

      const slideSelector = `.deck-stage > .slide:nth-of-type(${requestedIndex})`;
      const slideStyle = getComputedStyle(slide);
      if (!slide.classList.contains('active') || slideStyle.display === 'none') {
        return {
          candidateCount: 0,
          issues: [{ type: 'activation-failed', slideSelector }],
        };
      }

      const stageRect = stage.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();
      const candidates: CandidateWithVisibleRect[] = [];
      const issues: Array<
        | {
            type: 'text-collision';
            first: BrowserCandidate;
            second: BrowserCandidate;
            overlap: BrowserRect;
          }
        | {
            type: 'clipped-text';
            candidate: BrowserCandidate;
            visibleRect: BrowserRect | null;
            clippedBy: string;
          }
      > = [];

      const round = (value: number): number => Math.round(value * 1000) / 1000;
      const relativeRect = (rect: DOMRect): BrowserRect => ({
        x: round(rect.left - stageRect.left),
        y: round(rect.top - stageRect.top),
        width: round(rect.width),
        height: round(rect.height),
      });
      const intersect = (
        first: BrowserRect,
        second: BrowserRect,
      ): BrowserRect | null => {
        const left = Math.max(first.x, second.x);
        const top = Math.max(first.y, second.y);
        const right = Math.min(first.x + first.width, second.x + second.width);
        const bottom = Math.min(first.y + first.height, second.y + second.height);
        if (right <= left || bottom <= top) {
          return null;
        }
        return {
          x: round(left),
          y: round(top),
          width: round(right - left),
          height: round(bottom - top),
        };
      };
      const area = (rect: BrowserRect): number => rect.width * rect.height;
      const containsReadableText = (candidate: BrowserCandidate): boolean =>
        /[\p{L}\p{N}]/u.test(candidate.text);
      const elementSelector = (element: Element): string => {
        if (element === slide) {
          return slideSelector;
        }
        const segments: string[] = [];
        let cursor: Element | null = element;
        while (cursor != null && cursor !== slide) {
          const parentElement: Element | null = cursor.parentElement;
          if (parentElement == null) {
            break;
          }
          const cursorTagName = cursor.tagName;
          const siblings = Array.from(parentElement.children).filter(
            (candidate: Element) => candidate.tagName === cursorTagName,
          );
          const ordinal = siblings.indexOf(cursor) + 1;
          segments.unshift(
            `${cursor.tagName.toLowerCase()}:nth-of-type(${Math.max(ordinal, 1)})`,
          );
          cursor = parentElement;
        }
        return `${slideSelector} > ${segments.join(' > ')}`;
      };
      const clippingAxes = (
        element: Element,
      ): { clipsX: boolean; clipsY: boolean } => {
        const style = getComputedStyle(element);
        const clippedValues = new Set(['hidden', 'clip', 'auto', 'scroll']);
        return {
          clipsX: clippedValues.has(style.overflowX),
          clipsY: clippedValues.has(style.overflowY),
        };
      };
      const clippedRectFor = (
        originalRect: BrowserRect,
        owner: Element,
      ): { rect: BrowserRect | null; clippedBy: string | null } => {
        let visibleRect: BrowserRect | null = originalRect;
        let clippedBy: string | null = null;
        let cursor: Element | null = owner;
        while (cursor != null && visibleRect != null) {
          const { clipsX, clipsY } = clippingAxes(cursor);
          if (cursor === slide || clipsX || clipsY) {
            const clientRect = relativeRect(cursor.getBoundingClientRect());
            const boundary: BrowserRect = {
              x: clipsX || cursor === slide ? clientRect.x : visibleRect.x,
              y: clipsY || cursor === slide ? clientRect.y : visibleRect.y,
              width: clipsX || cursor === slide ? clientRect.width : visibleRect.width,
              height: clipsY || cursor === slide ? clientRect.height : visibleRect.height,
            };
            const nextRect = intersect(visibleRect, boundary);
            if (
              nextRect == null ||
              nextRect.width < visibleRect.width - overlapThreshold ||
              nextRect.height < visibleRect.height - overlapThreshold
            ) {
              clippedBy = elementSelector(cursor);
            }
            visibleRect = nextRect;
          }
          if (cursor === slide) {
            break;
          }
          cursor = cursor.parentElement;
        }
        return { rect: visibleRect, clippedBy };
      };
      const isVisibleTextNode = (node: Text): boolean => {
        const owner = node.parentElement;
        if (owner == null || node.textContent?.trim().length === 0) {
          return false;
        }
        let cumulativeOpacity = 1;
        let cursor: Element | null = owner;
        while (cursor != null) {
          const style = getComputedStyle(cursor);
          cumulativeOpacity *= Number.parseFloat(style.opacity || '1');
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.visibility === 'collapse' ||
            cumulativeOpacity <= 0.01 ||
            cursor.getAttribute('aria-hidden') === 'true'
          ) {
            return false;
          }
          if (cursor === slide) {
            break;
          }
          cursor = cursor.parentElement;
        }
        return true;
      };

      const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current != null) {
        const textNode = current as Text;
        if (isVisibleTextNode(textNode)) {
          const owner = textNode.parentElement;
          if (owner != null) {
            const ownerTextNodes = Array.from(owner.childNodes).filter(
              (node) => node.nodeType === Node.TEXT_NODE,
            );
            const textNodeIndex = ownerTextNodes.indexOf(textNode);
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const lineRects = Array.from(range.getClientRects()).filter(
              (rect) => rect.width > 0 && rect.height > 0,
            );

            for (const [lineIndex, domRect] of lineRects.entries()) {
              const rect = relativeRect(domRect);
              const candidate: BrowserCandidate = {
                ownerSelector: elementSelector(owner),
                textNodeIndex,
                lineIndex,
                text: (textNode.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
                rect,
              };
              const clipped = clippedRectFor(rect, owner);
              if (
                clipped.clippedBy != null &&
                (clipped.rect == null ||
                  clipped.rect.width < rect.width - overlapThreshold ||
                  clipped.rect.height < rect.height - overlapThreshold)
              ) {
                issues.push({
                  type: 'clipped-text',
                  candidate,
                  visibleRect: clipped.rect,
                  clippedBy: clipped.clippedBy,
                });
              }
              if (clipped.rect != null) {
                candidates.push({ candidate, visibleRect: clipped.rect });
              }
            }
          }
        }
        current = walker.nextNode();
      }

      for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
        const first = candidates[firstIndex];
        if (first == null) {
          continue;
        }
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < candidates.length;
          secondIndex += 1
        ) {
          const second = candidates[secondIndex];
          if (second == null) {
            continue;
          }
          if (
            first.candidate.ownerSelector === second.candidate.ownerSelector
          ) {
            // Text nodes in one flow owner (for example, the two sides of a
            // <br>) are laid out as one typographic unit. Their Range boxes can
            // overlap under tight line-height even when the glyphs do not.
            continue;
          }
          if (
            !containsReadableText(first.candidate) ||
            !containsReadableText(second.candidate)
          ) {
            // Punctuation-only nodes are decorative marks, not readable copy.
            continue;
          }
          const overlap = intersect(first.visibleRect, second.visibleRect);
          const smallerArea = Math.min(
            area(first.visibleRect),
            area(second.visibleRect),
          );
          // Range rectangles describe CSS line boxes, which include leading.
          // Require material coverage so adjacent lines are not reported as
          // colliding solely because their line boxes touch.
          if (
            overlap != null &&
            overlap.width > overlapThreshold &&
            overlap.height > overlapThreshold &&
            smallerArea > 0 &&
            area(overlap) / smallerArea >= materialOverlapRatio
          ) {
            issues.push({
              type: 'text-collision',
              first: first.candidate,
              second: second.candidate,
              overlap,
            });
          }
        }
      }

      return {
        candidateCount: candidates.length,
        issues,
      };
    },
    {
      requestedIndex: oneBasedIndex,
      overlapThreshold: OVERLAP_THRESHOLD_PX,
      materialOverlapRatio: MATERIAL_OVERLAP_RATIO,
    },
  );
}

async function captureSlide(
  page: Page,
  outputDir: string,
  slide: DeckMetadata['slides'][number],
): Promise<string> {
  const slug = (slide.label ?? 'unlabelled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const filename = `slide-${String(slide.index).padStart(2, '0')}-${slug || 'unlabelled'}.png`;
  const outputPath = path.join(outputDir, filename);
  await page.locator('.deck-stage').screenshot({
    path: outputPath,
    animations: 'disabled',
  });
  return outputPath;
}

async function restoreDeck(page: Page, snapshot: DeckSnapshot): Promise<void> {
  await page.evaluate((original) => {
    const stage = document.querySelector<HTMLElement>('.deck-stage');
    if (stage == null) {
      return;
    }
    stage.style.transform = original.stageTransform;
    stage.style.transformOrigin = original.stageTransformOrigin;
    const slides = Array.from(stage.querySelectorAll<HTMLElement>('.slide'));
    for (const [index, slide] of slides.entries()) {
      slide.classList.toggle('active', original.slideActiveStates[index] ?? false);
    }
  }, snapshot);
}
