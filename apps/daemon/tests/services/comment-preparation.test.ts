import { chmod, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { load } from 'cheerio';
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as projectFiles from '../../src/projects.js';
import { ensureProject, writeProjectFile } from '../../src/projects.js';
import { listProjectFileVersions, readProjectFileVersion, withProjectFileVersionLock } from '../../src/project-file-versions.js';
import { prepareCommentIdentity, prepareStaticCommentSource } from '../../src/services/comment-preparation.js';

const html = '<!doctype html>\r\n<html><head><title>T</title></head><body><h2 data-od-id="tool">A</h2><p>C</p><script>document.body.append("dynamic")</script></body></html>';
async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'comment-prepare-'));
  try { await ensureProject(root, 'p'); await writeProjectFile(root, 'p', 'index.html', Buffer.from(html)); await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const request = { expectedSource: html, editingSettled: true as const };
const stateDivergentRawText = [
  '<noscript><script></noscript>',
  '<script><!-- <script></script><style> --></script>',
];
afterEach(() => vi.restoreAllMocks());
describe('explicit static comment preparation source boundary', () => {
  it.each(stateDivergentRawText)('prepares the actual following p after raw-text state triggers: %s', async (rawText) => fixture(async (root) => {
    const source = `${rawText}<p>A</p>`;
    await writeProjectFile(root, 'p', 'index.html', Buffer.from(source));
    const result = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: source });
    expect(load(result.source)('p').text()).toBe('A');
    expect(load(result.source)('p').attr('data-od-comment-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.source.replace(/ data-od-comment-id="[^"]+"/g, '')).toBe(source);
    const retry = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: result.source });
    expect(retry).toMatchObject({ changed: false, source: result.source, version: { id: result.version.id } });
  }));
  it.each(stateDivergentRawText.flatMap((rawText) => ['html', 'body'].map((tag) => ({ rawText, tag }))))('rejects ignored malformed $tag after $rawText even on unchanged retries', async ({ rawText, tag }) => fixture(async (root) => {
    const source = '<html data-od-comment-id="12345678-1234-4234-8234-123456789abc"><body data-od-comment-id="34567890-1234-4234-8234-123456789abc">'
      + rawText + '<p data-od-comment-id="23456789-1234-4234-8234-123456789abc">A</p>'
      + `<${tag} data-od-comment-id="bad">`;
    await writeProjectFile(root, 'p', 'index.html', Buffer.from(source));
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: source })).rejects.toMatchObject({ code: 'COMMENT_IDENTITY_INVALID' });
      expect(await readFile(path.join(root, 'p/index.html'), 'utf8')).toBe(source);
      expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(0);
    }
  }));
  it.each(stateDivergentRawText)('preserves astral Unicode, CRLF, raw-text literal bytes and later tag offsets: %s', async (rawText) => fixture(async (root) => {
    const decoratedRawText = rawText.replace('</noscript>', '🧭\r\n</noscript>').replace('<style>', '<style>🧭\r\n');
    const source = '😀\r\n' + decoratedRawText + '<p title="🌍" data-od-id="tool">A🧪</p>\n';
    await writeProjectFile(root, 'p', 'index.html', Buffer.from(source));
    const result = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: source });
    expect(Buffer.from(result.source.replace(/ data-od-comment-id="[^"]+"/g, ''))).toEqual(Buffer.from(source));
    expect(await readFile(path.join(root, 'p/index.html'))).toEqual(Buffer.from(result.source));
    const before = load(source); const after = load(result.source);
    expect(after('noscript,script').text()).toBe(before('noscript,script').text());
    expect(after('p').text()).toBe('A🧪');
    expect(after('p').attr('title')).toBe('🌍');
    expect(after('p').attr('data-od-id')).toBe('tool');
    const retry = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: result.source });
    expect(retry).toMatchObject({ changed: false, source: result.source, version: { id: result.version.id } });
  }));
  it.each([
    '<x foo>Visible</x foo>',
    '<p title=a data-od-comment-id=b data-od-comment-id="12345678-1234-4234-8234-123456789abc">A</p>',
  ])('preserves HTML NBSP tag/attribute semantics and persisted idempotent retry: %s', async (source) => fixture(async (root) => {
    // Actual U+00A0 characters above are HTML name/value data, not delimiters.
    await writeProjectFile(root, 'p', 'index.html', Buffer.from(source));
    const before = load(source);
    const result = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: source });
    const after = load(result.source);
    expect(after('body').children().first().prop('tagName')).toBe(before('body').children().first().prop('tagName'));
    expect(after('p').attr('title')).toBe(before('p').attr('title'));
    expect(result.source.replace(/ data-od-comment-id="[^"]+"/g, '')).toBe(source.replace(/ data-od-comment-id="[^"]+"/g, ''));
    const retry = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: result.source });
    expect(retry).toMatchObject({ changed: false, source: result.source, version: { id: result.version.id } });
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(1);
  }));
  it.each([
    '<body><p>A</p><body data-od-comment-id="12345678-1234-4234-8234-123456789abc" data-od-comment-id="bad">',
    '<html data-od-comment-id="12345678-1234-4234-8234-123456789abc"><body><p>A</p></body><html data-od-comment-id="bad">',
    '<html data-od-comment-id="12345678-1234-4234-8234-123456789abc"><body><p data-od-comment-id="23456789-1234-4234-8234-123456789abc">A</p></body><html data-od-comment-id="bad">',
  ])('rejects merged/ignored authored identity tokens before save, including no-change retries: %s', async (source) => fixture(async (root) => {
    await writeProjectFile(root, 'p', 'index.html', Buffer.from(source));
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: source })).rejects.toMatchObject({ code: 'COMMENT_IDENTITY_INVALID' });
      expect(await readFile(path.join(root, 'p/index.html'), 'utf8')).toBe(source);
      expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(0);
    }
  }));
  it.each([
    '<script>const markup = \'<body data-od-comment-id="bad" data-od-comment-id="bad">\';</script><p>A</p>',
    '<style>.x::before { content: \'<html data-od-comment-id="bad">\'; }</style><p>A</p>',
    '<!-- <body data-od-comment-id="bad"> --><p title=\'<html data-od-comment-id="bad">\'>A</p>',
    '<script><!-- <script></script><body data-od-comment-id="bad"> --></script><p>A</p>',
    '<textarea><html data-od-comment-id="bad"></textarea><p>A</p>',
  ])('never treats raw text, comments or quoted values as authored start tags: %s', (source) => {
    const prepared = prepareStaticCommentSource(source).source;
    expect(prepared.replace(/ data-od-comment-id="(?!bad")[^"]+"/g, '')).toBe(source);
    const before = load(source); const after = load(prepared);
    for (const tag of ['script', 'style', 'textarea']) expect(after(tag).text()).toBe(before(tag).text());
    expect(after('p').attr('title')).toBe(before('p').attr('title'));
    expect(prepareStaticCommentSource(prepared).source).toBe(prepared);
  });
  it('preserves unquoted slash values, quoted greater-than signs and SVG markup semantics', () => {
    const source = '<img src=a/><input value="a>b"/><svg viewBox="0 0 10 10"><path d="M0 0"/></svg>';
    const prepared = prepareStaticCommentSource(source).source;
    expect(prepared.replace(/ data-od-comment-id="[^"]+"/g, '')).toBe(source);
    const before = load(source); const after = load(prepared);
    expect(after('img').attr('src')).toBe(before('img').attr('src'));
    expect(after('input').attr('value')).toBe('a>b');
    expect(after('svg').attr('viewBox')).toBe(before('svg').attr('viewBox'));
  });
  it('rejects parser-reconstructed duplicate targets rather than saving falsely ready identities', () => {
    expect(() => prepareStaticCommentSource('<b><p>X</b>Y</p>')).toThrow();
  });
  it('leaves inert script/style/template contents alone and preserves existing tool attributes', () => {
    const source = '<style>.x{color:red}</style><template><p>inactive</p></template><script>const x="<p>dynamic</p>"</script><p data-od-id="tool" data-screen-label="screen" data-od-source-path="0.1">static</p>';
    const prepared = prepareStaticCommentSource(source);
    expect(prepared.preparedTargets).toBe(1);
    expect(prepared.source.replace(/ data-od-comment-id="[^"]+"/g, '')).toBe(source);
    expect(prepared.source).toContain('<template><p>inactive</p></template>');
  });
  it('preserves all bytes except identity insertions, covers anonymous targets, records readable version, and retries without a new version', async () => fixture(async (root) => {
    const result = await prepareCommentIdentity(root, 'p', 'index.html', request);
    expect(result.changed).toBe(true);
    expect(result.source.replace(/ data-od-comment-id="[^"]+"/g, '')).toBe(html);
    expect(result.preparedTargets).toBe(2); // h2, p; not document roots/head/script
    expect((await readProjectFileVersion(root, 'p', 'index.html', result.version.id)).content).toBe(result.source);
    const again = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: result.source });
    expect(again).toMatchObject({ changed: false, source: result.source, version: { id: result.version.id } });
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(1);
  }));
  it('rejects stale expectations, unsettled editing, and invalid/duplicate identity without a write', async () => fixture(async (root) => {
    await expect(prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: 'stale' })).rejects.toMatchObject({ code: 'COMMENT_SOURCE_CONFLICT' });
    await expect(prepareCommentIdentity(root, 'p', 'index.html', { ...request, editingSettled: false as never })).rejects.toMatchObject({ code: 'COMMENT_EDITING_UNSETTLED' });
    expect(await readFile(path.join(root, 'p/index.html'), 'utf8')).toBe(html);
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(0);
    const id = '12345678-1234-4234-8234-123456789abc';
    for (const source of [`<p data-od-comment-id="bad">A</p>`, `<p data-od-comment-id="${id}">A</p><p data-od-comment-id="${id}">B</p>`, `<p data-od-comment-id="${id}" data-od-comment-id="${id}">A</p>`]) {
      expect(() => prepareStaticCommentSource(source)).toThrow();
      await writeProjectFile(root, 'p', 'index.html', Buffer.from(source));
      await expect(prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: source })).rejects.toMatchObject({ code: 'COMMENT_IDENTITY_INVALID' });
      expect(await readFile(path.join(root, 'p/index.html'), 'utf8')).toBe(source);
      expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(0);
    }
  }));
  it('save failure returns no success and preserves source, then explicit retry succeeds', async () => fixture(async (root) => {
    const file = path.join(root, 'p/index.html');
    await chmod(file, 0o400);
    try { await expect(prepareCommentIdentity(root, 'p', 'index.html', request)).rejects.toMatchObject({ code: 'EACCES' }); }
    finally { await chmod(file, 0o600); }
    expect(await readFile(file, 'utf8')).toBe(html);
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(0);
    expect((await prepareCommentIdentity(root, 'p', 'index.html', request)).changed).toBe(true);
  }));
  it('observes an external overwrite after the actual source save and refuses success without rollback', async () => fixture(async (root) => {
    const realSave = projectFiles.writeProjectFile;
    // Deterministic interposition, not simulated source: execute the real save then
    // an OS writer before its metadata returns to preparation's readback.
    vi.spyOn(projectFiles, 'writeProjectFile').mockImplementationOnce(async (...args) => {
      const result = await realSave(...args);
      await writeFile(path.join(root, 'p/index.html'), '<p>external later edit</p>');
      return result;
    });
    await expect(prepareCommentIdentity(root, 'p', 'index.html', request)).rejects.toMatchObject({ code: 'COMMENT_SOURCE_CONFLICT' });
    expect(await readFile(path.join(root, 'p/index.html'), 'utf8')).toBe('<p>external later edit</p>');
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(0);
  }));
  it('version failure is not success and does not rollback saved identities or later edits', async () => fixture(async (root) => {
    const store = path.join(root, 'p/.file-versions');
    await writeFile(store, 'filesystem obstruction');
    await expect(prepareCommentIdentity(root, 'p', 'index.html', request)).rejects.toThrow();
    const saved = await readFile(path.join(root, 'p/index.html'), 'utf8');
    expect(saved).toContain('data-od-comment-id');
    const later = saved.replace('>A<', '>later edit<');
    await writeProjectFile(root, 'p', 'index.html', Buffer.from(later));
    await rm(store);
    const retry = await prepareCommentIdentity(root, 'p', 'index.html', { ...request, expectedSource: later });
    expect(retry).toMatchObject({ changed: false, source: later });
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(1);
  }));
  it('two prepares serialize and the stale second does not overwrite the first', async () => fixture(async (root) => {
    const outcomes = await Promise.allSettled([prepareCommentIdentity(root, 'p', 'index.html', request), prepareCommentIdentity(root, 'p', 'index.html', request)]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await listProjectFileVersions(root, 'p', 'index.html')).toHaveLength(1);
  }));
  it.each(['controlled', 'external'])('rejects an observed %s writer while waiting for the file lock', async (writer) => fixture(async (root) => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const ready = new Promise<void>((r) => { entered = r; });
    const save = withProjectFileVersionLock(root, 'p', 'index.html', undefined, async () => {
      entered(); await gate;
      if (writer === 'controlled') await writeProjectFile(root, 'p', 'index.html', Buffer.from('<p>newer external content</p>'));
      else await writeFile(path.join(root, 'p/index.html'), '<p>newer external content</p>');
    });
    await ready;
    const preparation = prepareCommentIdentity(root, 'p', 'index.html', request);
    release(); await save;
    await expect(preparation).rejects.toMatchObject({ code: 'COMMENT_SOURCE_CONFLICT' });
    expect(await readFile(path.join(root, 'p/index.html'), 'utf8')).toBe('<p>newer external content</p>');
  }));
});
