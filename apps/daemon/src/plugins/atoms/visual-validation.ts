import path from 'node:path';
import { promises as fsp } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { type Page, type ViewportSize } from 'playwright';
import { detectEntryFile } from '../../projects.js';
import type { UntilSignals } from '../until.js';

const DEFAULT_PIXELMATCH_THRESHOLD = 0.1;
const DEFAULT_DIFF_BOX_PADDING = 12;
const DEFAULT_DIFF_BOX_MERGE_DISTANCE = 24;
const DEFAULT_DIFF_BOX_STROKE_WIDTH = 2;
const DEFAULT_MAX_DIFF_BOX_REGIONS = 12;
const DEFAULT_MAX_CANVAS_PIXELS = 16_000_000;
const DIFF_COLOR = [255, 76, 76] as const;
const IGNORED_REFERENCE_SCAN_DIRS = new Set(['critique', 'dist', 'node_modules', '.next']);
const AUTO_DISCOVERED_REFERENCE_IMAGE_RE = /\.png$/i;
const PACKAGED_PLAYWRIGHT_BROWSERS_DIR = 'ms-playwright';
const VISUAL_VALIDATION_CHROMIUM_CHANNEL = 'chromium';

export interface VisualValidationCaptureInput {
  entryFile: string;
  entryUrl: string;
  outputPath: string;
  viewport: ViewportSize;
}

export interface VisualValidationRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface VisualValidationComparison {
  referencePath: string;
  actualPath: string;
  diffPath: string;
  referenceWidth: number;
  referenceHeight: number;
  actualWidth: number;
  actualHeight: number;
  comparedWidth: number;
  comparedHeight: number;
  diffPixels: number;
  diffRatio: number;
  similarity: number;
  regions: VisualValidationRegion[];
  suggestions: string[];
}

export interface VisualValidationReport {
  status: 'ok' | 'skipped' | 'failed';
  entryFile: string | null;
  message: string;
  comparedAt: string;
  comparison: VisualValidationComparison | null;
}

export interface RunVisualValidationOptions {
  cwd: string;
  projectId?: string | null;
  daemonUrl?: string | null;
  referenceImages?: ReadonlyArray<string>;
  entryFile?: string | null;
  entryUrl?: string | null;
  pixelmatchThreshold?: number;
  captureScreenshot?: (input: VisualValidationCaptureInput) => Promise<void>;
}

export async function runVisualValidation(
  input: RunVisualValidationOptions,
): Promise<{ report: VisualValidationReport; signals: UntilSignals }> {
  const cwd = path.resolve(input.cwd);
  const entryFile = input.entryFile ?? await detectEntryFile(cwd);
  let outputDir: string | null = null;

  try {
    const referenceImages = await resolveReferenceImages(cwd, input.referenceImages);
    if (referenceImages.length === 0) {
      return {
        report: {
          status: 'skipped',
          entryFile,
          message: 'skipped: no reference screenshot found for visual validation',
          comparedAt: new Date().toISOString(),
          comparison: null,
        },
        signals: {},
      };
    }

    outputDir = path.join(cwd, 'critique', 'visual-validation');
    await fsp.mkdir(outputDir, { recursive: true });
    if (!entryFile) {
      const failure = buildFailedVisualValidationResult(
        null,
        'visual validation failed: no HTML entry file found for visual validation',
      );
      await writeVisualValidationArtifacts(outputDir, failure.report);
      return failure;
    }

    let best: VisualValidationComparison | null = null;
    for (const [index, referencePath] of referenceImages.entries()) {
      const reference = PNG.sync.read(await fsp.readFile(referencePath));
      assertPngSize(reference, referencePath);
      const viewport = viewportForReference(reference, referencePath);
      const stem = buildReferenceArtifactStem(cwd, referencePath, index);
      const actualPath = path.join(outputDir, `${stem}.actual.png`);
      const diffPath = path.join(outputDir, `${stem}.diff.png`);
      const capture = input.captureScreenshot ?? captureWithPlaywright;
      const entryUrl = await resolveVisualValidationEntryUrl({
        entryFile,
        ...(input.projectId == null ? {} : { projectId: input.projectId }),
        ...(input.daemonUrl == null ? {} : { daemonUrl: input.daemonUrl }),
        ...(input.entryUrl == null ? {} : { entryUrl: input.entryUrl }),
      });
      await capture({
        entryFile,
        entryUrl,
        outputPath: actualPath,
        viewport,
      });
      const actual = PNG.sync.read(await fsp.readFile(actualPath));
      assertPngSize(actual, actualPath);
      const comparison = await comparePngs({
        cwd,
        reference,
        referencePath,
        actual,
        actualPath,
        diffPath,
        pixelmatchThreshold: input.pixelmatchThreshold ?? DEFAULT_PIXELMATCH_THRESHOLD,
      });
      if (!best || comparison.similarity < best.similarity) best = comparison;
    }

    if (!best) {
      const failure = buildFailedVisualValidationResult(
        entryFile,
        'visual validation failed before any comparisons completed',
      );
      await writeVisualValidationArtifacts(outputDir, failure.report);
      return failure;
    }

    const similarity = best.similarity;
    const critiqueBand = similarityToCritiqueScore(similarity);
    const report: VisualValidationReport = {
      status: 'ok',
      entryFile,
      message: summarizeComparison(best),
      comparedAt: new Date().toISOString(),
      comparison: best,
    };
    await writeVisualValidationArtifacts(outputDir, report);
    return {
      report,
      signals: {
        'preview.ok': true,
        'critique.score': critiqueBand,
      },
    };
  } catch (error) {
    const failure = buildFailedVisualValidationResult(
      entryFile,
      `visual validation failed: ${formatVisualValidationError(error)}`,
    );
    if (outputDir) {
      await writeVisualValidationArtifacts(outputDir, failure.report).catch(() => {});
    }
    return failure;
  }
}

