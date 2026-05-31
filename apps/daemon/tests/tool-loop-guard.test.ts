import { describe, expect, it } from 'vitest';
import {
  computeToolSignature,
  createToolLoopGuard,
  resolveToolLoopMode,
} from '../src/tool-loop-guard.js';

// Drive a guard through a use+result pair the way the run loop does.
function fail(guard: ReturnType<typeof createToolLoopGuard>, id: string, name: string, input: unknown) {
  guard.observeToolUse(id, name, input);
  return guard.observeToolResult(id, true, 'boom');
}
function ok(guard: ReturnType<typeof createToolLoopGuard>, id: string, name: string, input: unknown) {
  guard.observeToolUse(id, name, input);
  return guard.observeToolResult(id, false, '');
}

describe('computeToolSignature', () => {
  it('uses the command for Bash', () => {
    expect(computeToolSignature('Bash', { command: 'ls -la' })).toBe('Bash ls -la');
  });

  it('uses file_path (and old_string) for Edit so different edits to one file differ', () => {
    const a = computeToolSignature('Edit', { file_path: '/a.html', old_string: 'foo' });
    const b = computeToolSignature('Edit', { file_path: '/a.html', old_string: 'bar' });
    expect(a).not.toBe(b);
    expect(a).toContain('/a.html');
  });

  it('collapses whitespace so trivially reformatted actions match', () => {
    expect(computeToolSignature('Bash', { command: 'ls   -la\n' })).toBe(
      computeToolSignature('Bash', { command: 'ls -la' }),
    );
  });

  it('falls back to the tool name when input has nothing usable', () => {
    expect(computeToolSignature('ExitPlanMode', {})).toBe('ExitPlanMode');
    expect(computeToolSignature('Bash', null)).toBe('Bash');
  });

  it('caps signature length', () => {
    const sig = computeToolSignature('Bash', { command: 'x'.repeat(1000) });
    expect(sig.length).toBeLessThanOrEqual(160);
    expect(sig.endsWith('…')).toBe(true);
  });
});

describe('createToolLoopGuard — repeated-failure trigger', () => {
  it('warns when the same failing action repeats warnRepeat times', () => {
    const guard = createToolLoopGuard();
    const input = { command: 'python3 verify.py' };
    expect(fail(guard, 't1', 'Bash', input)).toBeNull(); // 1
    expect(fail(guard, 't2', 'Bash', input)).toBeNull(); // 2
    expect(fail(guard, 't3', 'Bash', input)).toBeNull(); // 3
    const verdict = fail(guard, 't4', 'Bash', input); // 4 → warn
    expect(verdict).toMatchObject({
      type: 'tool_loop',
      reason: 'repeated-failure',
      action: 'warn',
      toolName: 'Bash',
      count: 4,
    });
    expect(guard.warned).toBe(true);
    expect(guard.halted).toBe(false);
  });

  it('halts when the same failing action repeats haltRepeat times', () => {
    const guard = createToolLoopGuard();
    const input = { file_path: '/x.html', old_string: 'titlebar-left' };
    let halt = null;
    for (let i = 0; i < 8; i += 1) halt = fail(guard, `t${i}`, 'Edit', input);
    expect(halt).toMatchObject({ reason: 'repeated-failure', action: 'halt', count: 8 });
    expect(guard.halted).toBe(true);
  });

  it('does not warn on a few legitimate retries of the same action', () => {
    const guard = createToolLoopGuard();
    const input = { command: 'pnpm build' };
    expect(fail(guard, 'a', 'Bash', input)).toBeNull();
    expect(fail(guard, 'b', 'Bash', input)).toBeNull();
    expect(ok(guard, 'c', 'Bash', input)).toBeNull(); // fixed it
    expect(guard.warned).toBe(false);
  });
});

