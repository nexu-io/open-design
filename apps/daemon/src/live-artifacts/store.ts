import { randomBytes } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ensureProject, projectDir } from '../projects.js';
import { DEFAULT_LIVE_ARTIFACT_TOTAL_TIMEOUT_MS } from './refresh.js';
import { renderHtmlTemplateV1 } from './render.js';
import type { BoundedJsonObject, LiveArtifact, LiveArtifactCreateInput, LiveArtifactProvenance, LiveArtifactRefreshErrorRecord, LiveArtifactRefreshLogEntry, LiveArtifactRefreshSourceMetadata, LiveArtifactRefreshStepStatus, LiveArtifactUpdateInput, LiveArtifactValidationIssue } from './schema.js';
import { validateBoundedJsonObject, validateLiveArtifactCreateInput, validateLiveArtifactRefreshLogEntry, validateLiveArtifactUpdateInput, validatePersistedLiveArtifact } from './schema.js';

export type LiveArtifactSummary = Omit<LiveArtifact, 'document'> & {
  hasDocument: boolean;
};

export const LIVE_ARTIFACTS_DIR_NAME = '.live-artifacts' as const;
export const LIVE_ARTIFACT_ARTIFACT_FILE = 'artifact.json' as const;
export const LIVE_ARTIFACT_TEMPLATE_FILE = 'template.html' as const;
export const LIVE_ARTIFACT_PREVIEW_FILE = 'index.html' as const;
export const LIVE_ARTIFACT_DATA_FILE = 'data.json' as const;
export const LIVE_ARTIFACT_PROVENANCE_FILE = 'provenance.json' as const;
export const LIVE_ARTIFACT_REFRESHES_FILE = 'refreshes.jsonl' as const;
export const LIVE_ARTIFACT_REFRESH_LOCK_FILE = 'refresh.lock.json' as const;
export const LIVE_ARTIFACT_REFRESH_STATE_FILE = 'refresh-state.json' as const;
export const LIVE_ARTIFACT_SNAPSHOTS_DIR = 'snapshots' as const;

const SAFE_LIVE_ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LIVE_ARTIFACT_ID_PREFIX = 'la';
const LIVE_ARTIFACT_ID_RANDOM_BYTES = 6;
const LIVE_ARTIFACT_ID_RANDOM_SUFFIX_LENGTH = LIVE_ARTIFACT_ID_RANDOM_BYTES * 2;
const MAX_LIVE_ARTIFACT_STORAGE_ID_LENGTH = 128;
const MAX_LIVE_ARTIFACT_SLUG_LENGTH = 128;
const FALLBACK_LIVE_ARTIFACT_SLUG = 'live-artifact';

function isPathInside(parentDir: string, targetPath: string): boolean {
  const relative = path.relative(parentDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveInside(parentDir: string, relativePath: string, escapeMessage: string): string {
  if (path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new Error(escapeMessage);
  }
  const targetPath = path.resolve(parentDir, relativePath);
  if (!isPathInside(parentDir, targetPath)) {
    throw new Error(escapeMessage);
  }
  return targetPath;
}

export interface LiveArtifactStorePaths {
  projectDir: string;
  rootDir: string;
  artifactDir: string;
  artifactJsonPath: string;
  templateHtmlPath: string;
  generatedPreviewHtmlPath: string;
  dataJsonPath: string;
  provenanceJsonPath: string;
  refreshesJsonlPath: string;
  refreshLockPath: string;
  refreshStatePath: string;
  snapshotsDir: string;
}

export interface LiveArtifactStoreSummary {
  artifact: LiveArtifactSummary;
  paths: LiveArtifactStorePaths;
}

export interface LiveArtifactStoreRecord {
  artifact: LiveArtifact;
  paths: LiveArtifactStorePaths;
}

export interface GenerateLiveArtifactIdOptions {
  title: string;
  slug?: string;
  randomSuffix?: string;
}

export interface CreateLiveArtifactOptions {
  projectsRoot: string;
  projectId: string;
  input: unknown;
  templateHtml?: string;
  provenanceJson?: LiveArtifactProvenance;
  createdByRunId?: string;
  now?: Date;
}

export interface ListLiveArtifactsOptions {
  projectsRoot: string;
  projectId: string;
}

export interface GetLiveArtifactOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
}

export interface UpdateLiveArtifactOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
  input: unknown;
  templateHtml?: string;
  provenanceJson?: LiveArtifactProvenance;
  now?: Date;
}

export interface DeleteLiveArtifactOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
}

export interface RegenerateLiveArtifactPreviewOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
}

export interface AcquireLiveArtifactRefreshLockOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
  now?: Date;
}

export interface AppendLiveArtifactRefreshLogEntryOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
  refreshId: string;
  sequence: number;
  step: string;
  status: LiveArtifactRefreshStepStatus;
  startedAt: Date | string;
  finishedAt?: Date | string;
  durationMs?: number;
  source?: LiveArtifactRefreshSourceMetadata;
  error?: LiveArtifactRefreshErrorRecord | unknown;
  metadata?: BoundedJsonObject;
  now?: Date;
}

export interface ListLiveArtifactRefreshLogEntriesOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
}

export interface MarkLiveArtifactRefreshCommittedOptions {
  projectsRoot: string;
  projectId: string;
  artifactId: string;
  refreshId: string;
}

export interface MarkLiveArtifactRefreshRunningOptions extends MarkLiveArtifactRefreshCommittedOptions {
  now?: Date;
}

export interface CommitLiveArtifactRefreshCandidateOptions extends MarkLiveArtifactRefreshCommittedOptions {
  dataJson: BoundedJsonObject;
  provenanceJson?: LiveArtifactProvenance;
  now?: Date;
}

export interface MarkLiveArtifactRefreshFailedOptions extends MarkLiveArtifactRefreshCommittedOptions {
  now?: Date;
}

export interface RecoverStaleLiveArtifactRefreshesOptions {
  projectsRoot: string;
  now?: Date;
  staleAfterMs?: number;
}

export interface LiveArtifactRefreshRecoveryResult {
  projectId: string;
  artifactId: string;
  refreshId: string;
  status: 'recovered' | 'skipped';
  reason?: string;
}

export interface LiveArtifactPreviewRenderRecord extends LiveArtifactStoreRecord {
  html: string;
}

export interface LiveArtifactRefreshLockMetadata {
  schemaVersion: 1;
  projectId: string;
  artifactId: string;
  refreshId: string;
  refreshOrdinal: number;
  acquiredAt: string;
  lockId: string;
}