export function similarityToCritiqueScore(similarity: number): number {
  if (similarity >= 98) return 5;
  if (similarity >= 95) return 4;
  if (similarity >= 88) return 3;
  if (similarity >= 78) return 2;
  return 1;
}

async function comparePngs(input: {
  cwd: string;
  reference: PNG;
  referencePath: string;
  actual: PNG;
  actualPath: string;
  diffPath: string;
  pixelmatchThreshold: number;
}): Promise<VisualValidationComparison> {
  const width = Math.max(input.reference.width, input.actual.width);
  const height = Math.max(input.reference.height, input.actual.height);
  assertPngPixels(width, height, `${input.referencePath} vs ${input.actualPath}`);
  const normalizedReference = normalizePng(input.reference, width, height);
  const normalizedActual = normalizePng(input.actual, width, height);
  const diffMask = new PNG({ width, height });
  const diffPixels = pixelmatch(
    normalizedReference.data,
    normalizedActual.data,
    diffMask.data,
    width,
    height,
    {
      threshold: input.pixelmatchThreshold,
      alpha: 0.2,
      diffColor: [DIFF_COLOR[0], DIFF_COLOR[1], DIFF_COLOR[2]],
    },
  );
  const highlighted = clonePng(normalizedActual);
  const mergedRegions = mergeDiffBoxes(diffBoxesFromMask(diffMask), DEFAULT_DIFF_BOX_MERGE_DISTANCE);
  for (const region of mergedRegions) {
    drawBox(highlighted, padBox(region, DEFAULT_DIFF_BOX_PADDING, width, height), DEFAULT_DIFF_BOX_STROKE_WIDTH);
  }
  await fsp.writeFile(input.diffPath, PNG.sync.write(highlighted));
  const totalPixels = width * height;
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;
  const similarity = Number(((1 - diffRatio) * 100).toFixed(2));
  return {
    referencePath: relativeToProject(input.cwd, input.referencePath),
    actualPath: relativeToProject(input.cwd, input.actualPath),
    diffPath: relativeToProject(input.cwd, input.diffPath),
    referenceWidth: input.reference.width,
    referenceHeight: input.reference.height,
    actualWidth: input.actual.width,
    actualHeight: input.actual.height,
    comparedWidth: width,
    comparedHeight: height,
    diffPixels,
    diffRatio: Number(diffRatio.toFixed(6)),
    similarity,
    regions: mergedRegions,
    suggestions: buildSuggestions({
      similarity,
      regionCount: mergedRegions.length,
      comparedWidth: width,
      comparedHeight: height,
      referenceWidth: input.reference.width,
      referenceHeight: input.reference.height,
      actualWidth: input.actual.width,
      actualHeight: input.actual.height,
    }),
  };
}

async function captureWithPlaywright(input: VisualValidationCaptureInput): Promise<void> {
  configurePackagedPlaywrightEnvironment();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(resolveVisualValidationChromiumLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: input.viewport, deviceScaleFactor: 1 });
    await stabilizePage(page);
    await page.goto(input.entryUrl, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: input.outputPath,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
    });
  } finally {
    await browser.close();
  }
}

