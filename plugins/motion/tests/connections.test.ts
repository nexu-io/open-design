import test from 'node:test';
import { closeFixtureEditor } from './fixtures.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transport } from './http.ts';
import { WorkspaceStore } from '../workspace.ts';
import { integrationConfig, manualConnection } from '../shared/integration.ts';

test('MCP connection configs launch the native tools in the exact workspace and safely quote shell paths', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "motion ' $(literal) "));
  try {
    const store = new WorkspaceStore(directory), request = transport(store);
    const before = await store.get();
    const info = await (await request('/motion-api/integration')).json();
    assert.equal(info.dataDirectory, directory);
    assert.equal(info.transport.env.PORT, '4173');
    const config = JSON.parse(integrationConfig(info, 'mcp').text).mcpServers.motion;
    assert.equal(config.env.MOTION_DATA_DIR, directory);
    assert.ok(path.isAbsolute(config.command)); assert.ok(path.isAbsolute(config.args[1]));
    const messages = [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { id: 2, method: 'tools/list' },
      { id: 3, method: 'resources/list' },
      { id: 4, method: 'tools/call', params: { name: 'motion_list_templates', arguments: { category: 'builtin' } } },
      { id: 5, method: 'resources/read', params: { uri: 'motion://workflow/production/production' } },
    ];
    const child = spawnSync(config.command, config.args, { cwd: tmpdir(), env: { ...process.env, ...config.env }, encoding: 'utf8', timeout: 10_000,
      input: messages.map(message => JSON.stringify({ jsonrpc: '2.0', ...message })).join('\n') + '\n' });
    assert.equal(child.status, 0, child.stderr);
    const replies = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(replies[1].result.tools.length, 9);
    assert.ok(replies[1].result.tools.some((tool: any) => tool.name === 'motion_edit_project'));
    assert.ok(replies[2].result.resources.some((item: any) => item.uri === 'motion://workflow/production/start'));
    assert.equal(replies[3].result.isError, true);
    assert.equal(JSON.parse(replies[4].result.contents[0].text).section, 'production');
    for (const host of ['codex', 'claude'] as const) {
      const command = manualConnection(info, host).split('\n')[0];
      const capture = spawnSync('/bin/sh', ['-c', `${host}() { printf '%s\\000' "$@"; }; ${command}`], { encoding: 'utf8', timeout: 5000 });
      assert.equal(capture.status, 0, capture.stderr);
      const args = capture.stdout.split('\0');
      assert.ok(args.includes(`MOTION_DATA_DIR=${directory}`)); assert.ok(args.includes(config.command)); assert.ok(args.includes(config.args[1]));
    }
    const download = await request('/connect/config?host=claude');
    assert.equal(JSON.parse(await download.text()).mcpServers.motion.env.MOTION_DATA_DIR, directory);
    const yaml = await (await request('/connect/config?host=deepseek')).text();
    assert.match(yaml, /^- insert:\n    - id: mcp-openmotion/);
    assert.match(yaml, /name: '@deepseek-ai\/dsh-mcp-client'/);
    assert.ok(yaml.includes(`MOTION_DATA_DIR: ${JSON.stringify(directory)}`));
    for (const host of ['codex', 'claude', 'deepseek', 'chatgpt', 'mcp']) {
      const redirect = await request('/connect?host=' + host);
      assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('Location'), '/?panel=connections&host=' + host);
      assert.equal((await request('/connect/guide?host=' + host)).status, 200);
    }
    const guide = await (await request('/connect/guide?host=codex')).text();
    assert.match(guide, /motion_edit_project/); assert.match(guide, /Hyperframes/);
    assert.match(guide, /resources\/read/); assert.match(guide, /motion_export_request/);
    assert.doesNotMatch(guide, /motion_update_shot|540×960|保持预览在前台/);
    const unavailable = await request('/connect/config?host=chatgpt');
    assert.equal(unavailable.status, 400); assert.match((await unavailable.json()).error, /尚无.*远程 MCP/);
    assert.deepEqual(await store.get(), before);
  } finally { await closeFixtureEditor(directory); await rm(directory, { recursive: true, force: true }); }
});

test('connection configs preserve custom ffprobe paths for rendering and export verification', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-probe-config-'));
  const previous = { FFPROBE_PATH: process.env.FFPROBE_PATH, HYPERFRAMES_FFPROBE_PATH: process.env.HYPERFRAMES_FFPROBE_PATH };
  process.env.FFPROBE_PATH = path.join(directory, 'legacy tools', 'ffprobe');
  process.env.HYPERFRAMES_FFPROBE_PATH = path.join(directory, 'native tools', 'ffprobe');
  try {
    const info = await (await transport(new WorkspaceStore(directory))('/motion-api/integration')).json();
    for (const key of Object.keys(previous)) {
      assert.equal(info.transport.env[key], process.env[key]);
      const config = JSON.parse(integrationConfig(info, 'mcp').text).mcpServers.motion;
      assert.equal(config.env[key], process.env[key]);
      assert.ok(integrationConfig(info, 'codex').text.includes(`${key} = ${JSON.stringify(process.env[key])}`));
      assert.ok(integrationConfig(info, 'deepseek').text.includes(`${key}: ${JSON.stringify(process.env[key])}`));
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
