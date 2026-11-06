import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, realpath, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportAdapters } from '../scripts/export-adapters.ts';

const source = fileURLToPath(new URL('../', import.meta.url));

test('local adapters share one runtime, launch outside its cwd and preserve previous exports', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "motion adapters ' $(literal) ")));
  try {
    const data = path.join(directory, 'user projects'), output = path.join(directory, 'export');
    const exported = await exportAdapters(source, data, output);
    assert.deepEqual(exported.hosts, ['codex', 'claude', 'workbuddy', 'deepseek']);
    for (const host of exported.hosts) {
      const scope = JSON.parse(await readFile(path.join(output, host, 'openmotion/scope.json'), 'utf8'));
      assert.equal(scope.mcpProfile, 'phase1');
    }
    for (const host of exported.hosts) assert.ok(existsSync(path.join(output, `openmotion-${host}-${exported.version}-local.zip`)));
    const launch = JSON.parse(await readFile(path.join(output, 'launch-spec.json'), 'utf8'));
    for (const host of ['codex', 'claude', 'workbuddy']) {
      const plugin = path.join(output, host, 'openmotion');
      const config = JSON.parse(await readFile(path.join(plugin, host === 'workbuddy' ? 'mcp.json' : '.mcp.json'), 'utf8')).mcpServers.motion;
      assert.equal(config.command, launch.command); assert.deepEqual(config.args, launch.args);
      assert.equal(config.env.MOTION_DATA_DIR, data);
      const manifest = JSON.parse(await readFile(path.join(plugin, host === 'workbuddy' ? 'connector-meta.json' : `.${host}-plugin/plugin.json`), 'utf8'));
      if (host === 'workbuddy') {
        assert.equal(manifest.type, 'mcp'); assert.equal(manifest.source, 'openmotion');
        assert.equal(manifest.minWorkbuddyVersion, '4.22.15');
        assert.equal(manifest.auth_mode, undefined);
        assert.equal(manifest.examples_en.length, 2); assert.equal(manifest.examples_zh.length, 2);
        assert.match(await readFile(path.join(plugin, 'icon.svg'), 'utf8'), /<svg.+viewBox="0 0 24 24"/);
        assert.deepEqual(config, launch);
        assert.equal(existsSync(path.join(plugin, '.workbuddy-plugin')), false);
      } else {
        assert.equal(manifest.mcpServers, './.mcp.json'); assert.equal(manifest.name, 'motion');
      }
      if (host === 'codex') {
        assert.equal(manifest.requires_local_executor, true);
        assert.equal(manifest.interface.displayName, 'OpenDesign');
        assert.deepEqual(config, launch);
        const marketplace = JSON.parse(await readFile(path.join(output, host, '.agents/plugins/marketplace.json'), 'utf8'));
        assert.deepEqual(marketplace.plugins[0], { name: 'motion', source: { source: 'local', path: './openmotion' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' });
      }
      assert.equal(await readFile(path.join(plugin, 'skills/motion-production/SKILL.md'), 'utf8'), await readFile(path.join(source, 'skills/motion-production/SKILL.md'), 'utf8'));
      for (const filename of ['AGENTS.md', 'CLAUDE.md', 'docs/README.md', 'docs/product/architecture.md']) {
        assert.equal(await readFile(path.join(plugin, filename), 'utf8'), await readFile(path.join(source, filename), 'utf8'));
      }
      for (const filename of ['runtime', 'node_modules', 'mcp.ts', 'server.ts']) assert.equal(existsSync(path.join(plugin, filename)), false);
      const child = spawnSync(config.command, config.args, { cwd: tmpdir(), env: { ...process.env, ...config.env }, encoding: 'utf8', timeout: 10_000,
        input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n' });
      assert.equal(child.status, 0, child.stderr);
      assert.ok(JSON.parse(child.stdout).result.tools.some(tool => tool.name === 'motion_export_request'));
      assert.equal(JSON.parse(child.stdout).result.tools.length, 9);
      assert.deepEqual((await (await import('node:fs/promises')).readdir(path.join(plugin, 'skills'))).sort(), ['motion-director', 'motion-production', 'motion-recreate', 'template-to-video']);
    }
    assert.equal(existsSync(data), false, 'Export must not initialize a video project');
    const patch = await readFile(path.join(output, 'deepseek/openmotion/cordis.patch.yml'), 'utf8');
    assert.match(patch, /^- insert:\n    - id: mcp-openmotion/);
    assert.ok(patch.includes(`MOTION_DATA_DIR: ${JSON.stringify(data)}`));
    const existing = await readFile(path.join(output, 'launch-spec.json'));
    await assert.rejects(exportAdapters(source, data, output), { code: 'EEXIST' });
    assert.deepEqual(await readFile(path.join(output, 'launch-spec.json')), existing);
    await assert.rejects(exportAdapters(source, path.join(source, 'private-projects'), path.join(directory, 'bad')), /outside the runtime/);
    await assert.rejects(exportAdapters(source, path.join(directory, 'overlap'), path.join(directory, 'overlap/export')), /separate from user projects/);
    await assert.rejects(exportAdapters(source, data, path.join(source, 'adapters')), /separate from the runtime/);
    const alias = path.join(directory, 'runtime-alias');
    await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(exportAdapters(source, path.join(alias, 'projects'), path.join(directory, 'bad-alias')), /outside the runtime/);
    await assert.rejects(exportAdapters(source, directory + '/missing/../runtime-alias/projects', path.join(directory, 'bad-normalized-data')), /outside the runtime/);
    await assert.rejects(exportAdapters(source, data, directory + '/missing/../runtime-alias/adapters'), /separate from the runtime/);
    const dataAlias = path.join(directory, 'data-alias');
    await mkdir(data); await symlink(data, dataAlias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(exportAdapters(source, data, path.join(dataAlias, 'export')), /separate from user projects/);
    await assert.rejects(exportAdapters(source, data, directory + '/missing/../data-alias/export'), /separate from user projects/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('bundled runtime adapters preserve the Node preload and launch with a minimal PATH', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'motion-bundled-adapter-')));
  try {
    const runtime = path.join(directory, 'runtime with spaces');
    const node = path.join(runtime, 'runtime/node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
    await mkdir(path.dirname(node), { recursive: true });
    await mkdir(path.join(runtime, 'skills'));
    await cp(process.execPath, node);
    await mkdir(path.join(runtime, 'docs'));
    for (const name of ['AGENTS.md', 'CLAUDE.md']) await writeFile(path.join(runtime, name), '# Fixture');
    for (const filename of ['scripts/export-adapters.ts', 'scripts/package.ts', 'scripts/distribution.ts', 'shared/entry.ts', 'shared/integration.ts', 'shared/workflow.ts', 'web/design-system/icons.svg']) {
      await mkdir(path.dirname(path.join(runtime, filename)), { recursive: true });
      await cp(path.join(source, filename), path.join(runtime, filename));
    }
    await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ type: 'module', version: '0.6.0' }));
    await writeFile(path.join(runtime, 'bootstrap.mjs'), 'process.env.ADAPTER_PRELOAD_TEST = "loaded";');
    await writeFile(path.join(runtime, 'mcp.ts'), 'console.log(JSON.stringify({preload:process.env.ADAPTER_PRELOAD_TEST,data:process.env.MOTION_DATA_DIR}));');
    const data = path.join(directory, 'projects'), output = path.join(directory, 'adapters');
    const exported = spawnSync(node, ['--experimental-strip-types', path.join(runtime, 'scripts/export-adapters.ts'), runtime, data, output], { cwd: tmpdir(), encoding: 'utf8', timeout: 10_000 });
    assert.equal(exported.status, 0, exported.stderr);
    assert.equal(JSON.parse(exported.stdout).hosts.length, 4);
    for (const host of ['codex', 'claude', 'workbuddy']) {
      const config = JSON.parse(await readFile(path.join(output, host, 'openmotion', host === 'workbuddy' ? 'mcp.json' : '.mcp.json'), 'utf8')).mcpServers.motion;
      assert.equal(config.command, node);
      const child = spawnSync(config.command, config.args, { cwd: tmpdir(), env: { ...config.env, PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 5000 });
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout), { preload: 'loaded', data });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed adapter writes remove only the new output and preserve runtime and user data', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'motion-adapter-failure-')));
  try {
    const data = path.join(directory, 'projects'), output = path.join(directory, 'adapters');
    await mkdir(data); await writeFile(path.join(data, 'keep.txt'), 'user data');
    // An unreasonably long ZIP filename fails after output creation on supported filesystems.
    const runtime = path.join(directory, 'runtime');
    await mkdir(path.join(runtime, 'skills'), { recursive: true }); await mkdir(path.join(runtime, 'docs'));
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'mcp.ts']) await writeFile(path.join(runtime, name), '');
    await mkdir(path.join(runtime, 'web/design-system'), { recursive: true });
    await cp(path.join(source, 'web/design-system/icons.svg'), path.join(runtime, 'web/design-system/icons.svg'));
    await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ version: '0.6.1-' + 'a'.repeat(260) }));
    await assert.rejects(exportAdapters(runtime, data, output), { code: 'ENAMETOOLONG' });
    assert.equal(existsSync(output), false);
    assert.equal(await readFile(path.join(data, 'keep.txt'), 'utf8'), 'user data');
    assert.equal(existsSync(path.join(runtime, 'mcp.ts')), true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