export interface LiveArtifactRefreshState {
  schemaVersion: 1;
  projectId: string;
  artifactId: string;
  nextRefreshOrdinal: number;
  lastCommittedRefreshId?: string;
  lastCommittedRefreshOrdinal?: number;
}

export interface LiveArtifactRefreshLock {
  artifactId: string;
  lockPath: string;
  metadata: LiveArtifactRefreshLockMetadata;
}

export class LiveArtifactStoreValidationError extends Error {
  readonly issues: LiveArtifactValidationIssue[];

  constructor(message: string, issues: LiveArtifactValidationIssue[]) {
    super(message);
    this.name = 'LiveArtifactStoreValidationError';
    this.issues = issues;
  }
}

export class LiveArtifactRefreshLockError extends Error {
  readonly projectId: string;
  readonly artifactId: string;
  readonly lockPath: string;

  constructor(message: string, options: { projectId: string; artifactId: string; lockPath: string }) {
    super(message);
    this.name = 'LiveArtifactRefreshLockError';
    this.projectId = options.projectId;
    this.artifactId = options.artifactId;
    this.lockPath = options.lockPath;
  }
}

export class LiveArtifactStaleRefreshError extends Error {
  readonly projectId: string;
  readonly artifactId: string;
  readonly refreshId: string;
  readonly lastCommittedRefreshId?: string;

  constructor(message: string, options: { projectId: string; artifactId: string; refreshId: string; lastCommittedRefreshId?: string }) {
    super(message);
    this.name = 'LiveArtifactStaleRefreshError';
    this.projectId = options.projectId;
    this.artifactId = options.artifactId;
    this.refreshId = options.refreshId;
    if (options.lastCommittedRefreshId !== undefined) this.lastCommittedRefreshId = options.lastCommittedRefreshId;
  }
}

function truncateSlugAtSegmentBoundary(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const truncated = slug.slice(0, maxLength).replace(/-+$/g, '');
  return truncated.length > 0 ? truncated : slug.slice(0, maxLength);
}

export function generateLiveArtifactSlug(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return truncateSlugAtSegmentBoundary(slug || FALLBACK_LIVE_ARTIFACT_SLUG, MAX_LIVE_ARTIFACT_SLUG_LENGTH);
}

export function generateLiveArtifactId(options: GenerateLiveArtifactIdOptions): string {
  const randomSuffix = options.randomSuffix ?? randomBytes(LIVE_ARTIFACT_ID_RANDOM_BYTES).toString('hex');
  if (!/^[a-f0-9]+$/i.test(randomSuffix) || randomSuffix.length === 0) {
    throw new Error('invalid live artifact id random suffix');
  }

  const suffix = randomSuffix.toLowerCase();
  const maxSlugLength = MAX_LIVE_ARTIFACT_STORAGE_ID_LENGTH - LIVE_ARTIFACT_ID_PREFIX.length - suffix.length - 2;
  if (maxSlugLength < 1) {
    throw new Error('invalid live artifact id random suffix');
  }
  const slug = truncateSlugAtSegmentBoundary(generateLiveArtifactSlug(options.slug ?? options.title), maxSlugLength);
  return validateLiveArtifactStorageId(`${LIVE_ARTIFACT_ID_PREFIX}-${slug}-${suffix}`);
}

export function validateLiveArtifactStorageId(artifactId: string): string {
  if (!SAFE_LIVE_ARTIFACT_ID.test(artifactId) || artifactId === '.' || artifactId === '..') {
    throw new Error('invalid live artifact id');
  }
  return artifactId;
}

export function liveArtifactsRootDir(projectsRoot: string, projectId: string): string {
  const projectDirPath = path.resolve(projectDir(projectsRoot, projectId));
  return resolveInside(projectDirPath, LIVE_ARTIFACTS_DIR_NAME, 'live artifact path escapes project dir');
}

export function liveArtifactStorePaths(
  projectsRoot: string,
  projectId: string,
  artifactId: string,
): LiveArtifactStorePaths {
  const safeArtifactId = validateLiveArtifactStorageId(artifactId);
  const projectDirPath = path.resolve(projectDir(projectsRoot, projectId));
  const rootDir = liveArtifactsRootDir(projectsRoot, projectId);
  const artifactDir = resolveInside(rootDir, safeArtifactId, 'live artifact path escapes storage root');
  if (!isPathInside(projectDirPath, artifactDir)) throw new Error('live artifact path escapes project dir');

  return {
    projectDir: projectDirPath,
    rootDir,
    artifactDir,
    artifactJsonPath: resolveInside(artifactDir, LIVE_ARTIFACT_ARTIFACT_FILE, 'live artifact path escapes artifact dir'),
    templateHtmlPath: resolveInside(artifactDir, LIVE_ARTIFACT_TEMPLATE_FILE, 'live artifact path escapes artifact dir'),
    generatedPreviewHtmlPath: resolveInside(artifactDir, LIVE_ARTIFACT_PREVIEW_FILE, 'live artifact path escapes artifact dir'),
    dataJsonPath: resolveInside(artifactDir, LIVE_ARTIFACT_DATA_FILE, 'live artifact path escapes artifact dir'),
    provenanceJsonPath: resolveInside(artifactDir, LIVE_ARTIFACT_PROVENANCE_FILE, 'live artifact path escapes artifact dir'),
    refreshesJsonlPath: resolveInside(artifactDir, LIVE_ARTIFACT_REFRESHES_FILE, 'live artifact path escapes artifact dir'),
    refreshLockPath: resolveInside(artifactDir, LIVE_ARTIFACT_REFRESH_LOCK_FILE, 'live artifact path escapes artifact dir'),
    refreshStatePath: resolveInside(artifactDir, LIVE_ARTIFACT_REFRESH_STATE_FILE, 'live artifact path escapes artifact dir'),
    snapshotsDir: resolveInside(artifactDir, LIVE_ARTIFACT_SNAPSHOTS_DIR, 'live artifact path escapes artifact dir'),
  };
}

export async function ensureLiveArtifactStoreLayout(
  projectsRoot: string,
  projectId: string,
  artifactId: string,
): Promise<LiveArtifactStorePaths> {
  await ensureProject(projectsRoot, projectId);
  const paths = liveArtifactStorePaths(projectsRoot, projectId, artifactId);
  await mkdir(paths.snapshotsDir, { recursive: true });
  await writeFile(paths.refreshesJsonlPath, '', { flag: 'a' });
  return paths;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tempPath, contents, 'utf8');
  await rename(tempPath, filePath);
}

