// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockTasksViewFetch, countWriteRequests } from './tasks-view-test-helpers';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ChatRunStatusResponse,
  CreatorContentProjectData,
  CreatorPerformanceProjectData,
  CreatorPerformanceSnapshot,
  CreatorReleaseChecklist,
  CreatorReleasePackage,
  CreatorReleasePackageData,
  CreatorReleasePlatform,
  Project,
  Routine,
} from '@open-design/contracts';

import { TasksView } from '../../src/components/TasksView';
import * as router from '../../src/router';

type CreatorProjectData = {
  tasks: Array<{
    id: string;
    projectId: string;
    title: string;
    stage: string;
    status: string;
    priority: string;
    description?: string;
    blockerNote?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  activities: Array<{
    id: string;
    projectId: string;
    taskId?: string;
    category: string;
    title: string;
    createdAt: string;
  }>;
};

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;


function makeRelease(overrides: Partial<CreatorReleasePackage> = {}): CreatorReleasePackage {
  return {
    id: 'creator-release:1',
    projectId: 'project-release-1',
    contentId: 'creator-content:1',
    platform: 'bilibili',
    status: 'draft',
    title: '首发短片',
    description: '',
    tags: [],
    coverAssetId: undefined,
    exportAssetId: undefined,
    scheduledAt: undefined,
    publishedAt: undefined,
    publishedUrl: undefined,
    checklist: { contentComplete: false, exportConfirmed: false, coverConfirmed: false, metadataConfirmed: false, platformConfirmed: false },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePublishedRelease(overrides: Partial<CreatorReleasePackage> = {}): CreatorReleasePackage {
  return makeRelease({
    status: 'published',
    checklist: { contentComplete: true, exportConfirmed: true, coverConfirmed: true, metadataConfirmed: true, platformConfirmed: true },
    publishedAt: '2026-07-01T00:00:00.000Z',
    publishedUrl: 'https://www.bilibili.com/video/BV1',
    ...overrides,
  });
}

function makeSnapshot(
  overrides: Partial<CreatorPerformanceSnapshot> & {
    id: string;
    projectId: string;
    releaseId: string;
    capturedAt: string;
  },
): CreatorPerformanceSnapshot {
  return {
    source: 'manual',
    metrics: {},
    createdAt: overrides.capturedAt,
    ...overrides,
  };
}

// CW-05: 读取 Performance overview 区域内表体行的 releaseId 顺序，用于断言排序与筛选。
function performanceOverviewReleaseOrder(overview: HTMLElement): string[] {
  return Array.from(overview.querySelectorAll('tbody tr')).map((row) => row.getAttribute('data-release-id') ?? '');
}

function performanceOverviewRowByReleaseId(overview: HTMLElement, releaseId: string): HTMLElement {
  const row = overview.querySelector(`tbody tr[data-release-id="${releaseId}"]`);
  if (!row) throw new Error(`performance overview row not found: ${releaseId}`);
  return row as HTMLElement;
}


// CW-06: 读取 Release schedule 区域内所有排期项的 releaseId 顺序（跨日期组，按文档顺序）。
function releaseScheduleItemOrder(region: HTMLElement): string[] {
  return Array.from(region.querySelectorAll('li[data-release-id]')).map((li) => li.getAttribute('data-release-id') ?? '');
}
// CW-06: 读取日期组顺序（group 的本地日期键）。
function releaseScheduleGroupDates(region: HTMLElement): string[] {
  return Array.from(region.querySelectorAll('[data-testid="creator-release-schedule-group"]')).map(
    (g) => g.getAttribute('data-group-date') ?? '',
  );
}
function releaseScheduleItemByReleaseId(region: HTMLElement, releaseId: string): HTMLElement {
  const li = region.querySelector(`li[data-release-id="${releaseId}"]`);
  if (!li) throw new Error(`release schedule item not found: ${releaseId}`);
  return li as HTMLElement;
}


describe('TasksView creator content', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (typeof globalThis !== 'undefined' && typeof (globalThis as { gc?: () => void }).gc === 'function') {
      (globalThis as { gc?: () => void }).gc!();
    }
  });

  it('creates a content project and saves its brief, outline, storyboard, and retrospective', async () => {
    const creatorProject: Project = {
      id: 'project-content-1', name: '内容项目', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    };
    const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
    mockTasksViewFetch({ creatorProjects: [creatorProject] });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/projects/project-content-1/creator-content' && init?.method === 'POST') {
        writes.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return new Response(JSON.stringify({ content: {
          id: 'creator-content:1', projectId: creatorProject.id, title: '校园黄昏短片', status: 'idea',
          brief: {}, outline: {}, storyboardItems: [], retrospective: {}, taskIds: [],
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        } }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/projects/project-content-1/creator-content/creator-content%3A1' && init?.method === 'PATCH') {
        writes.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.change(screen.getByLabelText('Content title'), { target: { value: '校园黄昏短片' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create content' }));
    fireEvent.change(await screen.findByLabelText('Brief topic'), { target: { value: '毕业前的傍晚' } });
    fireEvent.change(screen.getByLabelText('Outline opening'), { target: { value: '下课铃' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add storyboard item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add storyboard item' }));
    fireEvent.change(screen.getAllByLabelText('Storyboard purpose')[0]!, { target: { value: '建立时间' } });
    fireEvent.change(screen.getAllByLabelText('Storyboard purpose')[1]!, { target: { value: '跟拍离开教室' } });
    fireEvent.change(screen.getByLabelText('Retrospective learnings'), { target: { value: '保留环境声' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save content' }));

    await waitFor(() => expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: '/api/projects/project-content-1/creator-content', body: { title: '校园黄昏短片', status: 'idea' } }),
      expect.objectContaining({ url: '/api/projects/project-content-1/creator-content/creator-content%3A1', body: expect.objectContaining({
        brief: expect.objectContaining({ topic: '毕业前的傍晚' }),
        outline: expect.objectContaining({ opening: '下课铃' }),
        storyboardItems: expect.arrayContaining([expect.objectContaining({ purpose: '建立时间' }), expect.objectContaining({ purpose: '跟拍离开教室' })]),
        retrospective: expect.objectContaining({ learnings: '保留环境声' }),
      }) }),
    ])));
  });

  it('shows missing storyboard media and never offers it as a new candidate', async () => {
    const creatorProject: Project = { id: 'project-content-media-1', name: '内容素材项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-content-media-1': { contentProjects: [{
        id: 'creator-content:1', projectId: creatorProject.id, title: '校园黄昏短片', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [],
        storyboardItems: [{ id: 'creator-storyboard:1', position: 1, purpose: '开场', mediaAssetIds: ['creator-media:missing'], createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorMediaData: { 'project-content-media-1': { assets: [
        { id: 'creator-media:missing', fileName: 'missing.jpg', kind: 'image', relativePath: 'missing.jpg', availability: 'missing' },
        { id: 'creator-media:available', fileName: 'available.jpg', kind: 'image', relativePath: 'available.jpg', availability: 'available' },
      ], taskLinks: [] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit content 校园黄昏短片' }));
    expect(screen.getAllByText('Missing').length).toBeGreaterThan(0);
    const candidates = screen.getByLabelText('Storyboard media candidate');
    expect(within(candidates).queryByRole('option', { name: 'missing.jpg' })).toBeNull();
      expect(within(candidates).getByRole('option', { name: 'available.jpg' })).toBeTruthy();
  });

  it('shows a missing asset hint in the content list before opening the editor', async () => {
    const creatorProject: Project = { id: 'project-content-missing-hint-1', name: '缺失素材提示项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-content-missing-hint-1': { contentProjects: [
        {
          id: 'creator-content:missing', projectId: creatorProject.id, title: '有缺失素材的内容', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [],
          storyboardItems: [{ id: 'creator-storyboard:missing', position: 1, purpose: '开场', mediaAssetIds: ['creator-media:missing'], createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }],
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'creator-content:ok', projectId: creatorProject.id, title: '资料齐全的内容', status: 'idea', brief: {}, outline: {}, retrospective: {}, taskIds: [],
          storyboardItems: [{ id: 'creator-storyboard:ok', position: 1, purpose: '开场', mediaAssetIds: ['creator-media:available'], createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }],
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'creator-content:empty', projectId: creatorProject.id, title: '无素材的内容', status: 'idea', brief: {}, outline: {}, retrospective: {}, taskIds: [],
          storyboardItems: [],
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
      ] } },
      creatorMediaData: { 'project-content-missing-hint-1': { assets: [
        { id: 'creator-media:missing', fileName: 'missing.jpg', kind: 'image', relativePath: 'missing.jpg', availability: 'missing' },
        { id: 'creator-media:available', fileName: 'available.jpg', kind: 'image', relativePath: 'available.jpg', availability: 'available' },
      ], taskLinks: [] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));

    // The missing-asset content surfaces the hint before the editor opens.
    expect(await screen.findByText('1 missing asset')).toBeTruthy();
    // Available-only and asset-less content are listed but carry no hint.
    expect(screen.getAllByText('资料齐全的内容').length).toBeGreaterThan(0);
    expect(screen.getAllByText('无素材的内容').length).toBeGreaterThan(0);
    // Exactly one missing-asset chip exists: only the missing-media content shows it.
    expect(screen.getAllByText(/missing asset/i).length).toBe(1);
  });

  it('asks for confirmation before deleting a content project', async () => {
    const creatorProject: Project = { id: 'project-content-delete-1', name: '删除内容项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const deleteCalls: string[] = [];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockTasksViewFetch({ creatorProjects: [creatorProject], creatorContentData: { 'project-content-delete-1': { contentProjects: [{
      id: 'creator-content:1', projectId: creatorProject.id, title: '校园黄昏短片', status: 'idea', brief: {}, outline: {}, storyboardItems: [], retrospective: {}, taskIds: [],
      createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    }] } } });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === '/api/projects/project-content-delete-1/creator-content/creator-content%3A1' && init?.method === 'DELETE') {
        deleteCalls.push(input.toString());
        return new Response(null, { status: 204 });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete content 校园黄昏短片' }));
    expect(deleteCalls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete content 校园黄昏短片' }));
    await waitFor(() => expect(deleteCalls).toEqual(['/api/projects/project-content-delete-1/creator-content/creator-content%3A1']));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('degrades creator content when the content API fails but keeps tasks and media usable', async () => {
    const creatorProject: Project = {
      id: 'project-content-fail-1', name: '内容失败项目', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentFailures: ['project-content-fail-1'],
      creatorProjectData: { 'project-content-fail-1': { tasks: [{
        id: 'creator-task:1', projectId: creatorProject.id, title: 'surviving task', stage: 'topic', status: 'todo',
        priority: 'medium', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }], activities: [] } },
      creatorMediaData: { 'project-content-fail-1': { assets: [
        { id: 'creator-media:1', fileName: 'clip.mp4', kind: 'video', relativePath: 'media/clip.mp4', availability: 'available' },
      ], taskLinks: [] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect((await screen.findAllByText('Content unavailable for this project.')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('surviving task').length).toBeGreaterThan(0);
    expect(screen.getAllByText('clip.mp4').length).toBeGreaterThan(0);
  });

});
