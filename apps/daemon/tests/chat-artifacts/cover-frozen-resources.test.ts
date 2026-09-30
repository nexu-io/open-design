import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDesktopSidecarMessage, SIDECAR_MESSAGES } from '@open-design/sidecar-proto';
import { closeDatabase, openDatabase, upsertMessage } from '../../src/db.js';
import { createChatArtifactBlobStore, resetChatArtifactBlobStoreCache } from '../../src/chat-artifacts/blob-store.js';
import { ensureWorkspaceArtifactForPath, replaceMessageArtifacts } from '../../src/chat-artifacts/store.js';
import { freezeAndRenderChatArtifactCovers, type ChatArtifactCoverRenderer } from '../../src/chat-artifacts/cover.js';

// Execute only this test-owned document to observe its actual DOM resource requests.
// This is not an Electron renderer, image decoder, or stored-thumbnail acceptance.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const PNG_A = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAd0lEQVR4nO3QIQEAIAwAMEKg0cQhLA2o8RpoiHHxiRVYizFfpr5XqiZAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQUCBgrXqZ7eioBAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECCgQMAHJAEyLL94r0cAAAAASUVORK5CYII=", 'base64');
const PNG_B = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAmUlEQVR4nO3QMREAIBDAsFeCfwGIwBXIyECH7L3OXuf+bHSA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AFaA3SA1gAdoDVAB2gN0AHaAygMkmj+tn2tAAAAAElFTkSuQmCC", 'base64');
// Structural reconstruction: the SVG markup is from the diagnostic tool output;
// the full filter/input script is unchanged from the qualified browser fixture.
const FILTER_SVG_HTML = "<!doctype html><html><head><meta charset=\"utf-8\"><title>2809 image decode fixture</title><style>html,body{margin:0;background:#fff}body{padding:32px}img{display:block;width:128px;height:128px;image-rendering:pixelated}span{display:block;font:16px monospace;color:#111}textarea{width:600px;height:150px}.search-icon{width:24px;height:24px;fill:none;stroke:#111;stroke-width:2;vertical-align:middle}</style></head><body><svg class=\"search-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m16 16 4 4\"/></svg><input id=\"pokemonSearch\" aria-label=\"Filter Preview\"><div id=\"cards\"></div><script>const searchInput = document.querySelector(\"#pokemonSearch\");\nconst cards = [{image:\"assets/a.png\", name:\"Preview\"}];\nfunction applyFilters() {\n  const query = searchInput.value.trim().toLowerCase();\n  const filtered = cards.filter(item => item.name.toLowerCase().includes(query));\n  document.getElementById(\"cards\").innerHTML = filtered.map(item => `<img src=\"${item.image}\" alt=\"${item.name}\"><span>${item.image}</span>`).join(\"\");\n}\nsearchInput.addEventListener(\"input\", applyFilters);\napplyFilters();</script></body></html>";

