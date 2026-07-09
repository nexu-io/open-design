import type { ProjectFile } from '@open-design/contracts';
import { createProjectArtifactFile } from '../artifacts/create.js';
import {
  listFiles as defaultListFiles,
  writeProjectFile as defaultWriteProjectFile,
} from '../projects.js';

type JsonRecord = Record<string, unknown>;

export interface PlainStreamArtifact {
  identifier: string;
  artifactType: string;
  title: string;
  content: string;
  extension: SupportedArtifactExtension;
  fileName: string;
}

export interface PersistedPlainStreamArtifact {
  identifier: string;
  artifactType: string;
  title: string;
  name: string;
  file: unknown;
}

interface RunEventLike {
  event?: string;
  data?: unknown;
}

type SupportedArtifactExtension = '.html' | '.css' | '.svg' | '.md';

type WriteProjectFile = Parameters<typeof createProjectArtifactFile>[0]['writeProjectFile'];

type ListFiles = (
  projectsRoot: string,
  projectId: string,
  opts?: { metadata?: unknown },
) => Promise<ProjectFile[]>;

const OPEN_TAG = '<artifact';
const CLOSE_TAG = '</artifact>';
const MAX_ARTIFACTS_PER_RUN = 50;
const HEADING_RE = /^#{1,4}\s+/;
const UL_ITEM_RE = /^\s*[-*+]\s+/;
const OL_ITEM_RE = /^\s*\d+\.\s+/;
// Mirrors apps/web/src/artifacts/markdown-context.ts so headless plain-stream
// persistence sees the same fence boundaries as the browser artifact parser.
const FENCE_OPEN_RE = /^```(\w[\w+-]*)?\s*$/;
const FENCE_CLOSE_RE = /^```\s*$/;

const TYPE_TO_EXTENSION = new Map<string, SupportedArtifactExtension>([
  ['html', '.html'],
  ['text/html', '.html'],
  ['css', '.css'],
  ['text/css', '.css'],
  ['svg', '.svg'],
  ['image/svg+xml', '.svg'],
  ['markdown', '.md'],
  ['md', '.md'],
  ['text/markdown', '.md'],
  ['text/x-markdown', '.md'],
]);

export function plainStdoutFromRunEvents(events: readonly RunEventLike[]): string {
  let stdout = '';
  for (const rec of events) {
    if (rec?.event !== 'stdout') continue;
    const data = rec.data as { chunk?: unknown } | null | undefined;
    if (typeof data?.chunk === 'string') stdout += data.chunk;
  }
  return stdout;
}

export function extractPlainStreamArtifacts(stdout: string): PlainStreamArtifact[] {
  if (!stdout.includes(OPEN_TAG)) return [];
  const skipRanges = computeMarkdownSkipRanges(stdout);
  const artifacts: PlainStreamArtifact[] = [];
  let from = 0;

  while (from < stdout.length && artifacts.length < MAX_ARTIFACTS_PER_RUN) {
    const openStart = findNextArtifactOpen(stdout, from, skipRanges);
    if (openStart === -1) break;
    const nextOpenStart = findNextArtifactOpen(stdout, openStart + OPEN_TAG.length, skipRanges);
    const openEnd = findOpenTagEnd(stdout, openStart + OPEN_TAG.length);
    if (openEnd === -1) {
      from = openStart + OPEN_TAG.length;
      continue;
    }
    if (nextOpenStart !== -1 && nextOpenStart < openEnd) {
      from = nextOpenStart;
      continue;
    }
    const closeStart = stdout.indexOf(CLOSE_TAG, openEnd);
    if (closeStart === -1) {
      from = openStart + OPEN_TAG.length;
      continue;
    }
    if (nextOpenStart !== -1 && nextOpenStart < closeStart) {
      from = nextOpenStart;
      continue;
    }

    const attrText = stdout.slice(openStart + OPEN_TAG.length, openEnd - 1);
    const attrs = parseAttrs(attrText);
    const content = stdout.slice(openEnd, closeStart);
    const artifactType = normalizeArtifactType(attrs.type, content);
    const extension = artifactType ? TYPE_TO_EXTENSION.get(artifactType) : undefined;
    if (artifactType && extension) {
      const title = attrs.title ?? '';
      const identifier = attrs.identifier ?? '';
      artifacts.push({
        identifier,
        artifactType,
        title,
        content,
        extension,
        fileName: `${artifactBaseNameFor({ identifier, title })}${extension}`,
      });
    }
    from = closeStart + CLOSE_TAG.length;
  }

  return artifacts;
}