function defaultTemplateHtml(title: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <title>{{data.title}}</title>',
    '  </head>',
    '  <body>',
    '    <main>',
    `      <h1>{{data.title}}</h1>`,
    `      <p>${title}</p>`,
    '    </main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function defaultProvenance(nowIso: string): LiveArtifactProvenance {
  return {
    generatedAt: nowIso,
    generatedBy: 'agent',
    notes: 'Created through the live artifact registration service.',
    sources: [{ label: 'Agent-authored live artifact input', type: 'user_input' }],
  };
}

function toSummary(artifact: LiveArtifact): LiveArtifactSummary {
  const { document: _document, ...summary } = artifact;
  return {
    ...summary,
    hasDocument: _document !== undefined,
  };
}

function validationError(path: string, message: string): LiveArtifactStoreValidationError {
  return new LiveArtifactStoreValidationError(message, [{ path, message }]);
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function compactLiveArtifactRefreshError(error: unknown): LiveArtifactRefreshErrorRecord {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown; path?: unknown };
    const compact: LiveArtifactRefreshErrorRecord = {
      message: truncateText(typeof record.message === 'string' ? record.message : String(error), 2_048),
    };
    if (typeof record.code === 'string' && record.code.length > 0) compact.code = truncateText(record.code, 128);
    if (typeof record.path === 'string' && record.path.length > 0) compact.path = truncateText(record.path, 260);
    return compact;
  }

  return { message: truncateText(String(error), 2_048) };
}

function normalizeRefreshLogEntry(options: AppendLiveArtifactRefreshLogEntryOptions): LiveArtifactRefreshLogEntry {
  const startedAt = toIsoDate(options.startedAt);
  const finishedAt = options.finishedAt === undefined ? undefined : toIsoDate(options.finishedAt);
  const durationMs = options.durationMs ?? (
    finishedAt === undefined ? undefined : Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
  );
  const entry: LiveArtifactRefreshLogEntry = {
    schemaVersion: 1,
    projectId: options.projectId,
    artifactId: options.artifactId,
    refreshId: options.refreshId,
    sequence: options.sequence,
    step: options.step,
    status: options.status,
    startedAt,
    createdAt: (options.now ?? new Date()).toISOString(),
  };
  if (finishedAt !== undefined) entry.finishedAt = finishedAt;
  if (durationMs !== undefined) entry.durationMs = durationMs;
  if (options.source !== undefined) entry.source = options.source;
  if (options.error !== undefined) entry.error = compactLiveArtifactRefreshError(options.error);
  if (options.metadata !== undefined) entry.metadata = options.metadata;
  return entry;
}

function formatRefreshId(refreshOrdinal: number): string {
  if (!Number.isSafeInteger(refreshOrdinal) || refreshOrdinal < 1) {
    throw new Error('invalid live artifact refresh ordinal');
  }
  return `refresh-${refreshOrdinal.toString().padStart(6, '0')}`;
}

function parseRefreshOrdinal(refreshId: string): number {
  const match = /^refresh-(\d+)$/.exec(refreshId);
  if (match === null) throw new Error('invalid live artifact refresh id');
  const refreshOrdinal = Number(match[1]);
  if (!Number.isSafeInteger(refreshOrdinal) || refreshOrdinal < 1) {
    throw new Error('invalid live artifact refresh id');
  }
  return refreshOrdinal;
}

function defaultRefreshState(projectId: string, artifactId: string): LiveArtifactRefreshState {
  return { schemaVersion: 1, projectId, artifactId, nextRefreshOrdinal: 1 };
}

function normalizeRefreshState(value: unknown, projectId: string, artifactId: string): LiveArtifactRefreshState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('refresh-state.json', 'live artifact refresh state must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) throw validationError('refresh-state.json.schemaVersion', 'live artifact refresh state schemaVersion must be 1');
  if (raw.projectId !== projectId) throw validationError('refresh-state.json.projectId', 'live artifact refresh state projectId does not match requested project');
  if (raw.artifactId !== artifactId) throw validationError('refresh-state.json.artifactId', 'live artifact refresh state artifactId does not match storage directory');
  if (!Number.isSafeInteger(raw.nextRefreshOrdinal) || (raw.nextRefreshOrdinal as number) < 1) {
    throw validationError('refresh-state.json.nextRefreshOrdinal', 'live artifact refresh state nextRefreshOrdinal must be a positive safe integer');
  }

  const state: LiveArtifactRefreshState = {
    schemaVersion: 1,
    projectId,
    artifactId,
    nextRefreshOrdinal: raw.nextRefreshOrdinal as number,
  };
  if (raw.lastCommittedRefreshId !== undefined) {
    if (typeof raw.lastCommittedRefreshId !== 'string') throw validationError('refresh-state.json.lastCommittedRefreshId', 'live artifact refresh state lastCommittedRefreshId must be a string');
    state.lastCommittedRefreshId = raw.lastCommittedRefreshId;
  }
  if (raw.lastCommittedRefreshOrdinal !== undefined) {
    if (!Number.isSafeInteger(raw.lastCommittedRefreshOrdinal) || (raw.lastCommittedRefreshOrdinal as number) < 1) {
      throw validationError('refresh-state.json.lastCommittedRefreshOrdinal', 'live artifact refresh state lastCommittedRefreshOrdinal must be a positive safe integer');
    }
    state.lastCommittedRefreshOrdinal = raw.lastCommittedRefreshOrdinal as number;
  }
  return state;
}

async function readLiveArtifactRefreshState(paths: LiveArtifactStorePaths, projectId: string, artifactId: string): Promise<LiveArtifactRefreshState> {
  const text = await readTextFileOrDefault(paths.refreshStatePath, '');
  if (text.trim().length === 0) return defaultRefreshState(projectId, artifactId);
  try {
    return normalizeRefreshState(JSON.parse(text), projectId, artifactId);
  } catch (error) {
    if (error instanceof SyntaxError) throw validationError('refresh-state.json', 'live artifact refresh state contains invalid JSON');
    throw error;
  }
}

async function writeLiveArtifactRefreshState(paths: LiveArtifactStorePaths, state: LiveArtifactRefreshState): Promise<void> {
  await writeFile(paths.refreshStatePath, stableJson(state), 'utf8');
}

