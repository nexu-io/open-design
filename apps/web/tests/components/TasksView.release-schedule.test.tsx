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


describe('TasksView release schedule', () => {
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

  // ===== CW-06 Release schedule tests =====
  const RS_NOW = new Date('2026-07-15T12:00:00.000Z');
  const rsProject = (id: string, name: string): Project => ({
    id, name, skillId: null, designSystemId: null, createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
  });

  it('release schedule lists only draft and ready releases that have a scheduledAt across multiple projects', async () => {
    const projectA = rsProject('rs-proj-a', '项目甲');
    const projectB = rsProject('rs-proj-b', '项目乙');
    const draftA = makeRelease({ id: 'creator-release:rsDa', projectId: 'rs-proj-a', title: '甲草稿', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const readyB = makeRelease({ id: 'creator-release:rsRb', projectId: 'rs-proj-b', title: '乙就绪', status: 'ready', scheduledAt: '2026-07-22T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [projectA, projectB],
      creatorReleaseData: {
        'rs-proj-a': { releasePackages: [draftA] },
        'rs-proj-b': { releasePackages: [readyB] },
      },
    });
    render(<TasksView projects={[projectA, projectB]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(2));
    expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:rsDa', 'creator-release:rsRb']);
    expect(within(region).getByText('甲草稿')).toBeTruthy();
    expect(within(region).getByText('乙就绪')).toBeTruthy();
  });

  it('release schedule excludes published, archived, and releases without a scheduledAt', async () => {
    const project = rsProject('rs-proj-x', '排除项目');
    const keep = makeRelease({ id: 'creator-release:rsKeep', projectId: 'rs-proj-x', title: '应保留', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const published = makeRelease({ id: 'creator-release:rsPub', projectId: 'rs-proj-x', title: '已发布排除', status: 'published', scheduledAt: '2026-07-10T09:00:00.000Z' });
    const archived = makeRelease({ id: 'creator-release:rsArc', projectId: 'rs-proj-x', title: '已归档排除', status: 'archived', scheduledAt: '2026-07-11T09:00:00.000Z' });
    const draftNoSched = makeRelease({ id: 'creator-release:rsNoSched', projectId: 'rs-proj-x', title: '草稿无时间', status: 'draft' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-x': { releasePackages: [keep, published, archived, draftNoSched] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:rsKeep']));
    expect(within(region).queryByText('已发布排除')).toBeNull();
    expect(within(region).queryByText('已归档排除')).toBeNull();
    expect(within(region).queryByText('草稿无时间')).toBeNull();
  });

  it('release schedule excludes releases with an unparseable scheduledAt while keeping valid neighbors', async () => {
    const project = rsProject('rs-proj-bad', '非法日期项目');
    const keep = makeRelease({ id: 'creator-release:rsBadKeep', projectId: 'rs-proj-bad', title: '合法邻居', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const bad = makeRelease({ id: 'creator-release:rsBad', projectId: 'rs-proj-bad', title: '非法日期', status: 'draft', scheduledAt: 'not-a-date' });
    const oob = makeRelease({ id: 'creator-release:rsBadOob', projectId: 'rs-proj-bad', title: '非法月份日期', status: 'ready', scheduledAt: '2026-13-45T10:00:00.000Z' });
    const emptyStr = makeRelease({ id: 'creator-release:rsBadEmpty', projectId: 'rs-proj-bad', title: '空串日期', status: 'draft', scheduledAt: '' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-bad': { releasePackages: [keep, bad, oob, emptyStr] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:rsBadKeep']));
    expect(within(region).queryByText('非法日期')).toBeNull();
    expect(within(region).queryByText('非法月份日期')).toBeNull();
    expect(within(region).queryByText('空串日期')).toBeNull();
  });

  it('release schedule orders items by scheduledAt ascending with a stable tie-break by title then id', async () => {
    const project = rsProject('rs-proj-o', '排序项目');
    const r1 = makeRelease({ id: 'creator-release:rs1', title: 'Alpha 07-18', status: 'draft', scheduledAt: '2026-07-18T00:00:00.000Z' });
    const tieA = makeRelease({ id: 'creator-release:tieA', title: 'Bravo tie', status: 'ready', scheduledAt: '2026-07-19T00:00:00.000Z' });
    const tieB = makeRelease({ id: 'creator-release:tieB', title: 'Charlie tie', status: 'ready', scheduledAt: '2026-07-19T00:00:00.000Z' });
    const r2 = makeRelease({ id: 'creator-release:rs2', title: 'Delta 07-20', status: 'draft', scheduledAt: '2026-07-20T00:00:00.000Z' });
    const r3 = makeRelease({ id: 'creator-release:rs3', title: 'Echo 07-22', status: 'draft', scheduledAt: '2026-07-22T00:00:00.000Z' });
    // 乱序传入以证明不信任 API 原顺序。
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-o': { releasePackages: [r3, tieB, r1, tieA, r2] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(5));
    // 升序：07-18 → 07-19(同时间按 title: Bravo < Charlie) → 07-20 → 07-22
    expect(releaseScheduleItemOrder(region)).toEqual([
      'creator-release:rs1',
      'creator-release:tieA',
      'creator-release:tieB',
      'creator-release:rs2',
      'creator-release:rs3',
    ]);
  });

  it('release schedule groups items by local date', async () => {
    const project = rsProject('rs-proj-g', '分组项目');
    // 两个「同日」项使用接近正午的 UTC 时间，确保任何真实时区下都落在同一本地日（避免跨时区断言脆弱）。
    const d1a = makeRelease({ id: 'creator-release:g1', title: '组一早', status: 'draft', scheduledAt: '2026-07-18T03:00:00.000Z' });
    const d1b = makeRelease({ id: 'creator-release:g2', title: '组一晚', status: 'draft', scheduledAt: '2026-07-18T05:00:00.000Z' });
    const d2 = makeRelease({ id: 'creator-release:g3', title: '组二', status: 'draft', scheduledAt: '2026-07-21T03:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-g': { releasePackages: [d2, d1b, d1a] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleGroupDates(region).length).toBe(2));
    // 整体顺序保持 scheduledAt 升序，跨日期组连续。
    expect(releaseScheduleItemOrder(region)).toEqual([
      'creator-release:g1',
      'creator-release:g2',
      'creator-release:g3',
    ]);
    const groups = region.querySelectorAll('[data-testid="creator-release-schedule-group"]');
    expect(within(groups[0] as HTMLElement).getByText('组一早')).toBeTruthy();
    expect(within(groups[0] as HTMLElement).getByText('组一晚')).toBeTruthy();
    expect(within(groups[1] as HTMLElement).getByText('组二')).toBeTruthy();
  });

  it('release schedule marks draft and ready releases scheduled in the past as Overdue', async () => {
    const project = rsProject('rs-proj-od', '逾期项目');
    const overdue = makeRelease({ id: 'creator-release:od', title: '逾期项', status: 'draft', scheduledAt: '2026-07-10T09:00:00.000Z' });
    const future = makeRelease({ id: 'creator-release:fu', title: '未来项', status: 'ready', scheduledAt: '2026-07-20T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-od': { releasePackages: [overdue, future] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(2));
    expect(within(releaseScheduleItemByReleaseId(region, 'creator-release:od')).getByText('Overdue')).toBeTruthy();
    expect(within(releaseScheduleItemByReleaseId(region, 'creator-release:fu')).queryByText('Overdue')).toBeNull();
  });

  it('release schedule Next 7 days filter includes now..now+7d and excludes the +7d boundary and farther items', async () => {
    const project = rsProject('rs-proj-w7', '七天项目');
    const within7 = makeRelease({ id: 'creator-release:w7', title: '七天内', status: 'draft', scheduledAt: '2026-07-18T12:00:00.000Z' });
    const boundary7 = makeRelease({ id: 'creator-release:b7', title: '七天整', status: 'draft', scheduledAt: '2026-07-22T12:00:00.000Z' });
    const far = makeRelease({ id: 'creator-release:far', title: '更远', status: 'draft', scheduledAt: '2026-07-25T12:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-w7': { releasePackages: [within7, boundary7, far] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(3));
    fireEvent.click(within(region).getByRole('button', { name: 'Next 7 days' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:w7']));
    expect(within(region).queryByText('七天整')).toBeNull();
    expect(within(region).queryByText('更远')).toBeNull();
  });

  it('release schedule Next 30 days filter includes up to now+30d and excludes the +30d boundary', async () => {
    const project = rsProject('rs-proj-w30', '三十天项目');
    const within30 = makeRelease({ id: 'creator-release:w30', title: '三十天内', status: 'draft', scheduledAt: '2026-08-04T12:00:00.000Z' });
    const boundary30 = makeRelease({ id: 'creator-release:b30', title: '三十天整', status: 'draft', scheduledAt: '2026-08-14T12:00:00.000Z' });
    const past = makeRelease({ id: 'creator-release:od30', title: '过去', status: 'draft', scheduledAt: '2026-07-10T12:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-w30': { releasePackages: [within30, boundary30, past] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(3));
    fireEvent.click(within(region).getByRole('button', { name: 'Next 30 days' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:w30']));
    expect(within(region).queryByText('三十天整')).toBeNull();
    expect(within(region).queryByText('过去')).toBeNull();
  });

  it('release schedule Overdue filter shows only releases scheduled before now', async () => {
    const project = rsProject('rs-proj-of', '逾期筛选项目');
    const past = makeRelease({ id: 'creator-release:op', title: '过去项', status: 'draft', scheduledAt: '2026-07-10T12:00:00.000Z' });
    const future = makeRelease({ id: 'creator-release:of', title: '未来项', status: 'draft', scheduledAt: '2026-07-20T12:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-of': { releasePackages: [past, future] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(2));
    fireEvent.click(within(region).getByRole('button', { name: 'Overdue' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:op']));
    expect(within(region).queryByText('未来项')).toBeNull();
  });

  it('release schedule platform filter shows only the selected platform across all five segments', async () => {
    const project = rsProject('rs-proj-p', '平台项目');
    const bili = makeRelease({ id: 'creator-release:pB', title: 'B站', platform: 'bilibili', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const yt = makeRelease({ id: 'creator-release:pY', title: '油管', platform: 'youtube', status: 'draft', scheduledAt: '2026-07-20T10:00:00.000Z' });
    const xhs = makeRelease({ id: 'creator-release:pX', title: '小红书', platform: 'xiaohongshu', status: 'draft', scheduledAt: '2026-07-20T11:00:00.000Z' });
    const other = makeRelease({ id: 'creator-release:pO', title: '其他', platform: 'other', status: 'draft', scheduledAt: '2026-07-20T12:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-p': { releasePackages: [bili, yt, xhs, other] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(4));
    fireEvent.click(within(region).getByRole('button', { name: 'YouTube' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:pY']));
    fireEvent.click(within(region).getByRole('button', { name: 'Xiaohongshu' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:pX']));
    fireEvent.click(within(region).getByRole('button', { name: 'Other' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:pO']));
    fireEvent.click(within(region).getByRole('button', { name: 'Bilibili' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:pB']));
    fireEvent.click(within(region).getByRole('button', { name: 'All' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(4));
  });

  it('release schedule resolves content titles and falls back to the content id', async () => {
    const project = rsProject('rs-proj-c', '内容项目');
    const titled = makeRelease({ id: 'creator-release:cw', title: '有内容', contentId: 'creator-content:alpha', platform: 'bilibili', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const fallback = makeRelease({ id: 'creator-release:cn', title: '无内容', contentId: 'creator-content:orphan', platform: 'youtube', status: 'ready', scheduledAt: '2026-07-20T10:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-c': { releasePackages: [titled, fallback] } },
      creatorContentData: { 'rs-proj-c': { contentProjects: [{
        id: 'creator-content:alpha', projectId: 'rs-proj-c', title: 'Alpha 内容', status: 'drafting', brief: {}, outline: {}, retrospective: {}, taskIds: [], storyboardItems: [],
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(2));
    expect(within(region).getByText('Alpha 内容')).toBeTruthy();
    expect(within(region).getByText('creator-content:orphan')).toBeTruthy();
  });

  it('release schedule shows an empty state when active filters match no releases', async () => {
    const project = rsProject('rs-proj-e', '空态项目');
    const far = makeRelease({ id: 'creator-release:e1', title: '远期', status: 'draft', scheduledAt: '2026-08-01T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-e': { releasePackages: [far] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(1));
    fireEvent.click(within(region).getByRole('button', { name: 'Next 7 days' }));
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(0));
    expect(within(region).getByText('No scheduled releases to show yet.')).toBeTruthy();
  });

  it('release schedule drops a project when its release API fails, keeps healthy projects, shows an unavailable hint, and leaves the Tasks panel usable', async () => {
    const healthy = rsProject('rs-healthy', '健康项目');
    const failing = rsProject('rs-fail', '失败项目');
    const hRelease = makeRelease({ id: 'creator-release:rh', projectId: 'rs-healthy', title: '健康排期', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const fRelease = makeRelease({ id: 'creator-release:rf', projectId: 'rs-fail', title: '失败排期', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [healthy, failing],
      creatorReleaseData: {
        'rs-healthy': { releasePackages: [hRelease] },
        'rs-fail': { releasePackages: [fRelease] },
      },
      creatorReleaseFailures: ['rs-fail'],
    });
    render(<TasksView projects={[healthy, failing]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region)).toEqual(['creator-release:rh']));
    expect(within(region).getByText('Release schedule unavailable for 1 project.')).toBeTruthy();
    expect(within(region).queryByText('失败排期')).toBeNull();
    // 既有 Tasks 区域仍可用：Automations 标签仍在。
    expect(screen.getByRole('tab', { name: /Automations/i })).toBeTruthy();
  });

  it('release schedule shows a plural hint for multiple failed projects', async () => {
    const p1 = rsProject('rs-f1', '失败一');
    const p2 = rsProject('rs-f2', '失败二');
    const r1 = makeRelease({ id: 'creator-release:f1', projectId: 'rs-f1', title: '排期一', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const r2 = makeRelease({ id: 'creator-release:f2', projectId: 'rs-f2', title: '排期二', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [p1, p2],
      creatorReleaseData: { 'rs-f1': { releasePackages: [r1] }, 'rs-f2': { releasePackages: [r2] } },
      creatorReleaseFailures: ['rs-f1', 'rs-f2'],
    });
    render(<TasksView projects={[p1, p2]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(within(region).getByText('Release schedule unavailable for 2 projects.')).toBeTruthy());
    expect(releaseScheduleItemOrder(region).length).toBe(0);
  });

  it('release schedule counts a project only once when both its release and performance APIs fail', async () => {
    const project = rsProject('rs-both', '双失败项目');
    const release = makeRelease({ id: 'creator-release:both', projectId: 'rs-both', title: '双失败排期', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-both': { releasePackages: [release] } },
      creatorReleaseFailures: ['rs-both'],
      creatorPerformanceFailures: ['rs-both'],
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    // 同一项目两个接口都失败 → 只计一次（1 project.，不是 2 projects.）。
    await waitFor(() => expect(within(region).getByText('Release schedule unavailable for 1 project.')).toBeTruthy());
    expect(releaseScheduleItemOrder(region).length).toBe(0);
  });

  it('release schedule keeps the unavailable hint and shows an available-releases empty state when every project fails', async () => {
    const project = rsProject('rs-allfail', '全失败项目');
    const release = makeRelease({ id: 'creator-release:af', projectId: 'rs-allfail', title: '全失败排期', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-allfail': { releasePackages: [release] } },
      creatorReleaseFailures: ['rs-allfail'],
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(within(region).getByText('Release schedule unavailable for 1 project.')).toBeTruthy());
    // 所有项目失败 → 保留提示，且空态不得仅暗示“没有排期”，必须表达为“没有可用排期”。
    expect(within(region).getByText('No available scheduled releases to show.')).toBeTruthy();
    expect(within(region).queryByText('No scheduled releases to show yet.')).toBeNull();
    expect(region.querySelector('.creator-release-schedule__agenda')).toBeNull();
  });

  it('release schedule interactions never issue write requests', async () => {
    const project = rsProject('rs-proj-z', '零写项目');
    const bili = makeRelease({ id: 'creator-release:zB', title: 'B站', platform: 'bilibili', status: 'draft', scheduledAt: '2026-07-20T09:00:00.000Z' });
    const yt = makeRelease({ id: 'creator-release:zY', title: '油管', platform: 'youtube', status: 'draft', scheduledAt: '2026-07-25T09:00:00.000Z' });
    mockTasksViewFetch({
      creatorProjects: [project],
      creatorReleaseData: { 'rs-proj-z': { releasePackages: [bili, yt] } },
    });
    render(<TasksView projects={[project]} now={RS_NOW} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const region = await screen.findByRole('region', { name: 'Release schedule' });
    await waitFor(() => expect(releaseScheduleItemOrder(region).length).toBe(2));
    fireEvent.click(within(region).getByRole('button', { name: 'YouTube' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Next 7 days' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Overdue' }));
    fireEvent.click(within(region).getByRole('button', { name: 'All' }));
    expect(countWriteRequests()).toBe(0);
  });

  it('release schedule ships responsive rules for the 960px and 640px breakpoints', () => {
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles', 'home', 'tasks.css');
    const css = readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');
    expect(css).toContain('.creator-release-schedule {');
    expect(css).toContain('.creator-release-schedule__agenda {');
    expect(css).toContain('@media (max-width: 960px) {\n  .creator-release-schedule__head {');
    expect(css).toContain('@media (max-width: 640px) {\n  .creator-release-schedule__item {');
  });
});