describe('createToolLoopGuard — consecutive-errors trigger', () => {
  it('warns after warnConsecutive different failing actions in a row', () => {
    const guard = createToolLoopGuard();
    let verdict = null;
    for (let i = 0; i < 5; i += 1) {
      verdict = fail(guard, `t${i}`, 'Bash', { command: `try-${i}` }); // all distinct signatures
    }
    expect(verdict).toMatchObject({ reason: 'consecutive-errors', action: 'warn', count: 5 });
  });

  it('resets the consecutive streak on a successful tool call', () => {
    const guard = createToolLoopGuard();
    for (let i = 0; i < 4; i += 1) fail(guard, `t${i}`, 'Bash', { command: `try-${i}` });
    ok(guard, 'good', 'Bash', { command: 'works' }); // progress resets streak
    const verdict = fail(guard, 'after', 'Bash', { command: 'try-after' });
    expect(verdict).toBeNull();
    expect(guard.warned).toBe(false);
  });

  it('halts after haltConsecutive failures in a row', () => {
    const guard = createToolLoopGuard();
    let last = null;
    for (let i = 0; i < 10; i += 1) last = fail(guard, `t${i}`, 'Bash', { command: `distinct-${i}` });
    expect(last).toMatchObject({ reason: 'consecutive-errors', action: 'halt', count: 10 });
    expect(guard.halted).toBe(true);
  });
});

describe('createToolLoopGuard — latching and modes', () => {
  it('emits warn at most once, then escalates to halt once', () => {
    const guard = createToolLoopGuard();
    const input = { command: 'same' };
    const verdicts = [];
    for (let i = 0; i < 12; i += 1) {
      const v = fail(guard, `t${i}`, 'Bash', input);
      if (v) verdicts.push(v.action);
    }
    expect(verdicts).toEqual(['warn', 'halt']);
  });

  it('warn mode never halts', () => {
    const guard = createToolLoopGuard({ mode: 'warn' });
    const input = { command: 'same' };
    let sawHalt = false;
    for (let i = 0; i < 20; i += 1) {
      const v = fail(guard, `t${i}`, 'Bash', input);
      if (v?.action === 'halt') sawHalt = true;
    }
    expect(sawHalt).toBe(false);
    expect(guard.warned).toBe(true);
    expect(guard.halted).toBe(false);
  });

  it('off mode never trips', () => {
    const guard = createToolLoopGuard({ mode: 'off' });
    const input = { command: 'same' };
    for (let i = 0; i < 30; i += 1) expect(fail(guard, `t${i}`, 'Bash', input)).toBeNull();
    expect(guard.warned).toBe(false);
    expect(guard.halted).toBe(false);
  });

  it('is inert after halting', () => {
    const guard = createToolLoopGuard();
    const input = { command: 'same' };
    for (let i = 0; i < 8; i += 1) fail(guard, `t${i}`, 'Bash', input);
    expect(guard.halted).toBe(true);
    expect(fail(guard, 'after', 'Bash', input)).toBeNull();
  });

  it('reproduces the titlebar-left loop: repeated failing assertion halts the run', () => {
    // The exact shape that motivated the guard: the agent re-runs the same
    // shell assertion against an element name that does not exist.
    const guard = createToolLoopGuard();
    const cmd = { command: "python3 -c \"assert 'titlebar-left' in open('v.html').read()\"" };
    const actions: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const v = fail(guard, `loop-${i}`, 'Bash', cmd);
      if (v) actions.push(v.action);
    }
    expect(actions).toContain('warn');
    expect(actions).toContain('halt');
    expect(guard.halted).toBe(true);
  });
});

describe('resolveToolLoopMode', () => {
  it('defaults to halt', () => {
    expect(resolveToolLoopMode({})).toBe('halt');
  });
  it('reads off/warn/halt case-insensitively', () => {
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'OFF' })).toBe('off');
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: ' warn ' })).toBe('warn');
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'halt' })).toBe('halt');
  });
  it('falls back to halt on an unrecognized value so a typo never disables it', () => {
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'disable' })).toBe('halt');
  });
});
