import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createShareFileMapping, publishedPathForSource, sourcePathForPublished } from '../src/collab/share-file-mapping.js';
import { buildDeployFilePlan, buildDeployFileSet, DeployError, prepareDeployPreflight } from '../src/deploy.js';

// Referenced HTML documents (iframes, frames) are walked exactly like the
// entry: their own references resolve against their own directory, at any
// depth. Termination is guaranteed by deduping on each file's real path, so
// in-project symlink loops cannot recurse forever.

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-share-nested-html-'));
  roots.push(root);
  const dir = path.join(root, 'p1');
  await mkdir(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), body);
  }
  return { root, dir };
}

const SHARE = { hookScriptUrl: '', assetUrlPolicy: 'share-relative' as const };
const DEPLOY = { hookScriptUrl: '' };

function contentsOf(plan: { files: { file: string; data: unknown }[] }) {
  return new Map(plan.files.map((f) => [f.file, Buffer.from(f.data as Buffer).toString('utf8')]));
}

const NESTED = {
  'pages/entry.html': '<!doctype html><iframe src="sub/child.html"></iframe>',
  'pages/sub/child.html': [
    '<link rel="stylesheet" href="child.css">',
    '<img src="pic.png">',
    '<img src="/images/root.png?v=1#h">',
    '<img src="https://other.test/x.png"><img src="data:image/png;base64,AAA">',
    '<iframe src="grand.html"></iframe>',
  ].join('\n'),
  'pages/sub/child.css': '.a{background:url(bg.png)}',
  'pages/sub/bg.png': 'bg',
  'pages/sub/pic.png': 'pic',
  'pages/sub/grand.html': '<img src="g.png">',
  'pages/sub/g.png': 'g',
  'images/root.png': 'root',
};

