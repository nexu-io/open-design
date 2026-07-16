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


describe('TasksView release', () => {
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

  it('reads release list per project and sends a create body limited to contentId, platform, and title', async () => {
    const creatorProject: Project = { id: 'project-release-1', name: '发布项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-release-1': { contentProjects: [{
        id: 'creator-content:1', projectId: 'project-release-1', title: '校园短片', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const contentSelect = await screen.findByLabelText('Release content');
    await screen.findByRole('option', { name: '校园短片' });
    fireEvent.change(contentSelect, { target: { value: 'creator-content:1' } });
    fireEvent.change(screen.getByLabelText('Release title'), { target: { value: '首发短片' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create release' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith('/creator-release-packages') && (call[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const sent = JSON.parse(String((postCall![1] as RequestInit).body));
      expect(sent).toEqual({ contentId: 'creator-content:1', platform: 'bilibili', title: '首发短片' });
    });
    // The new package appears in the project's release list.
    expect(await screen.findByText('首发短片')).toBeTruthy();
  });

  it('sends null to clear optional release fields on save', async () => {
    const creatorProject: Project = { id: 'project-release-2', name: '空字段发布', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({
      id: 'creator-release:2', projectId: 'project-release-2', title: '待清空',
      coverAssetId: 'creator-media:cover',
      scheduledAt: '2025-06-01T00:00:00.000Z',
      publishedAt: '2025-06-02T00:00:00.000Z',
      publishedUrl: 'https://example.com/x',
    });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-release-2': { contentProjects: [{
        id: 'creator-content:2', projectId: 'project-release-2', title: '内容B', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorReleaseData: { 'project-release-2': { releasePackages: [release] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 待清空' }));
    fireEvent.change(screen.getByLabelText('Edit release cover asset'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Edit release scheduled at'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Edit release published at'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Edit release published url'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save release' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes('/creator-release-packages/creator-release%3A2') && (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const sent = JSON.parse(String((patchCall![1] as RequestInit).body));
      expect(sent.coverAssetId).toBeNull();
      expect(sent.exportAssetId).toBeNull();
      expect(sent.scheduledAt).toBeNull();
      expect(sent.publishedAt).toBeNull();
      expect(sent.publishedUrl).toBeNull();
    });
  });

  it('rejects ready/published release saves when the checklist is incomplete and preserves the editor input', async () => {
    const creatorProject: Project = { id: 'project-release-3', name: '门禁发布', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({ id: 'creator-release:3', projectId: 'project-release-3', title: '待发布' });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-release-3': { contentProjects: [{
        id: 'creator-content:3', projectId: 'project-release-3', title: '内容C', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorReleaseData: { 'project-release-3': { releasePackages: [release] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 待发布' }));
    fireEvent.change(screen.getByLabelText('Edit release status'), { target: { value: 'ready' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save release' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await waitFor(async () => {
      const idx = fetchMock.mock.calls.findIndex(
        (call) => String(call[0]).includes('/creator-release-packages/creator-release%3A3') && (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(idx).toBeGreaterThan(-1);
      const res = await (fetchMock.mock.results[idx] as { value: Promise<Response> }).value;
      expect(res.status).toBe(400);
    });
    // Editor input is preserved (status stays "ready", title unchanged) and an error is shown.
    expect((screen.getByLabelText('Edit release status') as HTMLSelectElement).value).toBe('ready');
    expect((screen.getByLabelText('Edit release title') as HTMLInputElement).value).toBe('待发布');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('keeps a missing asset reference on the release and offers it as a retained candidate', async () => {
    const creatorProject: Project = { id: 'project-release-4', name: '缺失素材发布', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({ id: 'creator-release:4', projectId: 'project-release-4', title: '带缺失素材', coverAssetId: 'creator-media:missing' });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-release-4': { contentProjects: [{
        id: 'creator-content:4', projectId: 'project-release-4', title: '内容D', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorMediaData: { 'project-release-4': { assets: [
        { id: 'creator-media:missing', fileName: 'missing.jpg', kind: 'image', relativePath: 'missing.jpg', availability: 'missing' },
        { id: 'creator-media:available', fileName: 'available.jpg', kind: 'image', relativePath: 'available.jpg', availability: 'available' },
      ], taskLinks: [] } },
      creatorReleaseData: { 'project-release-4': { releasePackages: [release] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    // The list surfaces the missing-asset chip before opening the editor.
    expect(await screen.findByText('1 missing asset')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit release 带缺失素材' }));
    // The missing asset is retained as a candidate and flagged Missing.
    const coverSelect = screen.getByLabelText('Edit release cover asset') as HTMLSelectElement;
    expect(within(coverSelect).getByRole('option', { name: 'missing.jpg (Missing)' })).toBeTruthy();
    const editor = document.querySelector('.creator-release-editor') as HTMLElement;
    expect(within(editor).getByText('Missing')).toBeTruthy();
    // Saving without changing the cover keeps the missing reference (not nulled).
    fireEvent.click(screen.getByRole('button', { name: 'Save release' }));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes('/creator-release-packages/creator-release%3A4') && (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const sent = JSON.parse(String((patchCall![1] as RequestInit).body));
      expect(sent.coverAssetId).toBe('creator-media:missing');
    });
  });

  it('shows the release unavailable state when the release API fails but keeps other panels usable', async () => {
    const creatorProject: Project = {
      id: 'project-release-5', name: '发布失败项目', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseFailures: ['project-release-5'],
      creatorProjectData: { 'project-release-5': { tasks: [{
        id: 'creator-task:release-fail', projectId: 'project-release-5', title: 'surviving task', stage: 'topic', status: 'todo',
        priority: 'medium', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }], activities: [] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect(await screen.findByText('Release unavailable for this project.')).toBeTruthy();
    expect(screen.getAllByText('surviving task').length).toBeGreaterThan(0);
  });

  it('asks for confirmation before deleting a release and cancels on decline', async () => {
    const creatorProject: Project = { id: 'project-release-6', name: '删除发布', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({ id: 'creator-release:6', projectId: 'project-release-6', title: '待删除' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-release-6': { contentProjects: [{
        id: 'creator-content:6', projectId: 'project-release-6', title: '内容E', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorReleaseData: { 'project-release-6': { releasePackages: [release] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete release 待删除' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete release 待删除' }));
    await waitFor(() => {
      const deleteCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => String(call[0]).includes('/creator-release-packages/creator-release%3A6') && (call[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBe(1);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('downloads the release package as JSON and Markdown blobs', async () => {
    const creatorProject: Project = { id: 'project-release-7', name: '导出发布', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({
      id: 'creator-release:7', projectId: 'project-release-7', title: '导出包', contentId: 'creator-content:7',
      description: '简介', tags: ['a', 'b'],
      checklist: { contentComplete: true, exportConfirmed: true, coverConfirmed: false, metadataConfirmed: true, platformConfirmed: false },
    });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorContentData: { 'project-release-7': { contentProjects: [{
        id: 'creator-content:7', projectId: 'project-release-7', title: '内容F', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorReleaseData: { 'project-release-7': { releasePackages: [release] } },
    });

    const capturedBlobs: Blob[] = [];
    const originalCreate = (URL as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (blob: Blob) => { capturedBlobs.push(blob); return 'blob:mock'; },
    });

    try {
      render(<TasksView projects={[creatorProject]} />);
      fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
      fireEvent.click(await screen.findByRole('button', { name: 'Edit release 导出包' }));
      fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
      await waitFor(() => expect(capturedBlobs.length).toBeGreaterThanOrEqual(1));
      const json = JSON.parse(await capturedBlobs[0]!.text()) as { id: string; title: string; content: { id: string }; checklist: CreatorReleaseChecklist };
      expect(json.id).toBe('creator-release:7');
      expect(json.title).toBe('导出包');
      expect(json.content.id).toBe('creator-content:7');
      expect(json.checklist.contentComplete).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
      await waitFor(() => expect(capturedBlobs.length).toBeGreaterThanOrEqual(2));
      const md = await capturedBlobs[1]!.text();
      expect(md).toContain('# 导出包');
      expect(md).toContain('- Platform: bilibili');
      expect(md).toContain('- Tags: a, b');
      expect(md).toContain('## Checklist');
      expect(md).toContain('contentComplete: true');
    } finally {
      if (originalCreate) {
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreate });
      } else {
        delete (URL as { createObjectURL?: unknown }).createObjectURL;
      }
    }
  });

  it('ships responsive release layout rules for the 960px and 640px breakpoints', () => {
    // jsdom does not evaluate media queries, so we assert the rules exist in the stylesheet.
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles', 'home', 'tasks.css');
    const css = readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');
    expect(css).toContain('@media (max-width: 960px) {\n  .creator-release-layout,');
    expect(css).toContain('@media (max-width: 640px) {\n  .creator-release-create,');
    expect(css).toContain('.creator-release-editor .creator-check {');
  });

});
