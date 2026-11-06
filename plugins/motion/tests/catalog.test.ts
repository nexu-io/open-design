import test from 'node:test';
import { closeFixtureEditor } from './fixtures.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { catalogTemplates, featuredTemplateIds, groupTemplates, isCatalogMedia } from '../shared/catalog.ts';
import { libraryTemplates, listTemplates, getTemplate, readTemplate } from '../template-catalog.ts';
import { templatePrompt } from '../shared/integration.ts';
import { pluginRoot } from '../hyperframes.ts';
import { callTool, rpc, mcpRegistry } from '../mcp.ts';
import { WorkspaceStore } from '../workspace.ts';
import { transport } from './http.ts';

test('the complete source snapshot, every original ID and matched poster survive the import', async () => {
  const raw = await readFile(new URL('../web/catalog/hyperframes.json', import.meta.url));
  const snapshot = JSON.parse(raw.toString());
  const provenance = JSON.parse(await readFile(new URL('../web/catalog/provenance.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(raw).digest('hex'), provenance.sha256);
  assert.equal(snapshot.entries.length, 891); assert.equal(provenance.entries, 891);
  const counts = Object.fromEntries(['reference', 'moment', 'block', 'component', 'example'].map(collection => [collection, snapshot.entries.filter(entry => entry.collection === collection).length]));
  assert.deepEqual(counts, { reference: 42, moment: 393, block: 210, component: 238, example: 8 });
  assert.equal(libraryTemplates.length, 894);
  for (const entry of snapshot.entries) {
    const template = getTemplate(entry.id);
    assert.equal(template.title, entry.title); assert.equal(template.sourceUrl, entry.sourceUrl);
    assert.equal(template.previewUrl, entry.videoAvailable === false ? undefined : entry.video);
  }
  const frames = JSON.parse(await readFile(new URL('../web/catalog/template-frames.json', import.meta.url), 'utf8')).frames;
  assert.equal(frames.length, 38);
  for (const frame of frames) {
    assert.equal(frame.video, snapshot.entries.find(entry => entry.id === frame.id).video);
    const bytes = await readFile(new URL('..' + frame.poster, import.meta.url));
    assert.equal(bytes.readUInt16BE(), 0xffd8);
  }
  const noMedia = getTemplate('hf-component-agent-cursor');
  assert.equal(noMedia.previewUrl, undefined); assert.equal(noMedia.posterUrl, undefined);
  assert.match(noMedia.sourceUrl!, /components\/agent-cursor\/registry-item.json$/);
  assert.equal(getTemplate('hf-block-ai-answer-rank').ratio, '1:1');
  assert.throws(() => catalogTemplates([snapshot.entries[0], snapshot.entries[0]]), /身份无效/);
  assert.throws(() => catalogTemplates([{ ...snapshot.entries[0], video: 'https://example.com/other.mp4' }]), /预览地址无效/);
  for (const url of ['https://static.heygen.ai.evil.test/hyperframes/a.mp4', 'http://static.heygen.ai/hyperframes/a.mp4', 'https://user@static.heygen.ai/hyperframes/a.mp4']) assert.equal(isCatalogMedia(url), false);
});

test('pagination and grouped variants expose every template without omitting IDs', () => {
  assert.deepEqual(listTemplates({ limit: 6, grouped: true }).items.map(item => item.id), featuredTemplateIds);
  const ids: string[] = []; let offset: number | null = 0;
  while (offset !== null) {
    const page = listTemplates({ category: 'all', offset, limit: 60 });
    ids.push(...page.items.map(item => item.id)); offset = page.next;
  }
  assert.deepEqual(new Set(ids), new Set(libraryTemplates.map(item => item.id)));
  assert.equal(ids.length, 894);
  const variants = groupTemplates(libraryTemplates).flatMap(item => item.variants || [item]);
  assert.equal(variants.length, 894); assert.equal(new Set(variants.map(item => item.id)).size, 894);
  assert.equal(listTemplates({ category: 'builtin' }).total, 3);
  assert.ok(listTemplates({ category: 'script' }).items.every(item => item.tags.includes('口播') || item.role === 'a-roll'));
  assert.equal(listTemplates({ query: 'hf-component-agent-cursor' }).items[0].id, 'hf-component-agent-cursor');
  assert.equal(listTemplates({ query: '@lovable_dev' }).items[0].id, 'hf-reference-jake-lovable');
  assert.equal(listTemplates({ query: 'not-a-template-xyz' }).total, 0);
  assert.throws(() => listTemplates({ limit: 900 }), /分页参数/);
  assert.throws(() => listTemplates({ offset: -1 }), /分页参数/);
  assert.throws(() => listTemplates({ category: 'unknown' }), /分页参数/);
  assert.throws(() => getTemplate('missing'), /模板不存在/);
});

test('HTTP catalog, local posters and copied guides resolve the exact selected template without changing the workspace', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-catalog-'));
  try {
    const store = new WorkspaceStore(directory), request = transport(store), before = await store.get();
    const page = await (await request('/motion-api/template-catalog?grouped=true&limit=6')).json();
    assert.deepEqual(page.items.map(item => item.id), featuredTemplateIds); assert.equal(page.catalogTotal, 894);
    assert.equal((await request('/motion-api/template-catalog?offset=-1')).status, 400);
    assert.equal((await request('/motion-api/template-catalog?limit=999')).status, 400);
    for (const template of libraryTemplates.filter(item => item.posterUrl?.startsWith('/web/'))) {
      const response = await request(template.posterUrl!);
      assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
      assert.equal(Buffer.from(await response.arrayBuffer()).readUInt16BE(), 0xffd8);
    }
    const info = await (await request('/api/integration')).json();
    for (const id of ['hf-reference-jake-lovable', 'hf-component-agent-cursor', 'product-promo']) {
      const template = getTemplate(id);
      for (const host of ['codex', 'claude', 'deepseek', 'mcp'] as const) {
        const prompt = templatePrompt(info, host, template);
        assert.ok(prompt.includes(id)); assert.ok(prompt.length < 250); assert.equal(prompt.split('\n').length, 1);
        assert.doesNotMatch(prompt, /dataDirectory|motion_write_files|expectedRevision/);
        const guideUrl = prompt.match(/http:\/\/localhost:4173\/connect\/guide\?[^\s]+/)![0];
        const response = await request(guideUrl); assert.equal(response.status, 200);
        const guide = await response.text(); assert.ok(guide.includes(`模板 ID：${id}`));
        assert.ok(guide.includes(template.title));
        const expectedRoute = template.kind === 'reference' ? 'recreate' : 'template';
        assert.ok(guide.includes(`motion://workflow/${expectedRoute}/start`));
        assert.deepEqual(readTemplate(id).workflowGuide, { workflow: expectedRoute, section: 'start', status: 'ready' });
        assert.match(guide, /本次用户明确要求成片或导出/);
        if (template.kind !== 'builtin') {
          assert.match(guide, /motion_edit_project/); assert.doesNotMatch(prompt, /motion_apply_template/);
          assert.ok(guide.includes(template.sourceUrl!));
        } else assert.match(guide, /motion_create_project/);
      }
    }
    assert.equal((await request('/connect/guide?template=missing')).status, 400);
    assert.deepEqual(await store.get(), before);
  } finally { await closeFixtureEditor(directory); await rm(directory, { recursive: true, force: true }); }
});

test('internal legacy compatibility reads the selected reference and uses the native source-writing workflow', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-template-native-'));
  try {
    const store = new WorkspaceStore(directory); await store.initialize(pluginRoot);
    const initial = await store.get(); const templateId = 'hf-reference-jake-lovable';
    const html = initial.project!.html!.replace('<title>', '<title>Selected template · ');
    const requests = [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { id: 2, method: 'tools/list' },
      { id: 3, method: 'tools/call', params: { name: 'motion_list_templates', arguments: { query: templateId } } },
      { id: 4, method: 'tools/call', params: { name: 'motion_get_template', arguments: { templateId } } },
      { id: 5, method: 'tools/call', params: { name: 'motion_write_files', arguments: { expectedRevision: initial.revision, files: [{ path: 'index.html', content: html }] } } },
      { id: 6, method: 'tools/call', params: { name: 'motion_write_files', arguments: { expectedRevision: initial.revision, files: [{ path: 'index.html', content: 'stale' }] } } },
    ];
    const replies = [];
    for (const message of requests) replies.push(await rpc({ jsonrpc: '2.0', ...message }, store, mcpRegistry('legacy')));
    assert.equal(replies[1].result.tools.length, 28);
    assert.equal(replies[2].result.structuredContent.items[0].id, templateId);
    assert.equal(replies[3].result.structuredContent.sourceUrl, getTemplate(templateId).sourceUrl);
    assert.match(replies[3].result.structuredContent.instructions, /motion_edit_project/);
    assert.deepEqual(replies[3].result.structuredContent.workflowGuide, { workflow: 'recreate', section: 'start', status: 'ready' });
    assert.doesNotMatch(replies[3].result.structuredContent.instructions, /motion_import_project|motion.json/);
    assert.notEqual(replies[4].result.structuredContent.revision, initial.revision);
    assert.equal(replies[5].result.isError, true);
    assert.equal((await store.get()).project!.html, html);
    assert.equal(readTemplate('product-promo').workflow, 'motion_apply_template');
    assert.equal(readTemplate(templateId).workflow, 'motion_import_asset + motion_write_files');
    await assert.rejects(callTool('motion_get_template', { templateId: 'missing' }, store), /模板不存在/);
  } finally { await closeFixtureEditor(directory); await rm(directory, { recursive: true, force: true }); }
});

test('the visual gallery only includes verified local covers and keeps coverless IDs available to MCP', async () => {
  const covers = JSON.parse(await readFile(new URL('../web/catalog/covers.json', import.meta.url), 'utf8'));
  assert.ok(covers.entries.length >= 500);
  for (const cover of covers.entries) {
    assert.equal(getTemplate(cover.id).posterUrl, cover.poster);
    const bytes = await readFile(new URL('..' + cover.poster, import.meta.url));
    assert.equal(bytes.readUInt16BE(), 0xffd8); assert.ok(bytes.length > 500);
  }
  const page = listTemplates({ covered: true, limit: 60 });
  assert.equal(page.catalogTotal, 894); assert.equal(page.galleryTotal, covers.entries.length + 3);
  assert.ok(page.items.every(item => item.posterUrl?.startsWith('/')));
  assert.equal(listTemplates({ covered: true, query: 'hf-component-agent-cursor' }).total, 0);
  assert.equal(listTemplates({ query: 'hf-component-agent-cursor' }).total, 1);
  assert.ok(listTemplates({ covered: true, query: 'shapelayer' }).items.some(item => item.sourceUrl === 'https://x.com/shapelayer/status/2070884943199150467'));
});
