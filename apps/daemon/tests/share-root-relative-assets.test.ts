import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildDeployFilePlan } from '../src/deploy.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-share-root-assets-'));
  roots.push(root);
  const dir = path.join(root, 'p1');
  for (const sub of ['pages', 'assets/nested', 'images', 'fonts']) await mkdir(path.join(dir, sub), { recursive: true });
  await writeFile(path.join(dir, 'pages/entry.html'), '<link rel="stylesheet" href="/assets/site.css?v=1#sheet"><img src="/images/bg.png?q=1#pixel" srcset="/images/bg.png 1x, /images/bg.png?large 2x"><style>.a{background:url(/images/bg.png#inline)}</style><div style="background:url(/images/bg.png?attr)"></div><img src="https://other.test/img"><img src="//cdn.test/img"><img src="data:image/png;base64,AAA"><img src="blob:abc"><img srcset="data:image/png;base64,AAA 1x, /images/bg.png 2x"><a href="#target">anchor</a><img src="/../../escape.png">');
  await writeFile(path.join(dir, 'assets/site.css'), '@import "/assets/nested/theme.css?theme#one"; .a{background:url(/images/bg.png?css#two)} .b{background:url(../images/bg.png)} .c{background:url(https://other.test/a)} .d{background:url(//cdn.test/a)} .e{mask:url(#mask)}');
  await writeFile(path.join(dir, 'assets/nested/theme.css'), '@font-face{src:url(/fonts/a.woff2?v=2#face)}');
  await writeFile(path.join(dir, 'images/bg.png'), 'image-bytes');
  await writeFile(path.join(dir, 'fonts/a.woff2'), 'font-bytes');
  return root;
}

it('rewrites share assets relative to each materialized file, not the website root', async () => {
  const root = await fixture();
  const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', { hookScriptUrl: '', assetUrlPolicy: 'share-relative' });
  const contents = new Map(plan.files.map(f => [f.file, Buffer.from(f.data).toString()]));
  const html = contents.get('index.html')!;
  expect(html).toContain('href="assets/site.css?v=1#sheet"');
  expect(html).toContain('src="images/bg.png?q=1#pixel"');
  expect(html).toContain('srcset="images/bg.png 1x, images/bg.png?large 2x"');
  expect(html).toContain('srcset="data:image/png;base64,AAA 1x, images/bg.png 2x"');
  expect(html).toContain('url(images/bg.png#inline)');
  expect(html).toContain('url(images/bg.png?attr)');
  expect(contents.get('assets/site.css')).toContain('@import "nested/theme.css?theme#one"');
  expect(contents.get('assets/site.css')).toContain('url(../images/bg.png?css#two)');
  expect(contents.get('assets/site.css')).toContain('url(../images/bg.png)');
  expect(contents.get('assets/nested/theme.css')).toContain('url(../../fonts/a.woff2?v=2#face)');
  expect(contents.get('images/bg.png')).toBe('image-bytes');
  expect(contents.get('fonts/a.woff2')).toBe('font-bytes');
  for (const external of ['https://other.test/img', '//cdn.test/img', 'data:image/png;base64,AAA', 'blob:abc', '#target']) expect(html).toContain(external);
  for (const external of ['https://other.test/a', '//cdn.test/a', '#mask']) expect(contents.get('assets/site.css')).toContain(external);
  expect(plan.invalid).toContain('/../../escape.png');
  expect([...contents.keys()].some(key => key.includes('escape'))).toBe(false);
});

it('keeps standalone deploy root URLs and CSS bytes unchanged', async () => {
  const root = await fixture();
  const plan = await buildDeployFilePlan(root, 'p1', 'pages/entry.html', { hookScriptUrl: '' });
  const contents = new Map(plan.files.map(f => [f.file, Buffer.from(f.data).toString()]));
  expect(contents.get('index.html')).toContain('href="/assets/site.css?v=1#sheet"');
  expect(contents.get('assets/site.css')).toContain('url(/images/bg.png?css#two)');
  expect(contents.get('assets/nested/theme.css')).toContain('url(/fonts/a.woff2?v=2#face)');
});
