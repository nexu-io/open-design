import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { callTool, rpc, tools } from '../mcp.ts';
import { WorkspaceStore } from '../workspace.ts';

test('default production preserves legacy calls while template reuse and video-to-template have separate real entries', async () => {
  const sections = ['start', 'intake', 'templates', 'production', 'verification'];
  const initial = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.match(initial.result.instructions, /motion:\/\/workflow\/production\/start/);
  assert.ok(!initial.result.instructions.includes('video-to-template'));
  assert.ok(!initial.result.instructions.includes('template-to-video'));
  for (const section of sections) {
    const value = await callTool('motion_get_workflow', { section });
    assert.equal(value.workflow, 'production');
    for (const legacySection of sections) assert.ok(value.sections.includes(legacySection), `Missing legacy section: ${legacySection}`);
    assert.ok(value.path.includes('/skills/motion-production/'));
    assert.equal(value.content, await readFile(value.path, 'utf8'));
  }
  const start = await callTool('motion_get_workflow');
  assert.equal(start.section, 'start');
  assert.ok(start.path.endsWith('/motion-production/SKILL.md'));
  const template = await callTool('motion_get_workflow', { workflow: 'template' });
  assert.equal(template.documentId, 'skills/template-to-video/SKILL.md');
  assert.equal(template.status, 'ready');
  const manufacturing = await callTool('motion_get_workflow', { workflow: 'video-to-template' });
  assert.equal(manufacturing.documentId, 'skills/video-to-template/SKILL.md');
  assert.equal(manufacturing.status, 'ready');
  const recreate = await callTool('motion_get_workflow', { workflow: 'recreate' });
  assert.equal(recreate.documentId, 'skills/motion-recreate/SKILL.md');
  assert.equal(recreate.status, 'placeholder');
  await assert.rejects(readFile(new URL('../skills/motion-template/SKILL.md', import.meta.url)), /ENOENT/);
  assert.ok(!tools.some(tool => tool.name === 'motion_save_template'));
  assert.ok(tools.some(tool => tool.name === 'motion_compare_video'));
});

test('existing private template files remain readable without altering team catalog results', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-extension-boundary-'));
  try {
    const store = new WorkspaceStore(directory);
    const before = await callTool('motion_list_templates', { category: 'all', limit: 60 }, store);
    const id = 'previous-private-template';
    const filename = path.join(directory, 'templates', id, 'template.json');
    await mkdir(path.dirname(filename), { recursive: true });
    const contents = JSON.stringify({ id, title: 'Old private template', canvas: { width: 1920, height: 1080, duration: 10 } });
    await writeFile(filename, contents);
    const after = await callTool('motion_list_templates', { category: 'all', limit: 60 }, store);
    assert.deepEqual(after, before);
    const searched = await callTool('motion_list_templates', { query: id }, store);
    assert.equal(searched.templates.length, 0);
    await assert.rejects(callTool('motion_get_template', { templateId: id }, store), /模板不存在/);
    assert.equal(await readFile(filename, 'utf8'), contents);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