describe('nested HTML walk', () => {
  it('walks iframe-referenced HTML relative to its own directory, at any depth', async () => {
    const { root } = await project(NESTED);
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', SHARE);
    const files = plan.files.map((f) => f.file).sort();
    expect(files).toEqual([
      'images/root.png',
      'index.html',
      'pages/sub/bg.png',
      'pages/sub/child.css',
      'pages/sub/child.html',
      'pages/sub/g.png',
      'pages/sub/grand.html',
      'pages/sub/pic.png',
    ]);
    expect(plan.missing).toEqual([]);
    expect(plan.invalid).toEqual([]);
  });

  it('rewrites root-absolute refs inside nested HTML in share mode', async () => {
    const { root } = await project(NESTED);
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', SHARE);
    const child = contentsOf(plan).get('pages/sub/child.html')!;
    expect(child).toContain('src="../../images/root.png?v=1#h"');
    expect(child).toContain('href="child.css"');
    expect(child).toContain('src="pic.png"');
    expect(child).toContain('src="grand.html"');
    expect(child).toContain('src="https://other.test/x.png"');
    expect(child).toContain('src="data:image/png;base64,AAA"');
  });

  it('keeps nested HTML bytes unchanged for standalone deploy but still uploads its assets', async () => {
    const { root } = await project(NESTED);
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', DEPLOY);
    const contents = contentsOf(plan);
    expect(contents.get('pages/sub/child.html')).toBe(NESTED['pages/sub/child.html']);
    expect(contents.get('images/root.png')).toBe('root');
    expect(contents.get('pages/sub/g.png')).toBe('g');
  });

  it('maps nested HTML files to themselves and the entry to index.html', async () => {
    const { root } = await project(NESTED);
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', SHARE);
    const mapping = createShareFileMapping(plan.files);
    expect(publishedPathForSource(mapping, 'pages/entry.html')).toBe('index.html');
    expect(sourcePathForPublished(mapping, 'pages/sub/child.html')).toBe('pages/sub/child.html');
    expect(sourcePathForPublished(mapping, 'pages/sub/grand.html')).toBe('pages/sub/grand.html');
  });

  it('reports missing and invalid references from nested HTML', async () => {
    const { root } = await project({
      'pages/entry.html': '<iframe src="sub/child.html"></iframe>',
      'pages/sub/child.html': '<img src="nope.png"><img src="/../../escape.png">',
    });
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', SHARE);
    expect(plan.missing).toEqual(['pages/sub/nope.png']);
    expect(plan.invalid).toEqual(['/../../escape.png']);
  });

  it('terminates on HTML cycles, self references, entry back-references and deep chains', async () => {
    const chain: Record<string, string> = {};
    let dir = 'deep';
    for (let i = 0; i < 10; i += 1) {
      chain[`${dir}/level.html`] = i < 9 ? `<iframe src="next/level.html"></iframe><img src="p${i}.png">` : '<img src="last.png">';
      chain[`${dir}/p${i}.png`] = 'p';
      dir = `${dir}/next`;
    }
    chain[`${dir.replace(/\/next$/, '')}/last.png`] = 'last';
    const { root } = await project({
      'entry.html': '<iframe src="a.html"></iframe><iframe src="deep/level.html"></iframe>',
      'a.html': '<iframe src="b.html"></iframe><iframe src="a.html"></iframe>',
      'b.html': '<iframe src="a.html"></iframe><iframe src="entry.html"></iframe>',
      ...chain,
    });
    const plan = await buildDeployFilePlan(root, 'p1', 'entry.html', SHARE);
    const names = plan.files.map((f) => f.file);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('a.html');
    expect(names).toContain('b.html');
    expect(names).not.toContain('entry.html');
    expect(names).toContain(`deep${'/next'.repeat(9)}/level.html`);
    expect(names.filter((n) => n.endsWith('.png'))).toHaveLength(10);
    expect(plan.missing).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('terminates on a symlinked directory loop (CSS and HTML)', { timeout: 5_000 }, async () => {
    const { root, dir } = await project({
      'entry.html': '<link rel="stylesheet" href="a.css"><iframe src="x/a.html"></iframe>',
      'a.css': '@import "x/a.css";',
      'a.html': '<iframe src="x/a.html"></iframe>',
    });
    await symlink('.', path.join(dir, 'x'));
    const plan = await buildDeployFilePlan(root, 'p1', 'entry.html', SHARE);
    const names = plan.files.map((f) => f.file).sort();
    // Each real file is parsed once. `x/a.css` and `x/x/a.html` are second
    // logical paths to already-parsed files: shipped (reachable at that URL)
    // but they add no references, so the walk stops there.
    expect(names).toEqual(['a.css', 'index.html', 'x/a.css', 'x/a.html', 'x/x/a.html']);
    // The unparsed copy's links resolve like the parsed one's, so they land
    // on shipped files instead of an unshipped deeper path.
    const contents = contentsOf(plan);
    expect(contents.get('x/a.html')).toContain('src="x/a.html"');
    expect(contents.get('x/x/a.html')).toContain('src="a.html"');
    expect(contents.get('x/a.css')).toContain('@import "a.css"');
  });

  it('rewrites nested references to the entry to the published index.html', async () => {
    const { root } = await project({
      'pages/entry.html': '<iframe src="sub/child.html"></iframe>',
      'pages/sub/child.html': '<iframe src="../entry.html#top"></iframe>',
    });
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', SHARE);
    expect(contentsOf(plan).get('pages/sub/child.html')).toContain('src="../../index.html#top"');
  });

  it('detects .htm and uppercase .HTML; ignores srcdoc, <a href>, script and comment text', async () => {
    const { root } = await project({
      'entry.html': [
        '<iframe src="one.HTM"></iframe>',
        '<iframe srcdoc="&lt;img src=srcdoc.png&gt;"></iframe>',
        '<a href="linked.html">x</a>',
        '<script>const s = \'<iframe src="script.html">\';</script>',
        '<!-- <iframe src="comment.html"> -->',
      ].join(''),
      'one.HTM': '<img src="one.png">',
      'one.png': 'one',
      'linked.html': 'l',
      'script.html': 's',
      'comment.html': 'c',
      'srcdoc.png': 'x',
    });
    const plan = await buildDeployFilePlan(root, 'p1', 'entry.html', SHARE);
    expect(plan.files.map((f) => f.file).sort()).toEqual(['index.html', 'one.HTM', 'one.png']);
  });
});

describe('root index.html conflict', () => {
  it('records a root index.html conflict instead of overwriting the entry', async () => {
    const { root } = await project({
      'page2.html': '<!doctype html>\n<h1>Two</h1>\n<iframe src="index.html"></iframe>',
      'index.html': '<h1>Home</h1>',
    });
    const plan = await buildDeployFilePlan(root, 'p1', 'page2.html', SHARE);
    const index = plan.files.find((f) => f.file === 'index.html');
    expect(index?.sourcePath).toBe('page2.html');
    expect(plan.indexConflict).toEqual({
      path: 'index.html',
      entryPath: 'page2.html',
      referencedFrom: 'page2.html',
      suggestedName: 'home.html',
      referrers: [{ file: 'page2.html', reference: 'index.html', attribute: '<iframe src>', line: 3, replacement: 'home.html' }],
    });
  });

  it('records conflicts from nested files and picks a free suggested name', async () => {
    const { root } = await project({
      'pages/index.html': '<iframe src="sub/child.html"></iframe><iframe src="../index.html"></iframe>',
      'pages/sub/child.html': '<iframe src="/index.html?x=1"></iframe>',
      'index.html': 'root',
      'home.html': 'taken',
    });
    const plan = await buildDeployFilePlan(root, 'p1', 'pages/index.html', SHARE);
    expect(plan.files.find((f) => f.file === 'index.html')?.sourcePath).toBe('pages/index.html');
    expect(plan.indexConflict?.suggestedName).toBe('home-2.html');
    expect(plan.indexConflict?.referrers.map((r) => [r.file, r.reference, r.replacement])).toEqual([
      ['pages/index.html', '../index.html', '../home-2.html'],
      ['pages/sub/child.html', '/index.html?x=1', '/home-2.html?x=1'],
    ]);
  });

  it('reports a referenced but absent root index.html as missing, not as a conflict', async () => {
    const { root } = await project({ 'page2.html': '<iframe src="index.html"></iframe>' });
    const plan = await buildDeployFilePlan(root, 'p1', 'page2.html', SHARE);
    expect(plan.indexConflict).toBeNull();
    expect(plan.missing).toEqual(['index.html']);
  });

  it.skipIf(process.platform === 'win32')('treats a root index.html that is the entry itself (symlink) as a self-reference', async () => {
    const { root, dir } = await project({ 'page2.html': '<iframe src="index.html"></iframe>' });
    await symlink('page2.html', path.join(dir, 'index.html'));
    const plan = await buildDeployFilePlan(root, 'p1', 'page2.html', SHARE);
    expect(plan.indexConflict).toBeNull();
    expect(plan.missing).toEqual([]);
    expect(plan.files.map((f) => f.file)).toEqual(['index.html']);
  });

  it('has no conflict when the entry is the root index.html or index.html is not referenced', async () => {
    const { root } = await project({
      'index.html': '<iframe src="index.html"></iframe>',
      'index-v1.html': '<h1>V1</h1>',
    });
    expect((await buildDeployFilePlan(root, 'p1', 'index.html', SHARE)).indexConflict).toBeNull();
    expect((await buildDeployFilePlan(root, 'p1', 'index-v1.html', { ...DEPLOY, includeProjectFiles: true })).indexConflict).toBeNull();
  });

  it('refuses a standalone deploy with ENTRY_INDEX_CONFLICT (409) carrying an agent prompt', async () => {
    const { root } = await project({
      'page2.html': '<iframe src="index.html"></iframe><img src="missing.png">',
      'index.html': '<h1>Home</h1>',
    });
    const error = await buildDeployFileSet(root, 'p1', 'page2.html', DEPLOY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeployError);
    const deployError = error as DeployError;
    expect(deployError.status).toBe(409);
    expect(deployError.code).toBe('ENTRY_INDEX_CONFLICT');
    const details = deployError.details as { referrers: unknown[]; suggestedName: string; agentPrompt: string };
    expect(details.suggestedName).toBe('home.html');
    expect(details.referrers).toHaveLength(1);
    expect(details.agentPrompt).toContain('Rename the project\'s root file "index.html" to "home.html"');
    expect(details.agentPrompt).toContain('page2.html line 1, <iframe src>: change "index.html" to "home.html"');

    const preflight = await prepareDeployPreflight(root, 'p1', 'page2.html', DEPLOY);
    expect(preflight.warnings.map((w) => w.code)).toContain('entry-index-conflict');
  });
});
