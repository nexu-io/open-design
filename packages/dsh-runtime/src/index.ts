import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import {
  installModelSelection,
  type AgentHandle,
  type ModelSelectionRef,
} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-default-model';
import {
  createUserMessage,
  ReasoningEffortId,
  type ContentBlock,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm';
import { SessionId, type SessionEvent, type TurnEndReason } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-cmdline';
import {
  CAPABILITIES,
  identityFrame,
  modelsFrame,
  parseHostCommand,
  type ExecuteCommand,
  type ModelCatalogEntry,
} from './protocol.js';

export const name = 'open-design-runtime';
export const inject = [
  'openDesignStartup',
  'agentDefaultModel',
  'agents',
  'llm',
  'sessions',
  'sessionPersistence',
];

const PLUGIN_VERSION = '0.1.0';

type Output = { write(chunk: string): unknown };
type ExitFallbackTimer = { unref(): unknown };
type ExitFallbackScheduler = (callback: () => void, delayMs: number) => ExitFallbackTimer;
type CancellationLatch = {
  activate(requestId: string, controller: AbortController): void;
  cancel(requestId: string): void;
};

const PROCESS_EXIT_FALLBACK_MS = 1_000;

function writeFrame(output: Output, frame: unknown): void {
  output.write(`${JSON.stringify(frame)}\n`);
}

function errorFacts(error: unknown, fallbackCode: string): { code: string; message: string } {
  const candidate = typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown }
    : undefined;
  const code = typeof candidate?.code === 'string' && candidate.code !== ''
    ? candidate.code
    : fallbackCode;
  if (error instanceof Error && error.message !== '') return { code, message: error.message };
  if (typeof candidate?.message === 'string' && candidate.message !== '') {
    return { code, message: candidate.message };
  }
  if (typeof error === 'string' && error !== '') return { code, message: error };
  return { code, message: 'DeepSeek Harness reported an execution error.' };
}

function contentText(content: readonly ContentBlock[]): string {
  const text: string[] = [];
  const visit = (blocks: readonly ContentBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'text' || block.type === 'reasoning') text.push(block.text);
      if (block.type === 'tool-result') visit(block.content);
    }
  };
  visit(content);
  return text.join('');
}

function resultStatus(reason: TurnEndReason | undefined): 'completed' | 'cancelled' | 'failed' {
  if (reason?.kind === 'completed' || reason?.kind === 'max-tokens') return 'completed';
  if (reason?.kind === 'aborted') return 'cancelled';
  return 'failed';
}

function resultError(reason: TurnEndReason | undefined): { code: string; message: string } | undefined {
  if (resultStatus(reason) !== 'failed') return undefined;
  if (!reason) {
    return {
      code: 'DSH_PROFILE_MISSING_TURN_END',
      message: 'DeepSeek Harness became idle without reporting how the turn ended.',
    };
  }
  if (reason.kind === 'error') return errorFacts(reason.error, 'DSH_PROFILE_TURN_FAILED');
  if (reason.kind === 'blocked') {
    return {
      code: 'DSH_PROFILE_TURN_BLOCKED',
      message: 'DeepSeek Harness blocked the turn before it completed.',
    };
  }
  return {
    code: 'DSH_PROFILE_TURN_FAILED',
    message: `DeepSeek Harness ended the turn with reason "${reason.kind}".`,
  };
}

function terminalOutput(output: string): { output: string } | Record<string, never> {
  return output === '' ? {} : { output };
}

function writeCancelledResult(output: Output, requestId: string, sessionId: string): void {
  writeFrame(output, {
    v: 1,
    type: 'result',
    request_id: requestId,
    status: 'cancelled',
    session_id: sessionId,
    resume_rejected: false,
  });
}

function requestProfileExit(
  exit: (code: number) => void,
  forceExit: () => void = () => process.exit(0),
  schedule: ExitFallbackScheduler = (callback, delayMs) => setTimeout(callback, delayMs),
): void {
  exit(0);
  // rc.6 can finish root disposal before its launcher-owned file watchers are
  // attached, leaving a one-shot profile alive when the host keeps stdin open.
  // The agent handle and session flush have already settled here, so retain a
  // bounded process fallback below OD's three-second cancellation grace.
  schedule(forceExit, PROCESS_EXIT_FALLBACK_MS).unref();
}

function createCancellationLatch(cancelActiveAgent: () => void): CancellationLatch {
  const pendingRequestIds = new Set<string>();
  let activeRequest: { requestId: string; controller: AbortController } | undefined;

  const cancelActive = () => {
    if (!activeRequest || activeRequest.controller.signal.aborted) return;
    activeRequest.controller.abort();
    cancelActiveAgent();
  };

  return {
    activate(requestId, controller) {
      activeRequest = { requestId, controller };
      if (pendingRequestIds.delete(requestId)) cancelActive();
    },
    cancel(requestId) {
      if (activeRequest?.requestId === requestId) {
        cancelActive();
        return;
      }
      // The host can cancel during the child-spawn/profile-handshake window,
      // before the execute line has created its AbortController. Retain that
      // request-scoped intent and replay it as soon as execute becomes active.
      pendingRequestIds.add(requestId);
    },
  };
}

