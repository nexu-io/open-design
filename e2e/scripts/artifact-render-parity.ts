import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext, type Frame, type Locator, type Page } from '@playwright/test';

import { settledActiveArtifactPreview as settledActivePreview } from '../lib/playwright/artifact-preview.ts';
import {
  classifyPixelParity,
  combinePixelParityClassifications,
  comparePngBuffers,
  type ParityClassification,
  type PixelComparison,
} from '../lib/playwright/artifact-render-parity.ts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../lib/tools-dev/runtime.ts';
import type { ToolsDevSuite } from '../lib/tools-dev/types.ts';

type Options = {
  corpusDir: string;
  outputDir: string;
  limit: number;
  timeoutMs: number;
  caseTimeoutMs: number;
  settleMs: number;
  maxBytes: number;
  maxPerceptualDiffRatio: number;
  maxSelfDriftRatio: number;
  headed: boolean;
};

type RunOptions = Options & { webUrl: string };

type RuntimeSnapshot = {
  readyState: string;
  compatMode: string;
  hrefKind: 'http' | 'blob' | 'about' | 'other';
  titleHash: string;
  textHash: string;
  domHash: string;
  textLength: number;
  domLength: number;
  elementCount: number;
  canvasCount: number;
  videoCount: number;
  windowScrollX: number;
  windowScrollY: number;
  scrollStateHash: string;
  scrollableCount: number;
};

type RawRuntimeSnapshot = Omit<RuntimeSnapshot, 'titleHash' | 'textHash' | 'domHash' | 'scrollStateHash'> & {
  title: string;
  text: string;
  dom: string;
  scrollState: string;
};

type StableCapture = {
  first: Buffer;
  second: Buffer;
  selfDrift: PixelComparison;
  snapshot: RuntimeSnapshot;
};

type ComparisonSummary = Omit<PixelComparison, 'diffPng'>;

type CaseResult = {
  sampleId: string;
  bytes: number;
  status: ParityClassification | 'failed' | 'skipped-not-url-load' | 'skipped-too-large';
  initialMode?: string | null;
  editMode?: string | null;
  editBootstrapHasDoctype?: boolean;
  editBootstrapLength?: number;
  scrolled?: boolean;
  entryStatus?: ParityClassification;
  roundTripStatus?: ParityClassification;
  entry?: ComparisonSummary;
  roundTrip?: ComparisonSummary;
  urlSelfDriftRatio?: number;
  srcDocSelfDriftRatio?: number;
  roundTripSelfDriftRatio?: number;
  urlState?: RuntimeSnapshot;
  srcDocState?: RuntimeSnapshot;
  roundTripState?: RuntimeSnapshot;
  consoleErrorHashes: string[];
  failedRequestHashes: string[];
  httpErrorHashes: string[];
  evidence?: string[];
  error?: string;
};

type BrowserSignals = {
  consoleErrorHashes: Set<string>;
  failedRequestHashes: Set<string>;
  httpErrorHashes: Set<string>;
};

const isDirectRun = process.argv[1] != null
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  await main(process.argv.slice(2));
}

async function main(argv: string[]): Promise<void> {
  const options = parseOptions(argv);
  const files = (await listHtmlFiles(options.corpusDir)).slice(0, options.limit);
  if (files.length === 0) {
    throw new Error(`No .html files found under ${options.corpusDir}`);
  }

  const toolsDev = await createParityToolsDevRuntime();
  let runError: unknown = null;
  try {
    await toolsDev.startWeb({
      AMR_HOME: path.join(toolsDev.root, 'scratch', 'amr-home'),
    });
    const runOptions: RunOptions = { ...options, webUrl: toolsDev.url.web() };
    await mkdir(options.outputDir, { recursive: true });
    const results: CaseResult[] = [];
    const startedAt = Date.now();

    console.log(`Comparing ${files.length} HTML artifacts. Evidence stays local at ${options.outputDir}`);
    for (const [index, filePath] of files.entries()) {
      const source = await readFile(filePath);
      const sampleId = sha256(source).slice(0, 20);
      process.stdout.write(`[${index + 1}/${files.length}] ${sampleId} (${source.byteLength} bytes) `);
      if (source.byteLength > options.maxBytes) {
        const skipped: CaseResult = emptyResult(sampleId, source.byteLength, 'skipped-too-large');
        results.push(skipped);
        console.log('skipped: too large');
        continue;
      }

      const result = await runIsolatedCase({ options: runOptions, sampleId, source: source.toString('utf8') });
      results.push(result);
      console.log(result.status);
      await writeReport(options, results, startedAt);
    }

    await writeReport(options, results, startedAt);
    printSummary(results, options.outputDir);
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    let stopError: unknown = null;
    try {
      await toolsDev.stopWeb();
    } catch (error) {
      stopError = error;
    }
    await rm(toolsDev.root, { force: true, recursive: true });
    if (runError == null && stopError != null) throw stopError;
  }
}

