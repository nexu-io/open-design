import { execFile } from 'node:child_process';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { listFiles, projectDir, readProjectFile, validateProjectPath } from '../projects.js';
import type { BoundedJsonObject, BoundedJsonValue, LiveArtifact, LiveArtifactRefreshSourceMetadata, LiveArtifactSource } from './schema.js';
import { validateBoundedJsonObject } from './schema.js';

const execFileAsync = promisify(execFile);

export const DEFAULT_LIVE_ARTIFACT_SOURCE_TIMEOUT_MS = 30_000;
export const DEFAULT_LIVE_ARTIFACT_TOTAL_TIMEOUT_MS = 120_000;

export type LiveArtifactRefreshAbortKind = 'cancelled' | 'source_timeout' | 'total_timeout';

export interface LiveArtifactRefreshTimeouts {
  sourceTimeoutMs: number;
  totalTimeoutMs: number;
}

export interface LiveArtifactRefreshRunScope {
  projectId: string;
  artifactId: string;
  refreshId: string;
}

export interface LiveArtifactRefreshRun extends LiveArtifactRefreshRunScope {
  readonly signal: AbortSignal;
  readonly startedAt: Date;
}

export interface LiveArtifactRefreshRunOptions extends LiveArtifactRefreshRunScope {
  totalTimeoutMs?: number;
  now?: Date;
}

export interface LiveArtifactRefreshSourceExecutionOptions {
  step: string;
  source?: LiveArtifactRefreshSourceMetadata;
  sourceTimeoutMs?: number;
}

export type LocalDaemonRefreshToolName =
  | 'project_files.search'
  | 'project_files.read_json'
  | 'git.summary'
  | 'public_github_repository_metric';

export interface ExecuteLocalDaemonRefreshSourceOptions {
  projectsRoot: string;
  projectId: string;
  source: LiveArtifactSource;
  signal?: AbortSignal;
}

export interface ApplyLiveArtifactOutputMappingOptions {
  source: LiveArtifactSource;
  output: BoundedJsonObject;
}

export interface LiveArtifactRefreshDocumentOutput {
  output: BoundedJsonObject;
}

export interface BuildLiveArtifactRefreshCandidateOptions {
  artifact: LiveArtifact;
  currentDataJson: BoundedJsonObject;
  documentOutput?: LiveArtifactRefreshDocumentOutput;
  now?: Date;
}

export interface LiveArtifactRefreshCandidate {
  dataJson: BoundedJsonObject;
}

export interface ProjectFilesSearchInput extends BoundedJsonObject {
  query?: string;
  maxResults?: number;
}

export interface ProjectFilesReadJsonInput extends BoundedJsonObject {
  path?: string;
  file?: string;
  name?: string;
}

export interface GitSummaryInput extends BoundedJsonObject {
  maxCommits?: number;
}

export interface PublicGithubRepositoryMetricInput extends BoundedJsonObject {
  url?: string;
  fields?: string[];
}


export class LiveArtifactRefreshAbortError extends Error {
  readonly kind: LiveArtifactRefreshAbortKind;
  readonly projectId: string;
  readonly artifactId: string;
  readonly refreshId: string;
  readonly timeoutMs?: number;
  readonly step?: string;

  constructor(message: string, options: LiveArtifactRefreshRunScope & { kind: LiveArtifactRefreshAbortKind; timeoutMs?: number; step?: string }) {
    super(message);
    this.name = 'LiveArtifactRefreshAbortError';
    this.kind = options.kind;
    this.projectId = options.projectId;
    this.artifactId = options.artifactId;
    this.refreshId = options.refreshId;
    if (options.timeoutMs !== undefined) this.timeoutMs = options.timeoutMs;
    if (options.step !== undefined) this.step = options.step;
  }
}

interface ActiveRefreshRun extends LiveArtifactRefreshRun {
  readonly controller: AbortController;
  readonly totalTimeout: ReturnType<typeof setTimeout>;
}

