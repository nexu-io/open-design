import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../../..');
const installScript = join(repoRoot, 'apps/landing-page/public/install.sh');

function runInstall(args: string[], pathDir: string) {
  return spawnSync('sh', [installScript, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${pathDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    },
  });
}

test('landing page serves install.sh as a shell script, not the HTML app fallback', () => {
  const body = readFileSync(installScript, 'utf8');

  assert.match(body, /^#!\/usr\/bin\/env sh\n/);
  assert.match(body, /od mcp install/);
  assert.doesNotMatch(body, /<!doctype html/i);
  assert.doesNotMatch(body, /<html/i);
});

test('install.sh delegates to the Open Design CLI installer with the requested agent', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-install-sh-'));
  const argvOut = join(tmp, 'argv.txt');
  const fakeOd = join(tmp, 'od');
  writeFileSync(
    fakeOd,
    `#!/bin/sh
if [ "$1" = "mcp" ] && [ "$2" = "install" ] && [ "$3" = "--help" ]; then
  printf '%s\\n' 'Usage text intentionally does not define CLI identity.'
  exit 0
fi
if [ "$1" = "mcp" ] && [ "$2" = "install" ] && [ "$3" = "--open-design-cli-probe" ]; then
  printf '%s\\n' 'open-design-cli:mcp-install:v1'
  exit 0
fi
printf '%s\\n' "$@" > "${argvOut}"
`,
    'utf8',
  );
  chmodSync(fakeOd, 0o755);

  try {
    const result = runInstall(['codex', '--print'], tmp);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(argvOut, 'utf8'), 'mcp\ninstall\ncodex\n--print\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.sh rejects a shadowed od binary even when its help exits successfully', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-install-sh-shadow-success-'));
  const argvOut = join(tmp, 'argv.txt');
  const fakeOd = join(tmp, 'od');
  writeFileSync(
    fakeOd,
    `#!/bin/sh
if [ "$3" = "--help" ]; then
  printf '%s\\n' 'Usage: od [OPTION]... [FILE]...'
  exit 0
fi
if [ "$3" = "--open-design-cli-probe" ]; then
  printf '%s\\n' 'Usage: od [OPTION]... [FILE]...'
  exit 0
fi
printf '%s\\n' "$@" > "${argvOut}"
exit 0
`,
    'utf8',
  );
  chmodSync(fakeOd, 0o755);

  try {
    const result = runInstall(['cursor'], tmp);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not look like the Open Design CLI/);
    assert.match(result.stderr, /macOS, Linux, and WSL2/);
    assert.match(result.stderr, /Settings -> MCP server/);
    assert.throws(() => readFileSync(argvOut, 'utf8'), /ENOENT/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.sh rejects a non-Open-Design od binary instead of calling coreutils od', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'od-install-sh-shadow-'));
  const fakeOd = join(tmp, 'od');
  writeFileSync(
    fakeOd,
    `#!/bin/sh
exit 1
`,
    'utf8',
  );
  chmodSync(fakeOd, 0o755);

  try {
    const result = runInstall(['cursor'], tmp);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not look like the Open Design CLI/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