export function resolveVisualValidationChromiumLaunchOptions(): { channel: 'chromium' } {
  return {
    // Playwright's default headless launch uses chromium_headless_shell-*.
    // Packaged builds may legitimately ship only chromium-* via `--no-shell`,
    // so force the bundled Chromium new-headless channel instead.
    channel: VISUAL_VALIDATION_CHROMIUM_CHANNEL,
  };
}

export function resolvePackagedPlaywrightBrowsersPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (configured) return configured;
  const resourceRoot = env.OD_RESOURCE_ROOT?.trim();
  if (!resourceRoot) return null;
  return path.join(resourceRoot, PACKAGED_PLAYWRIGHT_BROWSERS_DIR);
}

function configurePackagedPlaywrightEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const browsersPath = resolvePackagedPlaywrightBrowsersPath(env);
  if (!browsersPath || env.PLAYWRIGHT_BROWSERS_PATH?.trim()) return;
  env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}

async function stabilizePage(page: Page): Promise<void> {
  await page.addInitScript(`
    (() => {
      const style = document.createElement('style');
      style.textContent = \`
        *,
        *::before,
        *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          caret-color: transparent !important;
        }
        html {
          scroll-behavior: auto !important;
        }
      \`;
      document.documentElement.appendChild(style);
    })();
  `);
}

async function writeVisualValidationArtifacts(
  outputDir: string,
  report: VisualValidationReport,
): Promise<void> {
  await fsp.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const lines = [
    '# Visual validation',
    '',
    `Status: ${report.status}`,
    `Compared at: ${report.comparedAt}`,
    report.entryFile ? `Entry file: ${report.entryFile}` : 'Entry file: <none>',
    '',
    report.message,
  ];
  if (report.comparison) {
    lines.push(
      '',
      `Reference: ${report.comparison.referencePath}`,
      `Actual: ${report.comparison.actualPath}`,
      `Diff: ${report.comparison.diffPath}`,
      `Similarity: ${report.comparison.similarity}%`,
      `Diff ratio: ${(report.comparison.diffRatio * 100).toFixed(2)}%`,
    );
    if (report.comparison.suggestions.length > 0) {
      lines.push('', 'Suggestions:');
      for (const suggestion of report.comparison.suggestions) {
        lines.push(`- ${suggestion}`);
      }
    }
  }
  await fsp.writeFile(path.join(outputDir, 'summary.md'), lines.join('\n') + '\n', 'utf8');
}

function buildFailedVisualValidationResult(
  entryFile: string | null,
  message: string,
): { report: VisualValidationReport; signals: UntilSignals } {
  return {
    report: {
      status: 'failed',
      entryFile,
      message,
      comparedAt: new Date().toISOString(),
      comparison: null,
    },
    signals: { 'preview.ok': false, 'critique.score': 1 },
  };
}