function validateTimeoutMs(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${path} must be a positive safe integer`);
  }
  return value;
}

export function normalizeLiveArtifactRefreshTimeouts(options?: Partial<LiveArtifactRefreshTimeouts>): LiveArtifactRefreshTimeouts {
  return {
    sourceTimeoutMs: validateTimeoutMs(options?.sourceTimeoutMs ?? DEFAULT_LIVE_ARTIFACT_SOURCE_TIMEOUT_MS, 'sourceTimeoutMs'),
    totalTimeoutMs: validateTimeoutMs(options?.totalTimeoutMs ?? DEFAULT_LIVE_ARTIFACT_TOTAL_TIMEOUT_MS, 'totalTimeoutMs'),
  };
}

function refreshRunKey(scope: LiveArtifactRefreshRunScope): string {
  return `${scope.projectId}\0${scope.artifactId}\0${scope.refreshId}`;
}

function abortPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

function toRefreshAbortError(reason: unknown, fallback: LiveArtifactRefreshRunScope): LiveArtifactRefreshAbortError {
  if (reason instanceof LiveArtifactRefreshAbortError) return reason;
  if (reason instanceof Error) {
    return new LiveArtifactRefreshAbortError(reason.message, { ...fallback, kind: 'cancelled' });
  }
  return new LiveArtifactRefreshAbortError(String(reason || 'live artifact refresh cancelled'), { ...fallback, kind: 'cancelled' });
}

export class LiveArtifactRefreshRunRegistry {
  private readonly runs = new Map<string, ActiveRefreshRun>();

  startRun(options: LiveArtifactRefreshRunOptions): LiveArtifactRefreshRun {
    const totalTimeoutMs = validateTimeoutMs(options.totalTimeoutMs ?? DEFAULT_LIVE_ARTIFACT_TOTAL_TIMEOUT_MS, 'totalTimeoutMs');
    const key = refreshRunKey(options);
    if (this.runs.has(key)) {
      throw new Error('live artifact refresh run already registered');
    }

    const controller = new AbortController();
    const totalTimeout = setTimeout(() => {
      controller.abort(new LiveArtifactRefreshAbortError('live artifact refresh timed out', {
        ...options,
        kind: 'total_timeout',
        timeoutMs: totalTimeoutMs,
      }));
    }, totalTimeoutMs);
    totalTimeout.unref?.();

    const run: ActiveRefreshRun = {
      projectId: options.projectId,
      artifactId: options.artifactId,
      refreshId: options.refreshId,
      startedAt: options.now ?? new Date(),
      signal: controller.signal,
      controller,
      totalTimeout,
    };
    this.runs.set(key, run);
    return run;
  }

  finishRun(run: LiveArtifactRefreshRunScope): void {
    const active = this.runs.get(refreshRunKey(run));
    if (active === undefined) return;
    clearTimeout(active.totalTimeout);
    this.runs.delete(refreshRunKey(run));
  }

  cancelRun(scope: LiveArtifactRefreshRunScope, reason = 'live artifact refresh cancelled by user'): boolean {
    const active = this.runs.get(refreshRunKey(scope));
    if (active === undefined) return false;
    active.controller.abort(new LiveArtifactRefreshAbortError(reason, { ...scope, kind: 'cancelled' }));
    return true;
  }

  hasRun(scope: LiveArtifactRefreshRunScope): boolean {
    return this.runs.has(refreshRunKey(scope));
  }
}

export const liveArtifactRefreshRunRegistry = new LiveArtifactRefreshRunRegistry();

export async function withLiveArtifactRefreshRun<T>(
  registry: LiveArtifactRefreshRunRegistry,
  options: LiveArtifactRefreshRunOptions,
  callback: (run: LiveArtifactRefreshRun) => Promise<T>,
): Promise<T> {
  const run = registry.startRun(options);
  try {
    return await Promise.race([callback(run), abortPromise(run.signal)]);
  } catch (error) {
    if (!run.signal.aborted) throw error;
    throw toRefreshAbortError(error, run);
  } finally {
    registry.finishRun(run);
  }
}

export async function withLiveArtifactRefreshSourceTimeout<T>(
  run: LiveArtifactRefreshRun,
  options: LiveArtifactRefreshSourceExecutionOptions,
  callback: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const sourceTimeoutMs = validateTimeoutMs(options.sourceTimeoutMs ?? DEFAULT_LIVE_ARTIFACT_SOURCE_TIMEOUT_MS, 'sourceTimeoutMs');
  const sourceController = new AbortController();
  const onRunAbort = (): void => sourceController.abort(run.signal.reason);
  if (run.signal.aborted) onRunAbort();
  else run.signal.addEventListener('abort', onRunAbort, { once: true });

  const sourceTimeout = setTimeout(() => {
    sourceController.abort(new LiveArtifactRefreshAbortError('live artifact refresh source timed out', {
      projectId: run.projectId,
      artifactId: run.artifactId,
      refreshId: run.refreshId,
      kind: 'source_timeout',
      timeoutMs: sourceTimeoutMs,
      step: options.step,
    }));
  }, sourceTimeoutMs);
  sourceTimeout.unref?.();

  try {
    return await Promise.race([callback(sourceController.signal), abortPromise(sourceController.signal)]);
  } catch (error) {
    if (!sourceController.signal.aborted) throw error;
    throw toRefreshAbortError(error, run);
  } finally {
    clearTimeout(sourceTimeout);
    run.signal.removeEventListener('abort', onRunAbort);
  }
}

function isLocalDaemonRefreshToolName(value: string | undefined): value is LocalDaemonRefreshToolName {
  return value === 'project_files.search'
    || value === 'project_files.read_json'
    || value === 'git.summary'
    || value === 'public_github_repository_metric';
}

function asBoundedRefreshOutput(value: BoundedJsonObject): BoundedJsonObject {
  const result = validateBoundedJsonObject(value, 'localRefreshOutput');
  if (!result.ok) {
    const firstIssue = result.issues[0];
    throw new Error(firstIssue === undefined ? result.error : `${firstIssue.path}: ${firstIssue.message}`);
  }
  return result.value;
}

const SAFE_MAPPING_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]*$|^(?:0|[1-9][0-9]*)$/;
const UNSAFE_MAPPING_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function parseMappingPath(path: string, field: string): string[] {
  const normalized = path.startsWith('$.') ? path.slice(2) : path;
  if (normalized.length === 0 || normalized.startsWith('.') || normalized.endsWith('.') || normalized.includes('..')) {
    throw new Error(`${field} must be a dot-separated JSON path`);
  }
  const segments = normalized.split('.');
  for (const segment of segments) {
    if (!SAFE_MAPPING_SEGMENT.test(segment) || UNSAFE_MAPPING_SEGMENTS.has(segment)) {
      throw new Error(`${field} contains unsupported JSON path segment: ${segment}`);
    }
  }
  return segments;
}

function isJsonObject(value: BoundedJsonValue | undefined): value is BoundedJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readMappedValue(root: BoundedJsonObject, path: string): BoundedJsonValue | undefined {
  let current: BoundedJsonValue | undefined = root;
  for (const segment of parseMappingPath(path, 'outputMapping.dataPaths.from')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0) throw new Error(`outputMapping.dataPaths.from array segment is invalid: ${segment}`);
      current = current[index];
    } else if (isJsonObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function makeContainer(nextSegment: string): BoundedJsonObject | BoundedJsonValue[] {
  return /^(?:0|[1-9][0-9]*)$/.test(nextSegment) ? [] : {};
}

function writeMappedValue(root: BoundedJsonObject, path: string, value: BoundedJsonValue): void {
  const segments = parseMappingPath(path, 'outputMapping.dataPaths.to');
  let current: BoundedJsonObject | BoundedJsonValue[] = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const isLast = index === segments.length - 1;
    if (Array.isArray(current)) {
      const arrayIndex = Number(segment);
      if (!Number.isSafeInteger(arrayIndex) || arrayIndex < 0) throw new Error('outputMapping.dataPaths.to array segments must be non-negative integers');
      if (isLast) {
        current[arrayIndex] = value;
        return;
      }
      const next = current[arrayIndex];
      if (!isJsonObject(next) && !Array.isArray(next)) {
        current[arrayIndex] = makeContainer(segments[index + 1]!);
      }
      current = current[arrayIndex] as BoundedJsonObject | BoundedJsonValue[];
      continue;
    }

    if (isLast) {
      current[segment] = value;
      return;
    }
    const next = current[segment];
    if (!isJsonObject(next) && !Array.isArray(next)) {
      current[segment] = makeContainer(segments[index + 1]!);
    }
    current = current[segment] as BoundedJsonObject | BoundedJsonValue[];
  }
}

function applyDataPaths(output: BoundedJsonObject, dataPaths: NonNullable<LiveArtifactSource['outputMapping']>['dataPaths']): BoundedJsonObject {
  if (dataPaths === undefined || dataPaths.length === 0) return output;
  const mapped: BoundedJsonObject = {};
  for (const dataPath of dataPaths) {
    const value = readMappedValue(output, dataPath.from);
    if (value !== undefined) writeMappedValue(mapped, dataPath.to, value);
  }
  return mapped;
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced.length === 0 ? key : spaced.replace(/^./, (char) => char.toUpperCase());
}

function isPrimitive(value: BoundedJsonValue): value is null | boolean | number | string {
  return value === null || typeof value !== 'object';
}

function firstObjectArray(value: BoundedJsonValue): BoundedJsonObject[] | undefined {
  if (Array.isArray(value)) return value.filter(isJsonObject).slice(0, 500);
  if (!isJsonObject(value)) return undefined;
  for (const key of ['rows', 'items', 'matches', 'results', 'data']) {
    const child = value[key];
    if (Array.isArray(child)) return child.filter(isJsonObject).slice(0, 500);
  }
  for (const child of Object.values(value)) {
    const nested = firstObjectArray(child);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function compactTable(value: BoundedJsonObject): BoundedJsonObject {
  const rows = firstObjectArray(value) ?? [value];
  const keys: string[] = [];
  for (const row of rows) {
    for (const [key, child] of Object.entries(row)) {
      if (keys.length >= 20) break;
      if (!keys.includes(key) && isPrimitive(child)) keys.push(key);
    }
  }
  const compactRows = rows.slice(0, 100).map((row) => Object.fromEntries(keys.map((key) => [key, isPrimitive(row[key] ?? null) ? (row[key] ?? null) : JSON.stringify(row[key])])) as BoundedJsonObject);
  return {
    columns: keys.map((key) => ({ key, label: humanizeKey(key) })),
    rows: compactRows,
    count: rows.length,
    truncated: rows.length > compactRows.length,
  };
}

function findMetricValue(value: BoundedJsonValue): BoundedJsonValue | undefined {
  if (isPrimitive(value) && typeof value !== 'boolean' && value !== null) return value;
  if (Array.isArray(value)) return value.length;
  if (!isJsonObject(value)) return undefined;
  for (const key of ['value', 'count', 'total', 'score', 'amount']) {
    const child = value[key];
    if ((typeof child === 'number' || typeof child === 'string') && child !== '') return child;
  }
  for (const child of Object.values(value)) {
    const found = findMetricValue(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function optionalPrimitiveString(value: BoundedJsonValue | undefined): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return undefined;
}

function metricSummary(value: BoundedJsonObject): BoundedJsonObject {
  const entries = Object.entries(value);
  if (entries.length === 1 && isJsonObject(entries[0]?.[1])) return metricSummary(entries[0][1]);
  const metricValue = findMetricValue(value) ?? '';
  return {
    label: optionalPrimitiveString(value.label) ?? optionalPrimitiveString(value.name) ?? optionalPrimitiveString(value.title) ?? 'Metric',
    value: typeof metricValue === 'number' || typeof metricValue === 'string' ? metricValue : String(metricValue),
    ...(optionalPrimitiveString(value.unit) === undefined ? {} : { unit: optionalPrimitiveString(value.unit)! }),
    ...(optionalPrimitiveString(value.delta) === undefined ? {} : { delta: optionalPrimitiveString(value.delta)! }),
    source: value,
  };
}

export function applyLiveArtifactOutputMapping(options: ApplyLiveArtifactOutputMappingOptions): BoundedJsonObject {
  const mapping = options.source.outputMapping;
  const selected = applyDataPaths(options.output, mapping?.dataPaths);
  if (mapping?.dataPaths !== undefined && mapping.dataPaths.length > 0 && Object.keys(selected).length === 0) {
    return {};
  }
  const transform = mapping?.transform ?? 'identity';
  const transformed = transform === 'identity'
    ? selected
    : transform === 'compact_table'
      ? compactTable(selected)
      : metricSummary(selected);
  return asBoundedRefreshOutput(transformed);
}

function cloneBoundedJsonObject(value: BoundedJsonObject): BoundedJsonObject {
  return JSON.parse(JSON.stringify(value)) as BoundedJsonObject;
}

function deepMergeBoundedJsonObject(target: BoundedJsonObject, source: BoundedJsonObject): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (isJsonObject(current) && isJsonObject(value)) {
      deepMergeBoundedJsonObject(current, value);
    } else {
      target[key] = value;
    }
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function dateLabel(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function applyLegacyGithubRepositoryMetricCompat(dataJson: BoundedJsonObject, output: BoundedJsonObject): void {
  const repository = dataJson.repository;
  if (!isJsonObject(repository)) return;
  const stars = output.stargazers_count;
  if (typeof stars === 'number') {
    repository.starCount = stars;
    if (typeof repository.starCountFormatted === 'string') repository.starCountFormatted = formatNumber(stars);
  }
  if (typeof output.full_name === 'string') repository.fullName = output.full_name;
  if (typeof output.html_url === 'string') repository.url = output.html_url;
  if (typeof output.updated_at === 'string') {
    repository.fetchedAt = output.updated_at;
    const label = dateLabel(output.updated_at);
    if (label !== undefined && typeof repository.fetchedDate === 'string') repository.fetchedDate = label;
  }
}

export function buildLiveArtifactRefreshCandidate(options: BuildLiveArtifactRefreshCandidateOptions): LiveArtifactRefreshCandidate {
  const dataJson = cloneBoundedJsonObject(options.currentDataJson);

  if (options.documentOutput !== undefined && options.artifact.document?.sourceJson !== undefined) {
    const source = options.artifact.document.sourceJson;
    const mapped = source.toolName === 'public_github_repository_metric' && source.outputMapping?.dataPaths !== undefined
      ? asBoundedRefreshOutput(applyDataPaths(options.documentOutput.output, source.outputMapping.dataPaths))
      : applyLiveArtifactOutputMapping({
          source,
          output: options.documentOutput.output,
        });
    deepMergeBoundedJsonObject(dataJson, mapped);
    if (source.toolName === 'public_github_repository_metric') {
      applyLegacyGithubRepositoryMetricCompat(dataJson, options.documentOutput.output);
    }
  }

  return { dataJson: asBoundedRefreshOutput(dataJson) };
}

function optionalString(value: BoundedJsonValue | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value;
}

function optionalPositiveInteger(value: BoundedJsonValue | undefined, field: string, defaultValue: number, maxValue: number): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) throw new Error(`${field} must be a positive integer`);
  return Math.min(value, maxValue);
}

function selectJsonPath(input: ProjectFilesReadJsonInput): string {
  const rawPath = optionalString(input.path, 'input.path') ?? optionalString(input.file, 'input.file') ?? optionalString(input.name, 'input.name');
  if (rawPath === undefined) throw new Error('project_files.read_json requires input.path');
  return validateProjectPath(rawPath);
}

function compactTextPreview(text: string, query: string | undefined): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 240) return normalized;
  if (query === undefined || query.trim().length === 0) return `${normalized.slice(0, 240)}…`;
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return `${normalized.slice(0, 240)}…`;
  const start = Math.max(0, index - 80);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, start + 240)}…`;
}