function usageFrame(requestId: string, provider: string, model: string, usage: TokenUsage) {
  return {
    v: 1,
    type: 'usage',
    request_id: requestId,
    provider,
    model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    ...(usage.cacheReadTokens === undefined ? {} : { cache_read_tokens: usage.cacheReadTokens }),
    ...(usage.cacheWriteTokens === undefined ? {} : { cache_write_tokens: usage.cacheWriteTokens }),
  };
}

async function listModelCatalog(ctx: Context): Promise<ModelCatalogEntry[]> {
  const catalog: ModelCatalogEntry[] = [];
  for (const provider of ctx.llm.listProviders()) {
    try {
      for (const model of await ctx.llm.listModels(provider.id)) {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id).catch(() => null);
        catalog.push({
          provider: provider.id,
          provider_name: provider.name,
          id: model.id,
          name: model.name,
          ...(resolved?.reasoning?.efforts.length
            ? {
                reasoning_options: resolved.reasoning.efforts.map((effort) => ({
                  id: String(effort.id),
                  name: effort.name,
                  ...(resolved.reasoning?.defaultEffort === effort.id ? { default: true } : {}),
                })),
              }
            : {}),
        });
      }
    } catch {
      ctx.logger.warn(`open-design-runtime: could not list models for provider "${provider.id}"`);
    }
  }
  return catalog;
}

function emitSessionEvent(
  output: Output,
  request: ExecuteCommand,
  provider: string,
  model: string,
  event: SessionEvent,
): void {
  switch (event.type) {
    case 'assistant/chunk': {
      const chunk = event.data.chunk;
      if (chunk.type === 'text-delta' && chunk.text !== '') {
        writeFrame(output, { v: 1, type: 'text', request_id: request.request_id, content: chunk.text });
      } else if (chunk.type === 'reasoning-delta' && chunk.text !== '') {
        writeFrame(output, { v: 1, type: 'thinking', request_id: request.request_id, content: chunk.text });
      }
      return;
    }
    case 'tool/call':
      writeFrame(output, {
        v: 1,
        type: 'tool_call',
        request_id: request.request_id,
        call_id: String(event.data.callId),
        name: event.data.name,
        arguments: event.data.arguments,
      });
      return;
    case 'tool/result':
      writeFrame(output, {
        v: 1,
        type: 'tool_result',
        request_id: request.request_id,
        call_id: String(event.data.message.content[0].toolCallId),
        name: event.data.error?.name ?? 'tool',
        output: contentText(event.data.message.content[0].content),
        is_error: event.data.message.content[0].isError === true,
      });
      return;
    case 'assistant/message':
      if (event.data.usage) writeFrame(output, usageFrame(request.request_id, provider, model, event.data.usage));
      return;
    default:
      return;
  }
}

