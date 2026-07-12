import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  CreateCreatorContentRequest,
  CreatorContentBrief,
  CreatorContentOutline,
  CreatorContentProject,
  CreatorContentProjectData,
  CreatorContentStatus,
  CreatorRetrospective,
  CreatorStoryboardItem,
  CreatorStoryboardItemInput,
  UpdateCreatorContentRequest,
} from '@open-design/contracts';

const STATUSES = new Set<CreatorContentStatus>(['idea', 'drafting', 'production', 'published', 'archived']);

function storePath(dataDir: string, projectId: string): string {
  assertProjectId(projectId);
  const contentDirectory = path.resolve(dataDir, 'creator-content');
  const file = path.resolve(contentDirectory, `${projectId}.json`);
  const relative = path.relative(contentDirectory, file);
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

function requireLinkId(value: string, field: string): void {
  if (!nonEmptyString(value)) throw new Error(`${field} is required`);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validStoryboardItem(value: unknown): value is CreatorStoryboardItem {
  if (!isRecord(value)) return false;
  return nonEmptyString(value.id) && typeof value.position === 'number' && Number.isInteger(value.position) && value.position > 0
    && nonEmptyString(value.purpose) && Array.isArray(value.mediaAssetIds)
    && value.mediaAssetIds.every(nonEmptyString) && new Set(value.mediaAssetIds).size === value.mediaAssetIds.length
    && nonEmptyString(value.createdAt) && nonEmptyString(value.updatedAt);
}

function validContentProject(value: unknown): value is CreatorContentProject {
  if (!isRecord(value)) return false;
  return nonEmptyString(value.id) && nonEmptyString(value.projectId) && nonEmptyString(value.title)
    && STATUSES.has(value.status as CreatorContentStatus) && isRecord(value.brief) && isRecord(value.outline)
    && Array.isArray(value.storyboardItems) && value.storyboardItems.every(validStoryboardItem)
    && isRecord(value.retrospective) && Array.isArray(value.taskIds) && value.taskIds.every(nonEmptyString)
    && new Set(value.taskIds).size === value.taskIds.length
    && nonEmptyString(value.createdAt) && nonEmptyString(value.updatedAt);
}

async function readProjectData(dataDir: string, projectId: string): Promise<CreatorContentProjectData> {
  let source: string;
  try {
    source = await fsp.readFile(storePath(dataDir, projectId), 'utf8');
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    return { contentProjects: [] };
  }
  try {
    const raw: unknown = JSON.parse(source);
    if (!isRecord(raw) || !Array.isArray(raw.contentProjects)) return { contentProjects: [] };
    return {
      contentProjects: raw.contentProjects.filter(validContentProject).map((content) => ({
        ...content,
        storyboardItems: [...content.storyboardItems].sort((left, right) => left.position - right.position),
      })),
    };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return { contentProjects: [] };
    throw error;
  }
}

async function writeProjectData(
  dataDir: string,
  projectId: string,
  value: CreatorContentProjectData,
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

function requireTitle(value: unknown): string {
  if (!nonEmptyString(value)) throw new Error('content title is required');
  return value.trim();
}

function parseStatus(value: unknown, fallback: CreatorContentStatus): CreatorContentStatus {
  if (value === undefined) return fallback;
  if (!STATUSES.has(value as CreatorContentStatus)) throw new Error('invalid content status');
  return value as CreatorContentStatus;
}

function textObject<T extends object>(
  value: unknown,
  fields: readonly (keyof T)[],
): T {
  if (!isRecord(value)) return {} as T;
  return Object.fromEntries(fields.flatMap((field) => {
    const text = optionalText(value[field as string]);
    return text === undefined ? [] : [[field, text]];
  })) as T;
}

function parseStoryboardItems(
  inputs: CreatorStoryboardItemInput[],
  existing: CreatorStoryboardItem[],
): CreatorStoryboardItem[] {
  const existingByPosition = new Map(existing.map((item) => [item.position, item]));
  const positions = new Set<number>();
  const now = new Date().toISOString();
  const items = inputs.map((input) => {
    if (!Number.isInteger(input.position) || input.position <= 0) {
      throw new Error('storyboard position must be positive');
    }
    if (positions.has(input.position)) throw new Error('storyboard position must be unique');
    positions.add(input.position);
    if (!nonEmptyString(input.purpose)) throw new Error('storyboard purpose is required');
    const mediaAssetIds = input.mediaAssetIds ?? [];
    if (!Array.isArray(mediaAssetIds) || !mediaAssetIds.every(nonEmptyString)
      || new Set(mediaAssetIds).size !== mediaAssetIds.length) {
      throw new Error('storyboard media asset ids must be unique');
    }
    const current = existingByPosition.get(input.position);
    const visualDescription = optionalText(input.visualDescription);
    const audioNotes = optionalText(input.audioNotes);
    return {
      id: current?.id ?? `creator-storyboard:${randomUUID()}`,
      position: input.position,
      purpose: input.purpose.trim(),
      ...(visualDescription === undefined ? {} : { visualDescription }),
      ...(audioNotes === undefined ? {} : { audioNotes }),
      mediaAssetIds: [...mediaAssetIds],
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    } satisfies CreatorStoryboardItem;
  });
  return items.sort((left, right) => left.position - right.position);
}

function requireContent(data: CreatorContentProjectData, contentId: string): CreatorContentProject {
  const content = data.contentProjects.find((item) => item.id === contentId);
  if (!content) throw new Error('creator content not found');
  return content;
}

export async function getCreatorContentProjectData(
  dataDir: string,
  projectId: string,
): Promise<CreatorContentProjectData> {
  assertProjectId(projectId);
  return readProjectData(dataDir, projectId);
}

export async function createCreatorContent(
  dataDir: string,
  projectId: string,
  input: CreateCreatorContentRequest,
): Promise<CreatorContentProject> {
  assertProjectId(projectId);
  const data = await readProjectData(dataDir, projectId);
  const now = new Date().toISOString();
  const content: CreatorContentProject = {
    id: `creator-content:${randomUUID()}`,
    projectId,
    title: requireTitle(input?.title),
    status: parseStatus(input?.status, 'idea'),
    brief: {},
    outline: {},
    storyboardItems: [],
    retrospective: {},
    taskIds: [],
    createdAt: now,
    updatedAt: now,
  };
  data.contentProjects.push(content);
  await writeProjectData(dataDir, projectId, data);
  return content;
}

export async function updateCreatorContent(
  dataDir: string,
  projectId: string,
  contentId: string,
  patch: UpdateCreatorContentRequest,
): Promise<CreatorContentProject | null> {
  assertProjectId(projectId);
  if (!isRecord(patch)) throw new Error('content patch is required');
  const data = await readProjectData(dataDir, projectId);
  const index = data.contentProjects.findIndex((content) => content.id === contentId);
  if (index < 0) return null;
  const current = data.contentProjects[index]!;
  if (patch.storyboardItems !== undefined && !Array.isArray(patch.storyboardItems)) {
    throw new Error('storyboard items must be an array');
  }
  const storyboardItems = patch.storyboardItems === undefined
    ? undefined
    : parseStoryboardItems(patch.storyboardItems as CreatorStoryboardItemInput[], current.storyboardItems);
  const next: CreatorContentProject = {
    ...current,
    ...(patch.title === undefined ? {} : { title: requireTitle(patch.title) }),
    ...(patch.status === undefined ? {} : { status: parseStatus(patch.status, current.status) }),
    ...(patch.brief === undefined ? {} : { brief: textObject<CreatorContentBrief>(patch.brief, ['topic', 'audience', 'coreMessage', 'targetPlatform']) }),
    ...(patch.outline === undefined ? {} : { outline: textObject<CreatorContentOutline>(patch.outline, ['opening', 'sections', 'ending', 'editingIntent']) }),
    ...(storyboardItems === undefined ? {} : { storyboardItems }),
    ...(patch.retrospective === undefined ? {} : { retrospective: textObject<CreatorRetrospective>(patch.retrospective, ['publishedAt', 'performanceSummary', 'learnings', 'nextAction']) }),
    updatedAt: new Date().toISOString(),
  };
  data.contentProjects[index] = next;
  await writeProjectData(dataDir, projectId, data);
  return next;
}

export async function deleteCreatorContent(dataDir: string, projectId: string, contentId: string): Promise<boolean> {
  assertProjectId(projectId);
  const data = await readProjectData(dataDir, projectId);
  const next = data.contentProjects.filter((content) => content.id !== contentId);
  if (next.length === data.contentProjects.length) return false;
  await writeProjectData(dataDir, projectId, { contentProjects: next });
  return true;
}

export async function linkCreatorContentTask(
  dataDir: string,
  projectId: string,
  contentId: string,
  taskId: string,
): Promise<CreatorContentProject> {
  assertProjectId(projectId);
  requireLinkId(taskId, 'task id');
  const data = await readProjectData(dataDir, projectId);
  const content = requireContent(data, contentId);
  if (!content.taskIds.includes(taskId)) content.taskIds.push(taskId);
  content.updatedAt = new Date().toISOString();
  await writeProjectData(dataDir, projectId, data);
  return content;
}

export async function unlinkCreatorContentTask(
  dataDir: string,
  projectId: string,
  contentId: string,
  taskId: string,
): Promise<CreatorContentProject> {
  assertProjectId(projectId);
  requireLinkId(taskId, 'task id');
  const data = await readProjectData(dataDir, projectId);
  const content = requireContent(data, contentId);
  content.taskIds = content.taskIds.filter((item) => item !== taskId);
  content.updatedAt = new Date().toISOString();
  await writeProjectData(dataDir, projectId, data);
  return content;
}

export async function linkCreatorStoryboardMedia(
  dataDir: string,
  projectId: string,
  contentId: string,
  itemId: string,
  assetId: string,
): Promise<CreatorContentProject> {
  assertProjectId(projectId);
  requireLinkId(itemId, 'storyboard item id');
  requireLinkId(assetId, 'media asset id');
  const data = await readProjectData(dataDir, projectId);
  const content = requireContent(data, contentId);
  const item = content.storyboardItems.find((storyboardItem) => storyboardItem.id === itemId);
  if (!item) throw new Error('creator storyboard item not found');
  if (!item.mediaAssetIds.includes(assetId)) item.mediaAssetIds.push(assetId);
  const now = new Date().toISOString();
  item.updatedAt = now;
  content.updatedAt = now;
  await writeProjectData(dataDir, projectId, data);
  return content;
}

export async function unlinkCreatorStoryboardMedia(
  dataDir: string,
  projectId: string,
  contentId: string,
  itemId: string,
  assetId: string,
): Promise<CreatorContentProject> {
  assertProjectId(projectId);
  requireLinkId(itemId, 'storyboard item id');
  requireLinkId(assetId, 'media asset id');
  const data = await readProjectData(dataDir, projectId);
  const content = requireContent(data, contentId);
  const item = content.storyboardItems.find((storyboardItem) => storyboardItem.id === itemId);
  if (!item) throw new Error('creator storyboard item not found');
  item.mediaAssetIds = item.mediaAssetIds.filter((mediaAssetId) => mediaAssetId !== assetId);
  const now = new Date().toISOString();
  item.updatedAt = now;
  content.updatedAt = now;
  await writeProjectData(dataDir, projectId, data);
  return content;
}