function normalizeRefreshLockMetadata(value: unknown, lockPath: string): LiveArtifactRefreshLockMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(lockPath, 'live artifact refresh lock must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) throw validationError(`${lockPath}.schemaVersion`, 'live artifact refresh lock schemaVersion must be 1');
  if (typeof raw.projectId !== 'string' || raw.projectId.length === 0) throw validationError(`${lockPath}.projectId`, 'live artifact refresh lock projectId must be a string');
  if (typeof raw.artifactId !== 'string' || raw.artifactId.length === 0) throw validationError(`${lockPath}.artifactId`, 'live artifact refresh lock artifactId must be a string');
  if (typeof raw.refreshId !== 'string' || raw.refreshId.length === 0) throw validationError(`${lockPath}.refreshId`, 'live artifact refresh lock refreshId must be a string');
  if (!Number.isSafeInteger(raw.refreshOrdinal) || (raw.refreshOrdinal as number) < 1) throw validationError(`${lockPath}.refreshOrdinal`, 'live artifact refresh lock refreshOrdinal must be a positive safe integer');
  if (typeof raw.acquiredAt !== 'string' || Number.isNaN(Date.parse(raw.acquiredAt))) throw validationError(`${lockPath}.acquiredAt`, 'live artifact refresh lock acquiredAt must be an ISO date string');
  if (typeof raw.lockId !== 'string' || raw.lockId.length === 0) throw validationError(`${lockPath}.lockId`, 'live artifact refresh lock id must be a string');
  return {
    schemaVersion: 1,
    projectId: raw.projectId,
    artifactId: raw.artifactId,
    refreshId: raw.refreshId,
    refreshOrdinal: raw.refreshOrdinal as number,
    acquiredAt: raw.acquiredAt,
    lockId: raw.lockId,
  };
}

async function readLiveArtifactRefreshLockMetadata(paths: LiveArtifactStorePaths): Promise<LiveArtifactRefreshLockMetadata> {
  try {
    return normalizeRefreshLockMetadata(JSON.parse(await readFile(paths.refreshLockPath, 'utf8')), LIVE_ARTIFACT_REFRESH_LOCK_FILE);
  } catch (error) {
    if (error instanceof SyntaxError) throw validationError(LIVE_ARTIFACT_REFRESH_LOCK_FILE, 'live artifact refresh lock contains invalid JSON');
    throw error;
  }
}

async function readPersistedLiveArtifact(paths: LiveArtifactStorePaths): Promise<LiveArtifact> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(paths.artifactJsonPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw validationError('artifact.json', 'live artifact file contains invalid JSON');
    }
    throw error;
  }

  const persisted = validatePersistedLiveArtifact(parsed);
  if (!persisted.ok) throw new LiveArtifactStoreValidationError(persisted.error, persisted.issues);
  return persisted.value;
}

async function writePersistedLiveArtifact(paths: LiveArtifactStorePaths, artifact: LiveArtifact): Promise<LiveArtifact> {
  const persisted = validatePersistedLiveArtifact(artifact);
  if (!persisted.ok) throw new LiveArtifactStoreValidationError(persisted.error, persisted.issues);
  await writeFile(paths.artifactJsonPath, stableJson(persisted.value), 'utf8');
  return persisted.value;
}

async function readPersistedDataJson(paths: LiveArtifactStorePaths): Promise<BoundedJsonObject> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(paths.dataJsonPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw validationError('data.json', 'live artifact data file contains invalid JSON');
    }
    throw error;
  }

  const result = validateBoundedJsonObject(parsed, 'data.json');
  if (!result.ok) throw new LiveArtifactStoreValidationError(result.error, result.issues);
  return result.value;
}

function assertArtifactMatchesStorage(artifact: LiveArtifact, projectId: string, artifactId: string): void {
  if (artifact.id !== artifactId) {
    throw validationError('id', 'live artifact id does not match storage directory');
  }
  if (artifact.projectId !== projectId) {
    throw validationError('projectId', 'live artifact projectId does not match requested project');
  }
}

async function assertLiveArtifactRefreshLockScope(
  projectsRoot: string,
  projectId: string,
  artifactId: string,
): Promise<LiveArtifactStorePaths> {
  const safeArtifactId = validateLiveArtifactStorageId(artifactId);
  const paths = liveArtifactStorePaths(projectsRoot, projectId, safeArtifactId);
  const artifact = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(artifact, projectId, safeArtifactId);
  return paths;
}

function artifactWithDataJson(artifact: LiveArtifact, dataJson: BoundedJsonObject): LiveArtifact {
  if (artifact.document?.format !== 'html_template_v1') return artifact;
  return { ...artifact, document: { ...artifact.document, dataJson } };
}

async function readLiveArtifactWithDataJsonCache(paths: LiveArtifactStorePaths): Promise<LiveArtifact> {
  const artifact = await readPersistedLiveArtifact(paths);
  if (artifact.document?.format !== 'html_template_v1') return artifact;

  const dataJson = await readPersistedDataJson(paths);
  return artifactWithDataJson(artifact, dataJson);
}

function renderPreviewHtml(templateHtml: string, dataJson: BoundedJsonObject): string {
  try {
    return renderHtmlTemplateV1({ templateHtml, dataJson }).html;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LiveArtifactStoreValidationError(message, [{ path: 'template.html', message }]);
  }
}

async function writeLiveArtifactFiles(
  paths: LiveArtifactStorePaths,
  artifact: LiveArtifact,
  templateHtml: string,
  provenanceJson: LiveArtifactProvenance,
  dataJsonOverride?: BoundedJsonObject,
): Promise<LiveArtifact> {
  const dataJson = dataJsonOverride ?? artifact.document?.dataJson ?? {};
  const artifactForWrite = artifactWithDataJson(artifact, dataJson);
  const previewHtml = artifactForWrite.document?.format === 'html_template_v1'
    ? renderPreviewHtml(templateHtml, dataJson)
    : templateHtml;

  await mkdir(paths.snapshotsDir, { recursive: true });
  await Promise.all([
    writeFile(paths.artifactJsonPath, stableJson(artifactForWrite), 'utf8'),
    writeFile(paths.templateHtmlPath, templateHtml, 'utf8'),
    writeFile(paths.generatedPreviewHtmlPath, previewHtml, 'utf8'),
    writeFile(paths.dataJsonPath, stableJson(dataJson), 'utf8'),
    writeFile(paths.provenanceJsonPath, stableJson(provenanceJson), 'utf8'),
    writeFile(paths.refreshesJsonlPath, '', { flag: 'a' }),
  ]);
  return artifactForWrite;
}

