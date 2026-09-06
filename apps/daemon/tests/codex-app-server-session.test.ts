import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { attachCodexAppServerSession } from '../src/agent-protocol/codex-app-server/session.js';

type Frame = Record<string, any>;

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  written: string[] = [];
  killed = false;
  stdinEnded = 0;
  stdin = {
    write: (chunk: string, _enc?: unknown, cb?: (err?: Error | null) => void) => {
      this.written.push(String(chunk));
      if (typeof _enc === 'function') (_enc as (e?: Error | null) => void)(null);
      else cb?.(null);
      return true;
    },
    end: () => {
      this.stdinEnded += 1;
    },
    on: () => {},
    destroyed: false,
  };
  kill(signal?: string) {
    this.killed = true;
    this.emit('killed', signal);
    return true;
  }
  /** Feed a raw line (possibly split) from the agent's stdout. */
  say(obj: unknown) {
    this.stdout.emit('data', `${JSON.stringify(obj)}\n`);
  }
  frames(): Frame[] {
    return this.written
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Frame);
  }
  sent(method: string): Frame | undefined {
    return this.frames().find((f) => f.method === method);
  }
}

function harness(overrides: Record<string, unknown> = {}) {
  const child = new FakeChild();
  const agentEvents: Record<string, any>[] = [];
  const marks: string[] = [];
  const session = attachCodexAppServerSession({
    child: child as any,
    prompt: 'hello codex',
    cwd: '/workspace',
    model: 'gpt-5.4-mini',
    reasoning: 'high',
    serviceTier: null,
    sandboxMode: 'workspace-write',
    resumeSessionId: null,
    onAgentEvent: (ev) => agentEvents.push(ev),
    onCliReady: () => marks.push('cli-ready'),
    onSessionReady: () => marks.push('session-ready'),
    onPromptSendStart: () => marks.push('prompt-send-start'),
    onPromptSendEnd: () => marks.push('prompt-send-end'),
    onTurnComplete: () => marks.push('turn-complete'),
    ...overrides,
  });
  return { child, agentEvents, marks, session };
}

/** Walk the handshake up to (and including) the `turn/start` request. */
function completeHandshake(child: FakeChild, threadId = 'th-1') {
  const init = child.sent('initialize');
  child.say({ jsonrpc: '2.0', id: init?.id, result: { userAgent: 'codex/0.149.1' } });
  const start = child.sent('thread/start') ?? child.sent('thread/resume');
  child.say({
    jsonrpc: '2.0',
    id: start?.id,
    result: { thread: { id: threadId, cwd: '/workspace', path: '/CODEX_HOME/rollout.jsonl' } },
  });
  return threadId;
}

