import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../../..');
const posixInstaller = join(repoRoot, 'apps/landing-page/public/install-dsh.sh');
const powershellInstaller = join(repoRoot, 'apps/landing-page/public/install-dsh.ps1');
const cmdInstaller = join(repoRoot, 'apps/landing-page/public/install-dsh.cmd');

test('publishes pinned cross-platform DeepSeek Harness installers', () => {
  const shell = readFileSync(posixInstaller, 'utf8');
  const powershell = readFileSync(powershellInstaller, 'utf8');
  const cmd = readFileSync(cmdInstaller, 'utf8');

  assert.match(shell, /^#!\/usr\/bin\/env sh\n/);
  assert.match(shell, /NODE_VERSION=['"]?24\.19\.0/);
  assert.match(shell, /DSH_VERSION=['"]?0\.1\.0-rc\.6/);
  assert.match(shell, /PNPM_VERSION=['"]?11\.7\.0/);
  assert.match(shell, /SHASUMS256\.txt/);
  assert.match(shell, /--no-launch/);
  assert.doesNotMatch(shell, /npm\s+(?:install|i)\s+-g/);

  assert.match(powershell, /NodeVersion\s*=\s*'24\.19\.0'/);
  assert.match(powershell, /DshVersion\s*=\s*'0\.1\.0-rc\.6'/);
  assert.match(powershell, /PnpmVersion\s*=\s*'11\.7\.0'/);
  assert.match(powershell, /Get-FileHash/);
  assert.match(powershell, /NoLaunch/);
  assert.doesNotMatch(powershell, /npm(?:\.cmd)?\s+(?:install|i)\s+-g/);

  assert.match(cmd, /^@echo off\r?\n/);
  assert.match(cmd, /powershell\.exe/);
  assert.match(cmd, /https:\/\/open-design\.ai\/install-dsh\.ps1/);
  assert.doesNotMatch(cmd, /DEEPSEEK_API_KEY/);
});

test('POSIX installer performs a checksum-verified isolated install and is idempotent', () => {
  if (process.platform === 'win32') return;

  const tmp = mkdtempSync(join(tmpdir(), 'od-dsh-installer-'));
  const dist = join(tmp, 'dist');
  const fixtureRoot = join(tmp, 'node-v24.19.0-linux-x64');
  const fixtureBin = join(fixtureRoot, 'bin');
  const installRoot = join(tmp, 'managed');
  const binDir = join(tmp, 'bin');
  const archiveName = 'node-v24.19.0-linux-x64.tar.gz';
  const archive = join(dist, archiveName);
  mkdirSync(fixtureBin, { recursive: true });
  mkdirSync(dist, { recursive: true });

  writeFileSync(
    join(fixtureBin, 'node'),
    `#!/bin/sh
if [ "$1" = "-e" ]; then printf '%s\\n' '11.7.0'; exit 0; fi
printf '%s\\n' 'v24.19.0'
`,
  );
  writeFileSync(
    join(fixtureBin, 'npm'),
    `#!/bin/sh
prefix=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--prefix" ]; then prefix="$2"; shift 2; continue; fi
  shift
done
mkdir -p "$prefix/node_modules/@deepseek-ai/dsh/lib" "$prefix/node_modules/.bin"
: > "$prefix/node_modules/@deepseek-ai/dsh/lib/bin.js"
cat > "$prefix/node_modules/.bin/dsh" <<'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' '0.1.0-rc.6'; exit 0; fi
if [ "$1" = "plugin" ]; then pnpm --version; exit $?; fi
printf '%s\\n' "dsh:$*"
EOF
cat > "$prefix/node_modules/.bin/pnpm" <<'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' '11.7.0'; exit 0; fi
printf '%s\\n' "pnpm:$*"
EOF
chmod +x "$prefix/node_modules/.bin/dsh" "$prefix/node_modules/.bin/pnpm"
`,
  );
  writeFileSync(
    join(fixtureBin, 'pnpm'),
    `#!/bin/sh
printf '%s\\n' '10.33.2'
`,
  );
  chmodSync(join(fixtureBin, 'node'), 0o755);
  chmodSync(join(fixtureBin, 'npm'), 0o755);
  chmodSync(join(fixtureBin, 'pnpm'), 0o755);

  const tar = spawnSync('tar', ['-czf', archive, '-C', tmp, 'node-v24.19.0-linux-x64'], {
    encoding: 'utf8',
  });
  assert.equal(tar.status, 0, tar.stderr);
  const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
  writeFileSync(join(dist, 'SHASUMS256.txt'), `${hash}  ${archiveName}\n`);

  const env = {
    ...process.env,
    OD_DSH_INSTALL_PLATFORM: 'linux-x64',
    OD_DSH_INSTALL_DIST_BASE: `file://${dist}`,
    OD_DSH_INSTALL_ROOT: installRoot,
    OD_DSH_INSTALL_BIN_DIR: binDir,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  };

  try {
    const first = spawnSync('sh', [posixInstaller, '--no-launch'], { encoding: 'utf8', env });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /DeepSeek Harness 0\.1\.0-rc\.6 is ready/);

    const version = spawnSync(join(binDir, 'dsh'), ['--version'], { encoding: 'utf8', env });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), '0.1.0-rc.6');

    const pluginPnpm = spawnSync(join(binDir, 'dsh'), ['plugin'], { encoding: 'utf8', env });
    assert.equal(pluginPnpm.status, 0, pluginPnpm.stderr);
    assert.equal(pluginPnpm.stdout.trim(), '11.7.0');

    const second = spawnSync('sh', [posixInstaller, '--no-launch'], { encoding: 'utf8', env });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already installed/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('POSIX installer reuses a complete compatible toolchain without downloading Node', () => {
  if (process.platform === 'win32') return;

  const tmp = mkdtempSync(join(tmpdir(), 'od-dsh-existing-'));
  const pathDir = join(tmp, 'path');
  const binDir = join(tmp, 'bin');
  mkdirSync(pathDir, { recursive: true });
  for (const [name, version] of [
    ['node', 'v24.19.0'],
    ['dsh', '0.1.0-rc.6'],
    ['pnpm', '11.7.0'],
  ] as const) {
    const executable = join(pathDir, name);
    writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
    chmodSync(executable, 0o755);
  }

  const env = {
    ...process.env,
    OD_DSH_INSTALL_DIST_BASE: 'https://invalid.example.test/should-not-download',
    OD_DSH_INSTALL_ROOT: join(tmp, 'managed'),
    OD_DSH_INSTALL_BIN_DIR: binDir,
    PATH: `${pathDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
  };

  try {
    const result = spawnSync('sh', [posixInstaller, '--no-launch'], { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /existing Node, dsh, and pnpm/);
    assert.doesNotMatch(result.stdout + result.stderr, /Downloading/);
    const version = spawnSync(join(binDir, 'dsh'), ['--version'], { encoding: 'utf8', env });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), '0.1.0-rc.6');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