async function renderLiveArtifactPreviewFromFiles(paths: LiveArtifactStorePaths, artifact: LiveArtifact): Promise<string> {
  const templateHtml = await readFile(paths.templateHtmlPath, 'utf8');
  if (artifact.document?.format !== 'html_template_v1') return templateHtml;

  const dataJson = await readPersistedDataJson(paths);
  return renderPreviewHtml(templateHtml, dataJson);
}

async function readTextFileOrDefault(filePath: string, fallback: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readProvenanceOrDefault(paths: LiveArtifactStorePaths, nowIso: string): Promise<LiveArtifactProvenance> {
  try {
    const parsed = JSON.parse(await readFile(paths.provenanceJsonPath, 'utf8')) as LiveArtifactProvenance;
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw validationError('provenance.json', 'live artifact provenance file contains invalid JSON');
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return defaultProvenance(nowIso);
    throw error;
  }
}

export async function createLiveArtifact(options: CreateLiveArtifactOptions): Promise<LiveArtifactStoreRecord> {
  const result = validateLiveArtifactCreateInput(options.input);
  if (!result.ok) throw new LiveArtifactStoreValidationError(result.error, result.issues);

  const input: LiveArtifactCreateInput = result.value;
  const nowIso = (options.now ?? new Date()).toISOString();
  const artifactId = generateLiveArtifactId(input.slug === undefined ? { title: input.title } : { title: input.title, slug: input.slug });
  const slug = generateLiveArtifactSlug(input.slug ?? input.title);
  const artifactBase: LiveArtifact = {
    schemaVersion: 1,
    id: artifactId,
    projectId: options.projectId,
    title: input.title,
    slug,
    status: input.status ?? 'active',
    pinned: input.pinned ?? false,
    preview: input.preview,
    refreshStatus: 'idle',
    createdAt: nowIso,
    updatedAt: nowIso,
    document: input.document,
  };
  if (input.sessionId !== undefined) artifactBase.sessionId = input.sessionId;
  if (options.createdByRunId !== undefined) artifactBase.createdByRunId = options.createdByRunId;
  const persisted = validatePersistedLiveArtifact(artifactBase);
  if (!persisted.ok) throw new LiveArtifactStoreValidationError(persisted.error, persisted.issues);

  await ensureProject(options.projectsRoot, options.projectId);
  const finalPaths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  await mkdir(finalPaths.rootDir, { recursive: true });

  const tempArtifactId = validateLiveArtifactStorageId(`tmp-${randomBytes(12).toString('hex')}`);
  const tempPaths = liveArtifactStorePaths(options.projectsRoot, options.projectId, tempArtifactId);
  const templateHtml = options.templateHtml ?? defaultTemplateHtml(input.title);
  const provenanceJson = options.provenanceJson ?? defaultProvenance(nowIso);

  await rm(tempPaths.artifactDir, { recursive: true, force: true });
  await mkdir(tempPaths.artifactDir, { recursive: false });

  try {
    const writtenArtifact = await writeLiveArtifactFiles(tempPaths, persisted.value, templateHtml, provenanceJson);
    await rename(tempPaths.artifactDir, finalPaths.artifactDir);
    return { artifact: writtenArtifact, paths: finalPaths };
  } catch (error) {
    await rm(tempPaths.artifactDir, { recursive: true, force: true });
    throw error;
  }
}

export async function listLiveArtifacts(options: ListLiveArtifactsOptions): Promise<LiveArtifactSummary[]> {
  const rootDir = liveArtifactsRootDir(options.projectsRoot, options.projectId);
  let entries: Dirent[];
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }

  const summaries: LiveArtifactSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('tmp-')) continue;

    const artifactId = validateLiveArtifactStorageId(entry.name);
    const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
    const artifact = await readPersistedLiveArtifact(paths);
    assertArtifactMatchesStorage(artifact, options.projectId, artifactId);

    summaries.push(toSummary(artifact));
  }

  summaries.sort((a, b) => {
    const updatedDelta = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    return a.id.localeCompare(b.id);
  });
  return summaries;
}

export async function getLiveArtifact(options: GetLiveArtifactOptions): Promise<LiveArtifactStoreRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const artifact = await readLiveArtifactWithDataJsonCache(paths);
  assertArtifactMatchesStorage(artifact, options.projectId, artifactId);
  return { artifact, paths };
}

export async function appendLiveArtifactRefreshLogEntry(
  options: AppendLiveArtifactRefreshLogEntryOptions,
): Promise<LiveArtifactRefreshLogEntry> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const current = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);

  const normalized = normalizeRefreshLogEntry({ ...options, artifactId });
  const result = validateLiveArtifactRefreshLogEntry(normalized);
  if (!result.ok) throw new LiveArtifactStoreValidationError(result.error, result.issues);

  await appendFile(paths.refreshesJsonlPath, `${JSON.stringify(result.value)}\n`, 'utf8');
  return result.value;
}

export async function acquireLiveArtifactRefreshLock(
  options: AcquireLiveArtifactRefreshLockOptions,
): Promise<LiveArtifactRefreshLock> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = await assertLiveArtifactRefreshLockScope(options.projectsRoot, options.projectId, artifactId);
  const state = await readLiveArtifactRefreshState(paths, options.projectId, artifactId);
  const refreshOrdinal = state.nextRefreshOrdinal;
  const refreshId = formatRefreshId(refreshOrdinal);
  const metadata: LiveArtifactRefreshLockMetadata = {
    schemaVersion: 1,
    projectId: options.projectId,
    artifactId,
    refreshId,
    refreshOrdinal,
    acquiredAt: (options.now ?? new Date()).toISOString(),
    lockId: randomBytes(12).toString('hex'),
  };

  try {
    await writeFile(paths.refreshLockPath, stableJson(metadata), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      throw new LiveArtifactRefreshLockError('live artifact refresh already active', {
        projectId: options.projectId,
        artifactId,
        lockPath: paths.refreshLockPath,
      });
    }
    throw error;
  }

  try {
    await writeLiveArtifactRefreshState(paths, {
      ...state,
      nextRefreshOrdinal: refreshOrdinal + 1,
    });
  } catch (error) {
    await rm(paths.refreshLockPath, { force: true });
    throw error;
  }

  return { artifactId, lockPath: paths.refreshLockPath, metadata };
}

