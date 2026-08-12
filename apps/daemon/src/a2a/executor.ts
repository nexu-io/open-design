import {
  OPEN_DESIGN_A2A_ARTIFACT_MEDIA_TYPE,
  OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE,
  OPEN_DESIGN_QUESTION_FORM_MEDIA_TYPE,
  type OpenDesignA2ARequestMetadata,
  type QuestionForm,
  type QuestionFormEnvelope,
} from '@open-design/contracts';
import {
  Role,
  TaskState,
  type Artifact,
  type Message,
  type Part,
  type Task,
  type TaskStatus,
} from '@a2a-js/sdk';
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from '@a2a-js/sdk/server';
import {
  ContentTypeNotSupportedError,
  RequestMalformedError,
  TaskNotCancelableError,
  TaskNotFoundError,
} from '@a2a-js/sdk/errors';
import { randomUUID } from 'node:crypto';

import type {
  OpenDesignA2ADaemonClient,
  OpenDesignContextRef,
  OpenDesignRunRef,
} from './daemon-client.js';
import {
  formatQuestionFormAnswers,
  parseCompletedQuestionForm,
  parseQuestionFormAnswer,
} from './question-form.js';

interface OpenDesignTaskRecord extends OpenDesignContextRef {
  taskId: string;
  contextId: string;
  currentRun: OpenDesignRunRef | null;
  pendingForm: QuestionForm | null;
  requestMetadata: OpenDesignA2ARequestMetadata;
  seenMessageIds: Set<string>;
  cancelRequested: boolean;
}

export interface OpenDesignA2AExecutorOptions {
  daemon: OpenDesignA2ADaemonClient;
  pollIntervalMs?: number;
}

export class OpenDesignA2AExecutor implements AgentExecutor {
  private readonly daemon: OpenDesignA2ADaemonClient;
  private readonly pollIntervalMs: number;
  private readonly tasks = new Map<string, OpenDesignTaskRecord>();
  private readonly contexts = new Map<string, OpenDesignContextRef>();

