import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { catalogTemplates, formatTemplateViews, socialPlatform, templateCategoryLabel } from '../shared/catalog.ts';
import type { CatalogEntry } from '../shared/catalog.ts';
import { enrichTemplate, momentsMetadataUrl, normalizeTemplateMetadata } from '../shared/template-metadata.ts';
import { getTemplate, listTemplates } from '../template-catalog.ts';
import { callTool } from '../mcp.ts';
import { WorkspaceStore } from '../workspace.ts';
import { transport } from './http.ts';

const syncedAt = '2026-11-03T12:00:00.000Z';
const reference = (id: string, sourceUrl: string): CatalogEntry => ({ id: 'hf-moment-' + id, collection: 'moment', title: id, description: '', tags: [], author: '@creator', sourceUrl, video: new URL(id + '/clip.mp4', momentsMetadataUrl).href });
const original = reference('M953', 'https://x.com/shapelayer/status/2070884943199150467');
const source = { id: 'M953', clip: 'M953/clip.mp4', x_url: original.sourceUrl, x_author_name: 'Leon Fucak', x_views: 41513, role: 'hook', mechanic: ['stagger', 'typewriter'] };

test('social statistics bind to the exact template video and original post, never just an author', () => {
  const snapshot = normalizeTemplateMetadata([original], [source], syncedAt);
  assert.equal(snapshot.entries[0].views, 41513); assert.equal(snapshot.entries[0].platform, 'X');
  assert.equal(snapshot.entries[0].authorName, 'Leon Fucak'); assert.equal(snapshot.entries[0].role, 'hook');
  assert.deepEqual(snapshot.entries[0].mechanics, ['stagger', 'typewriter']);
  for (const clip of ['M999/clip.mp4', 'https://example.com/video.mp4', 'https://static.heygen.ai.evil.test/hyperframes-oss/clip.mp4']) {
    assert.equal(normalizeTemplateMetadata([original], [{ ...source, clip }], syncedAt).entries.length, 0);
  }
  const otherPost = normalizeTemplateMetadata([original], [{ ...source, x_url: 'https://x.com/shapelayer/status/99' }], syncedAt).entries[0];
  assert.equal(otherPost.views, undefined); assert.equal(otherPost.authorName, undefined);
  const template = catalogTemplates([original])[0];
  assert.equal(enrichTemplate(template, 'different-video.mp4', snapshot.entries[0], snapshot).social, undefined);
  assert.equal(enrichTemplate(template, original.video, snapshot.entries[0], snapshot).social!.views, 41513);
  assert.throws(() => normalizeTemplateMetadata([original], [source, source], syncedAt), /重复/);
});

test('cross-platform counts preserve real zeroes and omit missing or invalid values', () => {
  const posts = ['https://x.com/user/status/1', 'https://www.instagram.com/reel/abc/', 'https://www.youtube.com/watch?v=abc', 'https://www.tiktok.com/@user/video/123'];
  for (const [index, url] of posts.entries()) {
    const entry = reference('M' + index, url);
    const metadata = normalizeTemplateMetadata([entry], [{ id: 'M' + index, clip: 'M' + index + '/clip.mp4', source_url: url, x_views: 0 }], syncedAt).entries[0];
    assert.equal(metadata.platform, ['X', 'Instagram', 'YouTube', 'TikTok'][index]); assert.equal(metadata.views, 0);
  }
  for (const x_views of [undefined, null, '42K', -1, NaN, Infinity, 4.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(normalizeTemplateMetadata([original], [{ ...source, x_views }], syncedAt).entries[0].views, undefined);
  }
  for (const url of ['https://instagram.com.evil.test/reel/abc', 'http://x.com/user/status/1', 'https://user@x.com/user/status/1']) assert.equal(socialPlatform(url), undefined);
  assert.equal(normalizeTemplateMetadata([original], [{ ...source, x_url: 'https://twitter.com/shapelayer/status/2070884943199150467' }], syncedAt).entries[0].views, 41513);
});

test('card labels match compact Hyperframes counts and expose content categories', () => {
  assert.deepEqual([355162, 41513, 460300, 33801, 5813, 0].map(formatTemplateViews), ['355K', '42K', '460K', '34K', '5.8K', '0']);
  assert.equal(formatTemplateViews(-1), '');
  assert.equal(templateCategoryLabel(getTemplate('hf-moment-M953')), '开场');
  assert.equal(templateCategoryLabel(getTemplate('hf-moment-M945')), '产品展示');
  assert.equal(templateCategoryLabel(getTemplate('hf-reference-aroll-careerwithriya')), 'A-roll Cuts');
  assert.equal(templateCategoryLabel(getTemplate('hf-component-agent-cursor')), '动效组件');
});

test('the shipped snapshot and grouped variants retain per-post counts and provenance without adding them', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../web/catalog/metadata.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.source.url, momentsMetadataUrl); assert.match(snapshot.source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(snapshot.entries.length >= 380);
  for (const entry of snapshot.entries) {
    const template = getTemplate(entry.id);
    if (entry.views !== undefined) {
      assert.equal(template.social!.views, entry.views); assert.equal(template.social!.sourceUrl, template.sourceUrl);
      assert.equal(template.social!.syncedAt, snapshot.syncedAt);
    }
  }
  const group = listTemplates({ query: 'Leon Fucak', grouped: true, limit: 60 }).items.find(item => item.id === 'hf-moment-M953')!;
  const expected = snapshot.entries.find(entry => entry.id === group.id).views;
  assert.equal(group.social!.views, expected); assert.ok(group.variants!.length > 1);
  assert.ok(group.variants!.every(item => item.social!.views === expected));
  assert.equal(getTemplate('hf-reference-jake-figma-draw').social, undefined);
  assert.ok(listTemplates({ query: 'A-roll Cuts', limit: 60 }).items.every(item => templateCategoryLabel(item) === 'A-roll Cuts'));
  assert.ok(listTemplates({ query: 'Instagram', limit: 60 }).items.some(item => item.id === 'hf-reference-aroll-careerwithriya' && !item.social));
});

test('HTTP and MCP expose the same source statistics for the selected ID', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'motion-template-metadata-'));
  try {
    const store = new WorkspaceStore(directory), request = transport(store);
    const snapshot = JSON.parse(await readFile(new URL('../web/catalog/metadata.json', import.meta.url), 'utf8'));
    const page = await (await request('/motion-api/template-catalog?query=hf-moment-M953')).json();
    const detail = await callTool('motion_get_template', { templateId: 'hf-moment-M953' }, store) as ReturnType<typeof getTemplate>;
    assert.equal(page.items[0].social.views, snapshot.entries.find(entry => entry.id === 'hf-moment-M953').views); assert.deepEqual(page.items[0].social, detail.social);
    assert.equal(detail.authorName, 'Leon Fucak'); assert.equal(detail.role, 'hook');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
