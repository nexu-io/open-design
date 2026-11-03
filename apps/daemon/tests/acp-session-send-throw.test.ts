import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, test } from 'vitest'
import { attachAcpSession } from '../src/agent-protocol/index.js'

// #9268: a throwing send callback (disk full, SSE client tearing down) must
// not escape the ACP session wiring. The `close`-handler path runs `fail()`
// inside a child-process event listener, so an escaping throw would crash the
// daemon; the clean-completion path sets `finished` before its emits, so a
// throw there would skip stdin.close and the terminal callback — reporting
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
  // terminal callback are skipped — a "successful" run with a leaked process.
  expect(child.stdin.writableEnded).toBe(true)
  expect(terminal).toEqual(['completed'])
  expect(child.killed).toBe(true)
})