function isTextLikeFile(file: { kind?: string; mime?: string; name: string }): boolean {
  return file.kind === 'code' || file.kind === 'text' || file.kind === 'html' || file.mime?.startsWith('text/') === true || file.name.endsWith('.json');
}

async function executeProjectFilesSearch(options: ExecuteLocalDaemonRefreshSourceOptions): Promise<BoundedJsonObject> {
  const input = options.source.input as ProjectFilesSearchInput;
  const query = optionalString(input.query, 'input.query')?.trim();
  const maxResults = optionalPositiveInteger(input.maxResults, 'input.maxResults', 25, 100);
  const allFiles = await listFiles(options.projectsRoot, options.projectId) as Array<{ name: string; path: string; type: string; size: number; mtime: number; kind?: string; mime?: string }>;
  const matches: BoundedJsonObject[] = [];
  const normalizedQuery = query?.toLowerCase();

  for (const file of allFiles) {
    if (options.signal?.aborted === true) throw options.signal.reason;
    if (matches.length >= maxResults) break;
    const pathMatches = normalizedQuery === undefined || file.path.toLowerCase().includes(normalizedQuery) || file.name.toLowerCase().includes(normalizedQuery);
    let preview: string | undefined;
    let matched = pathMatches;

    if (!matched && normalizedQuery !== undefined && isTextLikeFile(file) && file.size <= 128 * 1024) {
      try {
        const entry = await readProjectFile(options.projectsRoot, options.projectId, file.path);
        const text = entry.buffer.toString('utf8');
        matched = text.toLowerCase().includes(normalizedQuery);
        if (matched) preview = compactTextPreview(text, query);
      } catch {
        // Ignore unreadable files during search; read_json reports hard failures.
      }
    }

    if (!matched) continue;
    const result: BoundedJsonObject = {
      path: file.path,
      name: file.name,
      size: file.size,
      mtime: file.mtime,
      kind: file.kind ?? 'file',
      mime: file.mime ?? 'application/octet-stream',
    };
    if (preview !== undefined) result.preview = preview;
    matches.push(result);
  }

  return asBoundedRefreshOutput({ toolName: 'project_files.search', query: query ?? '', count: matches.length, truncated: allFiles.length > matches.length && matches.length >= maxResults, matches });
}

