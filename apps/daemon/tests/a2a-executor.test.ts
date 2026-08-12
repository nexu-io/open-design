import {
  OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE,
  OPEN_DESIGN_QUESTION_FORM_MEDIA_TYPE,
  type OpenDesignA2ARequestMetadata,
} from '@open-design/contracts';
import {
  Role,
  TaskState,
  type Message,
  type SendMessageRequest,
  type Task,
} from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  ServerCallContext,
} from '@a2a-js/sdk/server';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type {
  OpenDesignA2ADaemonClient,
  OpenDesignContextRef,
  OpenDesignRunRef,
  OpenDesignRunStatus,
} from '../src/a2a/daemon-client.js';
import { OpenDesignA2AExecutor } from '../src/a2a/executor.js';
import { buildOpenDesignAgentCard } from '../src/routes/a2a.js';

class FakeDaemonClient implements OpenDesignA2ADaemonClient {
  readonly prompts: string[] = [];
  readonly contexts: OpenDesignContextRef[] = [];
  private run = 0;

  async resolveContext(): Promise<OpenDesignContextRef> {
    return { projectId: 'project-1', conversationId: 'conversation-1' };
  }

  async startRun(
    context: OpenDesignContextRef,
    prompt: string,
    _metadata: OpenDesignA2ARequestMetadata,
  ): Promise<OpenDesignRunRef> {
    this.prompts.push(prompt);
    this.contexts.push(context);
    this.run += 1;
    return { ...context, runId: `run-${this.run}` };
  }

  async getRun(run: OpenDesignRunRef): Promise<OpenDesignRunStatus> {
    return { ...run, status: 'succeeded' };
  }

  async getRunMessage(runId: string): Promise<string | null> {
    return runId === 'run-1' ? 'I need one answer.' : 'The design is ready.';
  }

  async getRunResult(run: OpenDesignRunRef) {
    return {
      message: run.runId === 'run-1'
        ? `I need one answer.
<question-form id="discovery" title="Design direction">
{"questions":[{"id":"tone","label":"Visual tone","type":"radio","required":true,"allowCustom":false,"options":[{"label":"Bold","value":"bold"}]}]}
</question-form>`
        : 'The design is ready.',
      artifact: {
        schemaVersion: 1 as const,
        projectId: run.projectId,
        conversationId: run.conversationId,
        runId: run.runId,
        entryFile: 'index.html',
        previewUrl: 'http://localhost/raw/index.html',
        files: [{ name: 'index.html', mime: 'text/html' }],
      },
    };
  }

  async cancelRun(_runId: string): Promise<void> {}
}

class RunningDaemonClient extends FakeDaemonClient {
  readonly canceledRunIds: string[] = [];

  override async getRun(run: OpenDesignRunRef): Promise<OpenDesignRunStatus> {
    return { ...run, status: 'running' };
  }

  override async cancelRun(runId: string): Promise<void> {
    this.canceledRunIds.push(runId);
  }
}

class StructuredQuestionDaemonClient extends FakeDaemonClient {
  override async getRun(run: OpenDesignRunRef): Promise<OpenDesignRunStatus> {
    if (run.runId !== 'run-1') return { ...run, status: 'succeeded' };
    return {
      ...run,
      status: 'succeeded',
      questionForm: {
        schemaVersion: 1,
        form: {
          id: 'discovery',
          title: 'Recovered brief',
          questions: [{
            id: 'tone',
            label: 'Visual tone',
            type: 'radio',
            options: [{ label: 'Bold', value: 'bold' }],
          }],
        },
      },
      questionFormDiagnostic: {
        source: 'fallback',
        repaired: true,
        reason: 'question form body is not valid JSON',
      },
    };
  }

  override async getRunResult(run: OpenDesignRunRef) {
    if (run.runId === 'run-1') throw new Error('structured question form should bypass run result parsing');
    return super.getRunResult(run);
  }
}