  constructor(options: OpenDesignA2AExecutorOptions) {
    this.daemon = options.daemon;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  execute = async (
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> => {
    const incoming = requestContext.userMessage;
    const existing = this.tasks.get(requestContext.taskId);
    if (existing?.seenMessageIds.has(incoming.messageId)) {
      if (!requestContext.task) throw new RequestMalformedError('duplicate message has no task');
      eventBus.publish(AgentEvent.task(requestContext.task));
      return;
    }

    if (requestContext.task) {
      await this.continueTask(requestContext, eventBus, existing);
      return;
    }

    await this.startTask(requestContext, eventBus);
  };

  cancelTask = async (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    const record = this.tasks.get(taskId);
    if (!record) throw new TaskNotFoundError(`A2A task not found: ${taskId}`);
    if (record.cancelRequested) throw new TaskNotCancelableError('task cancellation is already in progress');
    record.cancelRequested = true;
    if (record.currentRun) {
      await this.daemon.cancelRun(record.currentRun.runId);
    }
    eventBus.publish(AgentEvent.statusUpdate({
      taskId,
      contextId: record.contextId,
      status: status(TaskState.TASK_STATE_CANCELED, agentMessage({
        taskId,
        contextId: record.contextId,
        text: 'Open Design task canceled.',
      })),
      metadata: {},
    }));
    record.currentRun = null;
    record.pendingForm = null;
  };

  private async startTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const prompt = requireTextPrompt(requestContext.userMessage);
    const requestMetadata = requestMetadataFrom(requestContext);
    const context = this.contexts.get(requestContext.contextId)
      ?? await this.daemon.resolveContext(requestMetadata, prompt);
    this.contexts.set(requestContext.contextId, context);
    const run = await this.daemon.startRun(context, prompt, requestMetadata);
    const record: OpenDesignTaskRecord = {
      taskId: requestContext.taskId,
      contextId: requestContext.contextId,
      ...context,
      currentRun: run,
      pendingForm: null,
      requestMetadata,
      seenMessageIds: new Set([requestContext.userMessage.messageId]),
      cancelRequested: false,
    };
    this.tasks.set(record.taskId, record);
    eventBus.publish(AgentEvent.task(taskSnapshot(record, requestContext.userMessage)));
    await this.waitForRun(record, eventBus);
  }

  private async continueTask(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
    record: OpenDesignTaskRecord | undefined,
  ): Promise<void> {
    if (!record) throw new TaskNotFoundError(`A2A task not found: ${requestContext.taskId}`);
    if (requestContext.contextId !== record.contextId) {
      throw new RequestMalformedError('taskId and contextId do not match');
    }
    if (requestContext.task?.status?.state !== TaskState.TASK_STATE_INPUT_REQUIRED) {
      throw new RequestMalformedError('task is not waiting for clarification input');
    }
    if (!record.pendingForm) {
      throw new RequestMalformedError('task has no pending Open Design question form');
    }

    const answerPart = requestContext.userMessage.parts.find((part) =>
      part.mediaType === OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE
      && part.content?.$case === 'data');
    if (!answerPart || answerPart.content?.$case !== 'data') {
      publishQuestionForm(
        record,
        eventBus,
        record.pendingForm,
        `Clarification answers require ${OPEN_DESIGN_QUESTION_FORM_ANSWER_MEDIA_TYPE}.`,
      );
      return;
    }
    let answer: ReturnType<typeof parseQuestionFormAnswer>;
    try {
      answer = parseQuestionFormAnswer(answerPart.content.value, record.pendingForm);
    } catch (error) {
      publishQuestionForm(
        record,
        eventBus,
        record.pendingForm,
        `Invalid clarification answer: ${safeErrorMessage(error, 'invalid answer')}`,
      );
      return;
    }
    const prompt = formatQuestionFormAnswers(record.pendingForm, answer.answers);
    const nextRun = await this.daemon.startRun({
      projectId: record.projectId,
      conversationId: record.conversationId,
    }, prompt, record.requestMetadata);
    record.seenMessageIds.add(requestContext.userMessage.messageId);
    record.pendingForm = null;
    record.cancelRequested = false;
    record.currentRun = nextRun;
    eventBus.publish(AgentEvent.task(taskSnapshot(
      record,
      requestContext.userMessage,
      requestContext.task.history,
      requestContext.task.artifacts,
    )));
    await this.waitForRun(record, eventBus);
  }

  private async waitForRun(
    record: OpenDesignTaskRecord,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const run = record.currentRun;
    if (!run) throw new Error('Open Design task has no active run');

    try {
      while (!record.cancelRequested) {
        const current = await this.daemon.getRun(run);
        if (current.status === 'queued' || current.status === 'running') {
          await delay(this.pollIntervalMs);
          continue;
        }

        record.currentRun = null;
        if (current.status === 'canceled') {
          eventBus.publish(AgentEvent.statusUpdate({
            taskId: record.taskId,
            contextId: record.contextId,
            status: status(TaskState.TASK_STATE_CANCELED, agentMessage({
              taskId: record.taskId,
              contextId: record.contextId,
              text: 'Open Design canceled the run.',
            })),
            metadata: {},
          }));
          return;
        }
        if (current.status !== 'succeeded') {
          const detail = current.error || current.errorCode || 'Open Design run failed';
          eventBus.publish(AgentEvent.statusUpdate({
            taskId: record.taskId,
            contextId: record.contextId,
            status: status(TaskState.TASK_STATE_FAILED, agentMessage({
              taskId: record.taskId,
              contextId: record.contextId,
              text: detail,
            })),
            metadata: {},
          }));
          return;
        }

        if (current.questionForm) {
          record.pendingForm = current.questionForm.form;
          publishQuestionForm(
            record,
            eventBus,
            current.questionForm.form,
            current.questionFormDiagnostic?.repaired
              ? 'Open Design recovered the clarification form and needs your input before continuing.'
              : 'Open Design needs clarification before continuing.',
          );
          return;
        }

        const result = await this.daemon.getRunResult(run);
        const parsedForm = parseCompletedQuestionForm(result.message ?? '');
        if (parsedForm.kind === 'invalid') {
          eventBus.publish(AgentEvent.statusUpdate({
            taskId: record.taskId,
            contextId: record.contextId,
            status: status(TaskState.TASK_STATE_FAILED, agentMessage({
              taskId: record.taskId,
              contextId: record.contextId,
              text: `Open Design returned an invalid question form: ${parsedForm.reason}`,
            })),
            metadata: {},
          }));
          return;
        }
        if (parsedForm.kind === 'valid') {
          record.pendingForm = parsedForm.form;
          publishQuestionForm(
            record,
            eventBus,
            parsedForm.form,
            parsedForm.prose || 'Open Design needs clarification before continuing.',
          );
          return;
        }

        const artifact = resultArtifact(record.taskId, result.message, result.artifact);
        eventBus.publish(AgentEvent.artifactUpdate({
          taskId: record.taskId,
          contextId: record.contextId,
          artifact,
          append: false,
          lastChunk: true,
          metadata: {},
        }));
        eventBus.publish(AgentEvent.statusUpdate({
          taskId: record.taskId,
          contextId: record.contextId,
          status: status(TaskState.TASK_STATE_COMPLETED, agentMessage({
            taskId: record.taskId,
            contextId: record.contextId,
            text: result.message || 'Open Design completed the design task.',
          })),
          metadata: {},
        }));
        return;
      }
    } catch (error) {
      console.warn('[a2a] Open Design run polling failed', error);
      record.currentRun = null;
      record.pendingForm = null;
      eventBus.publish(AgentEvent.statusUpdate({
        taskId: record.taskId,
        contextId: record.contextId,
        status: status(TaskState.TASK_STATE_FAILED, agentMessage({
          taskId: record.taskId,
          contextId: record.contextId,
          text: 'Open Design became unavailable while running the task.',
        })),
        metadata: {},
      }));
    }
  }
}

function publishQuestionForm(
  record: OpenDesignTaskRecord,
  eventBus: ExecutionEventBus,
  form: QuestionForm,
  text: string,
): void {
  const envelope: QuestionFormEnvelope = { schemaVersion: 1, form };
  eventBus.publish(AgentEvent.statusUpdate({
    taskId: record.taskId,
    contextId: record.contextId,
    status: status(TaskState.TASK_STATE_INPUT_REQUIRED, agentMessage({
      taskId: record.taskId,
      contextId: record.contextId,
      text,
      data: envelope,
      dataMediaType: OPEN_DESIGN_QUESTION_FORM_MEDIA_TYPE,
    })),
    metadata: {},
  }));
}

function taskSnapshot(
  record: OpenDesignTaskRecord,
  userMessage: Message,
  history: Message[] = [],
  artifacts: Artifact[] = [],
): Task {
  return {
    id: record.taskId,
    contextId: record.contextId,
    status: status(TaskState.TASK_STATE_WORKING, agentMessage({
      taskId: record.taskId,
      contextId: record.contextId,
      text: 'Open Design is working on the task.',
    })),
    artifacts,
    history: history.some((message) => message.messageId === userMessage.messageId)
      ? history
      : [...history, userMessage],
    metadata: {
      openDesign: {
        projectId: record.projectId,
        conversationId: record.conversationId,
        runId: record.currentRun?.runId ?? null,
      },
    },
  };
}

function resultArtifact(
  taskId: string,
  message: string | null,
  data: Awaited<ReturnType<OpenDesignA2ADaemonClient['getRunResult']>>['artifact'],
): Artifact {
  const parts: Part[] = [];
  if (message) parts.push(textPart(message));
  parts.push(dataPart(data, OPEN_DESIGN_A2A_ARTIFACT_MEDIA_TYPE));
  if (data.studioUrl) parts.push(urlPart(data.studioUrl, 'Open Design studio'));
  if (data.previewUrl) parts.push(urlPart(data.previewUrl, data.entryFile || 'Open Design preview'));
  return {
    artifactId: `${taskId}-result`,
    name: 'Open Design result',
    description: 'Generated design metadata and browser links.',
    parts,
    metadata: {},
    extensions: [],
  };
}

function agentMessage(input: {
  taskId: string;
  contextId: string;
  text: string;
  data?: unknown;
  dataMediaType?: string;
}): Message {
  const parts = [textPart(input.text)];
  if (input.data !== undefined) {
    parts.push(dataPart(input.data, input.dataMediaType ?? 'application/json'));
  }
  return {
    messageId: randomUUID(),
    contextId: input.contextId,
    taskId: input.taskId,
    role: Role.ROLE_AGENT,
    parts,
    metadata: {},
    extensions: [],
    referenceTaskIds: [],
  };
}

function status(state: TaskState, message: Message): TaskStatus {
  return { state, message, timestamp: new Date().toISOString() };
}

function textPart(value: string): Part {
  return {
    content: { $case: 'text', value },
    mediaType: 'text/plain',
    filename: '',
    metadata: {},
  };
}

function dataPart(value: unknown, mediaType: string): Part {
  return {
    content: { $case: 'data', value },
    mediaType,
    filename: '',
    metadata: {},
  };
}

function urlPart(value: string, filename: string): Part {
  return {
    content: { $case: 'url', value },
    mediaType: 'text/html',
    filename,
    metadata: {},
  };
}

function requireTextPrompt(message: Message): string {
  const prompt = message.parts
    .filter((part) => part.content?.$case === 'text')
    .map((part) => part.content?.$case === 'text' ? part.content.value : '')
    .join('\n')
    .trim();
  if (!prompt) throw new ContentTypeNotSupportedError('Open Design requires a text prompt');
  return prompt;
}

function requestMetadataFrom(context: RequestContext): OpenDesignA2ARequestMetadata {
  const requestMetadata = isRecord(context.request.metadata?.openDesign)
    ? context.request.metadata.openDesign
    : {};
  const messageMetadata = isRecord(context.userMessage.metadata?.openDesign)
    ? context.userMessage.metadata.openDesign
    : {};
  return normalizeRequestMetadata({ ...requestMetadata, ...messageMetadata });
}

function normalizeRequestMetadata(value: Record<string, unknown>): OpenDesignA2ARequestMetadata {
  const stringKeys = [
    'projectId',
    'projectName',
    'conversationId',
    'agentId',
    'model',
    'skillId',
    'pluginId',
  ] as const;
  const output: OpenDesignA2ARequestMetadata = {};
  for (const key of stringKeys) {
    if (typeof value[key] === 'string' && value[key].trim()) output[key] = value[key].trim();
  }
  if (isRecord(value.pluginInputs)) output.pluginInputs = value.pluginInputs;
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  return message ? message.slice(0, 1_000) : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