export async function persistPlainStreamArtifacts(options: {
  projectsRoot: string;
  projectId: string;
  stdout: string;
  metadata?: unknown;
  writeProjectFile?: WriteProjectFile;
  listFiles?: ListFiles;
}): Promise<PersistedPlainStreamArtifact[]> {
  const artifacts = extractPlainStreamArtifacts(options.stdout);
  if (artifacts.length === 0) return [];

  const listFiles = options.listFiles ?? (defaultListFiles as ListFiles);
  const writeProjectFile = options.writeProjectFile ?? (defaultWriteProjectFile as WriteProjectFile);
  const existingFiles = await listFiles(options.projectsRoot, options.projectId, {
    metadata: options.metadata,
  });
  const reservedNames = new Set(existingFiles.map((file) => file.name));
  const persisted: PersistedPlainStreamArtifact[] = [];

  for (const artifact of artifacts) {
    const name = reserveUniqueArtifactFileName(artifact.fileName, reservedNames);
    const manifest = artifactManifestFor(artifact, name);
    const file = await createProjectArtifactFile({
      projectsRoot: options.projectsRoot,
      projectId: options.projectId,
      input: {
        name,
        content: artifact.content,
        artifactManifest: manifest,
      },
      metadata: options.metadata,
      writeProjectFile,
    });
    persisted.push({
      identifier: artifact.identifier,
      artifactType: artifact.artifactType,
      title: artifact.title,
      name,
      file,
    });
  }

  return persisted;
}

function normalizeArtifactType(rawType: string | undefined, content: string): string | null {
  const normalized = rawType?.trim().toLowerCase();
  if (normalized && TYPE_TO_EXTENSION.has(normalized)) return normalized;
  if (!normalized && looksLikeHtmlDocument(content)) return 'text/html';
  return null;
}

function looksLikeHtmlDocument(content: string): boolean {
  return /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(content);
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    attrs[match[1] as string] = (match[2] ?? match[3] ?? '') as string;
    match = re.exec(raw);
  }
  return attrs;
}

function findNextArtifactOpen(
  text: string,
  from: number,
  skipRanges: ReadonlyArray<[number, number]>,
): number {
  let current = from;
  while (current < text.length) {
    const idx = text.indexOf(OPEN_TAG, current);
    if (idx === -1) return -1;
    if (!isRealArtifactOpenAt(text, idx) || rangeContains(skipRanges, idx)) {
      current = idx + OPEN_TAG.length;
      continue;
    }
    return idx;
  }
  return -1;
}

function isRealArtifactOpenAt(text: string, idx: number): boolean {
  const next = text.charAt(idx + OPEN_TAG.length);
  return /\s/.test(next);
}

function findOpenTagEnd(text: string, from: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = from; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return -1;
}

function computeMarkdownSkipRanges(text: string): Array<[number, number]> {
  const fenceRanges = computeMarkdownFenceRanges(text);
  return [...fenceRanges, ...computeMarkdownInlineCodeRanges(text, fenceRanges)];
}

function computeMarkdownFenceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let pos = 0;
  let fenceStart = -1;
  while (pos < text.length) {
    const eol = text.indexOf('\n', pos);
    const lineEnd = eol === -1 ? text.length : eol;
    const line = text.slice(pos, lineEnd);
    const lineHasNewline = eol !== -1;

    if (fenceStart === -1) {
      if (lineHasNewline && FENCE_OPEN_RE.test(line)) {
        fenceStart = pos;
      }
    } else if (lineHasNewline && FENCE_CLOSE_RE.test(line)) {
      ranges.push([fenceStart, eol + 1]);
      fenceStart = -1;
    }

    if (!lineHasNewline) {
      break;
    }
    pos = eol + 1;
  }
  if (fenceStart !== -1) ranges.push([fenceStart, text.length]);
  return ranges;
}

function computeMarkdownInlineCodeRanges(
  text: string,
  fenceRanges: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const [start, end] of computeMarkdownInlineBlockRanges(text, fenceRanges)) {
    let i = start;
    while (i < end) {
      const idx = text.indexOf('`', i);
      if (idx === -1 || idx >= end) break;
      const tickCount = countBacktickRun(text, idx);
      const close = findMatchingBacktickRun(text, idx + tickCount, tickCount, fenceRanges, end);
      if (close === -1) {
        i = idx + tickCount;
        continue;
      }
      ranges.push([idx, close + tickCount]);
      i = close + tickCount;
    }
  }
  return ranges;
}

