import { describe, expect, it, vi } from 'vitest';

import type { FalMediaRequest } from '../../src/production-generation/fal';
import {
  buildFalMediaRequest,
  cancelFalMediaJob,
  cancelFalMediaTask,
  createFalMediaJob,
  planFalMediaJobs,
  submitFalMediaJob,
  waitForFalMediaJob,
} from '../../src/production-generation/fal';
import { updateProductionMediaJobStatus } from '../../src/production-generation/state';

describe('fal media adapter', () => {
  it('maps a storyboard shot into a FAL.ai media job request', () => {
    const request: FalMediaRequest = buildFalMediaRequest({
      provider: 'fal',
      kind: 'image',
      shotId: 'hook',
      prompt: 'Bold title card with one sample image',
      model: 'fal/flux-pro',
    });

    expect(request.provider).toBe('fal');
    expect(request.kind).toBe('image');
    expect(request.prompt).toContain('Bold title card');
  });

  it('creates and updates a media job without touching the segment graph', () => {
    const job = createFalMediaJob({
      id: 'job-1',
      segmentId: 'hook',
      kind: 'video',
      model: 'fal/kling-pro',
      prompt: 'Hook shot to short video',
      referenceAssetIds: ['asset-1'],
    });

    expect(job.status).toBe('idle');
    expect(job.provider).toBe('fal');
    expect(job.referenceAssetIds).toEqual(['asset-1']);

    const running = updateProductionMediaJobStatus(job, 'running', {});
    expect(running.status).toBe('running');

    const completed = updateProductionMediaJobStatus(running, 'completed', {
      resultAssetIds: ['asset-output-1'],
    });
    expect(completed.status).toBe('completed');
    expect(completed.resultAssetIds).toEqual(['asset-output-1']);
  });

  it('plans queued FAL.ai jobs from storyboard segments', () => {
    const jobs = planFalMediaJobs({
      segments: [
        {
          id: 'hook',
          label: 'Hook',
          paragraph: 'Open with the question the viewer cares about.',
          narration: '專業講解者 (professional) 旁白：Open with the question the viewer cares about.',
          shot: '鏡頭：Open with the question the viewer cares about.',
          assets: '素材：Use a bold title card and one sample image.',
          output: '成片：Open with the question the viewer cares about.',
          voiceProfileId: 'guide-host',
        },
      ],
      kind: 'image',
      model: 'fal/flux-pro',
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('queued');
    expect(jobs[0]?.kind).toBe('image');
    expect(jobs[0]?.prompt).toContain('Open with the question the viewer cares about.');
  });

  it('uses a video-first default model when planning a video queue', () => {
    const jobs = planFalMediaJobs({
      segments: [
        {
          id: 'hook',
          label: 'Hook',
          paragraph: 'Open with a motion cue.',
          narration: '專業講解者 (professional) 旁白：Open with a motion cue.',
          shot: '鏡頭：Open with a motion cue.',
          assets: '素材：Need a motion clip.',
          output: '成片：Open with a motion cue.',
          voiceProfileId: 'guide-host',
        },
      ],
      kind: 'video',
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe('video');
    expect(jobs[0]?.model).toBe('fal/wan-2.1-t2v');
  });

  it('plans 3D jobs as explicit plan-only jobs', () => {
    const jobs = planFalMediaJobs({
      segments: [
        {
          id: 'hook',
          label: 'Hook',
          paragraph: 'Open with a turntable view.',
          narration: '專業講解者 (professional) 旁白：Open with a turntable view.',
          shot: '鏡頭：Open with a turntable view.',
          assets: '素材：Use a hero render.',
          output: '成片：Open with a turntable view.',
          voiceProfileId: 'guide-host',
        },
      ],
      kind: '3d',
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe('3d');
    expect(jobs[0]?.provider).toBe('blender');
    expect(jobs[0]?.planOnly).toBe(true);
    expect(jobs[0]?.plan?.engine).toBe('blender');
    expect(jobs[0]?.plan?.sceneSummary).toContain('Open with a turntable view.');
  });

  it('submits and polls a daemon media task', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/media/generate')) {
        return new Response(JSON.stringify({ taskId: 'task-123', status: 'queued', startedAt: 111 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          taskId: 'task-123',
          status: 'done',
          startedAt: 111,
          endedAt: 222,
          progress: ['task-123 accepted; polling…'],
          nextSince: 1,
          file: { name: 'render.mp4' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    const initial = createFalMediaJob({
      id: 'job-1',
      segmentId: 'hook',
      kind: 'video',
      model: 'fal/wan-2.1-t2v',
      prompt: 'Hook shot to short video',
    });
    const submitted = await submitFalMediaJob({
      projectId: 'project-1',
      job: initial,
      fetchImpl: fetchImpl as never,
    });
    const polled = await waitForFalMediaJob({
      job: submitted,
      fetchImpl: fetchImpl as never,
      since: submitted.progress.length,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(submitted.taskId).toBe('task-123');
    expect(submitted.status).toBe('queued');
    expect(polled.job.status).toBe('completed');
    expect(polled.job.file).toEqual({ name: 'render.mp4' });
    expect(polled.snapshot.status).toBe('done');
  });

  it('rejects attempts to submit plan-only 3D jobs to FAL.ai', async () => {
    const job = createFalMediaJob({
      id: 'job-3d',
      segmentId: 'hook',
      kind: '3d',
      model: 'blender/plan-only',
      prompt: '3D prompt',
    });

    await expect(
      submitFalMediaJob({
        projectId: 'project-1',
        job,
        fetchImpl: vi.fn() as never,
      }),
    ).rejects.toThrow('plan-only');
  });

  it('marks a queued job as canceled locally', () => {
    const job = createFalMediaJob({
      id: 'job-2',
      segmentId: 'body',
      kind: 'image',
      model: 'fal/flux-pro',
      prompt: 'Body card',
    });

    const canceled = cancelFalMediaJob(job);
    expect(canceled.status).toBe('canceled');
    expect(canceled.error).toBe('Canceled by user.');
  });

  it('cancels a daemon media task and maps interrupted back to canceled', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/cancel')) {
        return new Response(
          JSON.stringify({
            taskId: 'task-123',
            status: 'interrupted',
            startedAt: 111,
            endedAt: 222,
            progress: ['cancelled by user'],
            nextSince: 1,
            error: { message: 'media task canceled by user', code: 'USER_CANCELLED' },
          }),
          {
            status: 202,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      return new Response(JSON.stringify({ taskId: 'task-123', status: 'queued', startedAt: 111 }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    });

    const job = createFalMediaJob({
      id: 'job-3',
      segmentId: 'hook',
      kind: 'image',
      model: 'fal/flux-pro',
      prompt: 'Hook prompt',
    });
    const canceled = await cancelFalMediaTask({
      projectId: 'project-1',
      job: {
        ...job,
        taskId: 'task-123',
        status: 'running',
        progress: ['accepted'],
      },
      fetchImpl: fetchImpl as never,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(canceled.status).toBe('canceled');
    expect(canceled.error).toBe('media task canceled by user');
    expect(canceled.progress).toContain('cancelled by user');
  });
});
