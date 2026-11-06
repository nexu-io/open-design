import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fixture } from './fixtures.ts';

test('actual MCP stdio exposes exactly phase-one tools and rejects hidden writes without side effects', () => fixture(async store => {
  const before = await store.get();
  const messages = [
    { id: 1, method: 'initialize' }, { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'motion_write_files', arguments: { expectedRevision: before.revision, files: [{ path: 'notes.md', content: 'hidden' }] } } },
    { id: 4, method: 'tools/call', params: { name: 'motion_edit_project', arguments: {} } },
  ];
  const child = spawnSync(process.execPath, ['--experimental-strip-types', 'mcp.ts'], { input: messages.map(m => JSON.stringify({ jsonrpc: '2.0', ...m })).join('\n') + '\n', encoding: 'utf8', env: { ...process.env, MOTION_DATA_DIR: store.directory }, timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(responses[1].result.tools.length, 9);
  assert.ok(responses[1].result.tools.every((tool: any) => tool.name.startsWith('motion_')));
  assert.match(responses[2].result.content[0].text, /MCP_TOOL_NOT_EXPOSED/);
  assert.match(responses[3].result.content[0].text, /INVALID_ARGUMENT/);
  assert.deepEqual(await store.get(), before);
}));

test('workflow sections are read-only and expose native production instructions', () => fixture(async store => {
  const { callTool } = await import('../mcp.ts');
  const before = await store.get();
  for (const section of ['start', 'intake', 'templates', 'production', 'verification']) {
    const result = await callTool('motion_get_workflow', { section }, store) as any;
    assert.equal(result.section, section); assert.ok(result.content.length > 100);
  }
  await assert.rejects(callTool('motion_get_workflow', { section: '../secrets' }, store), /Unknown workflow section/);
  assert.deepEqual(await store.get(), before);
}));
