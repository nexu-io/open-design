import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCreatorActivity,
  createCreatorTask,
  getCreatorWorkbenchProjectData,
  updateCreatorTask,
} from '../src/creator-workbench-store.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-creator-workbench-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('creator workbench store', () => {
  it('persists a task and project activity across reads', async () => {
    const task = await createCreatorTask(dataDir, 'project-1', {
      title: '整理校园素材',
      description: '筛出可用于短片的镜头。',
      stage: 'material',
      status: 'ready',
      priority: 'high',
      sourceType: 'manual',
    });
    const activity = await createCreatorActivity(dataDir, 'project-1', {
      taskId: task.id,
      category: 'material',
      title: '素材任务已创建',
      summary: '等待开始整理。',
    });

    const data = await getCreatorWorkbenchProjectData(dataDir, 'project-1');

    expect(data.tasks).toEqual([expect.objectContaining({
      id: task.id,
      projectId: 'project-1',
      stage: 'material',
      status: 'ready',
      priority: 'high',
    })]);
    expect(data.activities).toEqual([expect.objectContaining({
      id: activity.id,
      taskId: task.id,
      category: 'material',
    })]);
  });

  it('updates task progress without changing its identity or creation time', async () => {
    const task = await createCreatorTask(dataDir, 'project-2', {
      title: '剪辑第一版',
    });

    const updated = await updateCreatorTask(dataDir, 'project-2', task.id, {
      stage: 'editing',
      status: 'done',
      priority: 'low',
    });

    expect(updated).toMatchObject({
      id: task.id,
      createdAt: task.createdAt,
      stage: 'editing',
      status: 'done',
      priority: 'low',
    });
    expect((await getCreatorWorkbenchProjectData(dataDir, 'project-2')).tasks[0]).toEqual(updated);
  });

  it('rejects invalid workflow values and activities for missing tasks', async () => {
    await expect(createCreatorTask(dataDir, 'project-3', {
      title: '非法阶段',
      stage: 'unknown' as never,
    })).rejects.toThrow('invalid task stage');

    await expect(createCreatorActivity(dataDir, 'project-3', {
      taskId: 'missing-task',
      category: 'editing',
      title: '不应创建',
    })).rejects.toThrow('creator task not found');
  });

  it('keeps data isolated by project id', async () => {
    await createCreatorTask(dataDir, 'project-a', { title: 'A' });
    await createCreatorTask(dataDir, 'project-b', { title: 'B' });

    await expect(getCreatorWorkbenchProjectData(dataDir, 'project-a')).resolves.toMatchObject({
      tasks: [expect.objectContaining({ title: 'A' })],
    });
    await expect(getCreatorWorkbenchProjectData(dataDir, 'project-b')).resolves.toMatchObject({
      tasks: [expect.objectContaining({ title: 'B' })],
    });
  });
});
