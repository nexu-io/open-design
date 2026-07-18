import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const execFileAsync = promisify(execFile);
const marker = '<!-- visual-regression-bot -->';
const visualPrefix = 'visual-regression';
const inlineCaseLimit = 20;
const pixelThreshold = 0.1;
const changedPixelFloor = 500;
const comparisonImageWidth = 220;
const diffBoxPadding = 6;
const diffBoxMergeDistance = 12;
const diffBoxStrokeWidth = 3;
const diffBoxColor = [255, 0, 0, 255] as const;
const maxDiffBoxRegions = 2_000;
const maxCaseCount = 60;
const maxPngBytes = 10 * 1024 * 1024;
const maxPngPixels = 4_000_000;
const caseNamePattern = /^visual-[a-z0-9][a-z0-9-_]{0,80}$/u;

type CommandName = 'upload-baseline' | 'compare-pr';

type R2Config = {
  bucket: string;
  publicOrigin: string;
  client: S3Client;
};

type VisualCase = {
  name: string;
  path: string;
};

type BaselineLookup = {
  sha: string;
  key: string;
  behindBy: number;
};

type ComparedCase = {
  name: string;
  status: 'changed' | 'unchanged' | 'missing-baseline' | 'failed';
  diffPixels?: number;
  diffPixelRatio?: number;
  baselineSha?: string;
  baselineBehindBy?: number;
  mainUrl?: string;
  prUrl?: string;
  diffUrl?: string;
  error?: string;
};

type CompareCaseOps = {
  putFile?: (r2: R2Config, key: string, filePath: string) => Promise<void>;
  findBaseline?: (r2: R2Config, caseName: string, candidateShas: string[]) => Promise<BaselineLookup | null>;
  downloadObject?: (r2: R2Config, key: string, outputPath: string) => Promise<void>;
  writeDiffPng?: (mainPath: string, prPath: string, diffPath: string) => Promise<DiffPngResult>;
};

type DiffPngResult = {
  diffPixels: number;
  totalPixels: number;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(scriptDir, '..');

const isDirectRun = process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  await main(process.argv.slice(2));
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const command = args._[0] as CommandName | undefined;

  if (command === 'upload-baseline') {
    await uploadBaseline(args);
  } else if (command === 'compare-pr') {
    await comparePr(args);
  } else {
    printUsage();
    process.exitCode = 1;
  }
}

async function uploadBaseline(options: ParsedArgs): Promise<void> {
  const sha = requiredOption(options, 'sha');
  const screenshotsDir = path.resolve(optionString(options, 'screenshots') ?? 'ui/reports/visual-screenshots');
  const manifestOut = optionString(options, 'manifest-out');
  const r2 = r2ConfigFromEnv();
  const cases = await listPngCases(screenshotsDir);

  if (cases.length === 0) {
    throw new Error(`No PNG screenshots found in ${screenshotsDir}`);
  }

  const uploaded = [];
  for (const visualCase of cases) {
    const key = baselineKey(sha, visualCase.name);
    await putFile(r2, key, visualCase.path);
    uploaded.push({ name: visualCase.name, key, url: publicUrl(r2, key) });
  }

  if (manifestOut != null) {
    await writeJson(path.resolve(manifestOut), { sha, uploaded });
  }

  console.log(`Uploaded ${uploaded.length} visual baseline screenshots for ${sha}.`);
}

