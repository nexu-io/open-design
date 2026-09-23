import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { execCommandViaLoginShell } from '../src/services/login-shell.js';

// quotePosixShellArg is the injection boundary for every POSIX gh/CLI call the
// daemon routes through a login shell. These tests run the built command line
// through a real `/bin/sh -c` and assert hostile argv round-trips verbatim —
// quoting regressions become command injection, so the table is deliberately
// adversarial.
const posixOnly = process.platform === 'win32' ? describe.skip : describe;

posixOnly('execCommandViaLoginShell quoting', () => {
  // Sentinel paths live under a per-run mkdtemp so a leftover from a crashed
  // run or a shared CI runner can never produce a spurious pass/fail. The dir
  // is created in beforeAll (not the describe factory) so a skipped suite —
  // win32 — never leaves an orphaned temp dir behind.
  let sentinelDir = '';
  beforeAll(() => {
    sentinelDir = mkdtempSync(join(tmpdir(), 'od-quoting-'));
  });
  afterAll(() => {
    if (sentinelDir) rmSync(sentinelDir, { recursive: true, force: true });
  });
  const sentinel = (name: string) => join(sentinelDir, name);
  const hostileArgs = [
    "it's",
    `'$(touch ${sentinel('pwned')})'`,
    `\`touch ${sentinel('pwned2')}\``,
    'a b\tc\nd',
    '"; echo hi',
    '\\',
    '$HOME',
    '*',
    '--version; exit 1',
    '',
    "''",
  ];

  for (const arg of hostileArgs) {
    test(`argv survives verbatim: ${JSON.stringify(arg)}`, async () => {
      const res = await execCommandViaLoginShell('printf', ['%s', arg]);
      assert.equal(res.ok, true, res.stderr || String(res.error));
      assert.equal(res.stdout, arg);
    });
  }

  test('no stray files from command substitution attempts', async () => {
    const target = sentinel('pwned');
    await execCommandViaLoginShell('printf', ['%s', `$(touch ${target})`]);
    assert.equal(existsSync(target), false);
  });
});

posixOnly('execCommandViaLoginShell PATH handling', () => {
  test('does not clobber the child shell default PATH when daemon PATH is unset', async () => {
    const saved = process.env.PATH;
    delete process.env.PATH;
    try {
      const res = await execCommandViaLoginShell('sh', ['-c', 'printf %s "$PATH"']);
      assert.equal(res.ok, true, res.stderr || String(res.error));
      // Without the fix the command was `export PATH=''` and printed nothing;
      // a POSIX shell left alone supplies its own default.
      assert.ok(res.stdout.length > 0, 'child PATH was empty');
    } finally {
      if (saved !== undefined) process.env.PATH = saved;
    }
  });

  test('re-exports the daemon PATH so wrappers stay visible', async () => {
    const saved = process.env.PATH;
    process.env.PATH = '/tmp/od-fake-bin:/usr/bin:/bin';
    try {
      const res = await execCommandViaLoginShell('sh', ['-c', 'printf %s "$PATH"']);
      assert.equal(res.ok, true, res.stderr || String(res.error));
      assert.equal(res.stdout, '/tmp/od-fake-bin:/usr/bin:/bin');
    } finally {
      if (saved !== undefined) process.env.PATH = saved;
      else delete process.env.PATH;
    }
  });
});
