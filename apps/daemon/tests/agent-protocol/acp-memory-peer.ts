import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { attachAcpSession } from '../../src/agent-protocol/index.js';

type JsonObject = Record<string, unknown>;
type Terminal = 'completed' | 'fatal';
type RpcRequest = { id: string | number; method: string; params: JsonObject };

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object in the ACP memory-peer fixture');
  }
  return value as JsonObject;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// Same in-memory child seam as acp.test.ts. No executable, server, model,
// private parser stub, or generated host tool event is involved.
class MemoryAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill() {
    this.killed = true;
    return true;
  }
}

export const TODO_ID = 'd1-native-todo';
export const TODO_INPUT = {
  todos: [{ content: 'Generate the short video', status: 'in_progress' }],
};

export function textUpdate(text: string): JsonObject {
  return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } };
}

export function completedTodoUpdates(): JsonObject[] {
  // Vela's documented frame shape uses kind, not a fabricated name field.
  // These are synthetic protocol inputs, not proof of actual tool execution.
  return [
    { sessionUpdate: 'tool_call', toolCallId: TODO_ID, kind: 'todowrite', title: 'todowrite', status: 'pending', rawInput: TODO_INPUT },
    { sessionUpdate: 'tool_call_update', toolCallId: TODO_ID, status: 'completed', rawOutput: 'Todo list updated' },
  ];
}

