import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, test } from 'vitest'
import { attachAcpSession } from '../src/agent-protocol/index.js'

// #9268: a throwing send callback (disk full, SSE client tearing down) must
// not escape the ACP session wiring. The `close`-handler path runs `fail()`
// inside a child-process event listener, so an escaping throw would crash the
// daemon; the clean-completion path sets `finished` before its emits, so a
// throw there would skip stdin.close and the terminal callback 鈥?reporting
// success while the agent process tree is still alive.

class ThrowingSendChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  killSignal: string | null = null

  kill(signal?: string) {
    this.killed = true
    this.killSignal = signal ?? null
    return true
  }
}

function makeSession(child: ThrowingSendChild, onTerminal: (kind: string) => void) {
  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: () => {
      throw new Error('SQLITE_FULL: database or disk is full')
    },
    // Mirror the real host wiring (server.ts): the terminal callback owns the
    // process teardown via beginAcpAttemptTermination.
    onTerminal: (kind: string) => {
      onTerminal(kind)
      child.kill('SIGTERM')
    },
  } as never)
}

function writeAcpResult(child: ThrowingSendChild, id: number, result: unknown): void {
  child.stdout.write(`${JSON.stringify({ id, result })}\n`)
}

test('a throwing send in the close path must not escape and must still SIGTERM the child', () => {
  const child = new ThrowingSendChild()
  const terminal: string[] = []
  makeSession(child, (kind) => terminal.push(kind))

  // Pre-fix this escapes the close listener as an uncaught exception (daemon
  // crash); post-fix the failure path is best-effort and still kills the child.
  expect(() => child.emit('close', 1, null)).not.toThrow()
  expect(child.killed).toBe(true)
  expect(terminal).toEqual(['fatal'])
})

test('a throwing send during clean completion must still close stdin and reach the terminal callback', () => {
  const child = new ThrowingSendChild()
  const terminal: string[] = []
  makeSession(child, (kind) => terminal.push(kind))

  writeAcpResult(child, 1, {})
  writeAcpResult(child, 2, { sessionId: 'session-1' })
  // A pending tool frame guarantees the completion path has something to flush
  // through send before the terminal bookkeeping runs.
  child.stdout.write(
    `${JSON.stringify({ method: 'session/update', params: { update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'edit', status: 'pending' } } })}\n`,
  )
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } })

  // Pre-fix: finished flips true, the flush throws, and stdin.end() plus the
  // terminal callback are skipped 鈥?a "successful" run with a leaked process.
  expect(child.stdin.writableEnded).toBe(true)
  expect(terminal).toEqual(['completed'])
  expect(child.killed).toBe(true)
})

test('Review follow-up: one failing send must not strand the remaining open tools', () => {
  const child = new ThrowingSendChild()
  const terminal: string[] = []
  const emitted: Array<{ type?: string }> = []

  attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    // Kiro-style adapters complete the turn on an explicit `turn_end` update.
    // Nothing flushes the open tools before this path runs, so it is the one
    // where a single failing send can strand every later tool.
    completePromptOnTurnEnd: true,
    send: (_event: string, payload: { type?: string }) => {
      // Fail every terminal pair. The next pending tool must still be attempted,
      // otherwise its row stays unresolved for the run.
      if (payload?.type === 'tool_result') {
        throw new Error('SQLITE_FULL: database or disk is full')
      }
      emitted.push(payload)
    },
    onTerminal: (kind: string) => {
      terminal.push(kind)
      child.kill('SIGTERM')
    },
  } as never)

  writeAcpResult(child, 1, {})
  writeAcpResult(child, 2, { sessionId: 'session-1' })
  for (const [toolCallId, title] of [['tc-1', 'edit'], ['tc-2', 'read']] as const) {
    child.stdout.write(
      `${JSON.stringify({ method: 'session/update', params: { update: { sessionUpdate: 'tool_call', toolCallId, title, status: 'pending' } } })}\n`,
    )
  }
  child.stdout.write(
    `${JSON.stringify({ method: 'session/update', params: { update: { sessionUpdate: 'turn_end' } } })}\n`,
  )

  // Every tool_use is attempted even though each tool_result throws. Pre-fix the
  // first throw aborts the flush loop, so tc-2 never gets its pair.
  expect(emitted.filter((payload) => payload.type === 'tool_use')).toHaveLength(2)
  expect(terminal).toEqual(['completed'])
  expect(child.stdin.writableEnded).toBe(true)
})

test('Review follow-up: a failing usage emit must not swallow the AMR no-output verdict', () => {
  const child = new ThrowingSendChild()
  const terminal: string[] = []

  const session = attachAcpSession({
    child: child as never,
    prompt: 'hello',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
    send: (_event: string, payload: { type?: string }) => {
      if (payload?.type === 'usage') {
        throw new Error('SQLITE_FULL: database or disk is full')
      }
    },
    onTerminal: (kind: string) => {
      terminal.push(kind)
      child.kill('SIGTERM')
    },
  } as never)

  writeAcpResult(child, 1, {})
  writeAcpResult(child, 2, { sessionId: 'session-1' })
  // The prompt result carries usage but no visible output, so the completion
  // path classifies it as an AMR no-output turn and emits usage before failing.
  // Pre-fix that send throws, the JSON-line parser swallows it, and the verdict
  // (plus the teardown) never runs.
  writeAcpResult(child, 3, { usage: { inputTokens: 1, outputTokens: 2 } })

  // `fail()` hands teardown to the host through onTerminal, and never ends stdin
  // itself; what matters here is that the verdict is reached at all.
  expect(terminal).toEqual(['fatal'])
  expect(session.hasFatalError()).toBe(true)
})
