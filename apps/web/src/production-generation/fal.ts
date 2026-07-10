import type { MediaJobKind, ProductionMediaJob, ProductionSegment } from './types';
import { updateProductionMediaJobStatus } from './state';

export interface FalMediaRequest {
  provider: 'fal';
  kind: MediaJobKind;
  shotId: string;
  prompt: string;
  model: string;
  referenceAssetIds?: string[];
}

export function buildFalMediaRequest(input: FalMediaRequest): FalMediaRequest {
  return input;
}

export function createFalMediaJob(input: {
  id: string;
  segmentId: string;
  kind: MediaJobKind;
  model: string;
  prompt: string;
  referenceAssetIds?: readonly string[];
}): ProductionMediaJob {
  return {
    id: input.id,
    segmentId: input.segmentId,
    kind: input.kind,
    status: 'idle',
    provider: 'fal',
    model: input.model,
    prompt: input.prompt,
    referenceAssetIds: input.referenceAssetIds ?? [],
    resultAssetIds: [],
    progress: [],
    file: null,
  };
}

export interface FalMediaTaskSnapshot {
  taskId: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'interrupted';
  startedAt: number;
  endedAt: number | null;
  progress: string[];
  nextSince: number;
  file?: unknown | null;
  error?: {
    message: string;
    status?: number;
    code?: string;
  };
}

export interface SubmitFalMediaJobInput {
  projectId: string;
  job: ProductionMediaJob;
  fetchImpl?: typeof fetch;
}

export interface WaitForFalMediaJobInput {
  job: ProductionMediaJob;
  fetchImpl?: typeof fetch;
  since?: number;
  timeoutMs?: number;
}

export interface CancelFalMediaJobInput {
  projectId: string;
  job: ProductionMediaJob;
  fetchImpl?: typeof fetch;
}

const DEFAULT_WAIT_TIMEOUT_MS = 25_000;

function falSurfaceForKind(kind: MediaJobKind): 'image' | 'video' {
  return kind === 'video' ? 'video' : 'image';
}

function defaultFalModelForKind(kind: MediaJobKind): string {
  if (kind === 'video') return 'fal/wan-2.1-t2v';
  return 'fal/flux-pro';
}

function falMediaGenerateUrl(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/media/generate`;
}

function falMediaWaitUrl(taskId: string) {
  return `/api/media/tasks/${encodeURIComponent(taskId)}/wait`;
}

function falMediaCancelUrl(projectId: string, taskId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/media/tasks/${encodeURIComponent(taskId)}/cancel`;
}

function buildFalMediaPrompt(segment: ProductionSegment, kind: MediaJobKind) {
  const shot = segment.shot.trim();
  const paragraph = segment.paragraph.trim();
  const assets = segment.assets.trim();
  const output = segment.output.trim();
  const base = shot || paragraph || output || segment.label;
  const assetHint = assets ? `\nAssets: ${assets}` : '';
  return kind === 'video'
    ? `Video prompt for ${segment.label}: ${base}${assetHint}`
    : kind === '3d'
      ? `3D prompt for ${segment.label}: ${base}${assetHint}`
      : `Image prompt for ${segment.label}: ${base}${assetHint}`;
}

export function planFalMediaJobs(input: {
  segments: readonly ProductionSegment[];
  kind?: MediaJobKind;
  model?: string;
  jobPrefix?: string;
}): ProductionMediaJob[] {
  const kind = input.kind ?? 'image';
  const model = input.model ?? defaultFalModelForKind(kind);
  const jobPrefix = input.jobPrefix ?? `fal-${kind}`;

  return input.segments.map((segment, index) => {
    const job = createFalMediaJob({
      id: `${jobPrefix}-${segment.id}-${index + 1}`,
      segmentId: segment.id,
      kind,
      model,
      prompt: buildFalMediaPrompt(segment, kind),
    });

    return updateProductionMediaJobStatus(job, 'queued', {});
  });
}

export async function submitFalMediaJob(input: SubmitFalMediaJobInput): Promise<ProductionMediaJob> {
  const submit = input.fetchImpl ?? fetch;
  const resp = await submit(falMediaGenerateUrl(input.projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      surface: falSurfaceForKind(input.job.kind),
      model: input.job.model,
      prompt: input.job.prompt,
    }),
  });

  const payload = (await resp.json().catch(() => ({}))) as {
    taskId?: string;
    status?: string;
    startedAt?: number;
    error?: string;
  };

  if (!resp.ok) {
    throw new Error(payload.error || `Fal task submit failed (${resp.status})`);
  }
  if (!payload.taskId) {
    throw new Error('Fal task submit did not return a taskId.');
  }

  return updateProductionMediaJobStatus(input.job, 'queued', {
    taskId: payload.taskId,
    startedAt: payload.startedAt,
    progress: [...input.job.progress, `Submitted to daemon as ${payload.taskId}`],
  });
}

export async function waitForFalMediaJob(
  input: WaitForFalMediaJobInput,
): Promise<{ job: ProductionMediaJob; snapshot: FalMediaTaskSnapshot }> {
  if (!input.job.taskId) {
    throw new Error('Fal media job has no taskId yet.');
  }

  const wait = input.fetchImpl ?? fetch;
  const resp = await wait(falMediaWaitUrl(input.job.taskId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      since: input.since ?? input.job.progress.length,
      timeoutMs: input.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
    }),
  });

  const snapshot = (await resp.json().catch(() => ({}))) as FalMediaTaskSnapshot;
  if (!resp.ok) {
    throw new Error(snapshot?.error?.message || `Fal task wait failed (${resp.status})`);
  }

  const nextJob = updateProductionMediaJobStatus(
    input.job,
    snapshot.status === 'done'
      ? 'completed'
      : snapshot.status === 'failed'
        ? 'failed'
        : snapshot.status === 'interrupted'
          ? 'canceled'
        : 'running',
    {
      progress: [...input.job.progress, ...(snapshot.progress ?? [])],
      endedAt: snapshot.endedAt ?? input.job.endedAt,
      file: snapshot.file ?? input.job.file,
      error: snapshot.error?.message,
      resultAssetIds: snapshot.status === 'done' ? input.job.resultAssetIds : input.job.resultAssetIds,
    },
  );

  return { job: nextJob, snapshot };
}

export function cancelFalMediaJob(job: ProductionMediaJob): ProductionMediaJob {
  return updateProductionMediaJobStatus(job, 'canceled', {
    error: 'Canceled by user.',
  });
}

export async function cancelFalMediaTask(
  input: CancelFalMediaJobInput,
): Promise<ProductionMediaJob> {
  if (!input.job.taskId) {
    return cancelFalMediaJob(input.job);
  }

  const cancel = input.fetchImpl ?? fetch;
  const resp = await cancel(falMediaCancelUrl(input.projectId, input.job.taskId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const snapshot = (await resp.json().catch(() => ({}))) as Partial<FalMediaTaskSnapshot>;

  if (!resp.ok) {
    throw new Error(snapshot?.error?.message || `Fal task cancel failed (${resp.status})`);
  }

  return updateProductionMediaJobStatus(input.job, 'canceled', {
    progress: [...input.job.progress, ...(snapshot.progress ?? [])],
    endedAt: snapshot.endedAt ?? Date.now(),
    error: snapshot.error?.message ?? 'Canceled by user.',
  });
}