export async function markLiveArtifactRefreshCommitted(
  options: MarkLiveArtifactRefreshCommittedOptions,
): Promise<LiveArtifactRefreshState> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = await assertLiveArtifactRefreshLockScope(options.projectsRoot, options.projectId, artifactId);
  const refreshOrdinal = parseRefreshOrdinal(options.refreshId);
  const state = await readLiveArtifactRefreshState(paths, options.projectId, artifactId);
  if (refreshOrdinal >= state.nextRefreshOrdinal) {
    throw validationError('refreshId', 'live artifact refresh id has not been allocated');
  }
  if ((state.lastCommittedRefreshOrdinal ?? 0) >= refreshOrdinal) {
    const staleOptions: { projectId: string; artifactId: string; refreshId: string; lastCommittedRefreshId?: string } = {
      projectId: options.projectId,
      artifactId,
      refreshId: options.refreshId,
    };
    if (state.lastCommittedRefreshId !== undefined) staleOptions.lastCommittedRefreshId = state.lastCommittedRefreshId;
    throw new LiveArtifactStaleRefreshError('live artifact refresh is older than the latest committed refresh', staleOptions);
  }

  const nextState: LiveArtifactRefreshState = {
    ...state,
    nextRefreshOrdinal: Math.max(state.nextRefreshOrdinal, refreshOrdinal + 1),
    lastCommittedRefreshId: options.refreshId,
    lastCommittedRefreshOrdinal: refreshOrdinal,
  };
  await writeLiveArtifactRefreshState(paths, nextState);
  return nextState;
}

export async function markLiveArtifactRefreshRunning(
  options: MarkLiveArtifactRefreshRunningOptions,
): Promise<LiveArtifactStoreRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = await assertLiveArtifactRefreshLockScope(options.projectsRoot, options.projectId, artifactId);
  const current = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);
  const nowIso = (options.now ?? new Date()).toISOString();
  const artifact = await writePersistedLiveArtifact(paths, {
    ...current,
    refreshStatus: 'running',
    updatedAt: nowIso,
  });
  return { artifact, paths };
}

function assertLiveArtifactRefreshCanCommit(
  state: LiveArtifactRefreshState,
  options: MarkLiveArtifactRefreshCommittedOptions,
): number {
  const refreshOrdinal = parseRefreshOrdinal(options.refreshId);
  if (refreshOrdinal >= state.nextRefreshOrdinal) {
    throw validationError('refreshId', 'live artifact refresh id has not been allocated');
  }
  if ((state.lastCommittedRefreshOrdinal ?? 0) >= refreshOrdinal) {
    const staleOptions: { projectId: string; artifactId: string; refreshId: string; lastCommittedRefreshId?: string } = {
      projectId: options.projectId,
      artifactId: options.artifactId,
      refreshId: options.refreshId,
    };
    if (state.lastCommittedRefreshId !== undefined) staleOptions.lastCommittedRefreshId = state.lastCommittedRefreshId;
    throw new LiveArtifactStaleRefreshError('live artifact refresh is older than the latest committed refresh', staleOptions);
  }
  return refreshOrdinal;
}

async function writeLiveArtifactSuccessfulSnapshot(
  paths: LiveArtifactStorePaths,
  options: {
    refreshId: string;
    artifact: LiveArtifact;
    dataJson: BoundedJsonObject;
    templateHtml: string;
    previewHtml: string;
    provenanceJson: LiveArtifactProvenance;
  },
): Promise<void> {
  parseRefreshOrdinal(options.refreshId);
  await mkdir(paths.snapshotsDir, { recursive: true });

  // MVP decision: failed refresh payloads are not retained on disk. Failed attempts
  // are summarized in refreshes.jsonl only; snapshots/<refreshId>/ is reserved for
  // validated successful commits that are safe to use for history/rollback views.
  const finalSnapshotDir = resolveInside(paths.snapshotsDir, options.refreshId, 'live artifact snapshot path escapes snapshots dir');
  const tempSnapshotDir = resolveInside(paths.snapshotsDir, `.tmp-${options.refreshId}-${randomBytes(6).toString('hex')}`, 'live artifact snapshot path escapes snapshots dir');

  await rm(tempSnapshotDir, { recursive: true, force: true });
  await mkdir(tempSnapshotDir, { recursive: true });
  try {
    await Promise.all([
      writeFile(resolveInside(tempSnapshotDir, LIVE_ARTIFACT_ARTIFACT_FILE, 'live artifact snapshot path escapes snapshot dir'), stableJson(options.artifact), 'utf8'),
      writeFile(resolveInside(tempSnapshotDir, LIVE_ARTIFACT_DATA_FILE, 'live artifact snapshot path escapes snapshot dir'), stableJson(options.dataJson), 'utf8'),
      writeFile(resolveInside(tempSnapshotDir, LIVE_ARTIFACT_TEMPLATE_FILE, 'live artifact snapshot path escapes snapshot dir'), options.templateHtml, 'utf8'),
      writeFile(resolveInside(tempSnapshotDir, LIVE_ARTIFACT_PREVIEW_FILE, 'live artifact snapshot path escapes snapshot dir'), options.previewHtml, 'utf8'),
      writeFile(resolveInside(tempSnapshotDir, LIVE_ARTIFACT_PROVENANCE_FILE, 'live artifact snapshot path escapes snapshot dir'), stableJson(options.provenanceJson), 'utf8'),
    ]);
    await rename(tempSnapshotDir, finalSnapshotDir);
  } catch (error) {
    await rm(tempSnapshotDir, { recursive: true, force: true });
    throw error;
  }
}

