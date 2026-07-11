// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatRunStatusResponse, Project, Routine } from '@open-design/contracts';

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

function mockTasksViewFetch({
  routines = [],
  creatorProjects = [],
  creatorRuns = [],
  creatorProjectData = {},
}: {
  routines?: Routine[];
  creatorProjects?: Project[];
  creatorRuns?: ChatRunStatusResponse[];
  creatorProjectData?: Record<string, CreatorProjectData>;
} = {}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === '/api/routines' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ routines }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ projects: creatorProjects }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/runs' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ runs: creatorRuns }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const creatorRead = /^\/api\/projects\/([^/]+)\/creator-workbench$/.exec(url);
    if (creatorRead && (!init || init.method === undefined)) {
      const projectId = decodeURIComponent(creatorRead[1]!);
      return new Response(JSON.stringify(creatorProjectData[projectId] ?? { tasks: [], activities: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ proposals: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ packets: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

describe('TasksView page shell', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    vi.restoreAllMocks();
  });

  it('renders the automations page hero and summary metrics', async () => {
    const routines: Routine[] = [
      {
        id: 'routine-active-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'routine-active-2',
        name: 'Live artifact refresh',
        prompt: 'Refresh the artifact.',
        schedule: { kind: 'daily', time: '12:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'routine-paused-1',
        name: 'Weekly release notes',
        prompt: 'Draft release notes.',
        schedule: { kind: 'weekly', weekday: 1, time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: false,
        nextRunAt: null,
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockTasksViewFetch({ routines });

    render(<TasksView />);

    expect(await screen.findByRole('heading', { name: 'Automations' })).toBeTruthy();
    expect(
      screen.getByText(
        'Plan recurring conversations for project work, Orbit digests, and live artifacts.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('automations-new')).toBeTruthy();
    expect(screen.getByLabelText('Your automations')).toBeTruthy();

    const summary = screen.getByLabelText('Automation summary');
    await waitFor(() => {
      expect(summary.textContent ?? '').toContain('2');
      expect(summary.textContent ?? '').toContain('Active');
      expect(summary.textContent ?? '').toContain('1');
      expect(summary.textContent ?? '').toContain('Paused');
      expect(summary.textContent ?? '').toContain('8');
      expect(summary.textContent ?? '').toContain('Templates');
    });
  });

  it('renders the creator workbench summary inside the tasks page', async () => {
    const creatorProjects: Project[] = [
      {
        id: 'project-video-1',
        name: '校园黄昏短片',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 20_000,
        updatedAt: Date.now() - 5_000,
        pendingPrompt: '整理素材并推进剪辑节奏',
        metadata: { kind: 'video' },
        status: { value: 'running' },
      },
    ];
    mockTasksViewFetch({
      creatorProjects,
      creatorRuns: [
        {
          id: 'run-creator-1',
          projectId: 'project-video-1',
          conversationId: 'conv-1',
          assistantMessageId: 'msg-1',
          agentId: 'codex',
          status: 'succeeded',
          createdAt: Date.now() - 18_000,
          updatedAt: Date.now() - 2_000,
        },
      ],
    });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));

    const creatorDashboard = await screen.findByTestId('creator-dashboard');
    expect(within(creatorDashboard).getByRole('heading', { name: 'Creator workbench' })).toBeTruthy();
    expect(within(creatorDashboard).getByRole('heading', { name: 'Tasks' })).toBeTruthy();
    expect(within(creatorDashboard).getByRole('heading', { name: 'Activity' })).toBeTruthy();
    expect(within(creatorDashboard).getByRole('heading', { name: 'Workflows' })).toBeTruthy();
    expect(within(creatorDashboard).getAllByText('校园黄昏短片').length).toBeGreaterThan(0);
    expect(within(creatorDashboard).getAllByText('整理素材并推进剪辑节奏').length).toBeGreaterThan(0);
    expect(within(creatorDashboard).getByText('Run output · 校园黄昏短片')).toBeTruthy();
    expect(within(creatorDashboard).getByText('Media production pipeline')).toBeTruthy();
  });

  it('renders persisted creator work and advances it with an activity writeback', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-persisted-1', name: '摄影短片', skillId: null, designSystemId: null,
      createdAt: Date.now() - 30_000, updatedAt: Date.now() - 10_000, metadata: { kind: 'video' },
    }];
    const creatorProjectData: Record<string, CreatorProjectData> = {
      'project-persisted-1': {
        tasks: [{
          id: 'creator-task:1', projectId: 'project-persisted-1', title: '筛选可用镜头',
          stage: 'material', status: 'todo', priority: 'medium',
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        }],
        activities: [],
      },
    };
    const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
    mockTasksViewFetch({ creatorProjects, creatorProjectData });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === 'PATCH' && url.includes('/creator-tasks/creator-task%3A1')) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ url, body });
        creatorProjectData['project-persisted-1']!.tasks[0] = {
          ...creatorProjectData['project-persisted-1']!.tasks[0]!,
          stage: String(body.stage), status: String(body.status), updatedAt: '2025-01-02T00:00:00Z',
        };
        return new Response(JSON.stringify({ task: creatorProjectData['project-persisted-1']!.tasks[0] }), { status: 200 });
      }
      if (init?.method === 'POST' && url.endsWith('/creator-activities')) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ url, body });
        creatorProjectData['project-persisted-1']!.activities.push({
          id: 'creator-activity:1', projectId: 'project-persisted-1', taskId: String(body.taskId),
          category: String(body.category), title: String(body.title), createdAt: '2025-01-02T00:00:00Z',
        });
        return new Response(JSON.stringify({ activity: creatorProjectData['project-persisted-1']!.activities[0] }), { status: 201 });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect((await screen.findAllByText('筛选可用镜头')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Advance' }));

    await waitFor(() => {
      expect(writes).toEqual(expect.arrayContaining([
        expect.objectContaining({ body: { stage: 'editing', status: 'ready' } }),
        expect.objectContaining({ body: expect.objectContaining({ taskId: 'creator-task:1', category: 'editing' }) }),
      ]));
    });
  });

  it('creates a creator task for the selected project', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-create-1', name: '夏日片段', skillId: null, designSystemId: null,
      createdAt: Date.now() - 30_000, updatedAt: Date.now() - 10_000, metadata: { kind: 'video' },
    }];
    const creatorProjectData: Record<string, CreatorProjectData> = {
      'project-create-1': { tasks: [], activities: [] },
    };
    mockTasksViewFetch({ creatorProjects, creatorProjectData });
    const baseFetch = globalThis.fetch;
    const createSpy = vi.fn();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === 'POST' && url.endsWith('/creator-tasks')) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        createSpy(url, body);
        creatorProjectData['project-create-1']!.tasks.push({
          id: 'creator-task:new', projectId: 'project-create-1', title: String(body.title),
          stage: String(body.stage), status: String(body.status), priority: String(body.priority),
          createdAt: '2025-01-02T00:00:00Z', updatedAt: '2025-01-02T00:00:00Z',
        });
        return new Response(JSON.stringify({ task: creatorProjectData['project-create-1']!.tasks[0] }), { status: 201 });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.change(await screen.findByLabelText('Task title'), { target: { value: '整理拍摄计划' } });
    fireEvent.change(screen.getByLabelText('Task stage'), { target: { value: 'editing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        '/api/projects/project-create-1/creator-tasks',
        expect.objectContaining({ title: '整理拍摄计划', stage: 'editing', status: 'todo' }),
      );
    });
  });

  it('edits a creator task inline, records its blocker note, and writes an activity', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-edit-1', name: '夜景短片', skillId: null, designSystemId: null,
      createdAt: Date.now() - 30_000, updatedAt: Date.now() - 10_000, metadata: { kind: 'video' },
    }];
    const creatorProjectData: Record<string, CreatorProjectData> = {
      'project-edit-1': {
        tasks: [{
          id: 'creator-task:edit-1', projectId: 'project-edit-1', title: '补拍夜景',
          stage: 'material', status: 'ready', priority: 'high',
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        }],
        activities: [],
      },
    };
    const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
    mockTasksViewFetch({ creatorProjects, creatorProjectData });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === 'PATCH' && url.includes('/creator-tasks/creator-task%3Aedit-1')) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ url, body });
        creatorProjectData['project-edit-1']!.tasks[0] = {
          ...creatorProjectData['project-edit-1']!.tasks[0]!,
          ...body,
          updatedAt: '2025-01-02T00:00:00Z',
        } as CreatorProjectData['tasks'][number];
        return new Response(JSON.stringify({ task: creatorProjectData['project-edit-1']!.tasks[0] }), { status: 200 });
      }
      if (init?.method === 'POST' && url.endsWith('/creator-activities')) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ url, body });
        return new Response(JSON.stringify({ activity: body }), { status: 201 });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit task status'), { target: { value: 'blocked' } });
    fireEvent.change(screen.getByLabelText('Blocker reason'), { target: { value: '缺少夜景素材' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));

    await waitFor(() => {
      expect(writes).toEqual(expect.arrayContaining([
        expect.objectContaining({ body: expect.objectContaining({ status: 'blocked', blockerNote: '缺少夜景素材' }) }),
        expect.objectContaining({ body: expect.objectContaining({
          title: '补拍夜景 已阻塞', summary: '缺少夜景素材', category: 'material',
        }) }),
      ]));
    });
  });

  it('cancels inline editing without sending a task update', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-cancel-1', name: '取消编辑', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    }];
    mockTasksViewFetch({ creatorProjects, creatorProjectData: {
      'project-cancel-1': { tasks: [{
        id: 'creator-task:cancel-1', projectId: 'project-cancel-1', title: '原始标题',
        stage: 'topic', status: 'todo', priority: 'medium', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }], activities: [] },
    } });

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit task title'), { target: { value: '不会保存' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel task edit' }));

    expect(screen.queryByLabelText('Edit task title')).toBeNull();
    expect(screen.getAllByText('原始标题').length).toBeGreaterThan(0);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('does not render edit controls for inferred project tasks', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-inferred-1', name: '只读项目任务', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    }];
    mockTasksViewFetch({ creatorProjects });

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Advance' })).toBeNull();
  });

  it('shows a blocker note on a blocked creator task', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-blocked-note-1', name: '阻塞任务', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    }];
    mockTasksViewFetch({ creatorProjects, creatorProjectData: {
      'project-blocked-note-1': { tasks: [{
        id: 'creator-task:blocked-note-1', projectId: 'project-blocked-note-1', title: '补拍夜景',
        stage: 'material', status: 'blocked', priority: 'high', blockerNote: '缺少夜景素材',
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }], activities: [] },
    } });

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));

    expect(screen.getByText('阻塞：缺少夜景素材')).toBeTruthy();
  });

  it('hides blocker notes for a task that is not blocked', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-ready-note-1', name: '就绪任务', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    }];
    mockTasksViewFetch({ creatorProjects, creatorProjectData: {
      'project-ready-note-1': { tasks: [{
        id: 'creator-task:ready-note-1', projectId: 'project-ready-note-1', title: '整理镜头',
        stage: 'material', status: 'ready', priority: 'medium', blockerNote: '旧原因不应显示',
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }], activities: [] },
    } });

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));

    expect(screen.queryByText(/^阻塞：/)).toBeNull();
  });

  it('filters creator tasks and restores a completed creator task', async () => {
    const creatorProjects: Project[] = [{
      id: 'project-archive-1', name: '归档任务', skillId: null, designSystemId: null,
      createdAt: Date.now(), updatedAt: Date.now(), metadata: { kind: 'video' },
    }];
    const creatorProjectData: Record<string, CreatorProjectData> = {
      'project-archive-1': { tasks: [
        { id: 'creator-task:active-1', projectId: 'project-archive-1', title: '正在整理素材', stage: 'material', status: 'ready', priority: 'high', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'creator-task:done-1', projectId: 'project-archive-1', title: '发布复盘', stage: 'review', status: 'done', priority: 'medium', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-02T00:00:00Z' },
      ], activities: [] },
    };
    const writes: Array<Record<string, unknown>> = [];
    mockTasksViewFetch({ creatorProjects, creatorProjectData });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH' || (init?.method === 'POST' && input.toString().endsWith('/creator-activities'))) {
        writes.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    render(<TasksView projects={creatorProjects} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const taskPanel = screen.getByRole('heading', { name: 'Tasks' }).closest('section')!;
    expect(within(taskPanel).getByText('正在整理素材')).toBeTruthy();
    expect(within(taskPanel).queryByText('发布复盘')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '已完成' }));
    expect(within(taskPanel).getByText('发布复盘')).toBeTruthy();
    expect(within(taskPanel).queryByText('正在整理素材')).toBeNull();
    fireEvent.click(within(taskPanel).getByRole('button', { name: '恢复' }));

    await waitFor(() => {
      expect(writes).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: 'ready', blockerNote: '' }),
        expect.objectContaining({ taskId: 'creator-task:done-1', category: 'review', title: '发布复盘 已恢复进行中' }),
      ]));
    });
  });

  it('renders the creator workbench empty focus state when no projects exist', async () => {
    mockTasksViewFetch({ creatorProjects: [], creatorRuns: [] });

    render(<TasksView projects={[]} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));

    const creatorDashboard = await screen.findByTestId('creator-dashboard');
    expect(within(creatorDashboard).getByText('No active task')).toBeTruthy();
    expect(
      within(creatorDashboard).getByText(
        'Queue a topic, material, or editing task to start the chain.',
      ),
    ).toBeTruthy();
    expect(within(creatorDashboard).queryByRole('button', { name: /Open project/i })).toBeNull();
  });

  it('opens the focus project from the creator workbench hero action', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-focus-1',
        name: '校园黄昏短片',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 20_000,
        updatedAt: Date.now() - 5_000,
        pendingPrompt: '整理素材并推进剪辑节奏',
        metadata: { kind: 'video' },
        status: { value: 'running' },
      },
    ];
    mockTasksViewFetch({ creatorProjects, creatorRuns: [] });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start first run' }));

    expect(window.sessionStorage.getItem('od:auto-send-first:project-focus-1')).toBe('1');
    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-focus-1',
      conversationId: null,
      fileName: null,
    });
  });

  it('routes monitor-run focus action into the active conversation', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-monitor-1',
        name: '运行中的剪辑项目',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'running' },
      },
    ];
    mockTasksViewFetch({
      creatorProjects,
      creatorRuns: [
        {
          id: 'run-monitor-1',
          projectId: 'project-monitor-1',
          conversationId: 'conv-monitor-1',
          assistantMessageId: 'msg-monitor-1',
          agentId: 'codex',
          status: 'running',
          createdAt: Date.now() - 20_000,
          updatedAt: Date.now() - 2_000,
        },
      ],
    });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Monitor run' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-monitor-1',
      conversationId: 'conv-monitor-1',
      fileName: null,
    });
  });

  it('routes queued-run focus action into the queued conversation', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-queued-1',
        name: '排队中的剪辑项目',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'queued' },
      },
    ];
    mockTasksViewFetch({
      creatorProjects,
      creatorRuns: [
        {
          id: 'run-queued-1',
          projectId: 'project-queued-1',
          conversationId: 'conv-queued-1',
          assistantMessageId: 'msg-queued-1',
          agentId: 'codex',
          status: 'queued',
          createdAt: Date.now() - 20_000,
          updatedAt: Date.now() - 2_000,
        },
      ],
    });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect(await screen.findByText('Run queued')).toBeTruthy();
    const heroCard = screen
      .getByText('Focus now')
      .closest('.creator-dashboard__hero-card') as HTMLElement | null;
    if (!heroCard) {
      throw new Error('expected creator focus hero card');
    }
    expect(within(heroCard).getByText('Run queued')).toBeTruthy();
    expect(within(heroCard).getByRole('button', { name: 'Monitor run' })).toBeTruthy();
    expect(within(heroCard).getByText('素材')).toBeTruthy();
    expect(within(heroCard).getByText('就绪')).toBeTruthy();
    expect(within(heroCard).getByText('video')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Monitor run' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-queued-1',
      conversationId: 'conv-queued-1',
      fileName: null,
    });
  });

  it('routes review-output focus action into the completed conversation', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-review-1',
        name: '待复核的成片项目',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'succeeded' },
      },
    ];
    mockTasksViewFetch({
      creatorProjects,
      creatorRuns: [
        {
          id: 'run-review-1',
          projectId: 'project-review-1',
          conversationId: 'conv-review-1',
          assistantMessageId: 'msg-review-1',
          agentId: 'codex',
          status: 'succeeded',
          createdAt: Date.now() - 20_000,
          updatedAt: Date.now() - 2_000,
        },
      ],
    });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect(await screen.findByText('Fresh result to review')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Review output' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-review-1',
      conversationId: 'conv-review-1',
      fileName: null,
    });
  });

  it('routes retry-run focus action into the failed conversation', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-retry-1',
        name: '失败的剪辑项目',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'failed' },
      },
    ];
    mockTasksViewFetch({
      creatorProjects,
      creatorRuns: [
        {
          id: 'run-retry-1',
          projectId: 'project-retry-1',
          conversationId: 'conv-retry-1',
          assistantMessageId: 'msg-retry-1',
          agentId: 'codex',
          status: 'failed',
          createdAt: Date.now() - 20_000,
          updatedAt: Date.now() - 2_000,
        },
      ],
    });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry run' }));

    expect(window.sessionStorage.getItem('od:creator-retry-assistant:project-retry-1')).toBe(
      'msg-retry-1',
    );
    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-retry-1',
      conversationId: 'conv-retry-1',
      fileName: null,
    });
  });

  it('routes unblock-project focus action into the project workspace', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-blocked-1',
        name: '卡住的剪辑项目',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'awaiting_input' },
      },
    ];
    mockTasksViewFetch({ creatorProjects, creatorRuns: [] });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect(await screen.findByText('Needs intervention')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Unblock project' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-blocked-1',
      conversationId: null,
      fileName: null,
    });
  });

  it('routes continue-editing focus action into the project workspace', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-active-1',
        name: '正在推进的剪辑项目',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'running' },
      },
    ];
    mockTasksViewFetch({ creatorProjects, creatorRuns: [] });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect(await screen.findByText('Active priority')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue editing' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-active-1',
      conversationId: null,
      fileName: null,
    });
  });

  it('routes continue-task focus action into the project workspace', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-todo-1',
        name: '待整理的摄影任务',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'other' },
        status: { value: 'not_started' },
      },
    ];
    mockTasksViewFetch({ creatorProjects, creatorRuns: [] });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    expect(await screen.findByText('Next best task')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue task' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-todo-1',
      conversationId: null,
      fileName: null,
    });
  });

  it('opens a project from the creator task list', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-task-1',
        name: '待处理剪辑',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 10_000,
        metadata: { kind: 'video' },
        status: { value: 'failed' },
      },
    ];
    mockTasksViewFetch({ creatorProjects });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const creatorDashboard = await screen.findByTestId('creator-dashboard');
    const openButtons = within(creatorDashboard).getAllByRole('button', { name: 'Open' });
    const taskItem = openButtons[0]?.closest('li');
    if (!taskItem) {
      throw new Error('expected creator task row');
    }

    fireEvent.click(within(taskItem).getByRole('button', { name: 'Open' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-task-1',
      conversationId: null,
      fileName: null,
    });
  });

  it('opens a project from the creator activity list', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const creatorProjects: Project[] = [
      {
        id: 'project-activity-1',
        name: '相机样片整理',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now() - 40_000,
        updatedAt: Date.now() - 20_000,
        metadata: { kind: 'image' },
      },
    ];
    mockTasksViewFetch({
      creatorProjects,
      creatorRuns: [
        {
          id: 'run-activity-1',
          projectId: 'project-activity-1',
          conversationId: 'conv-activity-1',
          assistantMessageId: 'msg-activity-1',
          agentId: 'codex',
          status: 'succeeded',
          createdAt: Date.now() - 18_000,
          updatedAt: Date.now() - 5_000,
        },
      ],
    });

    render(<TasksView projects={creatorProjects} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Creator workbench/i }));
    const creatorDashboard = await screen.findByTestId('creator-dashboard');
    const activityItem = within(creatorDashboard).getByText('Run output · 相机样片整理').closest('li');
    if (!activityItem) {
      throw new Error('expected creator activity row');
    }

    fireEvent.click(within(activityItem).getByRole('button', { name: 'Open' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-activity-1',
      conversationId: null,
      fileName: null,
    });
  });

  it('keeps automations as the default surface until switching to creator workbench', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    expect(await screen.findByLabelText('Your automations')).toBeTruthy();
    expect(screen.queryByTestId('creator-dashboard')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Creator workbench/i }));

    await waitFor(() => {
      expect(screen.getByTestId('creator-dashboard')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Your automations')).toBeNull();
  });

  it('shows the empty state and opens the create modal from it', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    const emptyState = await screen.findByRole('button', { name: /No automations yet/i });
    expect(within(emptyState).getByText('Create one from a template or start with a blank schedule.')).toBeTruthy();

    fireEvent.click(emptyState);

    await waitFor(() => {
      expect(screen.getByLabelText('Automation title')).toBeTruthy();
    });
  });

  it('opens the create modal from the hero action', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    fireEvent.click(await screen.findByTestId('automations-new'));

    await waitFor(() => {
      expect(screen.getByLabelText('Automation title')).toBeTruthy();
    });
  });

  it('shows the template empty state when switching to an empty category', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    const tabs = await screen.findByRole('tablist', { name: 'Template filters' });
    fireEvent.click(within(tabs).getByRole('tab', { name: /Skills/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent ?? '').toContain('No templates in this category yet.');
    });

    fireEvent.click(within(tabs).getByRole('tab', { name: /^All/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Daily connector digest/i })).toBeTruthy();
    });
  });

  it('runs an automation and opens its project conversation when the daemon returns one', async () => {
    const routines: Routine[] = [
      {
        id: 'routine-run-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const runCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-run-1/run' && init?.method === 'POST') {
        runCalls.push(url);
        return new Response(JSON.stringify({
          projectId: 'proj-run',
          conversationId: 'conv-run',
          agentRunId: 'agent-run-1',
        }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Daily digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({
        kind: 'project',
        projectId: 'proj-run',
        conversationId: 'conv-run',
        fileName: null,
      });
    });
    expect(runCalls).toEqual(['/api/routines/routine-run-1/run']);
  });

  it('pauses and resumes an automation through PATCH updates', async () => {
    let routines: Routine[] = [
      {
        id: 'routine-pause-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const patchBodies: unknown[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-pause-1' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patchBodies.push(body);
        routines = [{ ...routines[0]!, enabled: body.enabled, updatedAt: Date.now() }];
        return new Response(JSON.stringify({ routine: routines[0] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Daily digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(within(row).getByRole('button', { name: 'Resume' })).toBeTruthy();
    });

    fireEvent.click(within(row).getByRole('button', { name: 'Resume' }));

    await waitFor(() => {
      expect(within(row).getByRole('button', { name: 'Pause' })).toBeTruthy();
    });

    expect(patchBodies).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('deletes an automation after confirmation and returns to the empty state', async () => {
    let routines: Routine[] = [
      {
        id: 'routine-delete-1',
        name: 'Daily digest',
        prompt: 'Generate a digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const deletedUrls: string[] = [];
    window.confirm = vi.fn(() => true);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-delete-1' && init?.method === 'DELETE') {
        deletedUrls.push(url);
        routines = [];
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Daily digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete automation' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /No automations yet/i })).toBeTruthy();
    });

    expect(deletedUrls).toEqual(['/api/routines/routine-delete-1']);
  });

  it('opens the last run result from the saved automation row', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => {});
    const startedAt = new Date('2026-05-25T09:29:00.000Z').getTime();
    const routines: Routine[] = [
      {
        id: 'routine-result-1',
        name: 'Orbit digest',
        prompt: 'Build the digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: {
          runId: 'run-1',
          status: 'failed',
          trigger: 'scheduled',
          startedAt,
          completedAt: startedAt + 5_000,
          projectId: 'proj-result',
          conversationId: 'conv-result',
          agentRunId: 'agent-run-1',
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockTasksViewFetch({ routines });

    render(<TasksView />);

    const row = (await screen.findByText('Orbit digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Open result' }));

    expect(navigateSpy).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'proj-result',
      conversationId: 'conv-result',
      fileName: null,
    });
  });

  it('expands and collapses automation history from the row action', async () => {
    const startedAt = new Date('2026-05-25T09:29:00.000Z').getTime();
    const routines: Routine[] = [
      {
        id: 'routine-history-1',
        name: 'Orbit digest',
        prompt: 'Build the digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-history-1/runs?limit=10') {
        return new Response(JSON.stringify({
          runs: [
            {
              id: 'run-1',
              routineId: 'routine-history-1',
              trigger: 'manual',
              status: 'succeeded',
              projectId: 'proj-result',
              conversationId: 'conv-result',
              agentRunId: 'agent-run-1',
              startedAt,
              completedAt: startedAt + 45_000,
              summary: 'Updated orbit digest',
              error: null,
              errorCode: null,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const row = (await screen.findByText('Orbit digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'History' }));

    expect(await screen.findByLabelText('Automation run history')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Hide history' })).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'Hide history' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Automation run history')).toBeNull();
    });
  });

  it('opens the edit modal with the routine title prefilled', async () => {
    const routines: Routine[] = [
      {
        id: 'routine-edit-1',
        name: 'Orbit digest',
        prompt: 'Build the digest.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        skillId: null,
        agentId: null,
        enabled: true,
        nextRunAt: Date.now(),
        lastRun: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    mockTasksViewFetch({ routines });

    render(<TasksView />);

    const row = (await screen.findByText('Orbit digest')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Automation title') as HTMLInputElement).value).toBe(
        'Orbit digest',
      );
    });
  });

  it('updates the active template filter tab state when switching categories', async () => {
    mockTasksViewFetch();

    render(<TasksView />);

    const tabs = await screen.findByRole('tablist', { name: 'Template filters' });
    const allTab = within(tabs).getByRole('tab', { name: /^All/i });
    const orbitTab = within(tabs).getByRole('tab', { name: /Orbit/i });

    expect(allTab.getAttribute('aria-selected')).toBe('true');
    expect(orbitTab.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(orbitTab);

    await waitFor(() => {
      expect(allTab.getAttribute('aria-selected')).toBe('false');
      expect(orbitTab.getAttribute('aria-selected')).toBe('true');
    });
  });
});
