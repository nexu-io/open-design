import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { submitToolResultToRunState } from '../src/run-tool-results.js';

function makeRun(pendingToolUseIds: string[]) {
  const stdin = new PassThrough();
  const writes: string[] = [];
  stdin.on('data', (chunk) => writes.push(String(chunk)));
  const run = {
    child: { stdin },
    pendingHostAnswers: new Set(pendingToolUseIds),
    stdinOpen: true,
  };
  return { run, stdin, writes };
}

describe('submitToolResultToRunState', () => {
  it('rejects unknown toolUseId values before writing to child stdin', () => {
    const { run, writes } = makeRun(['known-tool']);

    const result = submitToolResultToRunState(run, {
      content: 'answer',
      isTerminal: false,
      toolUseId: 'other-tool',
    });

    expect(result).toEqual({ ok: false, reason: 'bad_tool_use_id' });
    expect(writes).toEqual([]);
    expect(run.pendingHostAnswers.has('known-tool')).toBe(true);
    expect(run.stdinOpen).toBe(true);
  });

  it('writes valid tool results and closes stdin after the final pending answer', () => {
    const { run, stdin, writes } = makeRun(['tool-1']);

    const result = submitToolResultToRunState(run, {
      content: 'choice A',
      isError: true,
      isTerminal: false,
      toolUseId: 'tool-1',
    });

    expect(result).toEqual({ ok: true });
    expect(run.pendingHostAnswers.has('tool-1')).toBe(false);
    expect(run.stdinOpen).toBe(false);
    expect(stdin.destroyed || stdin.writableEnded).toBe(true);
    expect(writes).toHaveLength(1);
    const [write] = writes;
    expect(JSON.parse(write!)).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            content: 'choice A',
            is_error: true,
            tool_use_id: 'tool-1',
            type: 'tool_result',
          },
        ],
      },
    });
  });

  it('keeps stdin open when another pending host answer remains', () => {
    const { run, stdin } = makeRun(['tool-1', 'tool-2']);

    const result = submitToolResultToRunState(run, {
      content: 'first',
      isTerminal: false,
      toolUseId: 'tool-1',
    });

    expect(result).toEqual({ ok: true });
    expect(run.pendingHostAnswers.has('tool-1')).toBe(false);
    expect(run.pendingHostAnswers.has('tool-2')).toBe(true);
    expect(run.stdinOpen).toBe(true);
    expect(stdin.writableEnded).toBe(false);
  });

  it('rejects duplicate tool results after the first successful submission', () => {
    const { run, writes } = makeRun(['tool-1', 'tool-2']);

    expect(
      submitToolResultToRunState(run, {
        content: 'first',
        isTerminal: false,
        toolUseId: 'tool-1',
      }),
    ).toEqual({ ok: true });

    const duplicate = submitToolResultToRunState(run, {
      content: 'second',
      isTerminal: false,
      toolUseId: 'tool-1',
    });

    expect(duplicate).toEqual({ ok: false, reason: 'bad_tool_use_id' });
    expect(writes).toHaveLength(1);
    expect(run.stdinOpen).toBe(true);
  });

  it('rejects terminal runs before touching stdin', () => {
    const { run, writes } = makeRun(['tool-1']);

    const result = submitToolResultToRunState(run, {
      content: 'answer',
      isTerminal: true,
      toolUseId: 'tool-1',
    });

    expect(result).toEqual({ ok: false, reason: 'run_terminal' });
    expect(writes).toEqual([]);
  });
});