async function comparePr(options: ParsedArgs): Promise<void> {
  const prNumber = requiredOption(options, 'pr-number');
  const runId = requiredOption(options, 'run-id');
  const headSha = requiredOption(options, 'head-sha');
  const baseSha = requiredOption(options, 'base-sha');
  const screenshotsDir = path.resolve(optionString(options, 'screenshots') ?? 'ui/reports/visual-screenshots');
  const outputDir = path.resolve(optionString(options, 'output-dir') ?? 'ui/reports/visual-report');
  const commentOut = path.resolve(optionString(options, 'comment-out') ?? path.join(outputDir, 'comment.md'));
  const manifestOut = path.resolve(optionString(options, 'manifest-out') ?? path.join(outputDir, 'manifest.json'));
  const maxAncestors = Number(optionString(options, 'max-ancestors') ?? 20);
  const captureOutcome = optionString(options, 'capture-outcome') ?? 'success';
  const cases = await listPngCases(screenshotsDir);

  await mkdir(outputDir, { recursive: true });

  if (cases.length === 0) {
    const compared: ComparedCase[] = [
      {
        name: 'visual-capture',
        status: 'failed',
        error: `No PNG screenshots found in ${screenshotsDir}. Check the Playwright capture logs for details.`,
      },
    ];
    await writeFile(commentOut, renderComment({ compared, headSha, baseSha }));
    await writeJson(manifestOut, { prNumber, runId, headSha, baseSha, compared });
    console.log(`Wrote visual capture failure report to ${commentOut}.`);
    return;
  }

  const r2 = r2ConfigFromEnv();
  const candidateShas = await baselineCandidateShas(baseSha, maxAncestors);
  const compared: ComparedCase[] = captureOutcome === 'success'
    ? []
    : [
        {
          name: 'visual-capture',
          status: 'failed',
          error: `Playwright capture completed with outcome '${captureOutcome}'. Partial screenshots may be shown below.`,
        },
      ];

  for (const visualCase of cases) {
    compared.push(await compareCase({ r2, prNumber, runId, headSha, visualCase, candidateShas, outputDir }));
  }

  const comment = renderComment({ compared, headSha, baseSha });
  await writeFile(commentOut, comment);
  await writeJson(manifestOut, { prNumber, runId, headSha, baseSha, compared });

  console.log(`Wrote visual report for ${compared.length} cases to ${commentOut}.`);
}