export async function runMemoryAcpTurn(options: {
  amr: boolean;
  prompt: string;
  updates: JsonObject[];
  outputTokens?: number;
  onSend?: (event: string, payload: JsonObject, replayPromptResultSynchronously: () => void) => void;
}) {
  const child = new MemoryAcpChild();
  const terminal = deferred<Terminal>();
  const terminals: Terminal[] = [];
  const requests: RpcRequest[] = [];
  const inbox: RpcRequest[] = [];
  const waiters = new Map<string, ReturnType<typeof deferred<RpcRequest>>>();
  const events: Array<{ event: string; payload: JsonObject; hostSynthesized: boolean }> = [];
  const completionOrder: string[] = [];
  let promptResultFrame: string | null = null;
  let promptCompleteCount = 0;
  let pendingStdin = '';

  child.stdin.on('data', (chunk: Buffer | string) => {
    pendingStdin += String(chunk);
    let newline: number;
    while ((newline = pendingStdin.indexOf('\n')) !== -1) {
      const line = pendingStdin.slice(0, newline);
      pendingStdin = pendingStdin.slice(newline + 1);
      if (!line.trim()) continue;
      const frame = object(JSON.parse(line));
      if ((typeof frame.id !== 'number' && typeof frame.id !== 'string') || typeof frame.method !== 'string') {
        throw new Error('Expected an outbound ACP request with its actual id');
      }
      const request = { id: frame.id, method: frame.method, params: object(frame.params) };
      requests.push(request);
      const waiter = waiters.get(request.method);
      if (waiter) {
        waiters.delete(request.method);
        waiter.resolve(request);
      } else {
        inbox.push(request);
      }
    }
  });

  async function takeRequest(method: string): Promise<RpcRequest> {
    const index = inbox.findIndex((request) => request.method === method);
    if (index >= 0) return inbox.splice(index, 1)[0]!;
    const waiter = deferred<RpcRequest>();
    waiters.set(method, waiter);
    return waiter.promise;
  }

  function reply(request: RpcRequest, result: JsonObject) {
    child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
  }

  const session = attachAcpSession({
    child: child as unknown as Parameters<typeof attachAcpSession>[0]['child'],
    prompt: options.prompt,
    model: options.amr ? 'deepseek-v4-flash' : null,
    mcpServers: [],
    ...(options.amr ? { modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE' as const } : {}),
    send(event, payload, meta) {
      const body = object(payload);
      events.push({ event, payload: body, hostSynthesized: meta?.hostSynthesized === true });
      if (event === 'agent' && body.type === 'text_delta') completionOrder.push('text_delta');
      if (event === 'agent' && body.type === 'status' && body.label === 'streaming') completionOrder.push('streaming');
      options.onSend?.(event, body, () => {
        if (promptResultFrame === null) throw new Error('No actual prompt result is available to replay');
        completionOrder.push('replay_prompt_result');
        // Explicit synchronous EventEmitter delivery through the public
        // stdout boundary. A nested PassThrough.write may queue instead;
        // this does not model ordinary asynchronous process pipe scheduling.
        child.stdout.emit('data', promptResultFrame);
      });
    },
    onPromptComplete() {
      promptCompleteCount += 1;
      completionOrder.push('onPromptComplete');
    },
    onTerminal(kind) {
      terminals.push(kind);
      completionOrder.push(`terminal:${kind}`);
      terminal.resolve(kind);
    },
  });

  const observe = () => ({
    visibleText: events.filter((entry) => entry.event === 'agent' && entry.payload.type === 'text_delta')
      .map((entry) => String(entry.payload.delta)).join(''),
    textDeltas: events.filter((entry) => entry.event === 'agent' && entry.payload.type === 'text_delta')
      .map((entry) => String(entry.payload.delta)),
    tools: events.filter((entry) => entry.event === 'agent' &&
      (entry.payload.type === 'tool_use' || entry.payload.type === 'tool_result'))
      .map((entry) => ({
        origin: entry.hostSynthesized ? 'host_flush' : 'agent_frame',
        type: entry.payload.type,
        id: entry.payload.id ?? entry.payload.toolUseId,
        name: entry.payload.name,
        input: entry.payload.input,
        content: entry.payload.content,
        isError: entry.payload.isError,
      })),
    errors: events.filter((entry) => entry.event === 'error').map((entry) => {
      const error = entry.payload.error == null ? {} : object(entry.payload.error);
      const details = error.details == null ? {} : object(error.details);
      return {
        message: entry.payload.message,
        code: error.code,
        retryable: error.retryable,
        kind: details.kind,
        action: details.action,
      };
    }),
    fatal: session.hasFatalError(),
    completed: session.completedSuccessfully(),
    promptCompleteCount,
    terminals: [...terminals],
    completionOrder: [...completionOrder],
  });

  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const drive = async () => {
      reply(await takeRequest('initialize'), { protocolVersion: 1 });
      reply(await takeRequest('session/new'), { sessionId: 'd1-memory-session' });
      if (options.amr) reply(await takeRequest('session/set_model'), {});
      const promptRequest = await takeRequest('session/prompt');
      for (const update of options.updates) {
        child.stdout.write(`${JSON.stringify({
          jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'd1-memory-session', update },
        })}\n`);
      }
      const beforePromptResult = observe();
      promptResultFrame = `${JSON.stringify({
        jsonrpc: '2.0', id: promptRequest.id,
        result: {
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: options.outputTokens ?? 10 },
        },
      })}\n`;
      child.stdout.write(promptResultFrame);
      // onPromptComplete runs BEFORE the production flush. onTerminal is the
      // completion signal; awaiting it also lets the fatal callback's stack
      // finish publishing its error DTO before observation.
      await terminal.promise;
      return {
        ...observe(),
        beforePromptResult,
        requestMethods: requests.map((request) => request.method),
        selectedModel: requests.find((request) => request.method === 'session/set_model')?.params.modelId,
        sentPrompt: promptRequest.params.prompt,
        inputCompletedToolFrames: options.updates.filter((update) =>
          update.sessionUpdate === 'tool_call_update' && update.status === 'completed').length,
      };
    };
    const budget = new Promise<never>((_, reject) => {
      // Failure budget only: normal completion never waits for this timer.
      budgetTimer = setTimeout(() => reject(new Error('ACP memory-peer terminal signal did not arrive')), 5_000);
    });
    return await Promise.race([drive(), budget]);
  } finally {
    if (budgetTimer !== undefined) clearTimeout(budgetTimer);
    // The returned observation was taken before cleanup. Abort cannot turn a
    // missing terminal signal into a passing result.
    session.abort();
    child.stdin.removeAllListeners();
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    child.removeAllListeners();
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}

export type AcpTurnObservation = Awaited<ReturnType<typeof runMemoryAcpTurn>>;

export function safeObservation(turn: AcpTurnObservation): string {
  // All visible/tool content is this file's synthetic fixture. Deliberately
  // exclude cwd, outbound prompt, process environment and raw diagnostics.
  const { sentPrompt: _prompt, ...safe } = turn;
  return JSON.stringify(safe);
}
