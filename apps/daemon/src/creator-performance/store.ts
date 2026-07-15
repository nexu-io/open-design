import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  CreateCreatorPerformanceSnapshotRequest,
  CreatorPerformanceMetrics,
  CreatorPerformanceProjectData,
  CreatorPerformanceSnapshot,
} from '@open-design/contracts';

const METRIC_KEYS = [
  'views',
  'likes',
  'comments',
  'shares',
  'favorites',
  'followers',
  'watchSeconds',
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

function storePath(dataDir: string, projectId: string): string {
  assertProjectId(projectId);
  const performanceDirectory = path.resolve(dataDir, 'creator-performance');
  const file = path.resolve(performanceDirectory, `${projectId}.json`);
  const relative = path.relative(performanceDirectory, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('invalid project id');
  }
  return file;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertProjectId(projectId: string): void {
  if (typeof projectId !== 'string' || projectId.length === 0 || projectId.length > 128
    || /^\.+$/.test(projectId) || !/^[A-Za-z0-9._-]+$/.test(projectId)) {
    throw new Error('invalid project id');
  }
}

// capturedAt / createdAt 必须是带 Z 后缀的 ISO UTC 字符串。
function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function parseIsoDate(value: unknown): string {
  if (!isValidIsoDate(value)) throw new Error('date must be a valid ISO string');
  return value;
}

// 单项指标必须是安全整数且 >= 0；负数、小数、NaN、Infinity、非数字全部拒绝。
function validMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// 解析 create 的 metrics：仅接受白名单字段；未知字段、任何非法值、空对象全部拒绝。
function parseMetrics(value: unknown): CreatorPerformanceMetrics {
  if (!isRecord(value)) throw new Error('metrics must be an object');
  for (const key of Object.keys(value)) {
    if (!(METRIC_KEYS as readonly string[]).includes(key)) {
      throw new Error(`unknown metric field: ${key}`);
    }
  }
  const metrics: CreatorPerformanceMetrics = {};
  let known = 0;
  for (const key of METRIC_KEYS) {
    const entry = value[key];
    if (entry === undefined) continue;
    if (!validMetric(entry)) {
      throw new Error(`metric ${key} must be a non-negative integer`);
    }
    metrics[key] = entry;
    known += 1;
  }
  if (known === 0) throw new Error('at least one metric is required');
  return metrics;
}

// 读取已持久化记录时，过滤项目归属错误、非法 source、非法 metric、非法时间的记录。
function validSnapshot(value: unknown, projectId: string): value is CreatorPerformanceSnapshot {
  if (!isRecord(value)) return false;
  if (!nonEmptyString(value.id) || !nonEmptyString(value.releaseId)) return false;
  // 项目归属：本地文件不可信任，record.projectId 必须匹配当前读取的项目。
  if (!nonEmptyString(value.projectId) || value.projectId !== projectId) return false;
  if (value.source !== 'manual') return false;
  if (!isValidIsoDate(value.capturedAt)) return false;
  if (!isValidIsoDate(value.createdAt)) return false;
  if (!isRecord(value.metrics)) return false;
  let known = 0;
  for (const key of Object.keys(value.metrics)) {
    if (!(METRIC_KEYS as readonly string[]).includes(key)) return false;
  }
  for (const key of METRIC_KEYS) {
    const entry = value.metrics[key];
    if (entry !== undefined) {
      if (!validMetric(entry)) return false;
      known += 1;
    }
  }
  if (known === 0) return false;
  if (value.note !== undefined && typeof value.note !== 'string') return false;
  return true;
}

function sortByCapturedAtDesc(snapshots: CreatorPerformanceSnapshot[]): CreatorPerformanceSnapshot[] {
  return [...snapshots].sort((left, right) => {
    // 倒序：更晚 capturedAt 在前；时间相同时以 createdAt 更晚者优先，保证同时间戳稳定。
    if (left.capturedAt !== right.capturedAt) return left.capturedAt < right.capturedAt ? 1 : -1;
    if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;
    return left.id < right.id ? 1 : -1;
  });
}

async function readProjectData(dataDir: string, projectId: string): Promise<CreatorPerformanceProjectData> {
  let source: string;
  try {
    source = await fsp.readFile(storePath(dataDir, projectId), 'utf8');
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return { snapshots: [] };
  }
  try {
    const raw: unknown = JSON.parse(source);
    if (!isRecord(raw) || !Array.isArray(raw.snapshots)) return { snapshots: [] };
    return { snapshots: sortByCapturedAtDesc(raw.snapshots.filter((snapshot) => validSnapshot(snapshot, projectId))) };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return { snapshots: [] };
    throw error;
  }
}

async function writeProjectData(
  dataDir: string,
  projectId: string,
  value: CreatorPerformanceProjectData,
): Promise<void> {
  const file = storePath(dataDir, projectId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fsp.rename(temporaryFile, file);
  } catch (error) {
    try {
      await fsp.unlink(temporaryFile);
    } catch {
      // 清理失败不应掩盖原始写入错误。
    }
    throw error;
  }
}

export async function getCreatorPerformanceProjectData(
  dataDir: string,
  projectId: string,
): Promise<CreatorPerformanceProjectData> {
  assertProjectId(projectId);
  return readProjectData(dataDir, projectId);
}

export async function createCreatorPerformanceSnapshot(
  dataDir: string,
  projectId: string,
  input: CreateCreatorPerformanceSnapshotRequest,
): Promise<CreatorPerformanceSnapshot> {
  assertProjectId(projectId);
  if (!isRecord(input)) throw new Error('performance snapshot request is required');
  if (!nonEmptyString(input.releaseId)) throw new Error('release id is required');
  const data = await readProjectData(dataDir, projectId);
  const now = new Date().toISOString();
  const capturedAt = input.capturedAt === undefined ? now : parseIsoDate(input.capturedAt);
  const metrics = parseMetrics(input.metrics);
  // 仅使用 DTO 允许的字段；忽略任何运行时伪造的 id/projectId/source/createdAt。
  const note = input.note === undefined ? undefined : input.note.trim();
  const snapshot: CreatorPerformanceSnapshot = {
    id: `creator-performance:${randomUUID()}`,
    projectId,
    releaseId: input.releaseId,
    source: 'manual',
    capturedAt,
    metrics,
    ...(note ? { note } : {}),
    createdAt: now,
  };
  data.snapshots.push(snapshot);
  await writeProjectData(dataDir, projectId, { snapshots: sortByCapturedAtDesc(data.snapshots) });
  return snapshot;
}

export async function deleteCreatorPerformanceSnapshot(
  dataDir: string,
  projectId: string,
  snapshotId: string,
): Promise<boolean> {
  assertProjectId(projectId);
  if (!nonEmptyString(snapshotId)) throw new Error('snapshot id is required');
  const data = await readProjectData(dataDir, projectId);
  const next = data.snapshots.filter((snapshot) => snapshot.id !== snapshotId);
  if (next.length === data.snapshots.length) return false;
  // 仅删除目标快照，不触及 release、Content、Media 或原始文件。
  await writeProjectData(dataDir, projectId, { snapshots: next });
  return true;
}