async function createParityToolsDevRuntime(): Promise<ToolsDevSuite> {
  const namespace = `artifact-parity-${process.pid}-${randomUUID().slice(0, 8)}`;
  const root = path.join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratchDir = path.join(root, 'scratch');
  await mkdir(scratchDir, { recursive: true });
  return createToolsDevSuite({
    codexHomeDir: path.join(scratchDir, 'codex-home'),
    dataDir: path.join(scratchDir, 'data'),
    namespace,
    ownerPid: process.pid,
    root,
    toolsDevRoot: path.join(scratchDir, 'tools-dev'),
  });
}

async function runIsolatedCase(input: {
  options: RunOptions;
  sampleId: string;
  source: string;
}): Promise<CaseResult> {
  const { options, sampleId, source } = input;
  const projectId = `parity-${sampleId.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext({
    baseURL: options.webUrl,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      runCase({ context, options, projectId, sampleId, source }),
      new Promise<CaseResult>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Case exceeded the ${options.caseTimeoutMs} ms hard timeout`)),
          options.caseTimeoutMs,
        );
      }),
    ]);
  } catch (error) {
    return {
      ...emptyResult(sampleId, Buffer.byteLength(source), 'failed'),
      error: formatError(error),
    };
  } finally {
    if (timeout != null) clearTimeout(timeout);
    await browser.close({ reason: 'artifact parity case complete' }).catch(() => {});
    await fetch(new URL(`/api/projects/${encodeURIComponent(projectId)}`, options.webUrl), {
      method: 'DELETE',
      signal: AbortSignal.timeout(Math.min(options.timeoutMs, 5_000)),
    }).catch(() => {});
  }
}

