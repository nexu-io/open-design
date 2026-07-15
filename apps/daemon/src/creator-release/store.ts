import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  CreateCreatorReleasePackageRequest,
  CreatorReleaseChecklist,
  CreatorReleasePackage,
  CreatorReleasePackageData,
  CreatorReleasePlatform,
  CreatorReleaseStatus,
  UpdateCreatorReleasePackageRequest,
} from '@open-design/contracts';

const PLATFORMS = new Set<CreatorReleasePlatform>(['bilibili', 'youtube', 'xiaohongshu', 'other']);
const STATUSES = new Set<CreatorReleaseStatus>(['draft', 'ready', 'published', 'archived']);
const CHECKLIST_FIELDS = ['contentComplete', 'exportConfirmed', 'coverConfirmed', 'metadataConfirmed', 'platformConfirmed'] as const;

function storePath(dataDir: string, projectId: string): string {
  assertProjectId(projectId);
  const releaseDirectory = path.resolve(dataDir, 'creator-release');
  const file = path.resolve(releaseDirectory, `${projectId}.json`);
  const relative = path.relative(releaseDirectory, file);
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

// 关联标识（contentId / releaseId）只接受非空且路径安全的字符串，禁止任何路径穿越序列。
function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`);
  if (/[/\\]/.test(value) || value.includes('..')) throw new Error(`${field} is not path safe`);
  return value;
}

function requireTitle(value: unknown): string {
  if (!nonEmptyString(value)) throw new Error('release title is required');
  return value.trim();
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value.trim();
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (!nonEmptyString(value)) throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}

function requirePlatform(value: unknown): CreatorReleasePlatform {
  if (!PLATFORMS.has(value as CreatorReleasePlatform)) throw new Error('invalid release platform');
  return value as CreatorReleasePlatform;
}

function parseStatus(value: unknown, fallback: CreatorReleaseStatus): CreatorReleaseStatus {
  if (value === undefined) return fallback;
  if (!STATUSES.has(value as CreatorReleaseStatus)) throw new Error('invalid release status');
  return value as CreatorReleaseStatus;
}

// 校验并返回 ISO 字符串；缺少或非法一律抛错。调用方用 `=== undefined` 守卫存在性，
// 以便与 exactOptionalPropertyTypes 兼容（存在时必为 string，而非 string | undefined）。
function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function parseIsoDate(value: unknown): string {
  if (!isValidIsoDate(value)) throw new Error('date must be a valid ISO string');
  return value;
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseHttpUrl(value: unknown): string {
  if (!isValidHttpUrl(value)) throw new Error('published url must be http or https');
  return value;
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('tags must be an array');
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('tags must be strings');
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  if (result.length > 20) throw new Error('tags must not exceed 20');
  return result;
}

function emptyChecklist(): CreatorReleaseChecklist {
  return {
    contentComplete: false,
    exportConfirmed: false,
    coverConfirmed: false,
    metadataConfirmed: false,
    platformConfirmed: false,
  };
}

function validChecklist(value: unknown): value is CreatorReleaseChecklist {
  if (!isRecord(value)) return false;
  return CHECKLIST_FIELDS.every((field) => typeof value[field] === 'boolean');
}

function parseChecklist(value: unknown, fallback: CreatorReleaseChecklist): CreatorReleaseChecklist {
  if (value === undefined) return fallback;
  if (!isRecord(value)) throw new Error('checklist must be an object');
  const next: CreatorReleaseChecklist = { ...fallback };
  for (const field of CHECKLIST_FIELDS) {
    const entry = value[field];
    if (entry === undefined) continue;
    if (typeof entry !== 'boolean') throw new Error(`checklist ${field} must be a boolean`);
    next[field] = entry;
  }
  return next;
}

function checklistComplete(checklist: CreatorReleaseChecklist): boolean {
  return CHECKLIST_FIELDS.every((field) => checklist[field]);
}

// 对 update 中的可空关联/时间字段应用显式清空语义：
// undefined → 不修改；null → 从持久化对象删除；非空字符串 → 校验后写入；空字符串/非字符串 → 拒绝。
// 参数为 unknown：update 的 patch 经 isRecord 守卫后已被收窄为 Record<string, unknown>，
// 且字段来自不可信任的 DTO，故在此做运行时校验而非依赖调用端类型。
type NullableReleaseField = 'coverAssetId' | 'exportAssetId' | 'scheduledAt' | 'publishedAt' | 'publishedUrl';

function applyNullableReleaseField(
  target: CreatorReleasePackage,
  value: unknown,
  field: NullableReleaseField,
): void {
  if (value === undefined) return;
  if (value === null) {
    delete target[field];
    return;
  }
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  if (value.trim().length === 0) throw new Error(`${field} must be a non-empty string`);
  if (field === 'scheduledAt' || field === 'publishedAt') {
    target[field] = parseIsoDate(value);
  } else if (field === 'publishedUrl') {
    target[field] = parseHttpUrl(value);
  } else {
    target[field] = value.trim();
  }
}

// 状态门禁在存储层生效：ready 要求五项全 true；published 额外要求合法 publishedAt + publishedUrl。
// 调用方必须先合并当前 release 再传最终值，避免局部 PATCH 绕过门禁。
// publishedAt/publishedUrl 若存在已由 parseIsoDate/parseHttpUrl 校验，故此处仅判存在性。
function assertStatusGate(
  status: CreatorReleaseStatus,
  checklist: CreatorReleaseChecklist,
  publishedAt: string | undefined,
  publishedUrl: string | undefined,
): void {
  if (status === 'ready' && !checklistComplete(checklist)) {
    throw new Error('ready requires all checklist items complete');
  }
  if (status === 'published') {
    if (!checklistComplete(checklist)) throw new Error('published requires all checklist items complete');
    if (publishedAt === undefined) throw new Error('published requires a valid publishedAt');
    if (publishedUrl === undefined) throw new Error('published requires a valid publishedUrl');
  }
}

function validReleasePackage(value: unknown, projectId: string): value is CreatorReleasePackage {
  if (!isRecord(value)) return false;
  if (!nonEmptyString(value.id) || !nonEmptyString(value.contentId)) return false;
  // 项目归属：持久化自本地文件不得被信任，record.projectId 必须匹配当前读取的项目。
  if (!nonEmptyString(value.projectId) || value.projectId !== projectId) return false;
  if (!PLATFORMS.has(value.platform as CreatorReleasePlatform)) return false;
  if (!STATUSES.has(value.status as CreatorReleaseStatus)) return false;
  if (!nonEmptyString(value.title) || typeof value.description !== 'string') return false;
  if (!Array.isArray(value.tags)
    || !value.tags.every((tag) => typeof tag === 'string' && tag.trim().length > 0)
    || value.tags.length > 20) return false;
  const checklist = value.checklist;
  if (!validChecklist(checklist)) return false;
  if (value.coverAssetId !== undefined && !nonEmptyString(value.coverAssetId)) return false;
  if (value.exportAssetId !== undefined && !nonEmptyString(value.exportAssetId)) return false;
  if (value.scheduledAt !== undefined && !isValidIsoDate(value.scheduledAt)) return false;
  if (value.publishedAt !== undefined && !isValidIsoDate(value.publishedAt)) return false;
  if (value.publishedUrl !== undefined && !isValidHttpUrl(value.publishedUrl)) return false;
  if (!nonEmptyString(value.createdAt) || !nonEmptyString(value.updatedAt)) return false;
  // 已持久化数据也必须满足状态门禁；不满足的记录视为损坏，过滤而非返回。
  if (value.status === 'ready' && !checklistComplete(checklist)) return false;
  if (value.status === 'published') {
    if (!checklistComplete(checklist)) return false;
    if (!isValidIsoDate(value.publishedAt)) return false;
    if (!isValidHttpUrl(value.publishedUrl)) return false;
  }
  return true;
}

async function readProjectData(dataDir: string, projectId: string): Promise<CreatorReleasePackageData> {
  let source: string;
  try {
    source = await fsp.readFile(storePath(dataDir, projectId), 'utf8');
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return { releasePackages: [] };
  }
  try {
    const raw: unknown = JSON.parse(source);
    if (!isRecord(raw) || !Array.isArray(raw.releasePackages)) return { releasePackages: [] };
    return { releasePackages: raw.releasePackages.filter((release) => validReleasePackage(release, projectId)) };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return { releasePackages: [] };
    throw error;
  }
}

async function writeProjectData(
  dataDir: string,
  projectId: string,
  value: CreatorReleasePackageData,
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

export async function getCreatorReleaseProjectData(
  dataDir: string,
  projectId: string,
): Promise<CreatorReleasePackageData> {
  assertProjectId(projectId);
  return readProjectData(dataDir, projectId);
}

export async function createCreatorReleasePackage(
  dataDir: string,
  projectId: string,
  input: CreateCreatorReleasePackageRequest,
): Promise<CreatorReleasePackage> {
  assertProjectId(projectId);
  if (!isRecord(input)) throw new Error('release request is required');
  const data = await readProjectData(dataDir, projectId);
  const now = new Date().toISOString();
  const checklist = parseChecklist(input.checklist, emptyChecklist());
  const status = parseStatus(input.status, 'draft');
  // 仅使用 DTO 允许的业务字段；忽略任何运行时伪造的 id/projectId/createdAt/updatedAt。
  const release: CreatorReleasePackage = {
    id: `creator-release:${randomUUID()}`,
    projectId,
    contentId: requireId(input.contentId, 'content id'),
    platform: requirePlatform(input.platform),
    status,
    title: requireTitle(input.title),
    description: input.description === undefined ? '' : requireText(input.description, 'description'),
    tags: input.tags === undefined ? [] : parseTags(input.tags),
    ...(input.coverAssetId === undefined ? {} : { coverAssetId: requireNonEmptyString(input.coverAssetId, 'cover asset id') }),
    ...(input.exportAssetId === undefined ? {} : { exportAssetId: requireNonEmptyString(input.exportAssetId, 'export asset id') }),
    ...(input.scheduledAt === undefined ? {} : { scheduledAt: parseIsoDate(input.scheduledAt) }),
    ...(input.publishedAt === undefined ? {} : { publishedAt: parseIsoDate(input.publishedAt) }),
    ...(input.publishedUrl === undefined ? {} : { publishedUrl: parseHttpUrl(input.publishedUrl) }),
    checklist,
    createdAt: now,
    updatedAt: now,
  };
  assertStatusGate(status, checklist, release.publishedAt, release.publishedUrl);
  data.releasePackages.push(release);
  await writeProjectData(dataDir, projectId, data);
  return release;
}

export async function updateCreatorReleasePackage(
  dataDir: string,
  projectId: string,
  releaseId: string,
  patch: UpdateCreatorReleasePackageRequest,
): Promise<CreatorReleasePackage | null> {
  assertProjectId(projectId);
  requireId(releaseId, 'release id');
  if (!isRecord(patch)) throw new Error('release patch is required');
  const data = await readProjectData(dataDir, projectId);
  const index = data.releasePackages.findIndex((release) => release.id === releaseId);
  if (index < 0) return null;
  const current = data.releasePackages[index]!;
  // 先与当前 release 合并，再判断最终状态，避免局部 PATCH 绕过门禁。
  const next: CreatorReleasePackage = {
    ...current,
    ...(patch.title === undefined ? {} : { title: requireTitle(patch.title) }),
    ...(patch.status === undefined ? {} : { status: parseStatus(patch.status, current.status) }),
    ...(patch.contentId === undefined ? {} : { contentId: requireId(patch.contentId, 'content id') }),
    ...(patch.platform === undefined ? {} : { platform: requirePlatform(patch.platform) }),
    ...(patch.description === undefined ? {} : { description: requireText(patch.description, 'description') }),
    ...(patch.tags === undefined ? {} : { tags: parseTags(patch.tags) }),
    ...(patch.checklist === undefined ? {} : { checklist: parseChecklist(patch.checklist, current.checklist) }),
    updatedAt: new Date().toISOString(),
  };
  // 可空关联/时间字段的显式清空语义（undefined 保留 / null 删除 / 字符串校验写入）。
  applyNullableReleaseField(next, patch.coverAssetId, 'coverAssetId');
  applyNullableReleaseField(next, patch.exportAssetId, 'exportAssetId');
  applyNullableReleaseField(next, patch.scheduledAt, 'scheduledAt');
  applyNullableReleaseField(next, patch.publishedAt, 'publishedAt');
  applyNullableReleaseField(next, patch.publishedUrl, 'publishedUrl');
  assertStatusGate(next.status, next.checklist, next.publishedAt, next.publishedUrl);
  data.releasePackages[index] = next;
  await writeProjectData(dataDir, projectId, data);
  return next;
}

export async function deleteCreatorReleasePackage(
  dataDir: string,
  projectId: string,
  releaseId: string,
): Promise<boolean> {
  assertProjectId(projectId);
  requireId(releaseId, 'release id');
  const data = await readProjectData(dataDir, projectId);
  const next = data.releasePackages.filter((release) => release.id !== releaseId);
  if (next.length === data.releasePackages.length) return false;
  // 仅删除 release 记录，不触及内容、任务、素材或原始文件。
  await writeProjectData(dataDir, projectId, { releasePackages: next });
  return true;
}
