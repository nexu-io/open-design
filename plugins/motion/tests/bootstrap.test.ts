import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Isolate downloads, dependency commands and Codex writes from the user's machine.
async function fixture(run: (context: { directory: string; destination: string; log: string; env: NodeJS.ProcessEnv }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-bootstrap-'));
  try {
    const bin = path.join(directory, 'bin');
    const source = path.join(directory, 'source');
    const destination = path.join(directory, 'new user', 'open-motion');
    const log = path.join(directory, 'commands.log');
    await mkdir(bin);
    await mkdir(path.join(source, 'scripts'), { recursive: true });
    await copyFile(path.join(root, 'scripts/install-motion.command'), path.join(source, 'scripts/install-motion.command'));
    await copyFile(path.join(root, 'marketplace.example.json'), path.join(source, 'marketplace.example.json'));
    const commands = {
      git: 'echo "git $*" >> "$MOTION_TEST_LOG"\n[ "${MOTION_TEST_DOWNLOAD_FAIL:-0}" = 0 ] || exit 8\n[ "$1" = clone ] || exit 0\nfor destination; do :; done\nmkdir -p "$destination/plugins/motion"\ncp -R "$MOTION_TEST_SOURCE/." "$destination/plugins/motion/"',
      npm: 'echo "npm $*" >> "$MOTION_TEST_LOG"\nif [ "$1" = ci ]; then [ "${MOTION_TEST_DEPENDENCY_FAIL:-0}" = 0 ] || exit 9; fi\nif [ "$*" = "run build:studio" ]; then [ "${MOTION_TEST_BUILD_FAIL:-0}" = 0 ] || exit 9; mkdir -p studio/build; touch studio/build/index.html; fi',
      codex: 'echo "codex $*" >> "$MOTION_TEST_LOG"\n[ "${MOTION_TEST_OLD_CODEX:-0}" = 0 ] || exit 10',
      node: 'case "${1:-}" in\n  */check-installed-mcp.mjs) echo "MCP check" >> "$MOTION_TEST_LOG"; exit "${MOTION_TEST_MCP_FAIL:-0}" ;;\nesac\nexec "$MOTION_TEST_NODE" "$@"',
    };
    for (const [name, command] of Object.entries(commands)) {
      await writeFile(path.join(bin, name), '#!/bin/bash\nset -eu\n' + command + '\n', { mode: 0o755 });
    }
    await run({ directory, destination, log, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
      OPENMOTION_INSTALL_DIR: destination, OPENMOTION_REF: 'test-ref', MOTION_TEST_SOURCE: source,
      MOTION_TEST_NODE: process.execPath, MOTION_TEST_LOG: log } });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('remote entry point builds a fresh checkout before registering and checking the plugin', async () => {
  await fixture(async ({ destination, log, env }) => {
    const result = spawnSync('bash', [path.join(root, 'install.sh')], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await access(path.join(destination, 'plugins/motion/studio/build/index.html'));
    const commands = await readFile(log, 'utf8');
    assert.match(commands, /git clone --depth 1 --filter=blob:none --sparse --branch test-ref -- https:\/\/github\.com\/nexu-io\/open-design\.git/);
    assert.ok(commands.indexOf('npm ci --include=dev') < commands.indexOf('npm run build:studio'));
    assert.ok(commands.indexOf('npm run build:studio') < commands.indexOf('codex plugin marketplace add'));
    assert.match(commands, /codex plugin add motion@motion-local\ncodex plugin list --marketplace motion-local\nMCP check/);
    assert.match(result.stdout, /OpenDesign（Motion） 已安装/);
  });
});

for (const kind of ['directory', 'symlink']) {
  test(`existing ${kind} is protected without downloading or registering`, async () => {
    await fixture(async ({ directory, destination, log, env }) => {
      const marker = path.join(destination, 'user-work.txt');
      await mkdir(path.dirname(destination), { recursive: true });
      if (kind === 'directory') {
        await mkdir(destination);
        await writeFile(marker, 'keep');
      } else {
        await symlink(path.join(directory, 'missing'), destination);
      }
      const result = spawnSync('bash', [path.join(root, 'install.sh')], { env, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /安装目录已存在，未覆盖/);
      if (kind === 'directory') assert.equal(await readFile(marker, 'utf8'), 'keep');
      assert.doesNotMatch(await readFile(log, 'utf8'), /git clone|marketplace add/);
    });
  });
}

test('a prebuilt distribution skips dependency installation and editor build', async () => {
  await fixture(async ({ log, env }) => {
    const build = path.join(env.MOTION_TEST_SOURCE!, 'studio/build');
    await mkdir(build, { recursive: true });
    await writeFile(path.join(build, 'index.html'), 'prebuilt');
    const result = spawnSync('bash', [path.join(root, 'install.sh')], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(await readFile(log, 'utf8'), /npm /);
  });
});

for (const [failure, expected] of [
  ['MOTION_TEST_OLD_CODEX', /不支持插件安装/],
  ['MOTION_TEST_DOWNLOAD_FAIL', null],
  ['MOTION_TEST_DEPENDENCY_FAIL', null],
  ['MOTION_TEST_BUILD_FAIL', null],
] as const) {
  test(`${failure} stops before plugin registration and never claims success`, async () => {
    await fixture(async ({ log, env }) => {
      const result = spawnSync('bash', [path.join(root, 'install.sh')], { env: { ...env, [failure]: '1' }, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      if (expected) assert.match(result.stderr, expected);
      assert.doesNotMatch(await readFile(log, 'utf8'), /marketplace add|plugin add motion@/);
      assert.doesNotMatch(result.stdout, /OpenDesign（Motion） 已安装/);
    });
  });
}

test('MCP verification failure is reported even after plugin registration', async () => {
  await fixture(async ({ log, env }) => {
    const result = spawnSync('bash', [path.join(root, 'install.sh')], { env: { ...env, MOTION_TEST_MCP_FAIL: '1' }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(await readFile(log, 'utf8'), /plugin add motion@motion-local/);
    assert.doesNotMatch(result.stdout, /OpenDesign（Motion） 已安装/);
  });
});
