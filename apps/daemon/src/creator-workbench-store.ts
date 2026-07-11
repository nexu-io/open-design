import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  CreateCreatorActivityRequest,
  CreateCreatorTaskRequest,
  CreatorActivityRecord,
  CreatorTaskRecord,
  CreatorWorkbenchProjectData,
  UpdateCreatorTaskRequest,
} from '@open-design/contracts';
import type {
  CreatorTaskPriority,
  CreatorTaskStage,
  CreatorTaskStatus,
} from '@open-design/contracts';

const STAGES = new Set(["topic", "material", "editing", "release", "review"]);
const STATUSES = new Set(["todo", "ready", "blocked", "done"]);
const PRIORITIES = new Set(["low", "medium", "high"]);

function storePath(dataDir: string, projectId: string): string {
  return path.join(dataDir, 'creator-workbench', `${projectId}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTask(value: unknown): value is CreatorTaskRecord {
  if (!isRecord(value)) return false;
  return isString(value.id) && isString(value.projectId) && isString(value.title)
    && isString(value.createdAt) && isString(value.updatedAt)
    && STAGES.has(String(value.stage)) && STATUSES.has(String(value.status))
    && PRIORITIES.has(String(value.priority));
}

function validActivity(value: unknown): value is CreatorActivityRecord {
  if (!isRecord(value)) return false;
  return isString(value.id) && isString(value.projectId) && isString(value.title)
    && isString(value.createdAt) && STAGES.has(String(value.category));
}

async function readProjectData(dataDir: string, projectId: string): Promise<CreatorWorkbenchProjectData> {
  try {
    const raw: unknown = JSON.parse(await fsp.readFile(storePath(dataDir, projectId), 'utf8'));
    if (!isRecord(raw)) return { tasks: [], activities: [] };
    return {
      tasks: Array.isArray(raw.tasks) ? raw.tasks.filter(validTask) : [],
      activities: Array.isArray(raw.activities) ? raw.activities.filter(validActivity) : [],
    };
  } catch {
    return { tasks: [], activities: [] };
  }
}

async function writeProjectData(
  dataDir: string,
  projectId: string,
  value: CreatorWorkbenchProjectData,
): Promise<void> {
  const file = storePath(dataDir, projectId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, file);
}

function requireTitle(value: unknown, field: string): string {
  if (!isString(value)) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseStage(value: unknown, fallback: CreatorTaskStage): CreatorTaskStage {
  if (value === undefined) return fallback;
  if (!STAGES.has(String(value))) throw new Error('invalid task stage');
  return value as CreatorTaskStage;
}

function parseStatus(value: unknown, fallback: CreatorTaskStatus): CreatorTaskStatus {
  if (value === undefined) return fallback;
  if (!STATUSES.has(String(value))) throw new Error('invalid task status');
  return value as CreatorTaskStatus;
}

function parsePriority(value: unknown, fallback: CreatorTaskPriority): CreatorTaskPriority {
  if (value === undefined) return fallback;
  if (!PRIORITIES.has(String(value))) throw new Error('invalid task priority');
  return value as CreatorTaskPriority;
}

export async function getCreatorWorkbenchProjectData(
  dataDir: string,
  projectId: string,
): Promise<CreatorWorkbenchProjectData> {
  return readProjectData(dataDir, projectId);
}

export async function createCreatorTask(
  dataDir: string,
  projectId: string,
  input: CreateCreatorTaskRequest,
): Promise<CreatorTaskRecord> {
  const title = requireTitle(input?.title, 'task title');
  const stage = parseStage(input.stage, 'topic');
  const status = parseStatus(input.status, 'todo');
  const priority = parsePriority(input.priority, 'medium');
  const description = optionalText(input.description);
  const sourceType = optionalText(input.sourceType);
  const data = await readProjectData(dataDir, projectId);
  const now = new Date().toISOString();
  const task: CreatorTaskRecord = {
    id: `creator-task:${randomUUID()}`,
    projectId,
    title,
    ...(description === undefined ? {} : { description }),
    stage,
    status,
    priority,
    ...(sourceType === undefined ? {} : { sourceType }),
    createdAt: now,
    updatedAt: now,
  };
  data.tasks.push(task);
  await writeProjectData(dataDir, projectId, data);
  return task;
}

export async function updateCreatorTask(
  dataDir: string,
  projectId: string,
  taskId: string,
  patch: UpdateCreatorTaskRequest,
): Promise<CreatorTaskRecord | null> {
  if (!isRecord(patch)) throw new Error('task patch is required');
  const title = patch.title === undefined ? undefined : requireTitle(patch.title, 'task title');
  const stage = patch.stage === undefined ? undefined : parseStage(patch.stage, 'topic');
  const status = patch.status === undefined ? undefined : parseStatus(patch.status, 'todo');
  const priority = patch.priority === undefined ? undefined : parsePriority(patch.priority, 'medium');
  const description = patch.description === undefined ? undefined : optionalText(patch.description);
  const data = await readProjectData(dataDir, projectId);
  const index = data.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const current = data.tasks[index]!;
  const next: CreatorTaskRecord = {
    ...current,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(stage === undefined ? {} : { stage }),
    ...(status === undefined ? {} : { status }),
    ...(priority === undefined ? {} : { priority }),
    updatedAt: new Date().toISOString(),
  };
  data.tasks[index] = next;
  await writeProjectData(dataDir, projectId, data);
  return next;
}

export async function createCreatorActivity(
  dataDir: string,
  projectId: string,
  input: CreateCreatorActivityRequest,
): Promise<CreatorActivityRecord> {
  const title = requireTitle(input?.title, 'activity title');
  const category = parseStage(input.category, 'topic');
  const taskId = optionalText(input.taskId);
  const summary = optionalText(input.summary);
  const data = await readProjectData(dataDir, projectId);
  if (taskId && !data.tasks.some((task) => task.id === taskId)) {
    throw new Error('creator task not found');
  }
  const activity: CreatorActivityRecord = {
    id: `creator-activity:${randomUUID()}`,
    projectId,
    ...(taskId === undefined ? {} : { taskId }),
    category,
    title,
    ...(summary === undefined ? {} : { summary }),
    createdAt: new Date().toISOString(),
  };
  data.activities.push(activity);
  await writeProjectData(dataDir, projectId, data);
  return activity;
}