async function resolveVisualValidationEntryUrl(input: {
  entryFile: string;
  projectId?: string | null;
  daemonUrl?: string | null;
  entryUrl?: string | null;
}): Promise<string> {
  if (typeof input.entryUrl === 'string' && input.entryUrl.length > 0) {
    return input.entryUrl;
  }
  if (!input.projectId || !input.daemonUrl) {
    throw new Error(
      'visual validation requires daemon preview context to resolve the project entry URL',
    );
  }
  const base = input.daemonUrl.replace(/\/+$/, '');
  const response = await fetch(
    `${base}/api/projects/${encodeURIComponent(input.projectId)}/preview-url?file=${encodeURIComponent(input.entryFile)}`,
    { headers: { accept: 'application/json' } },
  );
  if (!response.ok) {
    throw new Error(`visual validation preview route lookup failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json() as { url?: unknown };
  if (typeof payload.url !== 'string' || payload.url.length === 0) {
    throw new Error('visual validation preview route lookup returned no url');
  }
  return new URL(payload.url, `${base}/`).toString();
}

async function resolveReferenceImages(
  cwd: string,
  explicit?: ReadonlyArray<string>,
): Promise<string[]> {
  if (explicit && explicit.length > 0) {
    return explicit.map((entry) => path.resolve(cwd, entry));
  }

  const files = await walkFiles(cwd, '');
  const candidates = files.filter((relPath) => {
    const lower = relPath.toLowerCase();
    if (!AUTO_DISCOVERED_REFERENCE_IMAGE_RE.test(lower)) return false;
    if (lower.startsWith('critique/')) return false;
    return isAutoDiscoveredReferenceImage(lower);
  });
  candidates.sort();
  return candidates.map((relPath) => path.join(cwd, relPath));
}

function isAutoDiscoveredReferenceImage(relPath: string): boolean {
  const name = path.basename(relPath);
  const dirSegments = path.dirname(relPath)
    .split(/[\\/]+/)
    .filter((segment) => segment !== '.' && segment.length > 0);
  return isNamedReferenceImage(name)
    || dirSegments.includes('references')
    || dirSegments.includes('reference')
    || dirSegments.includes('spec');
}

function isNamedReferenceImage(name: string): boolean {
  return name.startsWith('reference')
    || name.startsWith('baseline')
    || name.startsWith('expected');
}

async function walkFiles(root: string, relDir: string): Promise<string[]> {
  const dir = relDir ? path.join(root, relDir) : root;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) continue;
    const relPath = relDir ? path.join(relDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_REFERENCE_SCAN_DIRS.has(entry.name)) continue;
      out.push(...await walkFiles(root, relPath));
      continue;
    }
    if (entry.isFile()) out.push(relPath);
  }
  return out;
}

function summarizeComparison(comparison: VisualValidationComparison): string {
  const parts = [
    `visual similarity ${comparison.similarity}% against ${path.basename(comparison.referencePath)}`,
    `${comparison.regions.length} highlighted diff region${comparison.regions.length === 1 ? '' : 's'}`,
  ];
  if (comparison.suggestions.length > 0) {
    parts.push(`focus: ${comparison.suggestions[0]}`);
  }
  return parts.join('; ');
}

function formatVisualValidationError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'unknown error';
}

function buildSuggestions(input: {
  similarity: number;
  regionCount: number;
  comparedWidth: number;
  comparedHeight: number;
  referenceWidth: number;
  referenceHeight: number;
  actualWidth: number;
  actualHeight: number;
}): string[] {
  const suggestions: string[] = [];
  if (Math.abs(input.referenceWidth - input.actualWidth) > 24 || Math.abs(input.referenceHeight - input.actualHeight) > 24) {
    suggestions.push('Match the reference canvas size or responsive breakpoint before tuning local styling.');
  }
  if (input.regionCount === 0 && input.similarity < 100) {
    suggestions.push('Recheck anti-aliasing, image loading, and screenshot viewport settings.');
  } else if (input.regionCount <= 2 && input.similarity < 95) {
    suggestions.push('Fix the most visible component-level styling mismatches in the highlighted regions.');
  } else if (input.regionCount >= 6) {
    suggestions.push('Layout, spacing, or typography is drifting across the page rather than in one isolated component.');
  }
  if (input.similarity < 90) {
    suggestions.push('Audit large spacing, sizing, and color-token differences before doing fine polish.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Only minor visual polish remains; tighten spacing and token parity in the highlighted regions.');
  }
  return suggestions;
}

function clonePng(source: PNG): PNG {
  const target = new PNG({ width: source.width, height: source.height });
  source.data.copy(target.data);
  return target;
}

function viewportForReference(reference: PNG, label: string): ViewportSize {
  assertPngSize(reference, label);
  return { width: reference.width, height: reference.height };
}

function normalizePng(source: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  PNG.bitblt(source, out, 0, 0, source.width, source.height, 0, 0);
  return out;
}

function assertPngSize(png: PNG, label: string): void {
  assertPngPixels(png.width, png.height, label);
}

function assertPngPixels(width: number, height: number, label: string): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} has invalid PNG dimensions`);
  }
  const pixels = width * height;
  if (pixels > DEFAULT_MAX_CANVAS_PIXELS) {
    throw new Error(`${label} is ${pixels} pixels; maximum allowed is ${DEFAULT_MAX_CANVAS_PIXELS} pixels`);
  }
}

function drawBox(png: PNG, box: VisualValidationRegion, strokeWidth: number): void {
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      const isStroke =
        x - box.minX < strokeWidth
        || box.maxX - x < strokeWidth
        || y - box.minY < strokeWidth
        || box.maxY - y < strokeWidth;
      if (!isStroke) continue;
      const index = (y * png.width + x) << 2;
      png.data[index] = DIFF_COLOR[0];
      png.data[index + 1] = DIFF_COLOR[1];
      png.data[index + 2] = DIFF_COLOR[2];
      png.data[index + 3] = 255;
    }
  }
}

