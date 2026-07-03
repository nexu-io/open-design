// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatRunStatusResponse, Project, Routine } from '@open-design/contracts';

import { TasksView } from '../../src/components/TasksView';
import * as router from '../../src/router';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

function mockTasksViewFetch({
  routines = [],
  creatorProjects = [],
  creatorRuns = [],
}: {
  routines?: Routine[];
  creatorProjects?: Project[];
  creatorRuns?: ChatRunStatusResponse[];
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
