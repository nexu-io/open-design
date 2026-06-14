import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  ArtifactManifestEntry,
  ArtifactSummary,
  AttachmentManifestEntry,
  InputTextSnapshotManifestEntry,
  ObjectManifestCompleteness,
} from './langfuse-trace.js';
import { INPUT_MAX_BYTES } from './langfuse-trace.js';
import { mimeFor, readProjectFile, resolveProjectFilePath } from './projects.js';

const OBJECT_RELAY_MARKER_HEADER = 'X-Open-Design-Telemetry';
const OBJECT_RELAY_MARKER_VALUE = 'object-ingestion-v1';
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_OBJECT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_OBJECT_BATCH_MAX_BYTES = 20 * 1024 * 1024;
const OBJECT_BATCH_MAX_COUNT = 100;

type ObjectClass = 'attachment' | 'artifact' | 'input_text_snapshot';
type TraceObjectManifestEntry =
  | AttachmentManifestEntry
  | ArtifactManifestEntry
  | InputTextSnapshotManifestEntry;

export interface TraceObjectUploadManifests {
  attachmentManifest?: AttachmentManifestEntry[];
  artifactManifest?: ArtifactManifestEntry[];
  inputTextSnapshotManifest?: InputTextSnapshotManifestEntry[];
  completeness: ObjectManifestCompleteness;
}

export interface TraceObjectSource {
  objectClass: ObjectClass;
  id: string;
  filename: string;
  mime: string;
  type?: string;
  body?: Buffer;
  sizeBytes?: number;
  reason?: string;
  source: string;
  truncated?: boolean;
}

export interface BuildTraceObjectManifestsOptions {
  installationId: string | null;
  projectId: string;
  runId: string;
  projectsRoot: string;
  projectMetadata?: Record<string, unknown> | null;
  attachmentPaths?: string[];
  artifacts?: TraceArtifactObjectSource[];
  prompt: string;
  prefs: {
    metrics?: boolean;
    content?: boolean;
    artifactManifest?: boolean;
  };
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  uploadMode?: 'manifest-only' | 'upload';
}

export interface TraceArtifactObjectSource {
  summary: ArtifactSummary;
  sourcePath?: string;
}

interface ObjectRelayConfig {
  url: string;
  authorizeUrl: string;
  uploadsEnabled: boolean;
  timeoutMs: number;
  objectMaxBytes: number;
  objectBatchMaxBytes: number;
}

interface RelayResult {
  storage_ref: string;
  status: 'available' | 'unavailable';
  reason?: string;
  size_bytes?: number;
  sha256?: string;
}

interface ObjectRelayRequestObject {
  storage_ref: string;
  object_class: ObjectClass;
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  content_base64: string;
}

interface ObjectRelayAuthorizeObject {
  storage_ref: string;
  object_class: ObjectClass;
  size_bytes: number;
  sha256: string;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function sha256(body: Buffer): string {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9._=-]/g, '_'))
    .filter((segment) => segment !== '.' && segment !== '..')
    .join('/');
}

function objectId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function storageRef(projectId: string, runId: string, objectClass: ObjectClass, id: string): string {
  const safeProject = sanitizeSegment(projectId || 'unknown-project') || 'unknown-project';
  const safeRun = sanitizeSegment(runId || 'unknown-run') || 'unknown-run';
  const safeClass = sanitizeSegment(objectClass);
  const safeId = sanitizeSegment(id);
  return `od://objects/workspaces/unknown/projects/${safeProject}/runs/${safeRun}/${safeClass}/${safeId}`;
}

function inferRelayUrl(env: NodeJS.ProcessEnv): string | null {
  const explicit = env.OPEN_DESIGN_OBJECT_RELAY_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const rawTelemetryRelayUrl = env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim();
  if (!rawTelemetryRelayUrl) return null;
  const telemetryRelayUrl = rawTelemetryRelayUrl.replace(/\/+$/, '');
  try {
    const url = new URL(telemetryRelayUrl);
    if (!/\/api\/langfuse\/?$/u.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/api\/langfuse\/?$/u, '/api/objects/batch');
    return url.toString().replace(/\/+$/, '');
  } catch {
    const derived = telemetryRelayUrl.replace(/\/api\/langfuse\/?$/u, '/api/objects/batch');
    return derived === telemetryRelayUrl ? null : derived.replace(/\/+$/, '');
  }
  return null;
}

