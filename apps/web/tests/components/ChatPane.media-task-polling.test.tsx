// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage, ProjectMediaTask } from '@open-design/contracts';
import { ChatPane } from '../../src/components/ChatPane';

const registryMocks = vi.hoisted(() => ({
  fetchProjectMediaTasks: vi.fn(),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    fetchProjectMediaTasks: registryMocks.fetchProjectMediaTasks,
  };
});

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({
    message,
    mediaTasks = [],
  }: {
    message: ChatMessage;
    mediaTasks?: ProjectMediaTask[];
  }) => (
    <output data-testid={`assistant-media-${message.id}`}>
      {mediaTasks.map((task) => `${task.taskId}:${task.status}`).join(',')}
    </output>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/components/PixelLiquid', () => ({
  PixelLiquid: () => <span aria-hidden />,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ChatPane media-task polling', () => {
  it('polls the latest streaming run before ACP emits its terminal media tool_use', async () => {
    registryMocks.fetchProjectMediaTasks.mockResolvedValue({
      tasks: [{
        taskId: 'media-1',
        runId: 'run-media',
        status: 'running',
        surface: 'image',
        startedAt: 100,
        endedAt: null,
        elapsed: 0,
        progress: [],
        progressCount: 0,
      } satisfies ProjectMediaTask],
    });

    render(
      <ChatPane
        messages={[{
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          createdAt: 1,
          runId: 'run-media',
          runStatus: 'running',
          // ACP has exposed its plan, but the media command itself only arrives
          // when the terminal call completes.
          events: [{
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: { todos: [{ content: '生成配套插图', status: 'in_progress' }] },
          }],
        }]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledWith('project-1', null);
      expect(screen.getByTestId('assistant-media-assistant-1').textContent).toBe('media-1:running');
    });
  });

  it('keeps a bounded terminal confirmation poll until the completed file is registered', async () => {
    vi.useFakeTimers();
    const baseTask = {
      taskId: 'media-terminal',
      runId: 'run-terminal',
      status: 'done',
      surface: 'image',
      startedAt: 100,
      endedAt: 200,
      elapsed: 0,
      progress: [],
      progressCount: 0,
    } satisfies ProjectMediaTask;
    registryMocks.fetchProjectMediaTasks
      .mockResolvedValueOnce({ tasks: [baseTask] })
      .mockResolvedValue({
        tasks: [{ ...baseTask, file: { name: 'final/generated.png' } }],
      });

    render(
      <ChatPane
        messages={[{
          id: 'assistant-terminal',
          role: 'assistant',
          content: '',
          createdAt: 1,
          endedAt: 300,
          runId: 'run-terminal',
          runStatus: 'succeeded',
          events: [{
            kind: 'tool_use',
            id: 'media-call',
            name: 'Bash',
            input: { command: 'od media generate --output generated.png' },
          }],
        }]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(749);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(2);
  });

  it('orders same-millisecond tasks by creation sequence, not by response order', async () => {
    const base: Omit<ProjectMediaTask, 'taskId'> = {
      runId: 'run-batch',
      status: 'running',
      surface: 'image',
      // A parallel fan-out: startedAt cannot separate these cells.
      startedAt: 100,
      endedAt: null,
      elapsed: 0,
      progress: [],
      progressCount: 0,
    };
    registryMocks.fetchProjectMediaTasks.mockResolvedValue({
      tasks: [
        { ...base, taskId: 'media-3', sequence: 30 },
        { ...base, taskId: 'media-1', sequence: 10 },
        { ...base, taskId: 'media-2', sequence: 20 },
      ] satisfies ProjectMediaTask[],
    });

    render(
      <ChatPane
        messages={[{
          id: 'assistant-batch',
          role: 'assistant',
          content: '',
          createdAt: 1,
          runId: 'run-batch',
          runStatus: 'running',
          events: [{
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: { todos: [{ content: '生成配套插图', status: 'in_progress' }] },
          }],
        }]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('assistant-media-assistant-batch').textContent)
        .toBe('media-1:running,media-2:running,media-3:running');
    });
  });

  it('keeps reconciling a watched run’s completed media file after it goes terminal', async () => {
    vi.useFakeTimers();
    const mediaCall = {
      kind: 'tool_use',
      id: 'media-call',
      name: 'Bash',
      input: { command: 'od media generate --output assets/generated.png' },
    } as const;
    const runningTask = {
      taskId: 'media-settling',
      runId: 'run-settling',
      status: 'running',
      surface: 'image',
      startedAt: 100,
      endedAt: null,
      elapsed: 0,
      progress: [],
      progressCount: 0,
    } satisfies ProjectMediaTask;
    registryMocks.fetchProjectMediaTasks.mockResolvedValue({ tasks: [runningTask] });

    const { rerender } = render(
      <ChatPane
        messages={[{
          id: 'assistant-settling',
          role: 'assistant',
          content: '',
          createdAt: 1,
          runId: 'run-settling',
          runStatus: 'running',
          events: [mediaCall],
        }]}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The run ends and the daemon answers with the pre-rename path. That path
    // is not proof: the agent's normalize/move can still be in flight.
    registryMocks.fetchProjectMediaTasks.mockResolvedValue({
      tasks: [{
        ...runningTask,
        status: 'done',
        endedAt: 200,
        file: { name: 'assets_generated.png' },
      }],
    });
    registryMocks.fetchProjectMediaTasks.mockClear();
    rerender(
      <ChatPane
        messages={[{
          id: 'assistant-settling',
          role: 'assistant',
          content: '',
          createdAt: 1,
          endedAt: 300,
          runId: 'run-settling',
          runStatus: 'succeeded',
          events: [mediaCall],
        }]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750 * 3);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(4);

    // Still bounded: it must not poll the daemon forever.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750 * 20);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(9);
  });

  it('does not re-poll a settled media file replayed from history', async () => {
    vi.useFakeTimers();
    // Nothing about this run is in flight, so proving its path again would only
    // spend a burst of requests on every conversation open.
    registryMocks.fetchProjectMediaTasks.mockResolvedValue({
      tasks: [{
        taskId: 'media-history',
        runId: 'run-history',
        status: 'done',
        surface: 'image',
        startedAt: 100,
        endedAt: 200,
        elapsed: 0,
        progress: [],
        progressCount: 0,
        file: { name: 'generated.png' },
      } satisfies ProjectMediaTask],
    });

    render(
      <ChatPane
        messages={[{
          id: 'assistant-history',
          role: 'assistant',
          content: '',
          createdAt: 1,
          endedAt: 300,
          runId: 'run-history',
          runStatus: 'succeeded',
          events: [{
            kind: 'tool_use',
            id: 'media-call',
            name: 'Bash',
            input: { command: 'od media generate --output generated.png' },
          }],
        }]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750 * 12);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(1);
  });

  it('stops terminal file confirmation after the bounded retry budget', async () => {
    vi.useFakeTimers();
    registryMocks.fetchProjectMediaTasks.mockResolvedValue({
      tasks: [{
        taskId: 'media-unconfirmed',
        runId: 'run-unconfirmed',
        status: 'done',
        surface: 'image',
        startedAt: 100,
        endedAt: 200,
        elapsed: 0,
        progress: [],
        progressCount: 0,
      } satisfies ProjectMediaTask],
    });

    render(
      <ChatPane
        messages={[{
          id: 'assistant-unconfirmed',
          role: 'assistant',
          content: '',
          createdAt: 1,
          endedAt: 300,
          runId: 'run-unconfirmed',
          runStatus: 'succeeded',
          events: [{
            kind: 'tool_use',
            id: 'media-call',
            name: 'Bash',
            input: { command: 'od media generate --output missing.png' },
          }],
        }]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750 * 10);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(9);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750 * 2);
    });
    expect(registryMocks.fetchProjectMediaTasks).toHaveBeenCalledTimes(9);
  });
});
