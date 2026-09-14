// B11 "steer the running turn" (`引导对话`) — the invariant that decides whether a
// mid-turn user message can actually reach the model.
//
// The queue row's third button used to be "send now", which CANCELS the running
// turn and re-sends. Steering is the opposite: the turn keeps running and the
// message is written onto the child's still-open stdin.
//
// Three things have to hold for that write to mean anything, and each of them
// fails silently if we only guess:
//   1. the runtime must deliver its prompt as `stream-json` — that is the only
//      format whose writer leaves stdin open past the opening prompt. Every
//      other runtime calls `writePromptAndEndStdin`, so a later write lands on
//      a closed pipe (EPIPE at best, silently dropped at worst).
//   2. the run must still be live.
//   3. `run.stdinOpen` must still be true. A clean `turn_end` closes stdin
//      (applyClaudeStreamJsonRunBookkeeping); a `stop_reason: 'tool_use'` pause
//      does NOT — and that pause is exactly when steering is most valuable.

import { describe, expect, it } from 'vitest';

import { claudeAgentDef } from '../src/runtimes/defs/claude.js';
import { codexAgentDef } from '../src/runtimes/defs/codex.js';
import {
  classifyRunSteering,
  encodeStreamJsonUserMessage,
  runtimeAcceptsMidTurnInput,
  writeSteeringUserMessage,
} from '../src/runtimes/run-steering.js';

describe('runtimeAcceptsMidTurnInput', () => {
  it('accepts the stream-json runtime, which keeps stdin open past the prompt', () => {
    expect(claudeAgentDef.promptInputFormat).toBe('stream-json');
    expect(runtimeAcceptsMidTurnInput(claudeAgentDef)).toBe(true);
  });

  it('refuses a text-prompt runtime, whose stdin is closed with the prompt', () => {
    expect(runtimeAcceptsMidTurnInput(codexAgentDef)).toBe(false);
  });

  it('refuses an unknown / missing runtime def rather than guessing', () => {
    expect(runtimeAcceptsMidTurnInput(null)).toBe(false);
    expect(runtimeAcceptsMidTurnInput(undefined)).toBe(false);
    expect(runtimeAcceptsMidTurnInput({ id: 'x', promptInputFormat: 'text' })).toBe(false);
  });
});

describe('classifyRunSteering', () => {
  it('admits a live stream-json run whose stdin is still open', () => {
    expect(
      classifyRunSteering({ runtimeAccepts: true, terminal: false, stdinOpen: true }),
    ).toEqual({ ok: true });
  });

  it('admits a run paused on tool_use — stdin is open, so the model still reads', () => {
    // The daemon does not close stdin on `stop_reason: 'tool_use'`; that pause
    // is a mid-turn wait, not a turn boundary. Steering must be allowed there.
    expect(
      classifyRunSteering({ runtimeAccepts: true, terminal: false, stdinOpen: true }),
    ).toEqual({ ok: true });
  });

  it('refuses a runtime that cannot take mid-turn input, before anything else', () => {
    expect(
      classifyRunSteering({ runtimeAccepts: false, terminal: false, stdinOpen: true }),
    ).toEqual({ ok: false, refusal: 'runtime_unsupported' });
    // Permanent property of the runtime: it wins over the transient reasons so
    // the caller can disable the affordance instead of showing a retry hint.
    expect(
      classifyRunSteering({ runtimeAccepts: false, terminal: true, stdinOpen: false }),
    ).toEqual({ ok: false, refusal: 'runtime_unsupported' });
  });

  it('refuses a terminal run', () => {
    expect(
      classifyRunSteering({ runtimeAccepts: true, terminal: true, stdinOpen: false }),
    ).toEqual({ ok: false, refusal: 'run_terminal' });
  });

  it('refuses a live run whose turn already ended cleanly and closed stdin', () => {
    // The child process can still be alive here (it exits a beat later). The
    // message must be rejected loudly, not written into a closed pipe.
    expect(
      classifyRunSteering({ runtimeAccepts: true, terminal: false, stdinOpen: false }),
    ).toEqual({ ok: false, refusal: 'stdin_closed' });
  });
});

describe('encodeStreamJsonUserMessage', () => {
  it('produces exactly the JSONL frame the opening prompt uses', () => {
    // Drift here is invisible until a real model silently ignores the frame, so
    // the opening-prompt writer in server.ts shares this encoder.
    const line = encodeStreamJsonUserMessage('tighten the hero copy');
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'tighten the hero copy' }],
      },
    });
  });

  it('keeps newlines inside the text on one JSONL line', () => {
    const line = encodeStreamJsonUserMessage('one\ntwo');
    expect(line.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(line).message.content[0].text).toBe('one\ntwo');
  });
});

describe('writeSteeringUserMessage', () => {
  function fakeStdin(writeReturns: boolean, destroyed = false) {
    const calls: string[] = [];
    return {
      destroyed,
      calls,
      write(chunk: string, encoding: BufferEncoding) {
        calls.push(chunk);
        void encoding;
        return writeReturns;
      },
    };
  }

  it('writes the frame and reports it delivered', () => {
    const stdin = fakeStdin(true);
    expect(writeSteeringUserMessage(stdin, 'go left')).toEqual({
      delivered: true,
      backpressure: false,
    });
    expect(JSON.parse(stdin.calls[0]!).message.content[0].text).toBe('go left');
  });

  it('still counts as delivered when the pipe buffered it, but flags backpressure', () => {
    const stdin = fakeStdin(false);
    expect(writeSteeringUserMessage(stdin, 'go left')).toEqual({
      delivered: true,
      backpressure: true,
    });
  });

  it('never claims delivery on a destroyed or missing stdin', () => {
    expect(writeSteeringUserMessage(fakeStdin(true, true), 'go left')).toEqual({
      delivered: false,
      backpressure: false,
    });
    expect(writeSteeringUserMessage(null, 'go left')).toEqual({
      delivered: false,
      backpressure: false,
    });
  });

  it('reports a failed write instead of throwing on EPIPE', () => {
    const stdin = {
      destroyed: false,
      write() {
        const err = new Error('write EPIPE') as NodeJS.ErrnoException;
        err.code = 'EPIPE';
        throw err;
      },
    };
    expect(writeSteeringUserMessage(stdin, 'go left')).toEqual({
      delivered: false,
      backpressure: false,
    });
  });
});