describe('codex app-server session', () => {
  describe('handshake', () => {
    it('opens with initialize before anything else', () => {
      const { child } = harness();
      const frames = child.frames();
      expect(frames[0]?.method).toBe('initialize');
      expect(frames[0]?.params?.clientInfo?.name).toBeTruthy();
    });

    it('does NOT opt into the experimental API surface', () => {
      // Measured on codex-cli 0.149.1: `item/agentMessage/delta` and
      // `item/reasoning/summaryTextDelta` both arrive with experimentalApi
      // false, so opting in buys nothing and exposes us to the least stable
      // part of the protocol. See codex-app-server/session.ts for the data.
      const { child } = harness();
      expect(child.sent('initialize')?.params?.capabilities?.experimentalApi).toBe(false);
    });

    it('starts a thread only after initialize resolves', () => {
      const { child } = harness();
      expect(child.sent('thread/start')).toBeUndefined();
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: { userAgent: 'codex/0.149.1' } });
      expect(child.sent('initialized')).toBeDefined();
      expect(child.sent('thread/start')).toBeDefined();
    });

    it('carries the sandbox mode and a never-ask approval policy onto the thread', () => {
      const { child } = harness();
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      const params = child.sent('thread/start')?.params;
      expect(params.cwd).toBe('/workspace');
      expect(params.sandbox).toBe('workspace-write');
      expect(params.approvalPolicy).toBe('never');
    });

    it('passes danger-full-access straight through when that is the resolved mode', () => {
      const { child } = harness({ sandboxMode: 'danger-full-access' });
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      expect(child.sent('thread/start')?.params?.sandbox).toBe('danger-full-access');
    });

    it('resumes an existing thread instead of starting a new one', () => {
      const { child } = harness({ resumeSessionId: 'th-prev' });
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      expect(child.sent('thread/start')).toBeUndefined();
      expect(child.sent('thread/resume')?.params?.threadId).toBe('th-prev');
    });
  });

  describe('turn/start', () => {
    it('sends the prompt as turn input once the thread exists', () => {
      const { child } = harness();
      completeHandshake(child);
      const params = child.sent('turn/start')?.params;
      expect(params.threadId).toBe('th-1');
      expect(params.input).toEqual([{ type: 'text', text: 'hello codex', text_elements: [] }]);
    });

    it('asks for detailed reasoning summaries, the way the exec path does', () => {
      const { child } = harness();
      completeHandshake(child);
      expect(child.sent('turn/start')?.params?.summary).toBe('detailed');
    });

    it('carries model and reasoning effort as typed turn params, not argv', () => {
      const { child } = harness();
      completeHandshake(child);
      const params = child.sent('turn/start')?.params;
      expect(params.model).toBe('gpt-5.4-mini');
      expect(params.effort).toBe('high');
    });

    it('omits model and effort when the run did not pin them', () => {
      const { child } = harness({ model: null, reasoning: null });
      completeHandshake(child);
      const params = child.sent('turn/start')?.params;
      expect('model' in params).toBe(false);
      expect('effort' in params).toBe(false);
    });

    it("treats the synthetic 'default' selection as no selection", () => {
      const { child } = harness({ model: 'default', reasoning: 'default', serviceTier: 'default' });
      completeHandshake(child);
      const params = child.sent('turn/start')?.params;
      expect('model' in params).toBe(false);
      expect('effort' in params).toBe(false);
      expect('serviceTier' in params).toBe(false);
    });
  });

  describe('lifecycle marks (the ACP transport loses these)', () => {
    it('brackets the turn/start write with prompt-send marks', () => {
      const { child, marks } = harness();
      expect(marks).not.toContain('prompt-send-start');
      completeHandshake(child);
      expect(marks).toContain('prompt-send-start');
      expect(marks).toContain('prompt-send-end');
      expect(marks.indexOf('prompt-send-start')).toBeLessThan(marks.indexOf('prompt-send-end'));
    });

    it('marks the prompt send exactly once per turn', () => {
      const { child, marks } = harness();
      completeHandshake(child);
      child.say({ method: 'turn/started', params: { threadId: 'th-1', turnId: 'tu-1' } });
      expect(marks.filter((m) => m === 'prompt-send-start')).toHaveLength(1);
    });

    it('marks cli-ready on the first decoded frame and session-ready on the thread', () => {
      const { child, marks } = harness();
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      expect(marks).toContain('cli-ready');
      expect(marks).not.toContain('session-ready');
      const start = child.sent('thread/start');
      child.say({ jsonrpc: '2.0', id: start?.id, result: { thread: { id: 'th-1' } } });
      expect(marks).toContain('session-ready');
    });

    it('signals turn completion', () => {
      const { child, marks } = harness();
      completeHandshake(child);
      child.say({
        method: 'turn/completed',
        params: { threadId: 'th-1', turnId: 'tu-1', turn: { id: 'tu-1', status: 'completed', items: [] } },
      });
      expect(marks).toContain('turn-complete');
    });
  });

  describe('shutdown', () => {
    // `codex app-server` is a SERVER: unlike `codex exec` it does not exit when
    // the turn ends, so nothing would ever close the run. Measured on
    // codex-cli 0.149.1, it exits with code 0 roughly 250ms after stdin EOF,
    // which is the cleanest available shutdown — no signal, no null exit code,
    // and no special-casing in the run's close classifier.
    it('closes stdin once the turn completes so the server exits', () => {
      const { child } = harness();
      completeHandshake(child);
      expect(child.stdinEnded).toBe(0);
      child.say({
        method: 'turn/completed',
        params: {
          threadId: 'th-1',
          turnId: 'tu-1',
          turn: { id: 'tu-1', status: 'completed', items: [] },
        },
      });
      expect(child.stdinEnded).toBe(1);
    });

    it('keeps stdin open while the turn is still running', () => {
      const { child } = harness();
      completeHandshake(child);
      child.say({
        method: 'item/agentMessage/delta',
        params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'm1', delta: 'hi' },
      });
      expect(child.stdinEnded).toBe(0);
    });

    it('closes stdin on an interrupted turn too', () => {
      const { child, session } = harness();
      completeHandshake(child);
      session.abort();
      child.say({
        method: 'turn/completed',
        params: {
          threadId: 'th-1',
          turnId: 'tu-1',
          turn: { id: 'tu-1', status: 'interrupted', items: [] },
        },
      });
      expect(child.stdinEnded).toBe(1);
    });

    it('reports clean completion so a signalled exit is not read as failure', () => {
      const { child, session } = harness();
      completeHandshake(child);
      expect(session.completedSuccessfully()).toBe(false);
      child.say({
        method: 'turn/completed',
        params: {
          threadId: 'th-1',
          turnId: 'tu-1',
          turn: { id: 'tu-1', status: 'completed', items: [] },
        },
      });
      expect(session.completedSuccessfully()).toBe(true);
    });

    it('does not report clean completion for a failed turn', () => {
      const { child, session } = harness();
      completeHandshake(child);
      child.say({
        method: 'turn/completed',
        params: {
          threadId: 'th-1',
          turnId: 'tu-1',
          turn: { id: 'tu-1', status: 'failed', items: [], error: { message: 'boom' } },
        },
      });
      expect(session.completedSuccessfully()).toBe(false);
    });
  });

  describe('event routing', () => {
    it('forwards normalized notifications on the agent-event channel', () => {
      const { child, agentEvents } = harness();
      completeHandshake(child);
      child.say({
        method: 'item/agentMessage/delta',
        params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'm1', delta: 'hi' },
      });
      expect(agentEvents).toContainEqual({ type: 'text_delta', delta: 'hi' });
    });

    it('reports the thread id on the session-capture status channel', () => {
      const { child, agentEvents } = harness();
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      child.say({ method: 'thread/started', params: { thread: { id: 'th-9' } } });
      expect(agentEvents).toContainEqual({
        type: 'status',
        label: 'initializing',
        sessionId: 'th-9',
      });
    });

    it('routes token usage as a real usage event, never as a diagnostic', () => {
      // The ACP transport drops per-step usage into `diagnostic`, where the
      // analytics scan cannot see it. This one must land on the same channel
      // exec --json uses.
      const { child, agentEvents } = harness();
      completeHandshake(child);
      child.say({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'th-1',
          turnId: 'tu-1',
          tokenUsage: {
            total: {
              totalTokens: 300,
              inputTokens: 200,
              cachedInputTokens: 50,
              cacheWriteInputTokens: 7,
              outputTokens: 100,
              reasoningOutputTokens: 25,
            },
            last: {
              totalTokens: 1,
              inputTokens: 1,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
              outputTokens: 0,
              reasoningOutputTokens: 0,
            },
            modelContextWindow: null,
          },
        },
      });
      const usage = agentEvents.find((e) => e.type === 'usage');
      expect(usage).toBeDefined();
      expect(usage?.usage).toEqual({
        input_tokens: 200,
        output_tokens: 100,
        thought_tokens: 25,
        cached_read_tokens: 50,
        cached_write_tokens: 7,
        total_tokens: 300,
      });
      expect(agentEvents.some((e) => e.type === 'diagnostic')).toBe(false);
    });

    it('routes a turn failure as an agent error event, not a bespoke rpc failure', () => {
      // `failure_detail: 'stream_error'` is derived from the agent-event error
      // channel. The ACP path emits `fatal_rpc_error` instead and drops off
      // that Langfuse query entirely.
      const { child, agentEvents } = harness();
      completeHandshake(child);
      child.say({
        method: 'error',
        params: {
          threadId: 'th-1',
          turnId: 'tu-1',
          willRetry: false,
          error: { message: 'upstream 500' },
        },
      });
      expect(agentEvents).toContainEqual({ type: 'error', message: 'upstream 500' });
    });

    it('routes a JSON-RPC error response as an agent error event too', () => {
      const { child, agentEvents } = harness();
      const init = child.sent('initialize');
      child.say({
        jsonrpc: '2.0',
        id: init?.id,
        error: { code: -32600, message: 'Invalid request: missing field `text`' },
      });
      const error = agentEvents.find((e) => e.type === 'error');
      expect(error).toBeDefined();
      expect(String(error?.message)).toContain('missing field');
    });
  });

  describe('resume handle', () => {
    // Capture-style resume: the daemon persists whatever thread id it sees on
    // the session-capture status channel THIS turn. `thread/start` is followed
    // by a `thread/started` notification, but `thread/resume` answers with the
    // thread in its RPC result and (measured on codex-cli 0.149.1) sends no
    // such notification — so a resumed turn would report no handle at all and
    // the stored one would go stale.
    it('reports the handle on a resumed turn, where no notification arrives', () => {
      const { child, agentEvents } = harness({ resumeSessionId: 'th-prev' });
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      const resume = child.sent('thread/resume');
      child.say({
        jsonrpc: '2.0',
        id: resume?.id,
        result: { thread: { id: 'th-prev', path: '/CODEX_HOME/rollout.jsonl' } },
      });
      expect(agentEvents).toContainEqual({
        type: 'status',
        label: 'initializing',
        sessionId: 'th-prev',
      });
    });

    it('reports the handle exactly once on a fresh thread', () => {
      const { child, agentEvents } = harness();
      const init = child.sent('initialize');
      child.say({ jsonrpc: '2.0', id: init?.id, result: {} });
      child.say({ method: 'thread/started', params: { thread: { id: 'th-1' } } });
      const start = child.sent('thread/start');
      child.say({ jsonrpc: '2.0', id: start?.id, result: { thread: { id: 'th-1' } } });
      const captures = agentEvents.filter(
        (e) => e.type === 'status' && e.label === 'initializing',
      );
      expect(captures).toHaveLength(1);
    });

    it('exposes the codex-minted thread id', () => {
      const { child, session } = harness();
      completeHandshake(child, 'th-durable');
      expect(session.getDurableSessionId()).toBe('th-durable');
    });

    it('exposes the rollout path codex reported for the thread', () => {
      const { child, session } = harness();
      completeHandshake(child);
      expect(session.getLastSessionPath()).toBe('/CODEX_HOME/rollout.jsonl');
    });
  });

  describe('cancellation', () => {
    it('interrupts the turn instead of killing the process outright', () => {
      const { child, session } = harness();
      completeHandshake(child);
      session.abort();
      expect(child.sent('turn/interrupt')?.params?.threadId).toBe('th-1');
    });

    it('is idempotent', () => {
      const { child, session } = harness();
      completeHandshake(child);
      session.abort();
      session.abort();
      expect(child.frames().filter((f) => f.method === 'turn/interrupt')).toHaveLength(1);
    });

    it('still terminates when abort lands before a thread exists', () => {
      const { child, session } = harness();
      expect(() => session.abort()).not.toThrow();
      expect(child.sent('turn/interrupt')).toBeUndefined();
    });
  });

  describe('forward compatibility', () => {
    it('ignores an unknown notification rather than failing the run', () => {
      const { child, agentEvents } = harness();
      completeHandshake(child);
      child.say({ method: 'thread/telepathy/updated', params: { brainWaves: 12 } });
      expect(agentEvents.some((e) => e.type === 'error')).toBe(false);
    });

    it('answers an unknown server-to-client request instead of hanging', () => {
      const { child } = harness();
      completeHandshake(child);
      child.say({
        jsonrpc: '2.0',
        id: 9001,
        method: 'mcpServer/elicitation/request',
        params: { message: 'may I?' },
      });
      const reply = child.frames().find((f) => f.id === 9001);
      expect(reply).toBeDefined();
      expect(reply?.error?.code).toBe(-32601);
    });

    it('tolerates a frame split across two stdout chunks', () => {
      const { child, agentEvents } = harness();
      completeHandshake(child);
      const line = JSON.stringify({
        method: 'item/agentMessage/delta',
        params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'm1', delta: 'split' },
      });
      child.stdout.emit('data', line.slice(0, 20));
      child.stdout.emit('data', `${line.slice(20)}\n`);
      expect(agentEvents).toContainEqual({ type: 'text_delta', delta: 'split' });
    });

    it('does not crash on a non-JSON stdout line', () => {
      const { child, agentEvents } = harness();
      completeHandshake(child);
      expect(() => child.stdout.emit('data', 'not json at all\n')).not.toThrow();
      expect(agentEvents.some((e) => e.type === 'error')).toBe(false);
    });
  });

  describe('image inputs', () => {
    it('attaches staged local images alongside the prompt text', () => {
      const { child } = harness({ imagePaths: ['/tmp/a.png'] });
      completeHandshake(child);
      expect(child.sent('turn/start')?.params?.input).toEqual([
        { type: 'text', text: 'hello codex', text_elements: [] },
        { type: 'localImage', path: '/tmp/a.png' },
      ]);
    });
  });
});