export async function commitLiveArtifactRefreshCandidate(
  options: CommitLiveArtifactRefreshCandidateOptions,
): Promise<LiveArtifactStoreRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = await assertLiveArtifactRefreshLockScope(options.projectsRoot, options.projectId, artifactId);
  const current = await readLiveArtifactWithDataJsonCache(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);

  const state = await readLiveArtifactRefreshState(paths, options.projectId, artifactId);
  const refreshOrdinal = assertLiveArtifactRefreshCanCommit(state, { ...options, artifactId });
  const nowIso = (options.now ?? new Date()).toISOString();
  const candidateData = validateBoundedJsonObject(options.dataJson, 'data.json');
  if (!candidateData.ok) throw new LiveArtifactStoreValidationError(candidateData.error, candidateData.issues);

  const candidateArtifact: LiveArtifact = artifactWithDataJson({
    ...current,
    refreshStatus: 'succeeded',
    updatedAt: nowIso,
    lastRefreshedAt: nowIso,
  }, candidateData.value);
  const persisted = validatePersistedLiveArtifact(candidateArtifact);
  if (!persisted.ok) throw new LiveArtifactStoreValidationError(persisted.error, persisted.issues);

  const templateHtml = await readTextFileOrDefault(paths.templateHtmlPath, defaultTemplateHtml(persisted.value.title));
  const provenanceJson = options.provenanceJson ?? await readProvenanceOrDefault(paths, nowIso);
  const previewHtml = persisted.value.document?.format === 'html_template_v1'
    ? renderPreviewHtml(templateHtml, candidateData.value)
    : templateHtml;

  const nextState: LiveArtifactRefreshState = {
    ...state,
    nextRefreshOrdinal: Math.max(state.nextRefreshOrdinal, refreshOrdinal + 1),
    lastCommittedRefreshId: options.refreshId,
    lastCommittedRefreshOrdinal: refreshOrdinal,
  };

  await writeLiveArtifactSuccessfulSnapshot(paths, {
    refreshId: options.refreshId,
    artifact: persisted.value,
    dataJson: candidateData.value,
    templateHtml,
    previewHtml,
    provenanceJson,
  });
  await Promise.all([
    writeFileAtomic(paths.artifactJsonPath, stableJson(persisted.value)),
    writeFileAtomic(paths.dataJsonPath, stableJson(candidateData.value)),
    writeFileAtomic(paths.generatedPreviewHtmlPath, previewHtml),
    writeFileAtomic(paths.provenanceJsonPath, stableJson(provenanceJson)),
  ]);
  await writeLiveArtifactRefreshState(paths, nextState);
  return { artifact: persisted.value, paths };
}

export async function markLiveArtifactRefreshFailed(
  options: MarkLiveArtifactRefreshFailedOptions,
): Promise<LiveArtifactStoreRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = await assertLiveArtifactRefreshLockScope(options.projectsRoot, options.projectId, artifactId);
  const current = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);
  const nowIso = (options.now ?? new Date()).toISOString();
  const artifact = await writePersistedLiveArtifact(paths, {
    ...current,
    refreshStatus: 'failed',
    updatedAt: nowIso,
  });
  return { artifact, paths };
}

export async function releaseLiveArtifactRefreshLock(lock: LiveArtifactRefreshLock): Promise<void> {
  let current: LiveArtifactRefreshLockMetadata;
  try {
    current = JSON.parse(await readFile(lock.lockPath, 'utf8')) as LiveArtifactRefreshLockMetadata;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }

  if (
    current.projectId !== lock.metadata.projectId
    || current.artifactId !== lock.metadata.artifactId
    || current.lockId !== lock.metadata.lockId
  ) {
    throw new LiveArtifactRefreshLockError('live artifact refresh lock ownership mismatch', {
      projectId: lock.metadata.projectId,
      artifactId: lock.metadata.artifactId,
      lockPath: lock.lockPath,
    });
  }

  await rm(lock.lockPath, { force: true });
}

export async function withLiveArtifactRefreshLock<T>(
  options: AcquireLiveArtifactRefreshLockOptions,
  callback: (lock: LiveArtifactRefreshLock) => Promise<T>,
): Promise<T> {
  const lock = await acquireLiveArtifactRefreshLock(options);
  try {
    return await callback(lock);
  } finally {
    await releaseLiveArtifactRefreshLock(lock);
  }
}

export async function listLiveArtifactRefreshLogEntries(
  options: ListLiveArtifactRefreshLogEntriesOptions,
): Promise<LiveArtifactRefreshLogEntry[]> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const current = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);

  const text = await readTextFileOrDefault(paths.refreshesJsonlPath, '');
  const entries: LiveArtifactRefreshLogEntry[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw validationError(`refreshes.jsonl.${index + 1}`, 'live artifact refresh log contains invalid JSON');
      }
      throw error;
    }
    const result = validateLiveArtifactRefreshLogEntry(parsed, `refreshes.jsonl.${index + 1}`);
    if (!result.ok) throw new LiveArtifactStoreValidationError(result.error, result.issues);
    if (result.value.projectId !== options.projectId || result.value.artifactId !== artifactId) {
      throw validationError(`refreshes.jsonl.${index + 1}`, 'live artifact refresh log entry does not match storage scope');
    }
    entries.push(result.value);
  }
  return entries;
}

function nextRefreshRecoverySequence(entries: LiveArtifactRefreshLogEntry[], refreshId: string): number {
  let maxSequence = -1;
  for (const entry of entries) {
    if (entry.refreshId === refreshId) maxSequence = Math.max(maxSequence, entry.sequence);
  }
  return maxSequence + 1;
}

async function recoverLiveArtifactRefreshLock(
  projectsRoot: string,
  projectId: string,
  artifactId: string,
  now: Date,
  staleAfterMs: number,
): Promise<LiveArtifactRefreshRecoveryResult> {
  const paths = liveArtifactStorePaths(projectsRoot, projectId, artifactId);
  const lockMetadata = await readLiveArtifactRefreshLockMetadata(paths);

  if (lockMetadata.projectId !== projectId || lockMetadata.artifactId !== artifactId) {
    return { projectId, artifactId, refreshId: lockMetadata.refreshId, status: 'skipped', reason: 'lock scope mismatch' };
  }

  const acquiredAtMs = Date.parse(lockMetadata.acquiredAt);
  const ageMs = now.getTime() - acquiredAtMs;
  if (ageMs < staleAfterMs) {
    return { projectId, artifactId, refreshId: lockMetadata.refreshId, status: 'skipped', reason: 'lock has not timed out' };
  }

  const artifact = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(artifact, projectId, artifactId);
  const entries = await listLiveArtifactRefreshLogEntries({ projectsRoot, projectId, artifactId });
  const finishedAt = now.toISOString();
  await appendLiveArtifactRefreshLogEntry({
    projectsRoot,
    projectId,
    artifactId,
    refreshId: lockMetadata.refreshId,
    sequence: nextRefreshRecoverySequence(entries, lockMetadata.refreshId),
    step: 'refresh:crash_recovery',
    status: 'failed',
    startedAt: lockMetadata.acquiredAt,
    finishedAt,
    durationMs: Math.max(0, now.getTime() - acquiredAtMs),
    error: {
      code: 'REFRESH_CRASH_RECOVERY_TIMEOUT',
      message: 'Refresh was still running when the daemon started and exceeded the total refresh timeout.',
    },
    metadata: { staleAfterMs },
    now,
  });

  await writePersistedLiveArtifact(paths, {
    ...artifact,
    refreshStatus: 'failed',
    updatedAt: finishedAt,
  });
  await rm(paths.refreshLockPath, { force: true });

  return { projectId, artifactId, refreshId: lockMetadata.refreshId, status: 'recovered' };
}