describe('Open Design A2A executor', () => {
  it('publishes a structured run question form without reparsing assistant text', async () => {
    const daemon = new StructuredQuestionDaemonClient();
    const handler = new DefaultRequestHandler(
      buildOpenDesignAgentCard('http://127.0.0.1:7456', 'test'),
      new InMemoryTaskStore(),
      new OpenDesignA2AExecutor({ daemon, pollIntervalMs: 0 }),
    );
    const callContext = new ServerCallContext({ requestedVersion: '1.0' });
    const first = await handler.sendMessage(sendRequest(textMessage('Create a page.')), callContext);
    expect(isTask(first)).toBe(true);
    if (!isTask(first)) return;
    const waiting = await waitForState(handler, first.id, TaskState.TASK_STATE_INPUT_REQUIRED, callContext);
    expect(waiting.status?.message?.parts[0]?.content).toMatchObject({
      $case: 'text',
      value: expect.stringContaining('recovered'),
    });
    const formPart = waiting.status?.message?.parts.find((part) =>
      part.mediaType === OPEN_DESIGN_QUESTION_FORM_MEDIA_TYPE);
    expect(formPart?.content).toMatchObject({
      $case: 'data',
      value: { schemaVersion: 1, form: { id: 'discovery', title: 'Recovered brief' } },
    });
  });

  it('continues one task from INPUT_REQUIRED to COMPLETED in the same context', async () => {
    const daemon = new FakeDaemonClient();
    const handler = new DefaultRequestHandler(
      buildOpenDesignAgentCard('http://127.0.0.1:7456', 'test'),
      new InMemoryTaskStore(),
      new OpenDesignA2AExecutor({ daemon, pollIntervalMs: 0 }),
    );
    const callContext = new ServerCallContext({ requestedVersion: '1.0' });

    const first = await handler.sendMessage(sendRequest(textMessage(
      'Create a bold landing page.',
    ), { projectName: 'A2A test' }), callContext);
    expect(isTask(first)).toBe(true);
    if (!isTask(first)) return;

    const waiting = await waitForState(handler, first.id, TaskState.TASK_STATE_INPUT_REQUIRED, callContext);
    expect(waiting.contextId).toBe(first.contextId);
    const formPart = waiting.status?.message?.parts.find((part) =>
      part.mediaType === OPEN_DESIGN_QUESTION_FORM_MEDIA_TYPE);
    expect(formPart?.content).toMatchObject({
      $case: 'data',
      value: {
        schemaVersion: 1,
        form: {
          id: 'discovery',
          title: 'Design direction',
          questions: [{
            id: 'tone',
            label: 'Visual tone',
            type: 'radio',
            required: true,
            allowCustom: false,
            options: [{ label: 'Bold', value: 'bold' }],
          }],
        },
      },
    });

    const answer = dataMessage({
      schemaVersion: 1,
      formId: 'discovery',
      answers: { tone: 'bold' },
    }, OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE, waiting.id, waiting.contextId);
    const resumed = await handler.sendMessage(sendRequest(answer), callContext);
    expect(isTask(resumed) && resumed.id).toBe(waiting.id);

    const completed = await waitForState(
      handler,
      waiting.id,
      TaskState.TASK_STATE_COMPLETED,
      callContext,
    );
    expect(completed.contextId).toBe(waiting.contextId);
    expect(completed.artifacts?.[0]?.artifactId).toBe(`${waiting.id}-result`);
    expect(daemon.prompts).toEqual([
      'Create a bold landing page.',
      '[form answers — discovery]\n- Visual tone: Bold [value: bold]',
    ]);
    expect(daemon.contexts).toEqual([
      { projectId: 'project-1', conversationId: 'conversation-1' },
      { projectId: 'project-1', conversationId: 'conversation-1' },
    ]);
  });

  it('rejects an invalid form answer without consuming the pending form', async () => {
    const daemon = new FakeDaemonClient();
    const handler = new DefaultRequestHandler(
      buildOpenDesignAgentCard('http://127.0.0.1:7456', 'test'),
      new InMemoryTaskStore(),
      new OpenDesignA2AExecutor({ daemon, pollIntervalMs: 0 }),
    );
    const callContext = new ServerCallContext({ requestedVersion: '1.0' });
    const first = await handler.sendMessage(sendRequest(textMessage('Create a page.')), callContext);
    expect(isTask(first)).toBe(true);
    if (!isTask(first)) return;
    const waiting = await waitForState(handler, first.id, TaskState.TASK_STATE_INPUT_REQUIRED, callContext);

    const retry = await handler.sendMessage(sendRequest(dataMessage({
      schemaVersion: 1,
      formId: 'discovery',
      answers: { tone: 'not-an-option' },
    }, OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE, waiting.id, waiting.contextId)), callContext);
    expect(isTask(retry) && retry.status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
    expect(isTask(retry) && retry.status?.message?.parts[0]?.content).toMatchObject({
      $case: 'text',
      value: expect.stringContaining('not an allowed option'),
    });

    const unchanged = await handler.getTask({ tenant: '', id: waiting.id }, callContext);
    expect(unchanged.status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
    expect(daemon.prompts).toEqual(['Create a page.']);
  });

  it('cancels the active Open Design run and the A2A task', async () => {
    const daemon = new RunningDaemonClient();
    const handler = new DefaultRequestHandler(
      buildOpenDesignAgentCard('http://127.0.0.1:7456', 'test'),
      new InMemoryTaskStore(),
      new OpenDesignA2AExecutor({ daemon, pollIntervalMs: 1 }),
    );
    const callContext = new ServerCallContext({ requestedVersion: '1.0' });
    const first = await handler.sendMessage(sendRequest(textMessage('Create a page.')), callContext);
    expect(isTask(first)).toBe(true);
    if (!isTask(first)) return;

    const canceled = await handler.cancelTask({
      tenant: '',
      id: first.id,
      metadata: undefined,
    }, callContext);
    expect(canceled.status?.state).toBe(TaskState.TASK_STATE_CANCELED);
    expect(daemon.canceledRunIds).toEqual(['run-1']);
  });
});

function sendRequest(
  message: Message,
  openDesign?: OpenDesignA2ARequestMetadata,
): SendMessageRequest {
  return {
    tenant: '',
    message,
    configuration: {
      acceptedOutputModes: [],
      taskPushNotificationConfig: undefined,
      historyLength: 100,
      returnImmediately: true,
    },
    metadata: openDesign ? { openDesign } : {},
  };
}

function textMessage(text: string): Message {
  return {
    messageId: randomUUID(),
    contextId: '',
    taskId: '',
    role: Role.ROLE_USER,
    parts: [{
      content: { $case: 'text', value: text },
      mediaType: 'text/plain',
      filename: '',
      metadata: {},
    }],
    metadata: {},
    extensions: [],
    referenceTaskIds: [],
  };
}

function dataMessage(
  value: unknown,
  mediaType: string,
  taskId: string,
  contextId: string,
): Message {
  return {
    messageId: randomUUID(),
    contextId,
    taskId,
    role: Role.ROLE_USER,
    parts: [{
      content: { $case: 'data', value },
      mediaType,
      filename: '',
      metadata: {},
    }],
    metadata: {},
    extensions: [],
    referenceTaskIds: [],
  };
}

async function waitForState(
  handler: DefaultRequestHandler,
  taskId: string,
  expected: TaskState,
  context: ServerCallContext,
): Promise<Task> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = await handler.getTask({ tenant: '', id: taskId }, context);
    if (task.status?.state === expected) return task;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`A2A task ${taskId} did not reach state ${expected}`);
}

function isTask(value: Message | Task): value is Task {
  return 'status' in value;
}