function inferAuthorizeUrl(batchUrl: string): string {
  try {
    const url = new URL(batchUrl);
    url.pathname = url.pathname.replace(/\/api\/objects\/batch\/?$/, '/api/objects/authorize');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return batchUrl.replace(/\/api\/objects\/batch\/?$/, '/api/objects/authorize');
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRelayConfig(env: NodeJS.ProcessEnv): ObjectRelayConfig | null {
  const url = inferRelayUrl(env);
  if (!url) return null;
  return {
    url,
    authorizeUrl: inferAuthorizeUrl(url),
    uploadsEnabled: true,
    timeoutMs: parsePositiveInt(
      env.OPEN_DESIGN_OBJECT_RELAY_TIMEOUT_MS ?? env.OPEN_DESIGN_TELEMETRY_TIMEOUT_MS,
      10_000,
    ),
    objectMaxBytes: parsePositiveInt(
      env.OPEN_DESIGN_OBJECT_MAX_BYTES,
      DEFAULT_OBJECT_MAX_BYTES,
    ),
    objectBatchMaxBytes: parsePositiveInt(
      env.OPEN_DESIGN_OBJECT_BATCH_MAX_BYTES ?? env.TRACE_OBJECT_BATCH_MAX_BYTES,
      DEFAULT_OBJECT_BATCH_MAX_BYTES,
    ),
  };
}

function extensionFromName(value: string): string | undefined {
  const basename = value.split(/[\\/]/).pop() ?? '';
  const dot = basename.lastIndexOf('.');
  if (dot <= 0 || dot === basename.length - 1) return undefined;
  return basename.slice(dot + 1).toLowerCase();
}

function manifestBase(
  source: TraceObjectSource,
  opts: BuildTraceObjectManifestsOptions,
  now: Date,
): TraceObjectManifestEntry {
  const ref = storageRef(opts.projectId, opts.runId, source.objectClass, source.id);
  const extension = extensionFromName(source.filename);
  const common = {
    object_class: source.objectClass,
    storage_ref: ref,
    status: 'unavailable' as const,
    project_id: opts.projectId || null,
    run_id: opts.runId,
    workspace_id: null,
    ...(source.sizeBytes !== undefined ? { size_bytes: source.sizeBytes } : {}),
    mime_type: source.mime,
    ...(extension ? { extension } : {}),
    redacted: false,
    truncated: source.truncated === true,
    stored_in_open_design: false,
    retention_policy: 'observability_90d' as const,
    access_scope: 'project' as const,
    sensitivity: 'private' as const,
    expires_at: new Date(now.getTime() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    approved_by: null,
    open_in_open_design_url: null,
    preview_status: 'not_available',
    access_policy: 'open_design_auth_required' as const,
    ...(source.reason ? { reason: source.reason } : {}),
  };
  if (source.objectClass === 'attachment') {
    return {
      ...common,
      object_class: 'attachment',
      attachment_id: source.id,
      source: 'user_upload',
    };
  }
  if (source.objectClass === 'artifact') {
    return {
      ...common,
      object_class: 'artifact',
      artifact_id: source.id,
      type: source.type ?? 'unknown',
      build_status: 'complete',
      export_status: 'unavailable',
      source: 'agent_generated',
    };
  }
  return {
    ...common,
    object_class: 'input_text_snapshot',
    input_text_snapshot_id: source.id,
    type: 'text',
    source: 'user_prompt',
  };
}

function mergeSourceDigest(
  entry: TraceObjectManifestEntry,
  source: TraceObjectSource,
): TraceObjectManifestEntry {
  if (!source.body) return entry;
  return {
    ...entry,
    size_bytes: source.body.byteLength,
    sha256: sha256(source.body),
  };
}

function buildObjectBatchBody(
  opts: BuildTraceObjectManifestsOptions,
  objects: ObjectRelayRequestObject[],
  uploadToken: string,
): string {
  return JSON.stringify({
    client_id: opts.installationId ?? undefined,
    project_id: opts.projectId,
    run_id: opts.runId,
    upload_token: uploadToken,
    objects,
  });
}

function buildAuthorizeBody(
  opts: BuildTraceObjectManifestsOptions,
  objects: ObjectRelayAuthorizeObject[],
): string {
  return JSON.stringify({
    client_id: opts.installationId ?? undefined,
    project_id: opts.projectId,
    run_id: opts.runId,
    objects,
  });
}

function splitObjectBatches(
  config: ObjectRelayConfig,
  opts: BuildTraceObjectManifestsOptions,
  objects: ObjectRelayRequestObject[],
  uploadToken: string,
): {
  batches: ObjectRelayRequestObject[][];
  overflowResults: RelayResult[];
} {
  const batches: ObjectRelayRequestObject[][] = [];
  const overflowResults: RelayResult[] = [];
  let current: ObjectRelayRequestObject[] = [];

  for (const object of objects) {
    if (byteLength(buildObjectBatchBody(opts, [object], uploadToken)) > config.objectBatchMaxBytes) {
      overflowResults.push({
        storage_ref: object.storage_ref,
        status: 'unavailable',
        reason: 'object_batch_too_large',
      });
      continue;
    }

    const next = [...current, object];
    if (
      current.length > 0 &&
      (next.length > OBJECT_BATCH_MAX_COUNT ||
        byteLength(buildObjectBatchBody(opts, next, uploadToken)) > config.objectBatchMaxBytes)
    ) {
      batches.push(current);
      current = [object];
    } else {
      current = next;
    }
  }

  if (current.length > 0) batches.push(current);
  return { batches, overflowResults };
}

async function authorizeObjects(
  config: ObjectRelayConfig,
  opts: BuildTraceObjectManifestsOptions,
  objects: ObjectRelayAuthorizeObject[],
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const response = await fetchImpl(config.authorizeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [OBJECT_RELAY_MARKER_HEADER]: OBJECT_RELAY_MARKER_VALUE,
      },
      body: buildAuthorizeBody(opts, objects),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const parsed = await response.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') return null;
    const token = (parsed as { upload_token?: unknown }).upload_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function postObjects(
  config: ObjectRelayConfig,
  opts: BuildTraceObjectManifestsOptions,
  objects: ObjectRelayRequestObject[],
  uploadToken: string,
): Promise<RelayResult[]> {
  const body = buildObjectBatchBody(opts, objects, uploadToken);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [OBJECT_RELAY_MARKER_HEADER]: OBJECT_RELAY_MARKER_VALUE,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return objects.map((object) => ({
        storage_ref: object.storage_ref,
        status: 'unavailable',
        reason: `relay_${response.status}`,
      }));
    }
    const parsed = await response.json().catch(() => null);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { objects?: unknown }).objects)
    ) {
      return objects.map((object) => ({
        storage_ref: object.storage_ref,
        status: 'unavailable',
        reason: 'relay_invalid_response',
      }));
    }
    return (parsed as { objects: RelayResult[] }).objects;
  } catch {
    return objects.map((object) => ({
      storage_ref: object.storage_ref,
      status: 'unavailable',
      reason: 'relay_network_error',
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function collectSources(
  opts: BuildTraceObjectManifestsOptions,
  config: ObjectRelayConfig,
): Promise<TraceObjectSource[]> {
  const sources: TraceObjectSource[] = [];
  const projectId = opts.projectId;

  for (const attachmentPath of opts.attachmentPaths ?? []) {
    const id = objectId('att', attachmentPath);
    if (!projectId) {
      sources.push({
        objectClass: 'attachment',
        id,
        filename: path.basename(attachmentPath) || 'attachment.bin',
        mime: mimeFor(attachmentPath),
        reason: 'missing_project_id',
        source: 'user_attachment',
      });
      continue;
    }
    try {
      const fileInfo = await resolveProjectFilePath(
        opts.projectsRoot,
        projectId,
        attachmentPath,
        opts.projectMetadata ?? undefined,
      );
      if (fileInfo.size > config.objectMaxBytes) {
        sources.push({
          objectClass: 'attachment',
          id,
          filename: fileInfo.name,
          mime: fileInfo.mime,
          type: fileInfo.kind,
          sizeBytes: fileInfo.size,
          reason: 'object_too_large',
          source: 'user_attachment',
        });
        continue;
      }
      const file = await readProjectFile(
        opts.projectsRoot,
        projectId,
        attachmentPath,
        opts.projectMetadata ?? undefined,
      );
      sources.push({
        objectClass: 'attachment',
        id,
        filename: file.name,
        mime: file.mime,
        type: file.kind,
        body: file.buffer,
        sizeBytes: file.size,
        source: 'user_attachment',
      });
    } catch {
      sources.push({
        objectClass: 'attachment',
        id,
        filename: path.basename(attachmentPath) || 'attachment.bin',
        mime: mimeFor(attachmentPath),
        reason: 'source_read_failed',
        source: 'user_attachment',
      });
    }
  }

  for (const artifactSource of opts.artifacts ?? []) {
    const artifact = artifactSource.summary;
    const artifactPath = artifactSource.sourcePath ?? artifact.slug;
    const id = objectId('art', artifactPath);
    if (!projectId) {
      sources.push({
        objectClass: 'artifact',
        id,
        filename: path.basename(artifactPath) || 'artifact.bin',
        mime: mimeFor(artifactPath),
        type: artifact.type,
        sizeBytes: artifact.sizeBytes,
        reason: 'missing_project_id',
        source: 'produced_file',
      });
      continue;
    }
    try {
      const fileInfo = await resolveProjectFilePath(
        opts.projectsRoot,
        projectId,
        artifactPath,
        opts.projectMetadata ?? undefined,
      );
      if (fileInfo.size > config.objectMaxBytes) {
        sources.push({
          objectClass: 'artifact',
          id,
          filename: fileInfo.name,
          mime: fileInfo.mime,
          type: artifact.type || fileInfo.kind,
          sizeBytes: fileInfo.size,
          reason: 'object_too_large',
          source: 'produced_file',
        });
        continue;
      }
      const file = await readProjectFile(
        opts.projectsRoot,
        projectId,
        artifactPath,
        opts.projectMetadata ?? undefined,
      );
      sources.push({
        objectClass: 'artifact',
        id,
        filename: file.name,
        mime: file.mime,
        type: artifact.type || file.kind,
        body: file.buffer,
        sizeBytes: file.size,
        source: 'produced_file',
      });
    } catch {
      sources.push({
        objectClass: 'artifact',
        id,
        filename: path.basename(artifactPath) || 'artifact.bin',
        mime: mimeFor(artifactPath),
        type: artifact.type,
        sizeBytes: artifact.sizeBytes,
        reason: 'source_read_failed',
        source: 'produced_file',
      });
    }
  }

  if (opts.prefs.content === true && byteLength(opts.prompt) > INPUT_MAX_BYTES) {
    const body = Buffer.from(opts.prompt, 'utf8');
    sources.push({
      objectClass: 'input_text_snapshot',
      id: objectId('input', `${opts.runId}:${sha256(body)}`),
      filename: 'input.txt',
      mime: 'text/plain; charset=utf-8',
      type: 'text',
      body,
      sizeBytes: body.byteLength,
      source: 'user_prompt',
      truncated: true,
    });
  }

  return sources;
}

async function postObjectBatch(
  config: ObjectRelayConfig,
  opts: BuildTraceObjectManifestsOptions,
  manifests: TraceObjectManifestEntry[],
  sources: TraceObjectSource[],
): Promise<RelayResult[]> {
  const objects = sources
    .map((source, index) => ({ source, manifest: manifests[index] }))
    .filter((item): item is { source: TraceObjectSource; manifest: TraceObjectManifestEntry } =>
      item.manifest !== undefined
    )
    .filter((item) => item.source.body && item.source.body.byteLength <= config.objectMaxBytes)
    .map((item) => ({
      storage_ref: item.manifest.storage_ref,
      object_class: item.source.objectClass,
      filename: item.source.filename,
      mime: item.source.mime,
      size_bytes: item.source.body!.byteLength,
      sha256: sha256(item.source.body!),
      content_base64: item.source.body!.toString('base64'),
    }));

  if (objects.length === 0) return [];
  const authorizeObjectsBody = objects.map((object) => ({
    storage_ref: object.storage_ref,
    object_class: object.object_class,
    size_bytes: object.size_bytes,
    sha256: object.sha256,
  }));
  const uploadToken = await authorizeObjects(config, opts, authorizeObjectsBody);
  if (!uploadToken) {
    return objects.map((object) => ({
      storage_ref: object.storage_ref,
      status: 'unavailable',
      reason: 'relay_authorization_failed',
    }));
  }

  const { batches, overflowResults } = splitObjectBatches(config, opts, objects, uploadToken);
  const batchResults: RelayResult[] = [];
  for (const batch of batches) {
    batchResults.push(...await postObjects(config, opts, batch, uploadToken));
  }
  return [...batchResults, ...overflowResults];
}

function groupManifests(entries: TraceObjectManifestEntry[]): TraceObjectUploadManifests {
  const attachmentManifest = entries.filter(
    (entry): entry is AttachmentManifestEntry => entry.object_class === 'attachment',
  );
  const artifactManifest = entries.filter(
    (entry): entry is ArtifactManifestEntry => entry.object_class === 'artifact',
  );
  const inputTextSnapshotManifest = entries.filter(
    (entry): entry is InputTextSnapshotManifestEntry =>
      entry.object_class === 'input_text_snapshot',
  );
  const completeness =
    entries.length === 0
      ? 'unavailable'
      : entries.every((entry) => entry.status === 'ok')
        ? 'complete'
        : 'partial';
  return {
    ...(attachmentManifest.length > 0 ? { attachmentManifest } : {}),
    ...(artifactManifest.length > 0 ? { artifactManifest } : {}),
    ...(inputTextSnapshotManifest.length > 0 ? { inputTextSnapshotManifest } : {}),
    completeness,
  };
}

export async function buildTraceObjectManifests(
  opts: BuildTraceObjectManifestsOptions,
): Promise<TraceObjectUploadManifests | undefined> {
  if (
    opts.prefs.metrics !== true ||
    opts.prefs.content !== true
  ) {
    return undefined;
  }
  const config = readRelayConfig(opts.env ?? process.env);
  if (!config) return undefined;
  if (!config.uploadsEnabled) return undefined;

  const now = opts.now ? opts.now() : new Date();
  const sources = await collectSources(opts, config);
  if (sources.length === 0) return undefined;

  const manifests = sources.map((source) => manifestBase(source, opts, now));
  if (opts.uploadMode === 'manifest-only') {
    return groupManifests(manifests.map((entry, index) => ({
      ...mergeSourceDigest(entry, sources[index]!),
      status: 'unavailable' as const,
      stored_in_open_design: false,
      ...(entry.reason ? { reason: entry.reason } : {}),
    })));
  }

  const relayResults = await postObjectBatch(config, opts, manifests, sources);
  const resultByRef = new Map(relayResults.map((result) => [result.storage_ref, result]));
  const merged = manifests.map((entry, index) => {
    const source = sources[index]!;
    if (source.body && source.body.byteLength > config.objectMaxBytes) {
      return {
        ...entry,
        status: 'unavailable' as const,
        reason: 'object_too_large',
        size_bytes: source.body.byteLength,
      };
    }
    const result = resultByRef.get(entry.storage_ref);
    if (!result) {
      return {
        ...entry,
        status: 'unavailable' as const,
        reason: entry.reason ?? (source.body ? 'relay_missing_result' : 'source_unavailable'),
      };
    }
    return {
      ...entry,
      status: result.status === 'available' ? 'ok' as const : 'unavailable' as const,
      stored_in_open_design: result.status === 'available',
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.size_bytes !== undefined ? { size_bytes: result.size_bytes } : {}),
      ...(result.sha256 ? { sha256: result.sha256 } : {}),
    };
  });

  return groupManifests(merged);
}
