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


describe('TasksView performance', () => {
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

  it('creates a performance snapshot with only the filled metric keys for a published release', async () => {
    const creatorProject: Project = { id: 'project-perf-1', name: '表现复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:perf1', projectId: 'project-perf-1', title: '已发布包' });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-1': { releasePackages: [release] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 已发布包' }));
    const views = await screen.findByLabelText('Performance views');
    fireEvent.change(views, { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Performance likes'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith('/creator-performance-snapshots') && (call[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const sent = JSON.parse(String((postCall![1] as RequestInit).body));
      expect(sent).toEqual({ releaseId: 'creator-release:perf1', metrics: { views: 100, likes: 20 } });
    });
    // 成功后表单清空，且新快照出现在列表中。
    expect((screen.getByLabelText('Performance views') as HTMLInputElement).value).toBe('');
    expect(await screen.findByText('views: 100')).toBeTruthy();
  });

  it('hides the performance snapshot form for a non-published release', async () => {
    const creatorProject: Project = { id: 'project-perf-2', name: '草稿复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({ id: 'creator-release:perf2', projectId: 'project-perf-2', title: '草稿包', status: 'draft' });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-2': { releasePackages: [release] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 草稿包' }));
    expect(await screen.findByText('Performance snapshots require a published release.')).toBeTruthy();
    expect(screen.queryByLabelText('Performance views')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save snapshot' })).toBeNull();
  });

  it('retains archived performance snapshots and permits deleting a mistaken entry', async () => {
    const creatorProject: Project = { id: 'project-perf-archived', name: '归档复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makeRelease({ id: 'creator-release:archived', projectId: 'project-perf-archived', title: '归档包', status: 'archived' });
    const snapshot: CreatorPerformanceSnapshot = {
      id: 'creator-performance:archived', projectId: 'project-perf-archived', releaseId: release.id, source: 'manual',
      capturedAt: '2026-07-04T00:00:00.000Z', metrics: { views: 8 }, createdAt: '2026-07-04T00:00:00.000Z',
    };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-archived': { releasePackages: [release] } },
      creatorPerformanceData: { 'project-perf-archived': { snapshots: [snapshot] } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 归档包' }));

    expect(await screen.findByText('Performance snapshots require a published release.')).toBeTruthy();
    expect(screen.getByText('views: 8')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save snapshot' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete performance snapshot 2026-07-04T00:00:00.000Z' }));
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
      (call) => String(call[0]).includes('/creator-performance-snapshots/creator-performance%3Aarchived') && (call[1] as RequestInit | undefined)?.method === 'DELETE',
    )).toBe(true));
  });

  it('preserves performance snapshot input and shows an alert on a failed create', async () => {
    const creatorProject: Project = { id: 'project-perf-3', name: '失败复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:perf3', projectId: 'project-perf-3', title: '已发布包3' });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-3': { releasePackages: [release] } },
      creatorPerformanceCreateError: true,
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 已发布包3' }));
    const views = await screen.findByLabelText('Performance views');
    fireEvent.change(views, { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByLabelText('Performance views') as HTMLInputElement).value).toBe('100');
  });

  it('lists performance snapshots by capturedAt desc and shows signed deltas for shared metrics', async () => {
    const creatorProject: Project = { id: 'project-perf-4', name: '增量复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:perf4', projectId: 'project-perf-4', title: '已发布包4' });
    const older: CreatorPerformanceSnapshot = {
      id: 'creator-performance:old', projectId: 'project-perf-4', releaseId: 'creator-release:perf4', source: 'manual',
      capturedAt: '2026-07-01T00:00:00.000Z', metrics: { views: 100, likes: 10 }, createdAt: '2026-07-01T00:00:00.000Z',
    };
    const newer: CreatorPerformanceSnapshot = {
      id: 'creator-performance:new', projectId: 'project-perf-4', releaseId: 'creator-release:perf4', source: 'manual',
      capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 150, likes: 20 }, createdAt: '2026-07-03T00:00:00.000Z',
    };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-4': { releasePackages: [release] } },
      creatorPerformanceData: { 'project-perf-4': { snapshots: [older, newer] } },
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 已发布包4' }));

    // 较新快照在前，显示相对紧邻更旧快照的增量。
    expect(await screen.findByText('views: 150 (+50)')).toBeTruthy();
    expect(screen.getByText('likes: 20 (+10)')).toBeTruthy();
    // 较旧快照没有更旧的可比对象，不显示增量。
    expect(screen.getByText('views: 100')).toBeTruthy();
    expect(screen.getAllByText(/\(\+50\)/).length).toBe(1);
    expect(screen.getAllByText(/\(\+10\)/).length).toBe(1);
  });

  it('confirms before deleting a performance snapshot and removes it only after confirm', async () => {
    const creatorProject: Project = { id: 'project-perf-5', name: '删除复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:perf5', projectId: 'project-perf-5', title: '已发布包5' });
    const snapshot: CreatorPerformanceSnapshot = {
      id: 'creator-performance:del', projectId: 'project-perf-5', releaseId: 'creator-release:perf5', source: 'manual',
      capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 5 }, createdAt: '2026-07-02T00:00:00.000Z',
    };
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-5': { releasePackages: [release] } },
      creatorPerformanceData: { 'project-perf-5': { snapshots: [snapshot] } },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 已发布包5' }));
    const deleteBtn = await screen.findByRole('button', { name: 'Delete performance snapshot 2026-07-02T00:00:00.000Z' });
    fireEvent.click(deleteBtn);
    fireEvent.click(deleteBtn);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const delCalls = fetchMock.mock.calls.filter(
        (call) => String(call[0]).includes('/creator-performance-snapshots/creator-performance%3Adel') && (call[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCalls.length).toBe(1);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText('views: 5')).toBeNull());
  });

  it('degrades the performance snapshot panel for a failing project without breaking the Release panel', async () => {
    const creatorProject: Project = { id: 'project-perf-6', name: '降级复盘', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:perf6', projectId: 'project-perf-6', title: '已发布包6' });
    mockTasksViewFetch({
      creatorProjects: [creatorProject],
      creatorReleaseData: { 'project-perf-6': { releasePackages: [release] } },
      creatorPerformanceFailures: ['project-perf-6'],
    });

    render(<TasksView projects={[creatorProject]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit release 已发布包6' }));
    expect(await screen.findByText('Performance unavailable for this project.')).toBeTruthy();
    // Release 面板仍可用。
    expect(screen.getByRole('button', { name: 'Save release' })).toBeTruthy();
    expect(screen.queryByLabelText('Performance views')).toBeNull();
  });

  it('ships responsive performance snapshot layout rules for the 640px breakpoint', () => {
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles', 'home', 'tasks.css');
    const css = readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');
    expect(css).toContain('.creator-performance {');
    expect(css).toContain('.creator-performance-fields {');
    expect(css).toContain('@media (max-width: 640px) {\n  .creator-release-create,\n  .creator-release-fields--top {\n    grid-template-columns: 1fr;\n  }\n  .creator-performance-fields {\n    grid-template-columns: 1fr;\n  }\n}');
  });

  it('performance overview lists only published releases across multiple projects', async () => {
    const projectA: Project = { id: 'ov-proj-a', name: '项目甲', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const projectB: Project = { id: 'ov-proj-b', name: '项目乙', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const pubA = makePublishedRelease({ id: 'creator-release:ovA1', projectId: 'ov-proj-a', title: '甲已发布', platform: 'bilibili' });
    const draftA = makeRelease({ id: 'creator-release:ovAd', projectId: 'ov-proj-a', title: '甲草稿', status: 'draft' });
    const pubB = makePublishedRelease({ id: 'creator-release:ovB1', projectId: 'ov-proj-b', title: '乙已发布', platform: 'youtube' });
    mockTasksViewFetch({
      creatorProjects: [projectA, projectB],
      creatorReleaseData: {
        'ov-proj-a': { releasePackages: [pubA, draftA] },
        'ov-proj-b': { releasePackages: [pubB] },
      },
      creatorPerformanceData: {
        'ov-proj-a': { snapshots: [makeSnapshot({ id: 's-a', projectId: 'ov-proj-a', releaseId: 'creator-release:ovA1', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 10 } })] },
        'ov-proj-b': { snapshots: [makeSnapshot({ id: 's-b', projectId: 'ov-proj-b', releaseId: 'creator-release:ovB1', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 20 } })] },
      },
    });

    render(<TasksView projects={[projectA, projectB]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });

    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(2));
    const order = performanceOverviewReleaseOrder(overview);
    expect(order).toContain('creator-release:ovA1');
    expect(order).toContain('creator-release:ovB1');
    expect(order).not.toContain('creator-release:ovAd');
    expect(within(overview).getByText('甲已发布')).toBeTruthy();
    expect(within(overview).getByText('乙已发布')).toBeTruthy();
    expect(within(overview).queryByText('甲草稿')).toBeNull();
  });

  it('performance overview selects latest and previous snapshots by capturedAt', async () => {
    const project: Project = { id: 'ov-latest', name: '最新快照', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:ovL', projectId: 'ov-latest', title: '最新包' });
    // 快照乱序传入：中间、最新、最旧；总览必须选出最新一条并对相邻上一条求增量。
    const snapshots: CreatorPerformanceSnapshot[] = [
      makeSnapshot({ id: 's-mid', projectId: 'ov-latest', releaseId: 'creator-release:ovL', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 130 } }),
      makeSnapshot({ id: 's-new', projectId: 'ov-latest', releaseId: 'creator-release:ovL', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 150 } }),
      makeSnapshot({ id: 's-old', projectId: 'ov-latest', releaseId: 'creator-release:ovL', capturedAt: '2026-07-01T00:00:00.000Z', metrics: { views: 100 } }),
    ];
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-latest': { releasePackages: [release] } },
      creatorPerformanceData: { 'ov-latest': { snapshots } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    const row = await waitFor(() => performanceOverviewRowByReleaseId(overview, 'creator-release:ovL'));
    const tds = row.querySelectorAll('td');
    // 最新快照时间列显示最新一条 capturedAt。
    expect(tds[3]!.textContent).toContain('2026-07-03T00:00:00.000Z');
    // views 相对上一条（130）为 +20，而非相对最旧的 100。
    expect(tds[4]!.textContent?.replace(/\s+/g, '')).toBe('150+20');
  });

  it('performance overview shows positive, negative, and zero deltas', async () => {
    const project: Project = { id: 'ov-delta', name: '增量', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:ovD', projectId: 'ov-delta', title: '增量包' });
    const previous = makeSnapshot({ id: 's-prev', projectId: 'ov-delta', releaseId: 'creator-release:ovD', capturedAt: '2026-07-01T00:00:00.000Z', metrics: { views: 100, likes: 50, comments: 10 } });
    const latest = makeSnapshot({ id: 's-last', projectId: 'ov-delta', releaseId: 'creator-release:ovD', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 150, likes: 30, comments: 10 } });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-delta': { releasePackages: [release] } },
      creatorPerformanceData: { 'ov-delta': { snapshots: [previous, latest] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    const row = await waitFor(() => performanceOverviewRowByReleaseId(overview, 'creator-release:ovD'));
    const tds = row.querySelectorAll('td');
    expect(tds[4]!.textContent?.replace(/\s+/g, '')).toBe('150+50'); // 正增量
    expect(tds[5]!.textContent?.replace(/\s+/g, '')).toBe('30-20'); // 负增量
    expect(tds[6]!.textContent?.replace(/\s+/g, '')).toBe('100'); // 零增量显示 "0"
  });

  it('performance overview shows a dash for missing metrics without inferring zero and skips fake deltas', async () => {
    const project: Project = { id: 'ov-missing', name: '缺失', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:ovM', projectId: 'ov-missing', title: '缺失包' });
    const previous = makeSnapshot({ id: 's-mp', projectId: 'ov-missing', releaseId: 'creator-release:ovM', capturedAt: '2026-07-01T00:00:00.000Z', metrics: { views: 100, likes: 40 } });
    // 最新快照：views 有历史可比 → 增量；comments 为有效 0 且历史缺失 → 显示 "0" 无增量；likes 缺失 → "-"。
    const latest = makeSnapshot({ id: 's-ml', projectId: 'ov-missing', releaseId: 'creator-release:ovM', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 150, comments: 0 } });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-missing': { releasePackages: [release] } },
      creatorPerformanceData: { 'ov-missing': { snapshots: [previous, latest] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    const row = await waitFor(() => performanceOverviewRowByReleaseId(overview, 'creator-release:ovM'));
    const tds = row.querySelectorAll('td');
    expect(tds[4]!.textContent?.replace(/\s+/g, '')).toBe('150+50');
    expect(tds[5]!.textContent?.trim()).toBe('-'); // 缺失显示破折号，不补零
    expect(tds[6]!.textContent?.trim()).toBe('0'); // 有效 0 不是缺失，且无伪造增量
  });

  it('performance overview keeps published releases without snapshots and marks them', async () => {
    const project: Project = { id: 'ov-nosnap', name: '无快照', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:ovN', projectId: 'ov-nosnap', title: '无快照包' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-nosnap': { releasePackages: [release] } },
      creatorPerformanceData: { 'ov-nosnap': { snapshots: [] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    const row = await waitFor(() => performanceOverviewRowByReleaseId(overview, 'creator-release:ovN'));
    const tds = row.querySelectorAll('td');
    expect(tds[3]!.textContent).toContain('No performance snapshots');
    expect(tds[4]!.textContent?.trim()).toBe('-');
    expect(tds[5]!.textContent?.trim()).toBe('-');
    expect(tds[6]!.textContent?.trim()).toBe('-');
  });

  it('performance overview filters by platform across all five segments', async () => {
    const project: Project = { id: 'ov-plat', name: '平台', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const rBili = makePublishedRelease({ id: 'creator-release:pBili', projectId: 'ov-plat', title: 'B站包', platform: 'bilibili' });
    const rYt = makePublishedRelease({ id: 'creator-release:pYt', projectId: 'ov-plat', title: 'YT包', platform: 'youtube' });
    const rXhs = makePublishedRelease({ id: 'creator-release:pXhs', projectId: 'ov-plat', title: '小红书包', platform: 'xiaohongshu' });
    const rOther = makePublishedRelease({ id: 'creator-release:pOther', projectId: 'ov-plat', title: '其他包', platform: 'other' });
    const snap = (releaseId: string, id: string) => makeSnapshot({ id, projectId: 'ov-plat', releaseId, capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 5 } });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-plat': { releasePackages: [rBili, rYt, rXhs, rOther] } },
      creatorPerformanceData: { 'ov-plat': { snapshots: [snap('creator-release:pBili', 's1'), snap('creator-release:pYt', 's2'), snap('creator-release:pXhs', 's3'), snap('creator-release:pOther', 's4')] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(4));

    fireEvent.click(within(overview).getByRole('button', { name: 'Bilibili' }));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:pBili']);
    fireEvent.click(within(overview).getByRole('button', { name: 'YouTube' }));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:pYt']);
    fireEvent.click(within(overview).getByRole('button', { name: 'Xiaohongshu' }));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:pXhs']);
    fireEvent.click(within(overview).getByRole('button', { name: 'Other' }));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:pOther']);
    fireEvent.click(within(overview).getByRole('button', { name: 'All' }));
    expect(performanceOverviewReleaseOrder(overview).length).toBe(4);
  });

  it('performance overview sorts by latest snapshot, views, likes, and comments', async () => {
    const project: Project = { id: 'ov-sort', name: '排序', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const r1 = makePublishedRelease({ id: 'creator-release:R1', projectId: 'ov-sort', title: '包一' });
    const r2 = makePublishedRelease({ id: 'creator-release:R2', projectId: 'ov-sort', title: '包二' });
    const r3 = makePublishedRelease({ id: 'creator-release:R3', projectId: 'ov-sort', title: '包三' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-sort': { releasePackages: [r1, r2, r3] } },
      creatorPerformanceData: { 'ov-sort': { snapshots: [
        makeSnapshot({ id: 'c1', projectId: 'ov-sort', releaseId: 'creator-release:R1', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 300, likes: 5, comments: 9 } }),
        makeSnapshot({ id: 'c2', projectId: 'ov-sort', releaseId: 'creator-release:R2', capturedAt: '2026-07-05T00:00:00.000Z', metrics: { views: 100, likes: 50, comments: 1 } }),
        makeSnapshot({ id: 'c3', projectId: 'ov-sort', releaseId: 'creator-release:R3', capturedAt: '2026-07-01T00:00:00.000Z', metrics: { views: 200, likes: 20, comments: 5 } }),
      ] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(3));

    // 默认按 Latest snapshot 降序（capturedAt）：R2(07-05) → R1(07-03) → R3(07-01)。
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:R2', 'creator-release:R1', 'creator-release:R3']);
    const sortSelect = within(overview).getByLabelText('Performance overview sort');
    fireEvent.change(sortSelect, { target: { value: 'views' } });
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:R1', 'creator-release:R3', 'creator-release:R2']);
    fireEvent.change(sortSelect, { target: { value: 'likes' } });
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:R2', 'creator-release:R3', 'creator-release:R1']);
    fireEvent.change(sortSelect, { target: { value: 'comments' } });
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:R1', 'creator-release:R3', 'creator-release:R2']);
  });

  it('performance overview orders releases missing the sort value after those with values', async () => {
    const project: Project = { id: 'ov-miss-sort', name: '缺值排序', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const rWith = makePublishedRelease({ id: 'creator-release:with', projectId: 'ov-miss-sort', title: '有值包' });
    const rNoView = makePublishedRelease({ id: 'creator-release:noview', projectId: 'ov-miss-sort', title: '无该指标包' });
    const rNoSnap = makePublishedRelease({ id: 'creator-release:nosnap', projectId: 'ov-miss-sort', title: '无快照包' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-miss-sort': { releasePackages: [rWith, rNoView, rNoSnap] } },
      creatorPerformanceData: { 'ov-miss-sort': { snapshots: [
        makeSnapshot({ id: 'w1', projectId: 'ov-miss-sort', releaseId: 'creator-release:with', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 100 } }),
        makeSnapshot({ id: 'n1', projectId: 'ov-miss-sort', releaseId: 'creator-release:noview', capturedAt: '2026-07-04T00:00:00.000Z', metrics: { likes: 9 } }),
      ] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(3));

    fireEvent.change(within(overview).getByLabelText('Performance overview sort'), { target: { value: 'views' } });
    const order = performanceOverviewReleaseOrder(overview);
    // 有 views 的排最前；缺失该指标（无该指标 / 无快照）的两条都排其后。
    expect(order[0]).toBe('creator-release:with');
    expect(order.slice(1)).toContain('creator-release:noview');
    expect(order.slice(1)).toContain('creator-release:nosnap');
  });

  it('performance overview breaks sort ties deterministically by capturedAt, title, then id', async () => {
    const project: Project = { id: 'ov-tie', name: '并列', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    // 四条 release 的 views 与 capturedAt 完全相同：先按标题升序（Alpha<Beta<Same），
    // 同标题再按 id 升序（id-1<id-2）。乱序传入以证明排序确定性。
    const rAlpha = makePublishedRelease({ id: 'creator-release:z-alpha', projectId: 'ov-tie', title: 'Alpha' });
    const rBeta = makePublishedRelease({ id: 'creator-release:a-beta', projectId: 'ov-tie', title: 'Beta' });
    const rSame1 = makePublishedRelease({ id: 'creator-release:id-1', projectId: 'ov-tie', title: 'Same' });
    const rSame2 = makePublishedRelease({ id: 'creator-release:id-2', projectId: 'ov-tie', title: 'Same' });
    const cap = '2026-07-02T00:00:00.000Z';
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-tie': { releasePackages: [rSame2, rBeta, rSame1, rAlpha] } },
      creatorPerformanceData: { 'ov-tie': { snapshots: [
        makeSnapshot({ id: 't-a', projectId: 'ov-tie', releaseId: 'creator-release:z-alpha', capturedAt: cap, metrics: { views: 100 } }),
        makeSnapshot({ id: 't-b', projectId: 'ov-tie', releaseId: 'creator-release:a-beta', capturedAt: cap, metrics: { views: 100 } }),
        makeSnapshot({ id: 't-c', projectId: 'ov-tie', releaseId: 'creator-release:id-1', capturedAt: cap, metrics: { views: 100 } }),
        makeSnapshot({ id: 't-d', projectId: 'ov-tie', releaseId: 'creator-release:id-2', capturedAt: cap, metrics: { views: 100 } }),
      ] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(4));
    fireEvent.change(within(overview).getByLabelText('Performance overview sort'), { target: { value: 'views' } });
    expect(performanceOverviewReleaseOrder(overview)).toEqual([
      'creator-release:z-alpha',
      'creator-release:a-beta',
      'creator-release:id-1',
      'creator-release:id-2',
    ]);
  });

  it('performance overview excludes draft, ready, and archived releases', async () => {
    const project: Project = { id: 'ov-status', name: '状态', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const draft = makeRelease({ id: 'creator-release:st-draft', projectId: 'ov-status', title: '草稿态', status: 'draft' });
    const ready = makeRelease({ id: 'creator-release:st-ready', projectId: 'ov-status', title: '就绪态', status: 'ready' });
    const archived = makeRelease({ id: 'creator-release:st-arch', projectId: 'ov-status', title: '归档态', status: 'archived' });
    const published = makePublishedRelease({ id: 'creator-release:st-pub', projectId: 'ov-status', title: '发布态' });
    const snap = (releaseId: string, id: string) => makeSnapshot({ id, projectId: 'ov-status', releaseId, capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 7 } });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-status': { releasePackages: [draft, ready, archived, published] } },
      creatorPerformanceData: { 'ov-status': { snapshots: [snap('creator-release:st-draft', 'd'), snap('creator-release:st-ready', 'r'), snap('creator-release:st-arch', 'a'), snap('creator-release:st-pub', 'p')] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(1));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:st-pub']);
    expect(within(overview).queryByText('草稿态')).toBeNull();
    expect(within(overview).queryByText('就绪态')).toBeNull();
    expect(within(overview).queryByText('归档态')).toBeNull();
  });

  it('performance overview drops a project when its release API fails', async () => {
    const failing: Project = { id: 'ov-relfail', name: '发布失败项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const healthy: Project = { id: 'ov-relok', name: '健康项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const failRelease = makePublishedRelease({ id: 'creator-release:relfail', projectId: 'ov-relfail', title: '失败项目包' });
    const okRelease = makePublishedRelease({ id: 'creator-release:relok', projectId: 'ov-relok', title: '健康项目包' });
    mockTasksViewFetch({
      creatorProjects: [failing, healthy],
      creatorReleaseData: {
        'ov-relfail': { releasePackages: [failRelease] },
        'ov-relok': { releasePackages: [okRelease] },
      },
      creatorReleaseFailures: ['ov-relfail'],
      creatorPerformanceData: {
        'ov-relfail': { snapshots: [makeSnapshot({ id: 'rf', projectId: 'ov-relfail', releaseId: 'creator-release:relfail', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 1 } })] },
        'ov-relok': { snapshots: [makeSnapshot({ id: 'ro', projectId: 'ov-relok', releaseId: 'creator-release:relok', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 2 } })] },
      },
    });

    render(<TasksView projects={[failing, healthy]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(1));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:relok']);
    expect(within(overview).queryByText('失败项目包')).toBeNull();
    expect(within(overview).getByText('健康项目包')).toBeTruthy();
  });

  it('performance overview drops a project when its performance API fails', async () => {
    const failing: Project = { id: 'ov-perffail', name: '表现失败项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const healthy: Project = { id: 'ov-perfok', name: '健康项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const failRelease = makePublishedRelease({ id: 'creator-release:perffail', projectId: 'ov-perffail', title: '表现失败包' });
    const okRelease = makePublishedRelease({ id: 'creator-release:perfok', projectId: 'ov-perfok', title: '表现健康包' });
    mockTasksViewFetch({
      creatorProjects: [failing, healthy],
      creatorReleaseData: {
        'ov-perffail': { releasePackages: [failRelease] },
        'ov-perfok': { releasePackages: [okRelease] },
      },
      creatorPerformanceData: {
        'ov-perffail': { snapshots: [makeSnapshot({ id: 'pf', projectId: 'ov-perffail', releaseId: 'creator-release:perffail', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 1 } })] },
        'ov-perfok': { snapshots: [makeSnapshot({ id: 'po', projectId: 'ov-perfok', releaseId: 'creator-release:perfok', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 2 } })] },
      },
      creatorPerformanceFailures: ['ov-perffail'],
    });

    render(<TasksView projects={[failing, healthy]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(1));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:perfok']);
    expect(within(overview).queryByText('表现失败包')).toBeNull();
    expect(within(overview).getByText('表现健康包')).toBeTruthy();
  });

  it('performance overview shows an unavailable hint when a project release API fails, keeps healthy projects, and leaves other panels usable', async () => {
    const failing: Project = { id: 'ov-relfail2', name: '发布失败项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const healthy: Project = { id: 'ov-relok2', name: '健康项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const failRelease = makePublishedRelease({ id: 'creator-release:relfail2', projectId: 'ov-relfail2', title: '失败项目包' });
    const okRelease = makePublishedRelease({ id: 'creator-release:relok2', projectId: 'ov-relok2', title: '健康项目包' });
    mockTasksViewFetch({
      creatorProjects: [failing, healthy],
      creatorReleaseData: {
        'ov-relfail2': { releasePackages: [failRelease] },
        'ov-relok2': { releasePackages: [okRelease] },
      },
      creatorReleaseFailures: ['ov-relfail2'],
      creatorPerformanceData: {
        'ov-relfail2': { snapshots: [makeSnapshot({ id: 'rf2', projectId: 'ov-relfail2', releaseId: 'creator-release:relfail2', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 1 } })] },
        'ov-relok2': { snapshots: [makeSnapshot({ id: 'ro2', projectId: 'ov-relok2', releaseId: 'creator-release:relok2', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 2 } })] },
      },
    });

    render(<TasksView projects={[failing, healthy]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(1));
    // 健康项目仍显示，失败项目不显示任何聚合数据。
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:relok2']);
    expect(within(overview).queryByText('失败项目包')).toBeNull();
    expect(within(overview).getByText('健康项目包')).toBeTruthy();
    // 项目级降级提示可见，且为单数形式。
    expect(within(overview).getByText('Performance overview unavailable for 1 project.')).toBeTruthy();
    // 既有 Tasks 区域（Automations 子标签）仍可用，未被总览失败破坏。
    expect(screen.getByRole('tab', { name: /Automations/i })).toBeTruthy();
  });

  it('performance overview shows an unavailable hint when a project performance API fails and keeps healthy projects', async () => {
    const failing: Project = { id: 'ov-perffail2', name: '表现失败项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const healthy: Project = { id: 'ov-perfok2', name: '健康项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const failRelease = makePublishedRelease({ id: 'creator-release:perffail2', projectId: 'ov-perffail2', title: '表现失败包' });
    const okRelease = makePublishedRelease({ id: 'creator-release:perfok2', projectId: 'ov-perfok2', title: '表现健康包' });
    mockTasksViewFetch({
      creatorProjects: [failing, healthy],
      creatorReleaseData: {
        'ov-perffail2': { releasePackages: [failRelease] },
        'ov-perfok2': { releasePackages: [okRelease] },
      },
      creatorPerformanceData: {
        'ov-perffail2': { snapshots: [makeSnapshot({ id: 'pf2', projectId: 'ov-perffail2', releaseId: 'creator-release:perffail2', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 1 } })] },
        'ov-perfok2': { snapshots: [makeSnapshot({ id: 'po2', projectId: 'ov-perfok2', releaseId: 'creator-release:perfok2', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 2 } })] },
      },
      creatorPerformanceFailures: ['ov-perffail2'],
    });

    render(<TasksView projects={[failing, healthy]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(1));
    expect(performanceOverviewReleaseOrder(overview)).toEqual(['creator-release:perfok2']);
    expect(within(overview).queryByText('表现失败包')).toBeNull();
    expect(within(overview).getByText('表现健康包')).toBeTruthy();
    expect(within(overview).getByText('Performance overview unavailable for 1 project.')).toBeTruthy();
  });

  it('performance overview counts a project only once when both its release and performance APIs fail', async () => {
    const failing: Project = { id: 'ov-bothfail', name: '双失败项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:bothfail', projectId: 'ov-bothfail', title: '双失败包' });
    mockTasksViewFetch({
      creatorProjects: [failing],
      creatorReleaseData: { 'ov-bothfail': { releasePackages: [release] } },
      creatorReleaseFailures: ['ov-bothfail'],
      creatorPerformanceData: { 'ov-bothfail': { snapshots: [] } },
      creatorPerformanceFailures: ['ov-bothfail'],
    });

    render(<TasksView projects={[failing] } />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    // 同一项目两个接口都失败 → 只计 1，不重复计数。
    expect(await within(overview).findByText('Performance overview unavailable for 1 project.')).toBeTruthy();
    expect(within(overview).queryByText('Performance overview unavailable for 2 projects.')).toBeNull();
    expect(performanceOverviewReleaseOrder(overview).length).toBe(0);
  });

  it('performance overview keeps the unavailable hint and shows an available-releases empty state when every project fails', async () => {
    const failing: Project = { id: 'ov-allfail', name: '全失败项目', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const release = makePublishedRelease({ id: 'creator-release:allfail', projectId: 'ov-allfail', title: '全失败包' });
    mockTasksViewFetch({
      creatorProjects: [failing],
      creatorReleaseData: { 'ov-allfail': { releasePackages: [release] } },
      creatorReleaseFailures: ['ov-allfail'],
      creatorPerformanceData: { 'ov-allfail': { snapshots: [] } },
      creatorPerformanceFailures: ['ov-allfail'],
    });

    render(<TasksView projects={[failing] } />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    // 失败提示必须保留。
    expect(await within(overview).findByText('Performance overview unavailable for 1 project.')).toBeTruthy();
    // 空态不得仅暗示“没有已发布 release”，必须表达为“没有可用已发布 release”。
    expect(within(overview).getByText('No available published releases to compare yet.')).toBeTruthy();
    expect(within(overview).queryByText('No published releases to compare yet.')).toBeNull();
    expect(overview.querySelector('table')).toBeNull();
  });

  it('performance overview resolves content titles and falls back to the content id', async () => {
    const project: Project = { id: 'ov-content', name: '内容标题', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const titled = makePublishedRelease({ id: 'creator-release:ct-titled', projectId: 'ov-content', title: '有标题包', contentId: 'creator-content:1' });
    const fallback = makePublishedRelease({ id: 'creator-release:ct-fallback', projectId: 'ov-content', title: '回退包', contentId: 'creator-content:orphan' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-content': { releasePackages: [titled, fallback] } },
      creatorContentData: { 'ov-content': { contentProjects: [{
        id: 'creator-content:1', projectId: 'ov-content', title: '正片内容', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
      creatorPerformanceData: { 'ov-content': { snapshots: [
        makeSnapshot({ id: 'ct1', projectId: 'ov-content', releaseId: 'creator-release:ct-titled', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 3 } }),
      ] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(2));
    const titledRow = performanceOverviewRowByReleaseId(overview, 'creator-release:ct-titled');
    const fallbackRow = performanceOverviewRowByReleaseId(overview, 'creator-release:ct-fallback');
    expect(titledRow.querySelectorAll('td')[1]!.textContent).toContain('正片内容');
    // 内容无法解析时回退显示 contentId，且 release 仍然展示。
    expect(fallbackRow.querySelectorAll('td')[1]!.textContent).toContain('creator-content:orphan');
  });

  it('performance overview shows an empty state when no published releases exist', async () => {
    const project: Project = { id: 'ov-empty', name: '空态', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const draft = makeRelease({ id: 'creator-release:empty-draft', projectId: 'ov-empty', title: '仅草稿', status: 'draft' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-empty': { releasePackages: [draft] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    expect(await within(overview).findByText('No published releases to compare yet.')).toBeTruthy();
    expect(overview.querySelector('table')).toBeNull();
  });

  it('performance overview interactions never issue write requests', async () => {
    const project: Project = { id: 'ov-readonly', name: '只读', skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' } };
    const rBili = makePublishedRelease({ id: 'creator-release:ro-bili', projectId: 'ov-readonly', title: '只读B站', platform: 'bilibili' });
    const rYt = makePublishedRelease({ id: 'creator-release:ro-yt', projectId: 'ov-readonly', title: '只读YT', platform: 'youtube' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'ov-readonly': { releasePackages: [rBili, rYt] } },
      creatorPerformanceData: { 'ov-readonly': { snapshots: [
        makeSnapshot({ id: 'ro1', projectId: 'ov-readonly', releaseId: 'creator-release:ro-bili', capturedAt: '2026-07-02T00:00:00.000Z', metrics: { views: 4 } }),
        makeSnapshot({ id: 'ro2', projectId: 'ov-readonly', releaseId: 'creator-release:ro-yt', capturedAt: '2026-07-03T00:00:00.000Z', metrics: { views: 6 } }),
      ] } },
    });

    render(<TasksView projects={[project]} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const overview = await screen.findByRole('region', { name: 'Performance overview' });
    await waitFor(() => expect(performanceOverviewReleaseOrder(overview).length).toBe(2));
    expect(countWriteRequests()).toBe(0);

    fireEvent.click(within(overview).getByRole('button', { name: 'Bilibili' }));
    fireEvent.click(within(overview).getByRole('button', { name: 'YouTube' }));
    fireEvent.click(within(overview).getByRole('button', { name: 'All' }));
    fireEvent.change(within(overview).getByLabelText('Performance overview sort'), { target: { value: 'views' } });
    fireEvent.change(within(overview).getByLabelText('Performance overview sort'), { target: { value: 'latest' } });

    expect(countWriteRequests()).toBe(0);
  });

  it('performance overview ships responsive rules for the 960px and 640px breakpoints', () => {
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles', 'home', 'tasks.css');
    const css = readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');
    expect(css).toContain('.creator-performance-overview__scroll {');
    expect(css).toContain('.creator-performance-overview__table {');
    expect(css).toContain('@media (max-width: 960px) {\n  .creator-performance-overview__scroll {');
    expect(css).toContain('@media (max-width: 640px) {\n  .creator-performance-overview__head {');
    expect(css).toContain('min-width: 640px;');
  });

  // ===== CW-06 Release schedule tests =====
  const RS_NOW = new Date('2026-07-15T12:00:00.000Z');
  const rsProject = (id: string, name: string): Project => ({
    id, name, skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
  });

});
