import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachAcpSession } from '../../src/agent-protocol/index.js';
import { supportsSessionDelete } from '../../src/agent-protocol/acp/probe-cleanup.js';
import captures from '../fixtures/acp-probe-initialize-captures.json' with { type: 'json' };

class ProbeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill() { this.killed = true; return true; }
}

function probe(options: { resumed?: boolean; disposable?: boolean } = {}) {
  const child = new ProbeChild();
  const frames: Array<{ id: number; method: string; params: unknown }> = [];
  const send = vi.fn();
  const terminal = vi.fn();
  child.stdin.on('data', (chunk) => frames.push(JSON.parse(String(chunk))));
  const controller = attachAcpSession({
    child: child as never,
    prompt: 'Reply ok',
    cwd: '/tmp/probe',
    send,
    onTerminal: terminal,
    disposeSessionAfterPrompt: options.disposable ?? true,
    ...(options.resumed ? { resumeSessionId: 'user-session' } : {}),
  });
  const result = (id: number, value: unknown) => child.stdout.write(JSON.stringify({ id, result: value }) + '\n');
  const error = (id: number, value: unknown) => child.stdout.write(JSON.stringify({ id, error: value }) + '\n');
  result(1, { agentCapabilities: { sessionCapabilities: { delete: {} } } });
  result(2, { sessionId: options.resumed ? 'user-session' : 'probe-session' });
  return { child, frames, send, terminal, controller, result, error };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('ACP disposable probe cleanup', () => {
  it.each(captures)('recognizes captured $adapter initialize support', (capture) => {
    expect(supportsSessionDelete(capture.initializeResult)).toBe(capture.supportsDelete);
  });

  it.each([undefined, null, false, true, [], 'supported', 1])('rejects unadvertised or malformed delete capability %s', (deletion) => {
    expect(supportsSessionDelete({ agentCapabilities: { sessionCapabilities: { delete: deletion } } })).toBe(false);
  });

  it('accepts the advertised empty capability object', () => {
    expect(supportsSessionDelete({ agentCapabilities: { sessionCapabilities: { delete: {} } } })).toBe(true);
    expect(supportsSessionDelete({})).toBe(false);
  });

  it('awaits one delete response before closing stdin and ignores duplicate prompt results', async () => {
    const p = probe();
    p.result(3, { stopReason: 'end_turn' });
    p.result(3, { stopReason: 'end_turn' });
    expect(p.frames.filter((frame) => frame.method === 'session/delete')).toEqual([
      { jsonrpc: '2.0', id: 4, method: 'session/delete', params: { sessionId: 'probe-session' } },
    ]);
    expect(p.child.stdin.writableEnded).toBe(false);
    expect(p.terminal).not.toHaveBeenCalled();
    p.result(999, {});
    expect(p.child.stdin.writableEnded).toBe(false);
    p.result(4, {});
    await p.controller.cleanupCompleted();
    expect(p.child.stdin.writableEnded).toBe(true);
    expect(p.terminal).toHaveBeenCalledExactlyOnceWith('completed');
    expect(p.controller.completedSuccessfully()).toBe(true);
    expect(p.send.mock.calls.filter(([event]) => event === 'error')).toEqual([]);
  });

  it.each([{ disposable: false }, { resumed: true }])('preserves user sessions with options %j', (options) => {
    const p = probe(options);
    p.result(3, {});
    expect(p.frames.some((frame) => frame.method === 'session/delete')).toBe(false);
    expect(p.child.stdin.writableEnded).toBe(true);
    expect(p.terminal).toHaveBeenCalledExactlyOnceWith('completed');
  });

  it('keeps cleanup rejection out of a successful probe verdict and diagnostics', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = probe();
    p.result(3, {});
    p.error(4, { code: -32603, message: 'private session id and credential' });
    await p.controller.cleanupCompleted();
    expect(p.controller.completedSuccessfully()).toBe(true);
    expect(p.controller.hasFatalError()).toBe(false);
    expect(p.send.mock.calls.filter(([event]) => event === 'error')).toEqual([]);
    expect(warning).toHaveBeenCalledExactlyOnceWith('[acp] probe session cleanup: rejected');
    expect(p.child.stdin.writableEnded).toBe(true);
  });

  it('preserves a failed prompt while deleting the already-created session', async () => {
    const p = probe();
    p.error(3, { code: -32000, message: 'original prompt failure' });
    expect(p.child.killed).toBe(false);
    expect(p.frames.at(-1)?.method).toBe('session/delete');
    p.result(4, {});
    await p.controller.cleanupCompleted();
    expect(p.controller.hasFatalError()).toBe(true);
    expect(p.controller.completedSuccessfully()).toBe(false);
    expect(p.send).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('original prompt failure') }));
    expect(p.terminal).toHaveBeenCalledExactlyOnceWith('fatal');
  });

  it('bounds silent cleanup without changing successful completion', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = probe();
    p.result(3, {});
    await vi.advanceTimersByTimeAsync(1000);
    await p.controller.cleanupCompleted();
    expect(p.controller.completedSuccessfully()).toBe(true);
    expect(p.child.stdin.writableEnded).toBe(true);
    expect(p.terminal).toHaveBeenCalledExactlyOnceWith('completed');
    expect(vi.getTimerCount()).toBe(0);
    p.error(4, { code: -32603, message: 'late cleanup response' });
    expect(p.controller.hasFatalError()).toBe(false);
  });

  it('settles cleanup when the agent closes its transport', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = probe();
    p.result(3, {});
    p.child.emit('close', 0, null);
    await p.controller.cleanupCompleted();
    expect(p.controller.completedSuccessfully()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels before deleting an aborted disposable session', async () => {
    const p = probe();
    p.controller.abort();
    expect(p.frames.slice(-2).map((frame) => frame.method)).toEqual(['session/cancel', 'session/delete']);
    p.result(4, {});
    await p.controller.cleanupCompleted();
    expect(p.controller.completedSuccessfully()).toBe(false);
    expect(p.child.stdin.writableEnded).toBe(true);
  });
});