async function execute(
  ctx: Context,
  request: ExecuteCommand,
  output: Output,
  onHandle: (handle: AgentHandle | undefined) => void,
  signal: AbortSignal,
): Promise<void> {
  const defaultSelection = ctx.agentDefaultModel.currentSelection();
  const baseSelection = request.model
    ? { provider: request.model.provider, model: request.model.id }
    : defaultSelection;
  const selection = request.reasoning_effort
    ? { ...baseSelection, reasoningEffort: ReasoningEffortId(request.reasoning_effort) }
    : baseSelection;
  const sessionId = SessionId(request.resume_session_id ?? `od-${randomUUID()}`);
  let handle: AgentHandle | undefined;
  let firstSeq = Number.POSITIVE_INFINITY;
  let turnEnd: SessionEvent<'turn/end'> | undefined;
  let assistantOutput = '';
  const setup = (agentCtx: Context) => {
    const selected: ModelSelectionRef = { current: selection, assembled: undefined };
    installModelSelection(agentCtx, selected);
  };
  let disposeEvent = () => {};
  const onSessionEvent = (session: { id: unknown }, event: SessionEvent) => {
    if (String(session.id) !== String(sessionId) || event.seq < firstSeq) return;
    emitSessionEvent(output, request, selection.provider, selection.model, event);
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
      assistantOutput += event.data.chunk.text;
    }
    if (event.type === 'turn/end') turnEnd = event;
  };

  try {
    try {
      handle = request.resume_session_id
        ? await ctx.agents.resume({ resumeSessionId: sessionId, agentOptions: selection, setup, signal })
        : await ctx.agents.create({
            sessionId,
            meta: { cwd: request.cwd },
            agentOptions: selection,
            setup,
            signal,
          });
      onHandle(handle);
    } catch (error: unknown) {
      if (signal.aborted) {
        writeCancelledResult(output, request.request_id, String(sessionId));
        return;
      }
      const facts = errorFacts(error, request.resume_session_id
        ? 'DSH_PROFILE_RESUME_REJECTED'
        : 'DSH_PROFILE_SESSION_CREATE_FAILED');
      writeFrame(output, {
        v: 1,
        type: 'result',
        request_id: request.request_id,
        status: 'failed',
        session_id: String(sessionId),
        resume_rejected: Boolean(request.resume_session_id),
        error: facts,
      });
      return;
    }

    writeFrame(output, {
      v: 1,
      type: 'session',
      request_id: request.request_id,
      session_id: String(sessionId),
      resumed: Boolean(request.resume_session_id),
    });
    await handle.agent.whenIdle();
    if (signal.aborted) {
      writeCancelledResult(output, request.request_id, String(sessionId));
      return;
    }
    firstSeq = handle.agent.session.seq + 1;
    disposeEvent = ctx.on('session/event', onSessionEvent);
    await handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: request.prompt }],
      source: { kind: 'user' },
    }));
    await handle.agent.whenIdle();
    await ctx.sessions.flush(handle.agent.session);
    if (signal.aborted) {
      writeCancelledResult(output, request.request_id, String(sessionId));
      return;
    }

    const reason = turnEnd?.data.reason;
    const status = resultStatus(reason);
    const failed = resultError(reason);
    writeFrame(output, {
      v: 1,
      type: 'result',
      request_id: request.request_id,
      status,
      session_id: String(sessionId),
      ...terminalOutput(assistantOutput),
      stop_reason: reason?.kind ?? 'unknown',
      resume_rejected: false,
      ...(failed === undefined ? {} : { error: failed }),
    });
  } catch (error: unknown) {
    if (signal.aborted) {
      writeCancelledResult(output, request.request_id, String(sessionId));
      return;
    }
    writeFrame(output, {
      v: 1,
      type: 'result',
      request_id: request.request_id,
      status: 'failed',
      session_id: String(sessionId),
      resume_rejected: false,
      error: errorFacts(error, 'DSH_PROFILE_EXECUTION_FAILED'),
    });
  } finally {
    disposeEvent();
    await handle?.dispose().catch(() => undefined);
    onHandle(undefined);
  }
}

async function serve(
  ctx: Context,
  output: Output,
  exit: (code: number) => void,
  input: Readable = process.stdin,
  finishProfile: (exitCallback: (code: number) => void) => void = requestProfileExit,
): Promise<void> {
  writeFrame(output, identityFrame('ready', PLUGIN_VERSION));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let requestId: string | null = null;
  let handle: AgentHandle | undefined;
  let task: Promise<void> | undefined;
  const cancellation = createCancellationLatch(() => {
    handle?.agent.cancel({ kind: 'user' });
  });
  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      lines.close();
      input.destroy();
      resolve();
    };
    lines.on('line', (line) => {
      if (line.trim() === '') return;
      let command;
      try {
        command = parseHostCommand(JSON.parse(line) as unknown);
      } catch {
        writeFrame(output, {
          v: 1,
          type: 'protocol_error',
          ...(requestId ? { request_id: requestId } : {}),
          code: 'DSH_PROFILE_INVALID_COMMAND',
          message: 'OpenDesign sent an invalid profile command.',
        });
        return;
      }
      if (command.type === 'cancel') {
        cancellation.cancel(command.request_id);
        return;
      }
      if (task) {
        writeFrame(output, {
          v: 1,
          type: 'protocol_error',
          request_id: command.request_id,
          code: 'DSH_PROFILE_BUSY',
          message: 'This profile process accepts exactly one execute command.',
        });
        return;
      }
      requestId = command.request_id;
      const taskAbort = new AbortController();
      cancellation.activate(requestId, taskAbort);
      task = execute(
        ctx,
        command,
        output,
        (nextHandle) => { handle = nextHandle; },
        taskAbort.signal,
      );
      void task.finally(settle);
    });
    lines.on('close', () => {
      if (!task) settle();
    });
  });
  finishProfile(exit);
}

export function apply(ctx: Context): void {
  const startup = ctx.openDesignStartup;
  const exit = ctx.get('appExit');
  if (!startup || !exit) throw new Error('open-design-runtime requires startup and appExit services');
  if (startup.mode === 'probe') {
    writeFrame(process.stdout, identityFrame('probe', PLUGIN_VERSION));
    exit(0);
    return;
  }
  void ctx.get('loader')?.await().then(async () => {
    if (startup.mode === 'models') {
      writeFrame(process.stdout, modelsFrame(await listModelCatalog(ctx)));
      exit(0);
      return;
    }
    await serve(ctx, process.stdout, exit);
  }).catch((error: unknown) => {
    process.stderr.write(`open-design-runtime: ${error instanceof Error ? error.message : String(error)}\n`);
    exit(1);
  });
}

export const internals = {
  contentText,
  createCancellationLatch,
  errorFacts,
  emitSessionEvent,
  execute,
  listModelCatalog,
  requestProfileExit,
  resultStatus,
  resultError,
  serve,
  terminalOutput,
};