async function executeProjectFilesReadJson(options: ExecuteLocalDaemonRefreshSourceOptions): Promise<BoundedJsonObject> {
  const filePath = selectJsonPath(options.source.input as ProjectFilesReadJsonInput);
  if (!filePath.endsWith('.json')) throw new Error('project_files.read_json only supports .json files');
  const dir = projectDir(options.projectsRoot, options.projectId);
  const target = path.resolve(dir, filePath);
  const [dirReal, targetLinkStat] = await Promise.all([realpath(dir), lstat(target)]);
  if (targetLinkStat.isSymbolicLink()) throw new Error('project_files.read_json does not follow symlinks');
  const targetReal = await realpath(target);
  if (!targetReal.startsWith(`${dirReal}${path.sep}`) && targetReal !== dirReal) {
    throw new Error('project_files.read_json path escapes project dir');
  }
  const entryStat = await stat(targetReal);
  if (!entryStat.isFile()) throw new Error('project_files.read_json path must be a file');
  if (entryStat.size > 256 * 1024) throw new Error('project_files.read_json file exceeds 256KB');
  if (options.signal?.aborted === true) throw options.signal.reason;
  let parsed: BoundedJsonValue;
  try {
    parsed = JSON.parse(await readFile(targetReal, 'utf8')) as BoundedJsonValue;
  } catch {
    throw new Error(`project_files.read_json could not parse JSON at ${filePath}`);
  }
  return asBoundedRefreshOutput({ toolName: 'project_files.read_json', path: filePath, size: entryStat.size, json: parsed });
}