describe('Chat cover input freezes dynamic image resources', () => {
  let root: string;
  let projectRoot: string;
  let deps: { db: ReturnType<typeof openDatabase>; blobs: ReturnType<typeof createChatArtifactBlobStore> };
  let rows: ReturnType<typeof replaceMessageArtifacts>;
  const releaseRenderers: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opend2809-cover-resources-'));
    projectRoot = path.join(root, 'project');
    fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
    resetChatArtifactBlobStoreCache();
    const dataDir = path.join(root, 'data');
    const db = openDatabase(root, { dataDir });
    db.prepare('INSERT INTO projects (id,name,created_at,updated_at) VALUES (?,?,?,?)').run('p', 'P', 1, 1);
    db.prepare('INSERT INTO conversations (id,project_id,created_at,updated_at) VALUES (?,?,?,?)').run('c', 'p', 1, 1);
    upsertMessage(db, 'c', { id: 'm', role: 'assistant', content: 'Delivered index.html', runId: 'original-run', runStatus: 'succeeded' });
    const artifact = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'index.html', kind: 'html', mime: 'text/html' });
    rows = replaceMessageArtifacts(db, 'm', [{ workspaceArtifactId: artifact.id, label: 'index.html', kind: 'html', displayPolicy: 'latest_with_static_preview' }]);
    deps = { db, blobs: createChatArtifactBlobStore({ dataDir }) };
    fs.writeFileSync(path.join(projectRoot, 'index.html'), FILTER_SVG_HTML);
    fs.writeFileSync(path.join(projectRoot, 'assets/a.png'), PNG_A);
  });

  afterEach(async () => {
    for (const release of releaseRenderers.splice(0)) release();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
    closeDatabase();
    resetChatArtifactBlobStoreCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function captureInput(supportsResources?: boolean) {
    const renderer = vi.fn<ChatArtifactCoverRenderer>(() => new Promise((resolve) => {
      // Do not fake successful rendering or bind a manufactured thumbnail.
      releaseRenderers.push(() => resolve({ ok: false, error: 'test observer finished without rendering' }));
    }));
    if (supportsResources !== undefined) Object.assign(renderer, { supportsFrozenResources: async () => supportsResources });
    const report = await freezeAndRenderChatArtifactCovers(deps, { projectRoot, rows, renderer });
    expect(report).toEqual({ frozen: 1, skipped: 0, failed: 0 });
    expect(renderer).toHaveBeenCalledOnce();
    return renderer.mock.calls[0]![0];
  }

  it('carries the original PNG after filter/input/SVG rendering, even if the project changes before screenshot', async () => {
    const input = await captureInput(true);
    expect(input.captureMode).toBe('first_viewport_thumbnail');
    expect(input.baseHref).toBeUndefined();
    expect(input.html.match(/<script>([\s\S]*?)<\/script>/)?.[1])
      .toBe(FILTER_SVG_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1]);
    const dom = new JSDOM(input.html, { runScripts: 'dangerously', url: 'https://cover-input.invalid/index.html' });
    try {
      const document = dom.window.document;
      const image = () => document.querySelector('#cards img');
      const search = document.querySelector('#pokemonSearch');
      expect(image()?.getAttribute('src')).toBe('assets/a.png');
      expect(image()?.src).toBe('https://cover-input.invalid/assets/a.png');
      expect(document.querySelector('#cards span')?.textContent).toBe('assets/a.png');
      expect(document.querySelector('.search-icon')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(document.querySelectorAll('.search-icon circle')).toHaveLength(1);
      expect(document.querySelectorAll('.search-icon path')).toHaveLength(1);
      search.value = 'no-match-2809';
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      expect(image()).toBeNull();
      search.value = '';
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      expect(image()?.getAttribute('src')).toBe('assets/a.png');
      expect(document.querySelector('#cards span')?.textContent).toBe('assets/a.png');
    } finally {
      dom.window.close();
    }

    const beforeProjectChange = JSON.stringify(input);
    fs.writeFileSync(path.join(projectRoot, 'assets/a.png'), PNG_B);
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><p>Next turn</p>');
    const handoff = normalizeDesktopSidecarMessage({ type: SIDECAR_MESSAGES.EXPORT_ARTIFACT, input });
    if (handoff.type !== SIDECAR_MESSAGES.EXPORT_ARTIFACT) throw new Error('wrong normalized message');
    const afterProjectChange = JSON.stringify(handoff.input);
    expect(handoff.input).toEqual(input);
    expect(JSON.stringify(input)).toBe(beforeProjectChange);
    expect(afterProjectChange).not.toContain(projectRoot);
    expect(afterProjectChange).not.toContain(PNG_B.toString('base64'));
    // This producer handoff is destined for JSON sidecar IPC: it has no live FS
    // reader. With the relative request above, omitting these original bytes
    // makes this turn's image impossible to load after A is replaced by B.
    // The actual sidecar normalizer must preserve these bytes too. This
    // necessary assertion does not claim the desktop loader works;
    // that requires its own real consumer/browser validation.
    expect(afterProjectChange, 'the actual cover handoff must contain this turn PNG bytes, not only assets/a.png')
      .toContain(PNG_A.toString('base64'));
  });

  it('keeps the existing static cover handoff self-contained after the source image changes', async () => {
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><img src="assets/a.png"><span>assets/a.png</span>');
    const input = await captureInput();
    fs.writeFileSync(path.join(projectRoot, 'assets/a.png'), PNG_B);
    const dom = new JSDOM(input.html);
    try {
      const source = dom.window.document.querySelector('img')?.getAttribute('src');
      expect(source).toMatch(/^data:image\/png;base64,/);
      expect(Buffer.from(source!.split(',', 2)[1]!, 'base64')).toEqual(PNG_A);
      expect(dom.window.document.querySelector('span')?.textContent).toBe('assets/a.png');
      expect(input.baseHref).toBeUndefined();
    } finally {
      dom.window.close();
    }
  });

  it('does not sacrifice a small static cover for an unrelated image beyond the resource budget', async () => {
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><img src="assets/a.png"><span>assets/a.png</span>');
    // A sparse file keeps this capacity guard cheap. Its valid PNG prefix and
    // .png name make it an image candidate, but this page never references it.
    const unrelated = path.join(projectRoot, 'assets/unrelated-large.png');
    fs.writeFileSync(unrelated, PNG_A);
    fs.truncateSync(unrelated, 53 * 1024 * 1024);
    const input = await captureInput(true);
    const dom = new JSDOM(input.html);
    try {
      const source = dom.window.document.querySelector('img')?.getAttribute('src');
      expect(source).toMatch(/^data:image\/png;base64,/);
      expect(Buffer.from(source!.split(',', 2)[1]!, 'base64')).toEqual(PNG_A);
      expect(JSON.stringify(input)).not.toContain('unrelated-large.png');
      expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(16 * 1024);
    } finally {
      dom.window.close();
    }
  });


  it('does not expand the dynamic image pool to credentials, arbitrary data, source code, or symlink targets', async () => {
    const secret = 'NEVER_FREEZE_THIS_PRIVATE_CONFIG';
    fs.writeFileSync(path.join(projectRoot, '.env'), secret);
    fs.writeFileSync(path.join(projectRoot, 'private.json'), secret);
    fs.writeFileSync(path.join(projectRoot, 'private.js'), secret);
    fs.writeFileSync(path.join(projectRoot, 'private.txt'), secret);
    fs.writeFileSync(path.join(root, 'outside.png'), PNG_B);
    fs.symlinkSync(path.join(root, 'outside.png'), path.join(projectRoot, 'assets/linked.png'));
    const input = await captureInput(true);
    expect(input.frozenResources?.resources.map((item) => item.path)).toEqual(['assets/a.png']);
    expect(JSON.stringify(input)).not.toContain(Buffer.from(secret).toString('base64'));
    expect(JSON.stringify(input)).not.toContain(PNG_B.toString('base64'));
  });

  it('freezes a valid image that becomes visible only after a later filter input', async () => {
    const html = FILTER_SVG_HTML
      .replace('<input id="pokemonSearch"', '<input value="Preview" id="pokemonSearch"')
      .replace('const cards = [{image:"assets/a.png", name:"Preview"}];', 'const cards = [{image:"assets/a.png", name:"Preview"}, {image:"assets/b.png", name:"Other"}];');
    fs.writeFileSync(path.join(projectRoot, 'index.html'), html);
    fs.writeFileSync(path.join(projectRoot, 'assets/b.png'), PNG_B);
    const input = await captureInput(true);
    fs.unlinkSync(path.join(projectRoot, 'assets/b.png'));
    const dom = new JSDOM(input.html, { runScripts: 'dangerously', url: 'https://cover-input.invalid/index.html' });
    try {
      const document = dom.window.document;
      expect(document.querySelectorAll('#cards img')).toHaveLength(1);
      expect(document.querySelector('#cards img')?.getAttribute('src')).toBe('assets/a.png');
      const search = document.querySelector('#pokemonSearch');
      search.value = 'Other';
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      expect(document.querySelectorAll('#cards img')).toHaveLength(1);
      expect(document.querySelector('#cards img')?.getAttribute('src')).toBe('assets/b.png');
      const resource = input.frozenResources?.resources.find((item) => item.path === 'assets/b.png');
      expect(Buffer.from(resource?.bytesBase64 ?? '', 'base64')).toEqual(PNG_B);
    } finally { dom.window.close(); }
  });


  it('keeps both independently valid static covers when the optional image pool consumes the shared budget', async () => {
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><p>First static cover</p>');
    const prefix = '<!doctype html><p>';
    const suffix = '</p>';
    fs.writeFileSync(path.join(projectRoot, 'second.html'), prefix + 'x'.repeat(2 * 1024 * 1024 - prefix.length - suffix.length) + suffix);
    // Sparse storage: legacy cover generation never needs to load this image.
    // The optional pool may encounter it, but cannot starve the second entry.
    const unrelated = path.join(projectRoot, 'assets/large-unrelated.png');
    fs.writeFileSync(unrelated, PNG_A);
    fs.truncateSync(unrelated, 50 * 1024 * 1024);
    const second = ensureWorkspaceArtifactForPath(deps.db, { projectId: 'p', path: 'second.html', kind: 'html', mime: 'text/html' });
    const twoRows = replaceMessageArtifacts(deps.db, 'm', [
      { workspaceArtifactId: rows[0]!.workspaceArtifactId!, label: 'index.html', kind: 'html', displayPolicy: 'latest_with_static_preview' },
      { workspaceArtifactId: second.id, label: 'second.html', kind: 'html', displayPolicy: 'latest_with_static_preview' },
    ]);
    const renderer = Object.assign(vi.fn<ChatArtifactCoverRenderer>().mockResolvedValue({ ok: false, error: 'input observer only' }), {
      supportsFrozenResources: async () => true,
    });
    const report = await freezeAndRenderChatArtifactCovers(deps, { projectRoot, rows: twoRows, renderer });
    expect(report).toEqual({ frozen: 2, skipped: 0, failed: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(renderer.mock.calls.map(([input]) => input.title)).toEqual(['index.html', 'second.html']);
  });


  it('preserves a legacy cover whose explicit image lives in a directory excluded from the optional pool', async () => {
    fs.mkdirSync(path.join(projectRoot, '.hidden'));
    fs.writeFileSync(path.join(projectRoot, '.hidden/cover.png'), PNG_A);
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><img src=".hidden/cover.png">');
    const input = await captureInput(true);
    const dom = new JSDOM(input.html);
    try {
      const source = dom.window.document.querySelector('img')?.getAttribute('src');
      expect(source).toMatch(/^data:image\/png;base64,/);
      expect(Buffer.from(source!.split(',', 2)[1]!, 'base64')).toEqual(PNG_A);
      expect(input.frozenResources).toBeUndefined();
    } finally { dom.window.close(); }
  });

  it.each([
    { capability: 'legacy renderer', supportsResources: undefined },
    { capability: 'resource-capable renderer', supportsResources: true },
  ])('preserves an explicit project-internal image symlink with $capability', async ({ supportsResources }) => {
    fs.symlinkSync('a.png', path.join(projectRoot, 'assets/alias.png'));
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><img src="assets/alias.png"><span>assets/alias.png</span>');
    const input = await captureInput(supportsResources);
    fs.writeFileSync(path.join(projectRoot, 'assets/a.png'), PNG_B);
    const dom = new JSDOM(input.html);
    try {
      const source = dom.window.document.querySelector('img')?.getAttribute('src');
      expect(source).toMatch(/^data:image\/png;base64,/);
      expect(Buffer.from(source!.split(',', 2)[1]!, 'base64')).toEqual(PNG_A);
      expect(dom.window.document.querySelector('span')?.textContent).toBe('assets/alias.png');
      // A safe explicit legacy dependency need not expand the dynamic pool's
      // visibility policy: freeze its existing inline path before terminal.
      expect(input.frozenResources).toBeUndefined();
      expect(input.baseHref).toBeUndefined();
    } finally { dom.window.close(); }
  });

  it('does not fall back through an explicit symlink that escapes the project in resource-capable mode', async () => {
    fs.writeFileSync(path.join(root, 'outside.png'), PNG_B);
    fs.symlinkSync(path.join(root, 'outside.png'), path.join(projectRoot, 'assets/alias.png'));
    fs.writeFileSync(path.join(projectRoot, 'index.html'), '<!doctype html><img src="assets/alias.png">');
    const renderer = Object.assign(vi.fn<ChatArtifactCoverRenderer>().mockResolvedValue({ ok: false, error: 'must not render outside bytes' }), {
      supportsFrozenResources: async () => true,
    });
    const report = await freezeAndRenderChatArtifactCovers(deps, { projectRoot, rows, renderer });
    expect(report).toEqual({ frozen: 0, skipped: 0, failed: 1 });
    expect(renderer).not.toHaveBeenCalled();
  });

});