function computeMarkdownInlineBlockRanges(
  text: string,
  fenceRanges: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let pos = 0;
  let blockStart = -1;

  const closeBlockBefore = (idx: number) => {
    if (blockStart !== -1 && idx > blockStart) ranges.push([blockStart, idx]);
    blockStart = -1;
  };

  while (pos < text.length) {
    const fenceRange = rangeContaining(fenceRanges, pos);
    if (fenceRange) {
      closeBlockBefore(pos);
      pos = fenceRange[1];
      continue;
    }

    const eol = text.indexOf('\n', pos);
    const lineEnd = eol === -1 ? text.length : eol;
    const line = text.slice(pos, lineEnd);

    if (line.trim() === '') {
      closeBlockBefore(pos);
    } else if (HEADING_RE.test(line) || UL_ITEM_RE.test(line) || OL_ITEM_RE.test(line)) {
      closeBlockBefore(pos);
      ranges.push([pos, lineEnd]);
    } else if (blockStart === -1) {
      blockStart = pos;
    }

    pos = eol === -1 ? text.length : eol + 1;
  }

  closeBlockBefore(text.length);
  return ranges;
}

function countBacktickRun(text: string, from: number): number {
  let count = 0;
  while (text.charAt(from + count) === '`') count += 1;
  return count;
}

function findMatchingBacktickRun(
  text: string,
  from: number,
  tickCount: number,
  fenceRanges: ReadonlyArray<[number, number]>,
  until: number,
): number {
  let i = from;
  while (i < until) {
    const idx = text.indexOf('`', i);
    if (idx === -1 || idx >= until) return -1;
    if (rangeContains(fenceRanges, idx)) {
      i = idx + 1;
      continue;
    }
    const candidateCount = countBacktickRun(text, idx);
    if (candidateCount === tickCount) return idx;
    i = idx + candidateCount;
  }
  return -1;
}

function rangeContaining(
  ranges: ReadonlyArray<[number, number]>,
  idx: number,
): [number, number] | null {
  return ranges.find(([start, end]) => idx >= start && idx < end) ?? null;
}

function rangeContains(ranges: ReadonlyArray<[number, number]>, idx: number): boolean {
  return ranges.some(([start, end]) => idx >= start && idx < end);
}

function artifactBaseNameFor(input: { identifier: string; title: string }): string {
  return (
    (input.identifier || input.title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

function reserveUniqueArtifactFileName(
  desiredName: string,
  reservedNames: Set<string>,
): string {
  if (!reservedNames.has(desiredName)) {
    reservedNames.add(desiredName);
    return desiredName;
  }
  const dot = desiredName.lastIndexOf('.');
  const stem = dot >= 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot >= 0 ? desiredName.slice(dot) : '';
  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${stem}-${suffix}${ext}`;
    if (!reservedNames.has(candidate)) {
      reservedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
  throw new Error(`could not allocate artifact filename for ${desiredName}`);
}

function artifactManifestFor(artifact: PlainStreamArtifact, entry: string): JsonRecord {
  const title = artifact.title || artifact.identifier || entry;
  const metadata = {
    identifier: artifact.identifier,
    artifactType: artifact.artifactType,
    inferred: false,
  };

  if (artifact.extension === '.html') {
    return {
      kind: 'html',
      title,
      entry,
      renderer: 'html',
      status: 'complete',
      exports: ['html', 'pdf', 'zip'],
      primary: true,
      metadata,
    };
  }
  if (artifact.extension === '.css') {
    return {
      kind: 'code-snippet',
      title,
      entry,
      renderer: 'code',
      status: 'complete',
      exports: ['txt', 'zip'],
      metadata,
    };
  }
  if (artifact.extension === '.svg') {
    return {
      kind: 'svg',
      title,
      entry,
      renderer: 'svg',
      status: 'complete',
      exports: ['svg', 'zip'],
      metadata,
    };
  }
  return {
    kind: 'markdown-document',
    title,
    entry,
    renderer: 'markdown',
    status: 'complete',
    exports: ['md', 'html', 'pdf', 'zip'],
    metadata,
  };
}
