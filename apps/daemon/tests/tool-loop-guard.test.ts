import { describe, expect, it } from 'vitest';
import {
  computeToolSignature,
  createToolLoopGuard,
  displayToolSignature,
  isProgressSuccess,
  isReadOnlyShellCommand,
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

  it('keeps the full signature for counting and truncates only for display', () => {
    const full = computeToolSignature('Bash', { command: 'x'.repeat(1000) });
    expect(full.length).toBeGreaterThan(160); // full-fidelity dedup key, not capped
    const shown = displayToolSignature(full);
    expect(shown.length).toBeLessThanOrEqual(160);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('does not collide two distinct long commands sharing a 160-char prefix', () => {
    const prefix = 'run '.repeat(60); // 240 chars, well over the display cap
    const a = computeToolSignature('Bash', { command: `${prefix}alpha` });
    const b = computeToolSignature('Bash', { command: `${prefix}beta` });
    expect(a).not.toBe(b);
    // ...and their truncated display forms DO collide, which is exactly why the
    // display string must not be used as the counting key.
    expect(displayToolSignature(a)).toBe(displayToolSignature(b));
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
    const guard = createToolLoopGuard({ mode: 'halt' });
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

  it('does not halt when the same check keeps failing but successful edits land between attempts', () => {
    // The progressing-run case the cumulative counter wrongly halted (PR #3375
    // review): rerun the same verification command after each successful edit,
    // each run failing on the next newly-written case. The intervening success
    // is real progress, so the repeated-failure tally must not accumulate.
    const guard = createToolLoopGuard({ mode: 'halt' });
    const check = { command: 'pnpm test' };
    let tripped = null;
    for (let i = 0; i < 12; i += 1) {
      const verdict = fail(guard, `chk-${i}`, 'Bash', check); // same failing check
      if (verdict) tripped = verdict;
      ok(guard, `edit-${i}`, 'Edit', { file_path: '/src/a.ts', old_string: `case-${i}` }); // progress
    }
    expect(tripped).toBeNull();
    expect(guard.warned).toBe(false);
    expect(guard.halted).toBe(false);
  });

  it('still halts when the same failing call is interleaved with successful read-only calls', () => {
    // The false negative that clearing failCounts on EVERY success let through
    // (PR #3375 review): a stuck agent re-reads the file and retries the same
    // wrong assumption. A successful Read is not progress on the failing action,
    // so the repeated-failure tally must survive it and the loop must still trip.
    const guard = createToolLoopGuard({ mode: 'halt' });
    const failing = { command: "python3 -c \"assert 'titlebar-left' in open('v.html').read()\"" };
    for (let i = 0; i < 8; i += 1) {
      fail(guard, `chk-${i}`, 'Bash', failing); // same failing verification
      ok(guard, `read-${i}`, 'Read', { file_path: '/v.html' }); // read-only, NOT progress
    }
    expect(guard.halted).toBe(true);
  });

  it('a successful mutating tool clears the tally but a successful read does not', () => {
    const failing = { command: 'pnpm test' };
    // Read between failures: tally survives -> trips.
    const reads = createToolLoopGuard();
    for (let i = 0; i < 4; i += 1) {
      fail(reads, `f-${i}`, 'Bash', failing);
      ok(reads, `r-${i}`, 'Read', { file_path: '/x' });
    }
    expect(reads.warned).toBe(true);
    // Edit between failures: tally clears each round -> never trips.
    const edits = createToolLoopGuard();
    for (let i = 0; i < 4; i += 1) {
      fail(edits, `f-${i}`, 'Bash', failing);
      ok(edits, `e-${i}`, 'Edit', { file_path: '/x', old_string: `case-${i}` });
    }
    expect(edits.warned).toBe(false);
  });

  it('does not halt when a failing check is fixed by successful mutating Bash between attempts', () => {
    // PR #3375 review: agents change state through the shell, so a successful
    // `sed -i` (or install/build/git commit) between failing checks is real
    // progress and must clear the tally even though the tool is Bash.
    const guard = createToolLoopGuard({ mode: 'halt' });
    const check = { command: 'pnpm test' };
    let tripped = null;
    for (let i = 0; i < 12; i += 1) {
      const verdict = fail(guard, `chk-${i}`, 'Bash', check); // same failing check
      if (verdict) tripped = verdict;
      ok(guard, `fix-${i}`, 'Bash', { command: `sed -i 's/old/new/' src/file-${i}.ts` }); // shell fix = progress
    }
    expect(tripped).toBeNull();
    expect(guard.halted).toBe(false);
    expect(guard.warned).toBe(false);
  });

  it('does not halt when a failing check is fixed by a successful inline python/node script', () => {
    // PR #3375 review: an inline `python3 -c` / `node -e` snippet can write
    // files, so a successful one is a real fix and must clear the tally.
    const guard = createToolLoopGuard({ mode: 'halt' });
    const check = { command: 'pnpm test' };
    let tripped = null;
    for (let i = 0; i < 12; i += 1) {
      const verdict = fail(guard, `chk-${i}`, 'Bash', check);
      if (verdict) tripped = verdict;
      ok(guard, `fix-${i}`, 'Bash', { command: `python3 -c "open('f-${i}.ts','w').write('x')"` }); // inline write = progress
    }
    expect(tripped).toBeNull();
    expect(guard.halted).toBe(false);
  });

  it('does not halt when an env-prefixed mutating Bash fix lands between failing checks', () => {
    // PR #3375 review: `env CI=1 sed -i ...` and `env NODE_ENV=production pnpm install`
    // mutate via the wrapped command, not via `env`. The classifier must unwrap the
    // env prefix so a successful fix clears the tally, instead of reading it as a
    // read-only `env` inspection that lets stale failures accumulate to a halt.
    const guard = createToolLoopGuard({ mode: 'halt' });
    const check = { command: 'pnpm test' };
    let tripped = null;
    for (let i = 0; i < 12; i += 1) {
      const verdict = fail(guard, `chk-${i}`, 'Bash', check); // same failing check
      if (verdict) tripped = verdict;
      const fix = i % 2 === 0
        ? `env CI=1 sed -i 's/old/new/' src/file-${i}.ts`
        : 'env NODE_ENV=production pnpm install';
      ok(guard, `fix-${i}`, 'Bash', { command: fix }); // env-wrapped fix = progress
    }
    expect(tripped).toBeNull();
    expect(guard.halted).toBe(false);
    expect(guard.warned).toBe(false);
  });
});

describe('isReadOnlyShellCommand / isProgressSuccess', () => {
  it('classifies pure inspections as read-only', () => {
    for (const cmd of [
      'cat x.ts', 'ls -la', 'grep foo x', 'rg needle', 'wc -l x', 'sed -n p x',
      'git status', 'git diff HEAD', 'find . -name x',
      'env', 'env FOO=1 cat x', // bare env / env-wrapped inspection stays read-only
    ]) {
      expect(isReadOnlyShellCommand(cmd)).toBe(true);
    }
  });

  it('classifies state-changing shell commands as not read-only', () => {
    for (const cmd of [
      'sed -i s/a/b/ x', 'mv a b', 'rm x', 'mkdir y', 'pnpm install', 'npm run build',
      'git commit -m x', 'git add .', 'echo hi > f.txt',
      'python3 -c "open(\'x\',\'w\').write(\'1\')"', 'node -e "require(\'fs\').writeFileSync(\'x\',\'1\')"',
      'env CI=1 sed -i s/a/b/ x', 'env NODE_ENV=production pnpm install', // env prefix must unwrap to the real cmd
    ]) {
      expect(isReadOnlyShellCommand(cmd)).toBe(false);
    }
  });

  // PR #3375 review: mutating Bash fixes that were misclassified as read-only,
  // so in halt mode a run actually changing files could still be terminated.
  it('treats mutating find actions and unparseable segment heads as progress', () => {
    for (const cmd of [
      "find . -name '*.pyc' -delete", // -delete mutates
      'find . -exec rm {} \\;',       // -exec runs a command
      'find . -execdir rm {} ;',
      "find . -name x -fprint out.txt",
      "find . -name '*.ts' -fprint0 out.bin", // -fprint0 writes a file too
      'find . -fprintf out.txt "%p\\n"',
      '(sed -i s/a/b/ x.ts) && cat x.ts', // subshell head does not parse
      '"sed" -i s/a/b/ x',                // quoted head does not parse
    ]) {
      expect(isReadOnlyShellCommand(cmd)).toBe(false);
    }
  });

  it('keeps pure find and trailing separators read-only', () => {
    for (const cmd of [
      "find . -type f -name '*.ts'", // inspection only
      'find . -maxdepth 2 -name x',
      'ls;',          // trailing separator yields an empty segment, not a mutation
      'cat x.ts ;',
    ]) {
      expect(isReadOnlyShellCommand(cmd)).toBe(true);
    }
  });

  it('treats a Bash fix as progress and a Bash read or read-only tool as non-progress', () => {
    expect(isProgressSuccess('Bash', 'Bash sed -i s/a/b/ x')).toBe(true);
    expect(isProgressSuccess('Bash', 'Bash cat x')).toBe(false);
    expect(isProgressSuccess('Read', 'Read /x')).toBe(false);
    expect(isProgressSuccess('Edit', 'Edit /x')).toBe(true);
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
    const guard = createToolLoopGuard({ mode: 'halt' });
    let last = null;
    for (let i = 0; i < 10; i += 1) last = fail(guard, `t${i}`, 'Bash', { command: `distinct-${i}` });
    expect(last).toMatchObject({ reason: 'consecutive-errors', action: 'halt', count: 10 });
    expect(guard.halted).toBe(true);
  });
});

describe('createToolLoopGuard — latching and modes', () => {
  it('emits warn at most once, then escalates to halt once', () => {
    const guard = createToolLoopGuard({ mode: 'halt' });
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

  it('defaults to warn: it warns but never halts', () => {
    const guard = createToolLoopGuard(); // no mode -> warn (the daemon default)
    const input = { command: 'same' };
    for (let i = 0; i < 20; i += 1) fail(guard, `t${i}`, 'Bash', input);
    expect(guard.warned).toBe(true);
    expect(guard.halted).toBe(false);
  });

  it('is inert after halting', () => {
    const guard = createToolLoopGuard({ mode: 'halt' });
    const input = { command: 'same' };
    for (let i = 0; i < 8; i += 1) fail(guard, `t${i}`, 'Bash', input);
    expect(guard.halted).toBe(true);
    expect(fail(guard, 'after', 'Bash', input)).toBeNull();
  });

  it('reproduces the titlebar-left loop: repeated failing assertion halts the run', () => {
    // The exact shape that motivated the guard: the agent re-runs the same
    // shell assertion against an element name that does not exist.
    const guard = createToolLoopGuard({ mode: 'halt' });
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
  it('defaults to warn', () => {
    expect(resolveToolLoopMode({})).toBe('warn');
  });
  it('reads off/warn/halt case-insensitively', () => {
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'OFF' })).toBe('off');
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: ' warn ' })).toBe('warn');
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'HALT' })).toBe('halt');
  });
  it('falls back to warn on an unrecognized value', () => {
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'disable' })).toBe('warn');
  });
});
