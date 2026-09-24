import { taskObjectMetadata } from '../observability/task-object-summary.js';
import { createHash } from 'node:crypto';
import { mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { TelemetryOutbox, type DeliveryAttempt, type OutboxJob } from '../storage/telemetry-outbox.js';
import { agentCliEnvForAgent, readAppConfig } from '../app-config.js';
import { buildFeedbackPayload, postLegacyTelemetryBatch, readTaskTelemetrySinkConfig, readFeedbackTelemetrySinkConfig, readRunTelemetrySinkConfig, reportRunCompleted, type FeedbackReportContext, type ReportContext, type LangfuseDeliveryState } from '../langfuse-trace.js';
import { buildTraceObjectManifests, type TraceObjectSource, type TraceObjectUploadManifests } from '../trace-object-manifest.js';
import { readTelemetryEnvironment } from '../telemetry-environment.js';
import { type AttachmentContextEntry, evidenceMode } from '../observability/eval-context.js';

type FrozenSource = Omit<TraceObjectSource, 'body'> & { snapshotHash?: string };
interface ObjectJob { taskTraceId?: string; context: ReportContext; sources: FrozenSource[]; capturedAt: string; environment?: string }
interface FeedbackJob { context: FeedbackReportContext; batch: unknown[] }
const stores = new Map<string, Promise<TelemetryOutbox>>();
const sha = (body: Buffer | string) => createHash('sha256').update(body).digest('hex');
export async function evidenceStore(dataDir: string): Promise<TelemetryOutbox> {
  let store = stores.get(dataDir);
  if (!store) {
    store = (async () => {
      const directory = path.join(dataDir, 'telemetry');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const filename = path.join(directory, 'outbox.sqlite');
      const positive = (name: string, fallback: number, maximum: number) => {
        const value = Number(process.env[name]);
        return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
      };
      const outbox = new TelemetryOutbox(filename, {
        bytes: positive('OPEN_DESIGN_OBJECT_OUTBOX_MAX_BYTES', 512 * 1024 * 1024, 2 * 1024 * 1024 * 1024),
        jobs: positive('OPEN_DESIGN_OBJECT_OUTBOX_MAX_JOBS', 10_000, 100_000),
        attempts: positive('OPEN_DESIGN_OBJECT_OUTBOX_MAX_ATTEMPTS', 8, 20),
        ttlMs: positive('OPEN_DESIGN_OBJECT_OUTBOX_TTL_MS', 7 * 24 * 3600_000, 90 * 24 * 3600_000),
      });
      await chmod(filename, 0o600);
      return outbox;
    })();
    stores.set(dataDir, store);
    void store.catch(() => stores.delete(dataDir));
  }
  return store;
}

export async function enqueueObjectEvidence(dataDir: string, context: ReportContext, sources: TraceObjectSource[], taskTraceId?: string) {
  if (sources.length === 0) return 'not_required' as const;
  const store = await evidenceStore(dataDir);
  const payload: ObjectJob = {
    ...(taskTraceId ? { taskTraceId } : {}), context, capturedAt: new Date().toISOString(), environment: readTelemetryEnvironment(),
    sources: sources.map(({ body, ...source }) => ({ ...source, ...(body ? { snapshotHash: sha(body) } : {}) })),
  };
  return store.enqueue('object', `run:${context.run.runId}`, payload, sources.flatMap(s => s.body ? [s.body] : []));
}


/** A Task owns the trace; this queue owns only its original physical-Run objects. */
export async function readObjectEvidence(dataDir: string, runId: string) {
  const store = await evidenceStore(dataDir);
  const row = store.read<ObjectJob>('object', `run:${runId}`);
  if (!row) return undefined;
  return {
    sources: row.payload.sources.map(({ snapshotHash, ...source }) => ({
      ...source, ...(snapshotHash ? { body: store.snapshot(snapshotHash) } : {}),
    })),
    capturedAt: row.payload.capturedAt,
    uploaded: row.receipt as TraceObjectUploadManifests | undefined,
  };
}

/** Reuse only unambiguous, integrity-checked bytes from this project's exact conversation. */
export async function inheritFrozenAttachments(dataDir: string, context: { projectId: string; conversationId: string; runId: string }, entries: AttachmentContextEntry[], sources: TraceObjectSource[]): Promise<TraceObjectSource[]> {
  if (!entries.length) return sources;
  const store = await evidenceStore(dataDir);
  const history = store.objectJobsForConversation(context.projectId, context.conversationId)
    .flatMap(row => (JSON.parse(row.payload) as ObjectJob).sources)
    .filter(source => source.objectClass === 'attachment' && source.snapshotHash);
  const result = [...sources];
  let bytes = result.reduce((total, source) => total + (source.body?.length ?? 0), 0);
  for (const entry of entries) {
    if (!entry.source_path_hash || result.some(source => source.objectClass === 'attachment' && source.sourcePathHash === entry.source_path_hash)) continue;
    const candidates = history.filter(source => source.sourcePathHash === entry.source_path_hash
      && (!entry.sha256 || source.snapshotHash === entry.sha256.replace(/^sha256:/, '')));
    // Ambiguous history is incomplete evidence; never choose a convenient revision.
    if (new Set(candidates.map(source => source.snapshotHash)).size !== 1) continue;
    const { snapshotHash, ...source } = candidates[0]!;
    const body = store.snapshot(snapshotHash!);
    const id = `att_${sha(JSON.stringify([context.runId, entry.identity])).slice(0, 16)}`;
    if (bytes + body.length > 16 * 1024 * 1024) {
      result.push({ ...source, id, reason: 'snapshot_budget_exceeded' });
    } else {
      result.push({ ...source, id, body });
      bytes += body.length;
    }
  }
  return result;
}

export async function enqueueFeedbackEvidence(dataDir: string, context: FeedbackReportContext) {
  const store = await evidenceStore(dataDir);
  const key = `${context.runId}-rating:${sha(JSON.stringify([context.traceId ?? context.runId, context.rating, context.reasonCodes, context.customReason]))}`;
  return store.enqueue('feedback', key, { context, batch: buildFeedbackPayload(context) } satisfies FeedbackJob);
}

function deliveryAttempt(result: LangfuseDeliveryState): DeliveryAttempt {
  if (result.langfuse_delivery_status === 'accepted') return { status: 'accepted', reason: 'receipt_pending' };
  const terminal = new Set(['payload_too_large', 'payload_build_error', 'langfuse_4xx', 'vela_400', 'vela_403', 'vela_413', 'relay_413']);
  return { status: terminal.has(result.langfuse_drop_reason ?? '') ? 'terminal' : 'retry', reason: result.langfuse_drop_reason ?? 'network_error' };
}

/** All Task publishers share the same clearing history because the receiver deep-merges maps. */
export function reconcileTaskObjectReasons(store: TelemetryOutbox, taskTraceId: string, metadata: Record<string, unknown>): void {
  const summary = metadata.trace_object_summary as { skip_reasons?: Record<string, number> } | undefined;
  if (!summary?.skip_reasons) return;
  const reasons = summary.skip_reasons;
  const keys = store.rememberTaskObjectReasons(taskTraceId, Object.keys(reasons));
  summary.skip_reasons = Object.fromEntries(keys.map(reason => [reason, reasons[reason] ?? 0]));
}

async function publishTaskObjectManifests(store: TelemetryOutbox, payload: ObjectJob, dataDir: string, fetchImpl?: typeof fetch): Promise<DeliveryAttempt> {
  const sink = readTaskTelemetrySinkConfig(process.env);
  if (!sink || !payload.taskTraceId) return { status: 'retry', reason: 'task_sink_unavailable' };
  const manifests: TraceObjectUploadManifests[] = [];
  const runObjectMetadata: Record<string, unknown>[] = [];
  for (const row of store.objectJobsForTask(payload.taskTraceId)) {
    const other = JSON.parse(row.payload) as ObjectJob;
    const frozenSources = other.sources.map(({ snapshotHash, ...source }) => ({ ...source, ...(snapshotHash ? { body: store.snapshot(snapshotHash) } : {}) }));
    const pending: TraceObjectUploadManifests | undefined = row.receipt ? JSON.parse(row.receipt) : await buildTraceObjectManifests({
      installationId: other.context.installationId, projectId: other.context.projectId, runId: other.context.run.runId,
      prefs: other.context.prefs, projectsRoot: path.join(dataDir, 'projects'), prompt: '', frozenSources,
      uploadMode: 'manifest-only', now: () => new Date(other.capturedAt),
    });
    if (pending) {
      manifests.push(pending);
      runObjectMetadata.push({
        artifact_manifest: pending.artifactManifest, attachment_manifest: pending.attachmentManifest,
        input_text_snapshot_manifest: pending.inputTextSnapshotManifest, manifest_completeness: pending.completeness,
        trace_object_summary: other.context.traceObjectSummary ?? { candidate_file_count: other.sources.filter(source => source.objectClass === 'artifact').length },
      });
    }
  }
  const objectMetadata = taskObjectMetadata(runObjectMetadata);
  reconcileTaskObjectReasons(store, payload.taskTraceId, objectMetadata);
  const metadata = {
    artifact_manifest: manifests.flatMap(m => m.artifactManifest ?? []),
    attachment_manifest: manifests.flatMap(m => m.attachmentManifest ?? []),
    input_text_snapshot_manifest: manifests.flatMap(m => m.inputTextSnapshotManifest ?? []),
    projectId: payload.context.projectId,
    ...objectMetadata,
  };
  const key = `task-objects:${sha(JSON.stringify([payload.taskTraceId, metadata]))}`;
  const result = await postLegacyTelemetryBatch(sink, [{
    id: key, type: 'trace-create', timestamp: new Date().toISOString(),
    body: { id: payload.taskTraceId, environment: payload.environment ?? readTelemetryEnvironment(), metadata },
  }], { deliveryIdempotencyKey: key, ...(payload.context.installationId ? { installationId: payload.context.installationId } : {}), ...(fetchImpl ? { fetchImpl } : {}) });
  return result.langfuse_delivery_status === 'accepted'
    ? { status: 'uploaded', reason: 'consumer_readback_pending' }
    : { status: 'retry', reason: result.langfuse_drop_reason ?? 'task_manifest_update_failed' };
}

function objectManifestEntries(manifests?: TraceObjectUploadManifests) {
  return [...(manifests?.attachmentManifest ?? []), ...(manifests?.artifactManifest ?? []), ...(manifests?.inputTextSnapshotManifest ?? [])];
}

/** Preserve acknowledged objects while retrying only the unacknowledged siblings. */
export function mergeObjectUploadReceipts(previous: TraceObjectUploadManifests | undefined, next: TraceObjectUploadManifests): TraceObjectUploadManifests {
  const merge = <T extends { storage_ref: string; status: string }>(before: T[] = [], after: T[] = []) => {
    const entries = new Map(before.map(entry => [entry.storage_ref, entry]));
    for (const entry of after) if (entries.get(entry.storage_ref)?.status !== 'ok') entries.set(entry.storage_ref, entry);
    return [...entries.values()];
  };
  const result = {
    attachmentManifest: merge(previous?.attachmentManifest, next.attachmentManifest),
    artifactManifest: merge(previous?.artifactManifest, next.artifactManifest),
    inputTextSnapshotManifest: merge(previous?.inputTextSnapshotManifest, next.inputTextSnapshotManifest),
    completeness: next.completeness,
  };
  result.completeness = objectManifestEntries(result).every(entry => entry.status === 'ok') ? 'complete' : 'partial';
  return result;
}

export const taskObjectDeliveryEnabled = (mode: string | undefined): boolean => mode === undefined || evidenceMode(mode) === 'send';

export async function drainEvidence(dataDir: string, fetchImpl?: typeof fetch): Promise<void> {
  // Task content is part of ordinary consented telemetry. Keep an explicit
  // off/observe kill switch without requiring an acceptance-only enable flag.
  if (!taskObjectDeliveryEnabled(process.env.OPEN_DESIGN_OBJECT_OUTBOX_MODE)) return;
  const cfg = await readAppConfig(dataDir);
  if (cfg.telemetry?.metrics !== true || cfg.telemetry.content !== true) return;
  const sink = readRunTelemetrySinkConfig(process.env, agentCliEnvForAgent(cfg.agentCliEnv, 'amr'));
  if (!sink) return;
  const store = await evidenceStore(dataDir);
  await store.drain(async (job: OutboxJob): Promise<DeliveryAttempt> => {
    if (job.kind === 'feedback') {
      const payload = JSON.parse(job.payload) as FeedbackJob;
      const feedbackSink = payload.context.traceId
        ? readTaskTelemetrySinkConfig(process.env)
        : readFeedbackTelemetrySinkConfig(process.env, agentCliEnvForAgent(cfg.agentCliEnv, 'amr'));
      if (!feedbackSink) return { status: 'retry', reason: 'feedback_sink_unavailable' };
      const result = await postLegacyTelemetryBatch(feedbackSink, payload.batch, {
        ...(payload.context.installationId ? { installationId: payload.context.installationId } : {}),
        deliveryIdempotencyKey: job.key, ...(fetchImpl ? { fetchImpl } : {}),
      });
      return deliveryAttempt(result);
    }
    const payload = JSON.parse(job.payload) as ObjectJob;
    const context = payload.context;
    const previous = store.read<ObjectJob>('object', job.key)?.receipt as TraceObjectUploadManifests | undefined;
    if (payload.taskTraceId && previous && objectManifestEntries(previous).every(entry => entry.status === 'ok')) {
      return publishTaskObjectManifests(store, payload, dataDir, fetchImpl);
    }
    const frozenSources = payload.sources.map(({ snapshotHash, ...source }) => ({
      ...source, ...(snapshotHash ? { body: store.snapshot(snapshotHash) } : {}),
    }));
    const options = {
      installationId: context.installationId, projectId: context.projectId, runId: context.run.runId,
      projectsRoot: path.join(dataDir, 'projects'), prompt: '', prefs: cfg.telemetry!,
      frozenSources: frozenSources.filter(source => !objectManifestEntries(previous).some(entry => entry.object_class === source.objectClass && ('attachment_id' in entry ? entry.attachment_id : 'artifact_id' in entry ? entry.artifact_id : entry.input_text_snapshot_id) === source.id && entry.status === 'ok')), now: () => new Date(payload.capturedAt), ...(fetchImpl ? { fetchImpl } : {}),
    };
    const registration = await buildTraceObjectManifests({ ...options, uploadMode: 'manifest-only' });
    if (registration && sink.kind === 'vela') {
      const result = await reportRunCompleted({ ...context, ...registration }, { config: sink, deliveryPurpose: 'object-registration', ...(fetchImpl ? { fetchImpl } : {}) });
      if (result.langfuse_delivery_status !== 'accepted') return { status: 'retry', reason: result.langfuse_drop_reason ?? 'registration_failed' };
      const next = await buildTraceObjectManifests(options);
      const uploaded = next ? mergeObjectUploadReceipts(previous, next) : previous;
      if (uploaded) {
        context.attachmentManifest = uploaded.attachmentManifest ?? [];
        context.artifactManifest = uploaded.artifactManifest ?? [];
        context.manifestCompleteness = uploaded.completeness;
        context.inputTextSnapshotManifest = uploaded.inputTextSnapshotManifest ?? [];
        if (payload.taskTraceId) {
          const entries = [...(uploaded.attachmentManifest ?? []), ...(uploaded.artifactManifest ?? []), ...(uploaded.inputTextSnapshotManifest ?? [])];
          // Checkpoint each successful object before publishing or retrying siblings.
          store.checkpointReceipt('object', job.key, uploaded);
          const publication = await publishTaskObjectManifests(store, payload, dataDir, fetchImpl);
          const incomplete = entries.find(entry => entry.status !== 'ok');
          if (incomplete) return { status: 'retry', reason: incomplete.reason ?? 'object_upload_incomplete' };
          return publication;
        }
        if (context.evalContextV2) {
          const collisions = new Set(context.evalContextV2.artifacts.entries.filter(e => e.reason === 'cross_ledger_collision').map(e => e.artifact_id));
          context.evalContextV2.artifacts.entries = (uploaded.artifactManifest ?? []).map(e => collisions.has(e.artifact_id) ? { ...e, status: 'partial', reason: 'cross_ledger_collision' } : e);
        }
      }
    }
    if (payload.taskTraceId) return { status: 'retry', reason: 'object_authority_unavailable' };
    const result = await reportRunCompleted(context, { config: sink, deliveryIdempotencyKey: job.key, ...(fetchImpl ? { fetchImpl } : {}) });
    // Readback belongs to the receiver. The persistent accepted state remains visibly incomplete.
    return deliveryAttempt(result);
  });
}

/** Startup recovery runs outside product requests. Off/observe never open or drain the queue. */
export function startEvidenceDelivery(dataDir: string): () => void {
  let stopped = false;
  const tick = () => {
    if (!stopped) void drainEvidence(dataDir).catch(() => console.warn('[evidence-outbox] delivery_pass_failed'));
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return () => { stopped = true; clearInterval(timer); };
}