function compactExecOutput(value: string): string[] {
  return value.split('\n').map((line) => line.trimEnd()).filter(Boolean).slice(0, 100);
}

async function runGit(projectPath: string, args: string[], signal: AbortSignal | undefined): Promise<string> {
  try {
    const result = await execFileAsync('git', args, { cwd: projectPath, signal, timeout: 10_000, maxBuffer: 128 * 1024 });
    return result.stdout.toString();
  } catch (error) {
    const maybeError = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string; code?: unknown };
    if (maybeError.code === 128) return '';
    throw new Error(maybeError.stderr?.toString().trim() || maybeError.message || 'git command failed');
  }
}

async function executeGitSummary(options: ExecuteLocalDaemonRefreshSourceOptions): Promise<BoundedJsonObject> {
  const input = options.source.input as GitSummaryInput;
  const maxCommits = optionalPositiveInteger(input.maxCommits, 'input.maxCommits', 10, 50);
  const dir = projectDir(options.projectsRoot, options.projectId);
  const insideWorkTree = (await runGit(dir, ['rev-parse', '--is-inside-work-tree'], options.signal)).trim() === 'true';
  if (!insideWorkTree) return asBoundedRefreshOutput({ toolName: 'git.summary', isRepository: false, branch: '', status: [], recentCommits: [], diffStat: [] });

  const [branch, status, recentCommits, diffStat] = await Promise.all([
    runGit(dir, ['branch', '--show-current'], options.signal),
    runGit(dir, ['status', '--short'], options.signal),
    runGit(dir, ['log', `--max-count=${maxCommits}`, '--pretty=format:%h %s'], options.signal),
    runGit(dir, ['diff', '--stat', '--', '.'], options.signal),
  ]);

  return asBoundedRefreshOutput({
    toolName: 'git.summary',
    isRepository: true,
    branch: branch.trim(),
    status: compactExecOutput(status),
    recentCommits: compactExecOutput(recentCommits),
    diffStat: compactExecOutput(diffStat),
  });
}