async function runCase(input: {
  context: BrowserContext;
  options: RunOptions;
  projectId: string;
  sampleId: string;
  source: string;
}): Promise<CaseResult> {
  const { context, options, projectId, sampleId, source } = input;
  const signals: BrowserSignals = {
    consoleErrorHashes: new Set(),
    failedRequestHashes: new Set(),
    httpErrorHashes: new Set(),
  };
  const page = await context.newPage();
  collectBrowserSignals(page, signals);

  try {
    await createProject(page, projectId, sampleId, source, options.timeoutMs);
    await page.goto(`/projects/${encodeURIComponent(projectId)}/files/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    });
    await page.getByTestId('file-workspace').waitFor({ state: 'visible', timeout: options.timeoutMs });
    await page.mouse.move(0, 0);

    const initialFrame = await settledActivePreview(page, options.timeoutMs);
    const initialMode = await initialFrame.locator.getAttribute('data-od-render-mode');
    if (initialMode !== 'url-load') {
      return withSignals({
        ...emptyResult(sampleId, Buffer.byteLength(source), 'skipped-not-url-load'),
        initialMode,
      }, signals);
    }

    const scrolled = await scrollPrimarySurfaceSafely(page, options.timeoutMs);
    const urlCapture = await captureStable(page, 'url-load', options.timeoutMs, options.settleMs);

    const editToggle = page.getByTestId('manual-edit-mode-toggle').filter({ visible: true }).last();
    await editToggle.click({ timeout: options.timeoutMs });
    await waitForPressed(editToggle, 'true', options.timeoutMs);
    await page.mouse.move(0, 0);

    const editFrame = await settledActivePreview(page, options.timeoutMs);
    const editMode = await editFrame.locator.getAttribute('data-od-render-mode');
    if (editMode !== 'srcdoc') {
      throw new Error(`Edit did not activate srcDoc transport (active mode: ${String(editMode)})`);
    }
    const editBootstrap = await editFrame.locator.getAttribute('srcdoc') ?? '';
    const srcDocCapture = await captureStable(page, 'srcdoc', options.timeoutMs, options.settleMs);
    const entry = comparePngBuffers(urlCapture.second, srcDocCapture.second);
    const entryStatus = classifyPixelParity({
      comparison: entry,
      actualSelfDriftRatio: urlCapture.selfDrift.perceptualDiffRatio,
      expectedSelfDriftRatio: srcDocCapture.selfDrift.perceptualDiffRatio,
      maxPerceptualDiffRatio: options.maxPerceptualDiffRatio,
      maxSelfDriftRatio: options.maxSelfDriftRatio,
    });

    await editToggle.click({ timeout: options.timeoutMs });
    await waitForPressed(editToggle, 'false', options.timeoutMs);
    await page.mouse.move(0, 0);
    const roundTripFrame = await settledActivePreview(page, options.timeoutMs);
    await waitForRenderMode(roundTripFrame.locator, 'url-load', options.timeoutMs);
    const roundTripCapture = await captureStable(page, 'url-load', options.timeoutMs, options.settleMs);
    const roundTrip = comparePngBuffers(urlCapture.second, roundTripCapture.second);
    const roundTripStatus = classifyPixelParity({
      comparison: roundTrip,
      actualSelfDriftRatio: urlCapture.selfDrift.perceptualDiffRatio,
      expectedSelfDriftRatio: roundTripCapture.selfDrift.perceptualDiffRatio,
      maxPerceptualDiffRatio: options.maxPerceptualDiffRatio,
      maxSelfDriftRatio: options.maxSelfDriftRatio,
    });
    const status = combinePixelParityClassifications(entryStatus, roundTripStatus);

    const evidence = status === 'exact' && roundTrip.exactDiffPixels === 0
      ? []
      : await saveEvidence(options.outputDir, sampleId, {
          url: urlCapture.second,
          srcdoc: srcDocCapture.second,
          entryDiff: entry.diffPng,
          roundTrip: roundTripCapture.second,
          roundTripDiff: roundTrip.diffPng,
        });

    return withSignals({
      sampleId,
      bytes: Buffer.byteLength(source),
      status,
      initialMode,
      editMode,
      editBootstrapHasDoctype: /^\s*<!doctype\b/i.test(editBootstrap),
      editBootstrapLength: editBootstrap.length,
      scrolled,
      entryStatus,
      roundTripStatus,
      entry: summarizeComparison(entry),
      roundTrip: summarizeComparison(roundTrip),
      urlSelfDriftRatio: urlCapture.selfDrift.perceptualDiffRatio,
      srcDocSelfDriftRatio: srcDocCapture.selfDrift.perceptualDiffRatio,
      roundTripSelfDriftRatio: roundTripCapture.selfDrift.perceptualDiffRatio,
      urlState: urlCapture.snapshot,
      srcDocState: srcDocCapture.snapshot,
      roundTripState: roundTripCapture.snapshot,
      consoleErrorHashes: [],
      failedRequestHashes: [],
      httpErrorHashes: [],
      ...(evidence.length === 0 ? {} : { evidence }),
    }, signals);
  } catch (error) {
    return withSignals({
      ...emptyResult(sampleId, Buffer.byteLength(source), 'failed'),
      error: formatError(error),
    }, signals);
  }
}

async function createProject(
  page: Page,
  projectId: string,
  sampleId: string,
  source: string,
  timeoutMs: number,
): Promise<void> {
  const created = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: `Render parity ${sampleId}`,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
    timeout: timeoutMs,
  });
  if (!created.ok()) throw new Error(`Project create failed (${created.status()}): ${await created.text()}`);

  const uploaded = await page.request.post(`/api/projects/${encodeURIComponent(projectId)}/files`, {
    data: {
      name: 'index.html',
      content: source,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: sampleId,
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    },
    timeout: timeoutMs,
  });
  if (!uploaded.ok()) throw new Error(`HTML upload failed (${uploaded.status()}): ${await uploaded.text()}`);
}

async function captureStable(
  page: Page,
  expectedMode: string,
  timeoutMs: number,
  settleMs: number,
): Promise<StableCapture> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const firstActive = await settledActivePreview(page, remainingTimeout(startedAt, timeoutMs));
      await waitForRenderMode(firstActive.locator, expectedMode, remainingTimeout(startedAt, timeoutMs));
      const first = await firstActive.locator.screenshot({
        animations: 'disabled',
        type: 'png',
        timeout: remainingTimeout(startedAt, timeoutMs),
      });
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const secondActive = await settledActivePreview(page, remainingTimeout(startedAt, timeoutMs));
      await waitForRenderMode(secondActive.locator, expectedMode, remainingTimeout(startedAt, timeoutMs));
      const second = await secondActive.locator.screenshot({
        animations: 'disabled',
        type: 'png',
        timeout: remainingTimeout(startedAt, timeoutMs),
      });
      return {
        first,
        second,
        selfDrift: comparePngBuffers(first, second),
        snapshot: await readRuntimeSnapshot(secondActive.frame),
      };
    } catch (error) {
      lastError = error;
      if (!/detached|not attached|not visible|browsing context|Execution context was destroyed/i.test(formatError(error))) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Could not capture a stable ${expectedMode} iframe: ${formatError(lastError)}`);
}

async function readRuntimeSnapshot(frame: Frame): Promise<RuntimeSnapshot> {
  const raw = await frame.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('*')];
    const scrollingElement = document.scrollingElement as HTMLElement | null;
    const scrollEntries = all
      .map((element, index) => ({
        index,
        left: Math.round(element.scrollLeft),
        top: Math.round(element.scrollTop),
        maxLeft: Math.max(0, element.scrollWidth - element.clientWidth),
        maxTop: Math.max(0, element.scrollHeight - element.clientHeight),
      }))
      .filter((entry) => entry.maxLeft > 1 || entry.maxTop > 1 || entry.left !== 0 || entry.top !== 0);
    if (scrollingElement != null) {
      scrollEntries.unshift({
        index: -1,
        left: Math.round(window.scrollX),
        top: Math.round(window.scrollY),
        maxLeft: Math.max(0, scrollingElement.scrollWidth - window.innerWidth),
        maxTop: Math.max(0, scrollingElement.scrollHeight - window.innerHeight),
      });
    }
    const href = location.href;
    const hrefKind = href.startsWith('http')
      ? 'http'
      : href.startsWith('blob:')
        ? 'blob'
        : href.startsWith('about:')
          ? 'about'
          : 'other';
    const text = document.body?.innerText ?? '';
    const dom = document.documentElement?.outerHTML ?? '';
    return {
      readyState: document.readyState,
      compatMode: document.compatMode,
      hrefKind,
      title: document.title,
      text,
      dom,
      textLength: text.length,
      domLength: dom.length,
      elementCount: all.length,
      canvasCount: document.querySelectorAll('canvas').length,
      videoCount: document.querySelectorAll('video').length,
      windowScrollX: Math.round(window.scrollX),
      windowScrollY: Math.round(window.scrollY),
      scrollState: JSON.stringify(scrollEntries),
      scrollableCount: scrollEntries.length,
    } satisfies RawRuntimeSnapshot;
  });
  return {
    readyState: raw.readyState,
    compatMode: raw.compatMode,
    hrefKind: raw.hrefKind,
    titleHash: sha256(raw.title).slice(0, 16),
    textHash: sha256(raw.text).slice(0, 16),
    domHash: sha256(raw.dom).slice(0, 16),
    textLength: raw.textLength,
    domLength: raw.domLength,
    elementCount: raw.elementCount,
    canvasCount: raw.canvasCount,
    videoCount: raw.videoCount,
    windowScrollX: raw.windowScrollX,
    windowScrollY: raw.windowScrollY,
    scrollStateHash: sha256(raw.scrollState).slice(0, 16),
    scrollableCount: raw.scrollableCount,
  };
}

