import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { describe, it } from 'vitest';

import {
  bundleStandaloneHtml,
  type StandaloneAssetReader,
} from '../../src/artifacts/standalone-html.js';

function assetReader(files: Record<string, string>, reads = new Map<string, number>()): StandaloneAssetReader {
  return async (projectPath) => {
    const body = files[projectPath];
    if (body === undefined) return null;
    reads.set(projectPath, (reads.get(projectPath) ?? 0) + 1);
    const buffer = Buffer.from(body);
    return {
      buffer,
      mime: projectPath.endsWith('.html') ? 'text/html' : 'text/javascript',
      size: buffer.length,
    };
  };
}

function importedPaths(html: string): string[] {
  const json = load(html)('script[type="importmap"]').first().text();
  if (!json) return [];
  const map = JSON.parse(json) as { imports: Record<string, string> };
  for (const value of Object.values(map.imports)) {
    assert.match(value, /^data:text\/javascript;base64,/);
  }
  return Object.keys(map.imports).map((key) => key.replace(/^od-project:\//, '')).sort();
}

function frameDocuments(html: string): string[] {
  const $ = load(html);
  return $('iframe').toArray().map((node) => {
    const src = $(node).attr('src');
    assert.ok(src);
    assert.match(src, /^data:text\/html;base64,/);
    return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64').toString('utf8');
  });
}

describe('standalone document module closures', () => {
  it('preserves the complete import map for a single document', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="module" src="./main.js"></script>',
      readAsset: assetReader({
        'main.js': "export { answer } from './leaf.js';",
        'leaf.js': 'export const answer = 42;',
      }),
    });
    assert.deepEqual(importedPaths(result.html), ['leaf.js', 'main.js']);
    assert.deepEqual(frameDocuments(result.html), []);
  });

  it('includes cached transitive imports in both the parent and its iframe', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="module" src="./main.js"></script><iframe src="child.html"></iframe>',
      readAsset: assetReader({
        'main.js': "import { answer } from './middle.js'; globalThis.answer = answer;",
        'middle.js': "export { answer } from './leaf.js';",
        'leaf.js': 'export const answer = 42;',
        'child.html': '<script type="module" src="./main.js"></script>',
      }),
    });
    const expected = ['leaf.js', 'main.js', 'middle.js'];
    assert.deepEqual(importedPaths(result.html), expected);
    const [child] = frameDocuments(result.html);
    assert.ok(child);
    assert.deepEqual(importedPaths(child), expected);
  });

  it('includes the full closure when sibling iframes share a cached entry module', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<iframe src="one.html"></iframe><iframe src="two.html"></iframe>',
      readAsset: assetReader({
        'one.html': '<script type="module" src="./main.js"></script>',
        'two.html': '<script type="module" src="./main.js"></script>',
        'main.js': "export { answer } from './leaf.js';",
        'leaf.js': 'export const answer = 42;',
      }),
    });
    assert.deepEqual(importedPaths(result.html), []);
    const frames = frameDocuments(result.html);
    assert.equal(frames.length, 2);
    for (const frame of frames) assert.deepEqual(importedPaths(frame), ['leaf.js', 'main.js']);
  });

  it('keeps unrelated sibling entry modules out of each document import map', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<iframe src="one.html"></iframe><iframe src="two.html"></iframe>',
      readAsset: assetReader({
        'one.html': '<script type="module" src="./one.js"></script>',
        'two.html': '<script type="module" src="./two.js"></script>',
        'one.js': "export { answer } from './shared.js';",
        'two.js': "export { answer } from './shared.js';",
        'shared.js': "export { answer } from './leaf.js';",
        'leaf.js': 'export const answer = 42;',
      }),
    });
    const [one, two] = frameDocuments(result.html);
    assert.ok(one && two);
    assert.deepEqual(importedPaths(one), ['leaf.js', 'one.js', 'shared.js']);
    assert.deepEqual(importedPaths(two), ['leaf.js', 'shared.js', 'two.js']);
  });

  it('closes a cached cycle including imports discovered after its back edge', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="module" src="./a.js"></script><iframe src="child.html"></iframe>',
      readAsset: assetReader({
        'a.js': "import './b.js'; export { answer } from './leaf.js';",
        'b.js': "export { answer } from './a.js';",
        'leaf.js': 'export const answer = 42;',
        'child.html': '<script type="module" src="./b.js"></script>',
      }),
    });
    const expected = ['a.js', 'b.js', 'leaf.js'];
    assert.deepEqual(importedPaths(result.html), expected);
    const [child] = frameDocuments(result.html);
    assert.ok(child);
    assert.deepEqual(importedPaths(child), expected);
  });

  it('retains cached dynamic imports and re-exports referenced by inline modules', async () => {
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="module">import "./main.js";</script><iframe src="child.html"></iframe>',
      readAsset: assetReader({
        'main.js': "export * from './middle.js';",
        'middle.js': "export const lazy = () => import('./leaf.js');",
        'leaf.js': 'export const answer = 42;',
        'child.html': '<script type="module">import "./main.js";</script>',
      }),
    });
    const expected = ['leaf.js', 'main.js', 'middle.js'];
    assert.deepEqual(importedPaths(result.html), expected);
    const [child] = frameDocuments(result.html);
    assert.ok(child);
    assert.deepEqual(importedPaths(child), expected);
  });

  it('loads shared modules only once while preserving each document closure', async () => {
    const reads = new Map<string, number>();
    const result = await bundleStandaloneHtml({
      entryPath: 'index.html',
      html: '<script type="module" src="./main.js"></script><iframe src="child.html"></iframe><iframe src="child.html"></iframe>',
      readAsset: assetReader({
        'main.js': "import './left.js'; import './right.js';",
        'left.js': "import './shared.js';",
        'right.js': "import './shared.js';",
        'shared.js': 'export const answer = 42;',
        'child.html': '<script type="module" src="./main.js"></script>',
      }, reads),
    });
    const expected = ['left.js', 'main.js', 'right.js', 'shared.js'];
    assert.deepEqual(importedPaths(result.html), expected);
    const frames = frameDocuments(result.html);
    assert.equal(frames.length, 2);
    for (const frame of frames) assert.deepEqual(importedPaths(frame), expected);
    assert.equal(reads.size, 5);
    assert.ok([...reads.values()].every((count) => count === 1));
  });
});