function diffBoxesFromMask(maskPng: PNG): VisualValidationRegion[] {
  const { width, height } = maskPng;
  const changed = new Uint8Array(width * height);
  let overall: VisualValidationRegion | null = null;
  for (let index = 0; index < changed.length; index += 1) {
    const dataIndex = index << 2;
    if (
      maskPng.data[dataIndex] === DIFF_COLOR[0]
      && maskPng.data[dataIndex + 1] === DIFF_COLOR[1]
      && maskPng.data[dataIndex + 2] === DIFF_COLOR[2]
    ) {
      changed[index] = 1;
      const x = index % width;
      const y = Math.floor(index / width);
      overall = overall == null
        ? { minX: x, minY: y, maxX: x, maxY: y }
        : {
            minX: Math.min(overall.minX, x),
            minY: Math.min(overall.minY, y),
            maxX: Math.max(overall.maxX, x),
            maxY: Math.max(overall.maxY, y),
          };
    }
  }
  if (overall == null) return [];
  const boxes: VisualValidationRegion[] = [];
  const queue = new Int32Array(width * height);
  for (let index = 0; index < changed.length; index += 1) {
    if (changed[index] === 0) continue;
    let head = 0;
    let tail = 0;
    let minX = index % width;
    let maxX = minX;
    let minY = Math.floor(index / width);
    let maxY = minY;
    changed[index] = 0;
    queue[tail++] = index;
    while (head < tail) {
      const current = queue[head++] ?? -1;
      if (current < 0) continue;
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      tail = enqueueChanged(changed, queue, tail, x > 0 ? current - 1 : -1);
      tail = enqueueChanged(changed, queue, tail, x < width - 1 ? current + 1 : -1);
      tail = enqueueChanged(changed, queue, tail, y > 0 ? current - width : -1);
      tail = enqueueChanged(changed, queue, tail, y < height - 1 ? current + width : -1);
    }
    boxes.push({ minX, minY, maxX, maxY });
    if (boxes.length > DEFAULT_MAX_DIFF_BOX_REGIONS) return [overall];
  }
  return boxes;
}

function enqueueChanged(changed: Uint8Array, queue: Int32Array, tail: number, index: number): number {
  if (index < 0 || changed[index] === 0) return tail;
  changed[index] = 0;
  queue[tail] = index;
  return tail + 1;
}

function mergeDiffBoxes(boxes: VisualValidationRegion[], distance: number): VisualValidationRegion[] {
  if (boxes.length < 2) return boxes;
  const pending = boxes.slice();
  const merged: VisualValidationRegion[] = [];
  while (pending.length > 0) {
    let current = pending.shift()!;
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        const candidate = pending[i]!;
        if (!boxesTouchOrNear(current, candidate, distance)) continue;
        current = {
          minX: Math.min(current.minX, candidate.minX),
          minY: Math.min(current.minY, candidate.minY),
          maxX: Math.max(current.maxX, candidate.maxX),
          maxY: Math.max(current.maxY, candidate.maxY),
        };
        pending.splice(i, 1);
        changed = true;
      }
    }
    merged.push(current);
  }
  return merged;
}

function boxesTouchOrNear(a: VisualValidationRegion, b: VisualValidationRegion, distance: number): boolean {
  return !(
    a.maxX + distance < b.minX
    || b.maxX + distance < a.minX
    || a.maxY + distance < b.minY
    || b.maxY + distance < a.minY
  );
}

function padBox(
  box: VisualValidationRegion,
  padding: number,
  maxWidth: number,
  maxHeight: number,
): VisualValidationRegion {
  return {
    minX: clamp(box.minX - padding, 0, maxWidth - 1),
    minY: clamp(box.minY - padding, 0, maxHeight - 1),
    maxX: clamp(box.maxX + padding, 0, maxWidth - 1),
    maxY: clamp(box.maxY + padding, 0, maxHeight - 1),
  };
}

function sanitizeStem(input: string): string {
  const normalized = input.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'reference';
}

function buildReferenceArtifactStem(cwd: string, referencePath: string, index: number): string {
  const relativeReferencePath = relativeToProject(cwd, referencePath)
    .replace(/^\.\//, '')
    .replace(/\.[^.]+$/, '');
  return `${sanitizeStem(relativeReferencePath)}-${index + 1}`;
}

function relativeToProject(cwd: string, target: string): string {
  return path.relative(cwd, target).split(path.sep).join('/');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