function selectGithubRepositoryApiUrl(input: PublicGithubRepositoryMetricInput): URL {
  const rawUrl = optionalString(input.url, 'input.url');
  if (rawUrl === undefined) throw new Error('public_github_repository_metric requires input.url');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('public_github_repository_metric input.url must be a valid URL');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'api.github.com') {
    throw new Error('public_github_repository_metric only supports https://api.github.com repository URLs');
  }
  if (!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.pathname)) {
    throw new Error('public_github_repository_metric only supports /repos/{owner}/{repo} URLs');
  }
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  return url;
}

function selectGithubFields(input: PublicGithubRepositoryMetricInput): string[] {
  if (input.fields === undefined) return ['stargazers_count', 'full_name', 'html_url', 'updated_at'];
  if (!Array.isArray(input.fields)) throw new Error('input.fields must be an array of strings');
  const fields = input.fields.filter((field): field is string => typeof field === 'string');
  if (fields.length !== input.fields.length) throw new Error('input.fields must be an array of strings');
  return fields.slice(0, 20);
}

async function executePublicGithubRepositoryMetric(options: ExecuteLocalDaemonRefreshSourceOptions): Promise<BoundedJsonObject> {
  const input = options.source.input as PublicGithubRepositoryMetricInput;
  const url = selectGithubRepositoryApiUrl(input);
  const fetchInit: RequestInit = {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'open-design-live-artifact-refresh',
    },
  };
  if (options.signal !== undefined) fetchInit.signal = options.signal;
  const response = await fetch(url, fetchInit);
  if (!response.ok) {
    throw new Error(`public_github_repository_metric request failed with ${response.status}`);
  }
  const parsed = await response.json() as Record<string, unknown>;
  const output: BoundedJsonObject = { toolName: 'public_github_repository_metric' };
  for (const field of selectGithubFields(input)) {
    const value = parsed[field];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      output[field] = value;
    }
  }
  return asBoundedRefreshOutput(output);
}

export async function executeLocalDaemonRefreshSource(options: ExecuteLocalDaemonRefreshSourceOptions): Promise<BoundedJsonObject> {
  if (options.source.type === 'local_file') {
    const toolName = options.source.toolName ?? 'project_files.read_json';
    if (toolName !== 'project_files.read_json') {
      throw new Error(`unsupported local_file refresh tool: ${toolName}`);
    }
    return executeProjectFilesReadJson({
      ...options,
      source: {
        ...options.source,
        type: 'daemon_tool',
        toolName,
      },
    });
  }

  if (options.source.type !== 'daemon_tool') {
    throw new Error('local daemon refresh sources require source.type daemon_tool or local_file');
  }
  if (!isLocalDaemonRefreshToolName(options.source.toolName)) {
    throw new Error(`unsupported local daemon refresh tool: ${options.source.toolName ?? '<missing>'}`);
  }

  switch (options.source.toolName) {
    case 'project_files.search':
      return executeProjectFilesSearch(options);
    case 'project_files.read_json':
      return executeProjectFilesReadJson(options);
    case 'git.summary':
      return executeGitSummary(options);
    case 'public_github_repository_metric':
      return executePublicGithubRepositoryMetric(options);
  }
}