async function scrollPrimarySurface(frame: Frame): Promise<boolean> {
  return frame.evaluate(() => {
    const root = document.scrollingElement as HTMLElement | null;
    const elements = [...document.querySelectorAll<HTMLElement>('*')];
    const candidates = [
      ...(root == null ? [] : [{ element: root, root: true, ordinal: -1 }]),
      ...elements.map((element, ordinal) => ({ element, root: false, ordinal })),
    ].map((candidate) => {
      const viewportHeight = candidate.root ? window.innerHeight : candidate.element.clientHeight;
      const viewportWidth = candidate.root ? window.innerWidth : candidate.element.clientWidth;
      const maxTop = Math.max(0, candidate.element.scrollHeight - viewportHeight);
      const maxLeft = Math.max(0, candidate.element.scrollWidth - viewportWidth);
      return { ...candidate, maxTop, maxLeft, score: maxTop * viewportWidth + maxLeft * viewportHeight };
    }).filter((candidate) => candidate.maxTop > 8 || candidate.maxLeft > 8)
      .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal);
    const target = candidates[0];
    if (target == null) return false;
    const top = Math.round(target.maxTop * 0.57);
    const left = Math.round(target.maxLeft * 0.43);
    if (target.root) {
      window.scrollTo({ top, left, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
      return Math.abs(window.scrollY - top) <= 2 && Math.abs(window.scrollX - left) <= 2;
    }
    target.element.scrollTo({ top, left, behavior: 'instant' });
    target.element.dispatchEvent(new Event('scroll', { bubbles: false }));
    return Math.abs(target.element.scrollTop - top) <= 2 && Math.abs(target.element.scrollLeft - left) <= 2;
  });
}

async function scrollPrimarySurfaceSafely(page: Page, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const active = await settledActivePreview(page, remainingTimeout(startedAt, timeoutMs));
      return await scrollPrimarySurface(active.frame);
    } catch (error) {
      lastError = error;
      if (!/detached|not attached|browsing context|Execution context was destroyed/i.test(formatError(error))) {
        throw error;
      }
    }
  }
  throw new Error(`Could not scroll a stable active iframe: ${formatError(lastError)}`);
}