export async function compareCase(input: {
  r2: R2Config;
  prNumber: string;
  runId: string;
  headSha: string;
  visualCase: VisualCase;
  candidateShas: string[];
  outputDir: string;
}, ops: CompareCaseOps = {}): Promise<ComparedCase> {
  const { r2, prNumber, runId, headSha, visualCase, candidateShas, outputDir } = input;
  const putFileOp = ops.putFile ?? putFile;
  const findBaselineOp = ops.findBaseline ?? findBaseline;
  const downloadObjectOp = ops.downloadObject ?? downloadObject;
  const writeDiffPngOp = ops.writeDiffPng ?? writeDiffPng;
  const prKey = prImageKey(prNumber, runId, 'pr', visualCase.name);

  const visualBuffer = await readFile(visualCase.path);

  try {
    validatePngBuffer(visualBuffer, visualCase.path);
  } catch (error) {
    return {
      name: visualCase.name,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await putFileOp(r2, prKey, visualCase.path);

  const baseline = await findBaselineOp(r2, visualCase.name, candidateShas);
  if (baseline == null) {
    return {
      name: visualCase.name,
      status: 'missing-baseline',
      prUrl: publicUrl(r2, prKey),
    };
  }

  const mainPath = path.join(outputDir, 'main', `${visualCase.name}.png`);
  const diffPath = path.join(outputDir, 'diff', `${visualCase.name}.png`);
  await downloadObjectOp(r2, baseline.key, mainPath);

  let diffResult: DiffPngResult;
  try {
    diffResult = await writeDiffPngOp(mainPath, visualCase.path, diffPath);
  } catch (error) {
    return {
      name: visualCase.name,
      status: 'failed',
      ...(baseline == null
        ? {}
        : {
            baselineSha: baseline.sha,
            baselineBehindBy: baseline.behindBy,
            mainUrl: publicUrl(r2, baseline.key),
          }),
      prUrl: publicUrl(r2, prKey),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const mainKey = prImageKey(prNumber, runId, 'main', visualCase.name);
  const diffKey = prImageKey(prNumber, runId, 'diff', visualCase.name);
  await putFileOp(r2, mainKey, mainPath);
  await putFileOp(r2, diffKey, diffPath);

  const diffPixelRatio = diffResult.diffPixels / diffResult.totalPixels;
  return {
    name: visualCase.name,
    status: isChangedVisualDiff(diffResult.diffPixels, diffPixelRatio) ? 'changed' : 'unchanged',
    diffPixels: diffResult.diffPixels,
    diffPixelRatio,
    baselineSha: baseline.sha,
    baselineBehindBy: baseline.behindBy,
    mainUrl: publicUrl(r2, mainKey),
    prUrl: publicUrl(r2, prKey),
    diffUrl: publicUrl(r2, diffKey),
  };
}

export function isChangedVisualDiff(diffPixels: number, _diffPixelRatio: number): boolean {
  return diffPixels >= changedPixelFloor;
}

async function writeDiffPng(mainPath: string, prPath: string, diffPath: string): Promise<DiffPngResult> {
  const main = PNG.sync.read(await readFile(mainPath));
  const pr = PNG.sync.read(await readFile(prPath));
  assertPngSize(main, mainPath);
  assertPngSize(pr, prPath);
  const width = Math.max(main.width, pr.width);
  const height = Math.max(main.height, pr.height);
  assertPngPixels(width, height, `${mainPath} vs ${prPath} normalized diff canvas`);
  const normalizedMain = normalizePng(main, width, height);
  const normalizedPr = normalizePng(pr, width, height);
  const diffMask = new PNG({ width, height });
  const diffPixels = pixelmatch(normalizedMain.data, normalizedPr.data, diffMask.data, width, height, {
    threshold: pixelThreshold,
    alpha: 0.2,
    diffColor: [diffBoxColor[0], diffBoxColor[1], diffBoxColor[2]],
  });
  const diff = clonePng(normalizedPr);
  const boxes = mergeDiffBoxes(diffBoxesFromMask(diffMask), diffBoxMergeDistance);
  for (const box of boxes) {
    drawBox(diff, padBox(box, diffBoxPadding, width, height), diffBoxStrokeWidth);
  }

  await mkdir(path.dirname(diffPath), { recursive: true });
  await writeFile(diffPath, PNG.sync.write(diff));
  return { diffPixels, totalPixels: width * height };
}

export type DiffBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function clonePng(source: PNG): PNG {
  const target = new PNG({ width: source.width, height: source.height });
  source.data.copy(target.data);
  return target;
}

export function diffBoxesFromMask(maskPng: PNG): DiffBox[] {
  const { width, height } = maskPng;
  const changed = new Uint8Array(width * height);
  let overall: DiffBox | null = null;
  for (let index = 0; index < changed.length; index += 1) {
    const dataIndex = index << 2;
    if (
      maskPng.data[dataIndex] === diffBoxColor[0]
      && maskPng.data[dataIndex + 1] === diffBoxColor[1]
      && maskPng.data[dataIndex + 2] === diffBoxColor[2]
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

  if (overall == null) {
    return [];
  }

  const boxes: DiffBox[] = [];
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
    queue[tail] = index;
    tail += 1;

    while (head < tail) {
      const current = queue[head] ?? -1;
      head += 1;
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
    if (boxes.length > maxDiffBoxRegions) {
      return [overall];
    }
  }
  return boxes;
}

function enqueueChanged(changed: Uint8Array, queue: Int32Array, tail: number, index: number): number {
  if (index < 0 || changed[index] === 0) return tail;
  changed[index] = 0;
  queue[tail] = index;
  return tail + 1;
}

export function mergeDiffBoxes(boxes: DiffBox[], distance: number): DiffBox[] {
  if (boxes.length < 2) {
    return boxes.map((box) => ({ ...box }));
  }

  const parents = new Int32Array(boxes.length);
  for (let index = 0; index < parents.length; index += 1) {
    parents[index] = index;
  }

  for (let outer = 0; outer < boxes.length; outer += 1) {
    for (let inner = outer + 1; inner < boxes.length; inner += 1) {
      const first = boxes[outer];
      const second = boxes[inner];
      if (first == null || second == null || !boxesAreClose(first, second, distance)) continue;
      unionBoxIndex(parents, outer, inner);
    }
  }

  const merged = new Map<number, DiffBox>();
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (box == null) continue;
    const root = findBoxRoot(parents, index);
    const existing = merged.get(root);
    if (existing == null) {
      merged.set(root, { ...box });
      continue;
    }
    existing.minX = Math.min(existing.minX, box.minX);
    existing.minY = Math.min(existing.minY, box.minY);
    existing.maxX = Math.max(existing.maxX, box.maxX);
    existing.maxY = Math.max(existing.maxY, box.maxY);
  }

  return [...merged.values()];
}

function findBoxRoot(parents: Int32Array, index: number): number {
  let root = index;
  while (parents[root] !== root) {
    root = parents[root] ?? root;
  }
  while (parents[index] !== index) {
    const parent = parents[index] ?? index;
    parents[index] = root;
    index = parent;
  }
  return root;
}

function unionBoxIndex(parents: Int32Array, first: number, second: number): void {
  const firstRoot = findBoxRoot(parents, first);
  const secondRoot = findBoxRoot(parents, second);
  if (firstRoot === secondRoot) return;
  parents[secondRoot] = firstRoot;
}

function boxesAreClose(first: DiffBox, second: DiffBox, distance: number): boolean {
  return first.minX - distance <= second.maxX
    && first.maxX + distance >= second.minX
    && first.minY - distance <= second.maxY
    && first.maxY + distance >= second.minY;
}

export function padBox(box: DiffBox, padding: number, width: number, height: number): DiffBox {
  return {
    minX: Math.max(0, box.minX - padding),
    minY: Math.max(0, box.minY - padding),
    maxX: Math.min(width - 1, box.maxX + padding),
    maxY: Math.min(height - 1, box.maxY + padding),
  };
}

export function drawBox(png: PNG, box: DiffBox, strokeWidth: number): void {
  for (let offset = 0; offset < strokeWidth; offset += 1) {
    const minX = Math.min(box.maxX, box.minX + offset);
    const minY = Math.min(box.maxY, box.minY + offset);
    const maxX = Math.max(box.minX, box.maxX - offset);
    const maxY = Math.max(box.minY, box.maxY - offset);
    for (let x = minX; x <= maxX; x += 1) {
      setPixel(png, x, minY, diffBoxColor);
      setPixel(png, x, maxY, diffBoxColor);
    }
    for (let y = minY; y <= maxY; y += 1) {
      setPixel(png, minX, y, diffBoxColor);
      setPixel(png, maxX, y, diffBoxColor);
    }
  }
}

function setPixel(png: PNG, x: number, y: number, color: readonly [number, number, number, number]): void {
  const index = (png.width * y + x) << 2;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
}

function validatePngBuffer(buffer: Buffer, filePath: string): void {
  assertPngHeaderSize(buffer, filePath);
  const png = PNG.sync.read(buffer);
  assertPngSize(png, filePath);
}

function assertPngHeaderSize(buffer: Buffer, filePath: string): void {
  if (buffer.length < 24) {
    throw new Error(`Visual case ${filePath} is not a valid PNG file`);
  }
  const signature = buffer.subarray(0, 8);
  const expectedSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!signature.equals(expectedSignature)) {
    throw new Error(`Visual case ${filePath} is not a valid PNG file`);
  }
  const ihdrLength = buffer.readUInt32BE(8);
  const chunkType = buffer.toString('ascii', 12, 16);
  if (ihdrLength !== 13 || chunkType !== 'IHDR') {
    throw new Error(`Visual case ${filePath} is not a valid PNG file`);
  }
  assertPngPixels(buffer.readUInt32BE(16), buffer.readUInt32BE(20), filePath);
}

function assertPngSize(png: PNG, filePath: string): void {
  assertPngPixels(png.width, png.height, filePath);
}

export function assertPngPixels(width: number, height: number, label: string): void {
  const pixels = width * height;
  if (pixels > maxPngPixels) {
    throw new Error(`Visual case ${label} is ${width}x${height}; maximum allowed is ${maxPngPixels} pixels`);
  }
}

function normalizePng(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) {
    return source;
  }

  const target = new PNG({ width, height, fill: true });
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (source.width * y + x) << 2;
      const targetIndex = (width * y + x) << 2;
      target.data[targetIndex] = source.data[sourceIndex] ?? 255;
      target.data[targetIndex + 1] = source.data[sourceIndex + 1] ?? 255;
      target.data[targetIndex + 2] = source.data[sourceIndex + 2] ?? 255;
      target.data[targetIndex + 3] = source.data[sourceIndex + 3] ?? 255;
    }
  }
  return target;
}

async function listPngCases(screenshotsDir: string): Promise<VisualCase[]> {
  const entries = await readdir(screenshotsDir, { withFileTypes: true }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  const cases = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => ({ name: entry.name.replace(/\.png$/u, ''), path: path.join(screenshotsDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (cases.length > maxCaseCount) {
    throw new Error(`Visual artifact contains ${cases.length} PNG files; maximum allowed is ${maxCaseCount}`);
  }

  for (const visualCase of cases) {
    if (!caseNamePattern.test(visualCase.name)) {
      throw new Error(`Invalid visual case filename: ${visualCase.name}. Expected ${caseNamePattern.source}`);
    }
    const stats = await stat(visualCase.path);
    if (stats.size > maxPngBytes) {
      throw new Error(`Visual case ${visualCase.name} is ${stats.size} bytes; maximum allowed is ${maxPngBytes}`);
    }
  }

  return cases;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function baselineCandidateShas(baseSha: string, maxAncestors: number): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-list', `--max-count=${maxAncestors + 1}`, baseSha], {
      cwd: path.resolve(e2eDir, '..'),
    });
    const shas = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    return shas.length > 0 ? shas : [baseSha];
  } catch {
    return [baseSha];
  }
}

async function findBaseline(r2: R2Config, caseName: string, candidateShas: string[]): Promise<BaselineLookup | null> {
  for (const [index, sha] of candidateShas.entries()) {
    const key = baselineKey(sha, caseName);
    if (await objectExists(r2, key)) {
      return { sha, key, behindBy: index };
    }
  }
  return null;
}

function renderComment(input: { compared: ComparedCase[]; headSha: string; baseSha: string }): string {
  const { compared, headSha, baseSha } = input;
  const changed = compared.filter((visualCase) => visualCase.status === 'changed');
  const unchanged = compared.filter((visualCase) => visualCase.status === 'unchanged');
  const missing = compared.filter((visualCase) => visualCase.status === 'missing-baseline');
  const failed = compared.filter((visualCase) => visualCase.status === 'failed');
  const hasFallbackBaseline = compared.some((visualCase) => (visualCase.baselineBehindBy ?? 0) > 0);
  const lines = [marker, '## Visual regression review', ''];

  lines.push(`Head: \`${shortSha(headSha)}\` · Base: \`${shortSha(baseSha)}\``);
  if (missing.length === compared.length) {
    lines.push('', '> Baseline unavailable; PR screenshots are new visual cases and need baseline review.');
  } else if (missing.length > 0) {
    lines.push('', `> ${missing.length} new visual case(s) have no baseline yet; review these screenshots before accepting their baselines.`);
  }
  if (hasFallbackBaseline) {
    lines.push('', '> Some cases used the nearest available ancestor baseline instead of the exact base SHA.');
  }
  if (failed.length > 0) {
    lines.push('', `> ⚠️ ${failed.length} case(s) failed during diff generation; partial captures are shown below.`);
  }

  lines.push('', summaryLine({ changed, unchanged, missing, failed }), '');

  if (changed.length > 0) {
    lines.push('### Changed cases', '', ...renderComparisonCaseTable(changed.slice(0, inlineCaseLimit)), '');
    if (changed.length > inlineCaseLimit) {
      lines.push(`_${changed.length - inlineCaseLimit} additional changed case(s) omitted from this comment._`, '');
    }
  }

  if (failed.length > 0) {
    lines.push('### Capture or diff failures', '');
    for (const visualCase of failed) {
      lines.push(`- **${escapeMarkdown(visualCase.name)}**: ${escapeMarkdown(visualCase.error ?? 'Unknown error')}`);
    }
    lines.push('');
  }

  if (missing.length > 0) {
    lines.push('### New cases without baselines', '', ...renderMissingCaseGrid(missing.slice(0, inlineCaseLimit)), '');
    if (missing.length > inlineCaseLimit) {
      lines.push(`_${missing.length - inlineCaseLimit} additional new case(s) omitted from this comment._`, '');
    }
  }

  if (unchanged.length > 0) {
    lines.push('<details><summary>Unchanged cases</summary>', '', ...renderComparisonCaseTable(unchanged.slice(0, inlineCaseLimit)), '</details>', '');
  }

  lines.push('_Visual diff is advisory only and does not block merging._', '');
  return `${lines.join('\n')}\n`;
}

function summaryLine(groups: { changed: ComparedCase[]; unchanged: ComparedCase[]; missing: ComparedCase[]; failed: ComparedCase[] }): string {
  return [
    `**${groups.changed.length} changed**`,
    `${groups.unchanged.length} unchanged`,
    `${groups.missing.length} new without baseline`,
    `${groups.failed.length} failed`,
  ].join(' · ');
}

function renderComparisonCaseTable(cases: ComparedCase[]): string[] {
  const lines: string[] = ['| Case | Main | PR | Diff |', '| --- | --- | --- | --- |'];
  for (const visualCase of cases) {
    lines.push(`| ${caseSummaryCell(visualCase)} | ${imageCell(visualCase.mainUrl, 'main', comparisonImageWidth)} | ${imageCell(visualCase.prUrl, 'pr', comparisonImageWidth)} | ${imageCell(visualCase.diffUrl, 'diff', comparisonImageWidth)} |`);
  }

  return lines;
}

function caseSummaryCell(visualCase: ComparedCase): string {
    const baselineNote = visualCase.baselineBehindBy != null && visualCase.baselineBehindBy > 0
      ? ` · baseline ${visualCase.baselineBehindBy} commit(s) behind`
      : '';
    const diffNote = visualCase.diffPixels == null
      ? ''
      : ` · ${visualCase.diffPixels.toLocaleString('en-US')} px${visualCase.diffPixelRatio == null ? '' : ` (${formatPercent(visualCase.diffPixelRatio)})`}`;
    const notes = `${diffNote}${baselineNote}`.replace(/^ · /u, '');
    return notes.length > 0
      ? `<strong>${escapeHtml(visualCase.name)}</strong><br><sub>${escapeHtml(notes)}</sub>`
      : `<strong>${escapeHtml(visualCase.name)}</strong>`;
}

function renderMissingCaseGrid(cases: ComparedCase[]): string[] {
  const lines: string[] = ['| PR | PR | PR |', '| --- | --- | --- |'];
  for (let index = 0; index < cases.length; index += 3) {
    const row = cases.slice(index, index + 3).map((visualCase) => {
      return `<strong>${escapeHtml(visualCase.name)}</strong><br>${imageCell(visualCase.prUrl, 'pr', comparisonImageWidth)}`;
    });
    while (row.length < 3) {
      row.push('');
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines;
}

function imageCell(url: string | undefined, alt: string, width: number): string {
  return url == null ? 'n/a' : `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="${width}">`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function objectExists(r2: R2Config, key: string): Promise<boolean> {
  try {
    await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
    return true;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingObjectError(error: unknown): error is S3ServiceException {
  return error instanceof S3ServiceException
    && (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404);
}

async function putFile(r2: R2Config, key: string, filePath: string): Promise<void> {
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: 'image/png',
    }),
  );
}

async function downloadObject(r2: R2Config, key: string, outputPath: string): Promise<void> {
  const response = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
  if (response.Body == null) {
    throw new Error(`R2 object ${key} returned no body`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  const bytes = await response.Body.transformToByteArray();
  await writeFile(outputPath, bytes);
}

function r2ConfigFromEnv(): R2Config {
  const bucket = env('R2_BUCKET') ?? env('CLOUDFLARE_R2_RELEASES_BUCKET');
  const publicOrigin = env('R2_PUBLIC_ORIGIN') ?? env('CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN');
  const accessKeyId = env('R2_ACCESS_KEY_ID') ?? env('CLOUDFLARE_R2_RELEASES_AK');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY') ?? env('CLOUDFLARE_R2_RELEASES_SK');
  const endpoint = env('R2_ENDPOINT') ?? env('CLOUDFLARE_R2_RELEASES_URL') ?? endpointFromAccountId();

  if (bucket == null || publicOrigin == null || accessKeyId == null || secretAccessKey == null || endpoint == null) {
    throw new Error(
      'Missing R2 configuration. Set R2_BUCKET, R2_PUBLIC_ORIGIN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT or R2_ACCOUNT_ID.',
    );
  }

  return {
    bucket,
    publicOrigin: publicOrigin.replace(/\/+$/u, ''),
    client: new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function endpointFromAccountId(): string | undefined {
  const accountId = env('R2_ACCOUNT_ID');
  return accountId == null ? undefined : `https://${accountId}.r2.cloudflarestorage.com`;
}

function baselineKey(sha: string, caseName: string): string {
  return `${visualPrefix}/${sha}/${caseName}.png`;
}

function prImageKey(prNumber: string, runId: string, kind: 'main' | 'pr' | 'diff', caseName: string): string {
  return `${visualPrefix}/pr-${prNumber}/${runId}/${kind}/${caseName}.png`;
}

function publicUrl(r2: R2Config, key: string): string {
  return `${r2.publicOrigin}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function requiredOption(options: ParsedArgs, name: string): string {
  const value = optionString(options, name);
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing required --${name}`);
  }
  return value;
}

function optionString(options: ParsedArgs, name: string): string | undefined {
  const value = options[name];
  return typeof value === 'string' ? value : undefined;
}

type ParsedArgs = { _: string[] } & { [key: string]: string | string[] | undefined };

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg == null) {
      continue;
    }
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      parsed[name] = 'true';
    } else {
      parsed[name] = value;
      index += 1;
    }
  }
  return parsed;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value == null || value === '' ? undefined : value;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function escapeMarkdown(value: string): string {
  return escapeHtml(value).replace(/[|\\`*_{}[\]()#+.!-]/gu, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replace(/[\r\n]+/gu, ' ');
}

function printUsage(): void {
  console.log(`Usage: tsx scripts/visual-report.ts <command> [options]

Commands:
  upload-baseline --sha <sha> --screenshots <dir> [--manifest-out <path>]
  compare-pr --pr-number <num> --run-id <id> --head-sha <sha> --base-sha <sha> --screenshots <dir> [--comment-out <path>]
`);
}