export async function recoverStaleLiveArtifactRefreshes(
  options: RecoverStaleLiveArtifactRefreshesOptions,
): Promise<LiveArtifactRefreshRecoveryResult[]> {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_LIVE_ARTIFACT_TOTAL_TIMEOUT_MS;
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new RangeError('staleAfterMs must be a positive safe integer');
  }

  let projectEntries: Dirent[];
  try {
    projectEntries = await readdir(options.projectsRoot, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }

  const results: LiveArtifactRefreshRecoveryResult[] = [];
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue;
    const projectId = projectEntry.name;
    let artifactEntries: Dirent[];
    try {
      artifactEntries = await readdir(liveArtifactsRootDir(options.projectsRoot, projectId), { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      results.push({ projectId, artifactId: '', refreshId: '', status: 'skipped', reason: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const artifactEntry of artifactEntries) {
      if (!artifactEntry.isDirectory() || artifactEntry.name.startsWith('tmp-')) continue;
      let artifactId: string;
      try {
        artifactId = validateLiveArtifactStorageId(artifactEntry.name);
      } catch {
        continue;
      }
      const paths = liveArtifactStorePaths(options.projectsRoot, projectId, artifactId);
      try {
        await stat(paths.refreshLockPath);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
        throw error;
      }

      try {
        results.push(await recoverLiveArtifactRefreshLock(options.projectsRoot, projectId, artifactId, now, staleAfterMs));
      } catch (error) {
        results.push({
          projectId,
          artifactId,
          refreshId: '',
          status: 'skipped',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}

export async function regenerateLiveArtifactPreview(options: RegenerateLiveArtifactPreviewOptions): Promise<LiveArtifactPreviewRenderRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const artifact = await readLiveArtifactWithDataJsonCache(paths);
  assertArtifactMatchesStorage(artifact, options.projectId, artifactId);

  const html = await renderLiveArtifactPreviewFromFiles(paths, artifact);
  await writeFile(paths.generatedPreviewHtmlPath, html, 'utf8');

  return { artifact, paths, html };
}

export async function ensureLiveArtifactPreview(options: RegenerateLiveArtifactPreviewOptions): Promise<LiveArtifactPreviewRenderRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const artifact = await readLiveArtifactWithDataJsonCache(paths);
  assertArtifactMatchesStorage(artifact, options.projectId, artifactId);

  try {
    const dependencyStats = await Promise.all([
      stat(paths.artifactJsonPath),
      stat(paths.templateHtmlPath),
      ...(artifact.document?.format === 'html_template_v1' ? [stat(paths.dataJsonPath)] : []),
    ]);
    const previewStat = await stat(paths.generatedPreviewHtmlPath);
    const newestDependencyMtime = Math.max(...dependencyStats.map((dependencyStat) => dependencyStat.mtimeMs));
    if (previewStat.mtimeMs > newestDependencyMtime) {
      return { artifact, paths, html: await readFile(paths.generatedPreviewHtmlPath, 'utf8') };
    }
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  const html = await renderLiveArtifactPreviewFromFiles(paths, artifact);
  await writeFile(paths.generatedPreviewHtmlPath, html, 'utf8');
  return { artifact, paths, html };
}

export type LiveArtifactCodeVariant = 'template' | 'rendered';

export async function readLiveArtifactCode(options: RegenerateLiveArtifactPreviewOptions & { variant: LiveArtifactCodeVariant }): Promise<string> {
  if (options.variant === 'rendered') {
    return (await ensureLiveArtifactPreview(options)).html;
  }

  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const artifact = await readLiveArtifactWithDataJsonCache(paths);
  assertArtifactMatchesStorage(artifact, options.projectId, artifactId);
  return readFile(paths.templateHtmlPath, 'utf8');
}

export async function updateLiveArtifact(options: UpdateLiveArtifactOptions): Promise<LiveArtifactStoreRecord> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const result = validateLiveArtifactUpdateInput(options.input);
  if (!result.ok) throw new LiveArtifactStoreValidationError(result.error, result.issues);

  const input: LiveArtifactUpdateInput = result.value;
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const current = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);

  const nowIso = (options.now ?? new Date()).toISOString();
  const updated: LiveArtifact = {
    ...current,
    title: input.title ?? current.title,
    slug: input.slug === undefined ? current.slug : generateLiveArtifactSlug(input.slug),
    pinned: input.pinned ?? current.pinned,
    status: input.status ?? current.status,
    preview: input.preview ?? current.preview,
    updatedAt: nowIso,
  };
  if (input.document !== undefined) updated.document = input.document;

  const persisted = validatePersistedLiveArtifact(updated);
  if (!persisted.ok) throw new LiveArtifactStoreValidationError(persisted.error, persisted.issues);

  const templateHtml = options.templateHtml ?? await readTextFileOrDefault(paths.templateHtmlPath, defaultTemplateHtml(persisted.value.title));
  const provenanceJson = options.provenanceJson ?? await readProvenanceOrDefault(paths, nowIso);
  const dataJson = input.document === undefined && persisted.value.document?.format === 'html_template_v1'
    ? await readPersistedDataJson(paths)
    : persisted.value.document?.dataJson;

  const writtenArtifact = await writeLiveArtifactFiles(paths, persisted.value, templateHtml, provenanceJson, dataJson);

  return { artifact: writtenArtifact, paths };
}

export async function deleteLiveArtifact(options: DeleteLiveArtifactOptions): Promise<void> {
  const artifactId = validateLiveArtifactStorageId(options.artifactId);
  const paths = liveArtifactStorePaths(options.projectsRoot, options.projectId, artifactId);
  const current = await readPersistedLiveArtifact(paths);
  assertArtifactMatchesStorage(current, options.projectId, artifactId);
  await rm(paths.artifactDir, { recursive: true, force: true });
}

export function summarizeLiveArtifactRecord(record: LiveArtifactStoreRecord): LiveArtifactStoreSummary {
  return { artifact: toSummary(record.artifact), paths: record.paths };
}