async function waitForPressed(locator: Locator, expected: string, timeoutMs: number): Promise<void> {
  await locator.page().waitForFunction(
    ({ selector, expectedValue }) => document.querySelector(selector)?.getAttribute('aria-pressed') === expectedValue,
    { selector: '[data-testid="manual-edit-mode-toggle"]', expectedValue: expected },
    { timeout: timeoutMs },
  );
}

async function waitForRenderMode(locator: Locator, expected: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await locator.getAttribute('data-od-render-mode') === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for active render mode ${expected}`);
}

function collectBrowserSignals(page: Page, signals: BrowserSignals): void {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    signals.consoleErrorHashes.add(sha256(message.text()).slice(0, 16));
  });
  page.on('requestfailed', (request) => {
    signals.failedRequestHashes.add(sha256(`${request.method()} ${request.url()}`).slice(0, 16));
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    signals.httpErrorHashes.add(sha256(`${response.status()} ${response.url()}`).slice(0, 16));
  });
}

async function saveEvidence(
  outputDir: string,
  sampleId: string,
  images: Record<string, Buffer>,
): Promise<string[]> {
  const evidenceDir = path.join(outputDir, 'evidence', sampleId);
  await mkdir(evidenceDir, { recursive: true });
  const saved: string[] = [];
  for (const [name, bytes] of Object.entries(images)) {
    const relative = path.join('evidence', sampleId, `${name}.png`);
    await writeFile(path.join(outputDir, relative), bytes);
    saved.push(relative);
  }
  return saved;
}

function summarizeComparison(comparison: PixelComparison): ComparisonSummary {
  const { diffPng: _diffPng, ...summary } = comparison;
  return summary;
}

function withSignals(result: CaseResult, signals: BrowserSignals): CaseResult {
  return {
    ...result,
    consoleErrorHashes: [...signals.consoleErrorHashes].sort(),
    failedRequestHashes: [...signals.failedRequestHashes].sort(),
    httpErrorHashes: [...signals.httpErrorHashes].sort(),
  };
}

function emptyResult(sampleId: string, bytes: number, status: CaseResult['status']): CaseResult {
  return {
    sampleId,
    bytes,
    status,
    consoleErrorHashes: [],
    failedRequestHashes: [],
    httpErrorHashes: [],
  };
}

async function writeReport(options: Options, results: CaseResult[], startedAt: number): Promise<void> {
  const counts = countStatuses(results);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    corpus: {
      htmlFilesProcessed: results.length,
      sourcePathsIncluded: false,
      sourceContentIncluded: false,
    },
    browser: { name: 'chromium', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
    thresholds: {
      perceptualPixelThreshold: 0.1,
      maxPerceptualDiffRatio: options.maxPerceptualDiffRatio,
      maxSelfDriftRatio: options.maxSelfDriftRatio,
      settleMs: options.settleMs,
      caseTimeoutMs: options.caseTimeoutMs,
    },
    counts,
    results,
  };
  await writeFile(path.join(options.outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(options.outputDir, 'summary.md'), renderMarkdownSummary(results, counts));
}

function renderMarkdownSummary(results: CaseResult[], counts: Record<string, number>): string {
  const lines = [
    '# Artifact URL/srcDoc render parity',
    '',
    'Local-only black-box comparison. Sample IDs are SHA-256 prefixes; source paths and HTML are omitted.',
    '',
    '| Status | Count |',
    '| --- | ---: |',
    ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `| ${status} | ${count} |`),
    '',
    '| Sample | Status | Bytes | Entry perceptual diff | Round-trip perceptual diff |',
    '| --- | --- | ---: | ---: | ---: |',
    ...results.map((result) => [
      result.sampleId,
      result.status,
      String(result.bytes),
      formatRatio(result.entry?.perceptualDiffRatio),
      formatRatio(result.roundTrip?.perceptualDiffRatio),
    ].join(' | ')).map((row) => `| ${row} |`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function countStatuses(results: CaseResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
}

function printSummary(results: CaseResult[], outputDir: string): void {
  const counts = countStatuses(results);
  console.log(`Done: ${Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(', ')}`);
  console.log(`Report: ${path.join(outputDir, 'summary.md')}`);
}

async function listHtmlFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith('.html')) {
        found.push(absolute);
      }
    }
  }
  await visit(path.resolve(root));
  return found;
}

function parseOptions(argv: string[]): Options {
  const values = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (token == null || !token.startsWith('--')) throw new Error(usage());
    const key = token.slice(2);
    if (key === 'headed' || key === 'help') {
      values.set(key, true);
      continue;
    }
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) throw new Error(`Missing value for --${key}\n\n${usage()}`);
    values.set(key, value);
    index += 1;
  }
  if (values.has('help')) {
    console.log(usage());
    process.exit(0);
  }
  if (values.has('web-url') || values.has('keep-projects')) {
    throw new Error('The parity auditor owns an isolated tools-dev runtime; --web-url and --keep-projects are no longer supported.');
  }
  const corpusDir = path.resolve(required(values, 'corpus-dir'));
  const outputDir = path.resolve(
    optional(values, 'output-dir')
      ?? path.join(tmpdir(), `od-artifact-render-parity-${Date.now()}`),
  );
  return {
    corpusDir,
    outputDir,
    limit: positiveInteger(optional(values, 'limit') ?? '50', '--limit'),
    timeoutMs: positiveInteger(optional(values, 'timeout-ms') ?? '30000', '--timeout-ms'),
    caseTimeoutMs: positiveInteger(optional(values, 'case-timeout-ms') ?? '60000', '--case-timeout-ms'),
    settleMs: nonNegativeInteger(optional(values, 'settle-ms') ?? '500', '--settle-ms'),
    maxBytes: positiveInteger(optional(values, 'max-bytes') ?? '5000000', '--max-bytes'),
    maxPerceptualDiffRatio: ratioOption(optional(values, 'max-diff-ratio') ?? '0.001', '--max-diff-ratio'),
    maxSelfDriftRatio: ratioOption(optional(values, 'max-self-drift-ratio') ?? '0.001', '--max-self-drift-ratio'),
    headed: values.get('headed') === true,
  };
}

function required(values: Map<string, string | true>, key: string): string {
  const value = optional(values, key);
  if (value == null) throw new Error(`Missing --${key}\n\n${usage()}`);
  return value;
}

function optional(values: Map<string, string | true>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === 'string' ? value : undefined;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${option} must be a non-negative integer`);
  return parsed;
}

function ratioOption(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${option} must be between 0 and 1`);
  return parsed;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function formatRatio(value: number | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(4)}%`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function remainingTimeout(startedAt: number, timeoutMs: number): number {
  return Math.max(250, timeoutMs - (Date.now() - startedAt));
}

function usage(): string {
  return `Usage:
  pnpm --filter @open-design/e2e exec tsx scripts/artifact-render-parity.ts \\
    --corpus-dir /path/to/local/html-corpus \\
    [--output-dir /private/tmp/render-parity] [--limit 50] [--headed]

The script starts a namespace- and data-root-isolated tools-dev runtime, creates
temporary managed projects through its product API, captures the
active URL-load iframe, enters Manual Edit to capture the real srcDoc transport,
then exits Edit and captures URL-load again. The runtime and its projects are always
stopped and removed when the audit completes. Every artifact runs in an isolated
browser process with a 60-second hard timeout. Reports omit source paths and HTML content.`;
}
