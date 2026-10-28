import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import express from 'express';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import { registerCollabSyncRoutes } from '../src/routes/collab-sync.js';
import { migratePublicFilePublications, createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createPublicSharePublishingFixture } from './public-share-publishing-fixture.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildDeployFilePlan } from '../src/deploy.js';
import { stageShareFiles } from '../src/collab/share-staging.js';
import { fingerprintSharePayload } from '../src/collab/share-content-fingerprint.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const SHARE = { hookScriptUrl: '', assetUrlPolicy: 'share-relative' as const };
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'od-share-js-images-'));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, 'p', name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return root;
}
const names = (plan: Awaited<ReturnType<typeof buildDeployFilePlan>>) => plan.files.map(file => file.file).sort();

it('3881 stages the three inline product-array images, not unrelated project content', async () => {
  const html = '<!doctype html><img src="images/static.png"><script>const products = [{image:"images/bag.jpg"},{image:\'images/shoes.jpg?v=2#card\'},{image:`images/lipstick.jpg`}]; document.body.innerHTML += products.map(p => `<img src="${p.image}">`).join("");</script>';
  const root = await fixture({ 'index.html': html, 'images/static.png': 'static',
    'images/bag.jpg': 'bag', 'images/shoes.jpg': 'shoes', 'images/lipstick.jpg': 'lipstick',
    'images/private.png': 'unreferenced', 'private.json': 'not public',
  });
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(plan)).toEqual(['images/bag.jpg', 'images/lipstick.jpg', 'images/shoes.jpg', 'images/static.png', 'index.html']);
  expect(plan.missing).toEqual([]); expect(plan.invalid).toEqual([]);
  const stage = path.join(root, 'stage');
  await mkdir(stage);
  await stageShareFiles(stage, plan.files);
  for (const image of ['bag', 'shoes', 'lipstick']) expect(await readFile(path.join(stage, `images/${image}.jpg`), 'utf8')).toBe(image);
  expect(await readFile(path.join(stage, 'index.html'), 'utf8')).toBe(html);
  await expect(readFile(path.join(stage, 'private.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('includes JS-only image byte changes in the publication fingerprint and decodes JS escapes without rewriting code', async () => {
  const html = '<script>const image="images/\\u0062ag.jpg";</script>';
  const root = await fixture({ 'index.html': html, 'images/bag.jpg': 'before' });
  const plan = () => buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  const before = fingerprintSharePayload((await plan()).files);
  await writeFile(path.join(root, 'p/images/bag.jpg'), 'after');
  expect(fingerprintSharePayload((await plan()).files)).not.toBe(before);
  await writeFile(path.join(root, 'p/images/bag.jpg'), 'before');
  expect(fingerprintSharePayload((await plan()).files)).toBe(before);
  expect(Buffer.from((await plan()).files[0]!.data).toString()).toBe(html);
});

it('collects external JS and imported module images using document URLs versus import.meta URLs correctly', async () => {
  const script = 'import "./catalog.mjs"; const photo="images/bag.jpg"; const local=new URL("images/bag.jpg", document.baseURI); const icon=new URL("./icons/icon.svg#mark", import.meta.url);';
  const root = await fixture({ 'index.html': '<script type="module" src="scripts/app.js"></script>',
    'scripts/app.js': script, 'scripts/catalog.mjs': 'export const image = `images/lipstick.webp?size=2`;',
    'images/bag.jpg': 'bag', 'images/lipstick.webp': 'lipstick', 'scripts/icons/icon.svg': '<svg/>',
    'scripts/images/bag.jpg': 'wrong document base',
  });
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(plan)).toEqual(['images/bag.jpg', 'images/lipstick.webp', 'index.html', 'scripts/app.js', 'scripts/catalog.mjs', 'scripts/icons/icon.svg']);
  expect(Buffer.from(plan.files.find(f => f.file === 'scripts/app.js')!.data).toString()).toBe(script);
});

it('walks a shared script once for each owning document, without losing either image base', async () => {
  const root = await fixture({ 'index.html': '<iframe src="a/view.html"></iframe><iframe src="b/view.html"></iframe>',
    'a/view.html': '<script src="/shared.js"></script>', 'b/view.html': '<script src="/shared.js"></script>',
    'shared.js': 'const image="images/card.png";', 'a/images/card.png': 'a', 'b/images/card.png': 'b',
  });
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(plan)).toEqual(['a/images/card.png', 'a/view.html', 'b/images/card.png', 'b/view.html', 'index.html', 'shared.js']);
});

it('terminates circular local module imports and ignores bare/remote module specifiers', async () => {
  const root = await fixture({ 'index.html': '<script type="module">import "./a.js";</script>',
    'a.js': 'import "./b.js"; import "some-package"; import "https://cdn.test/module.js"; export const image="images/a.png";',
    'b.js': 'export {image} from "./a.js"; const image="images/a.png";', 'images/a.png': 'a',
  });
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(plan)).toEqual(['a.js', 'b.js', 'images/a.png', 'index.html']);
  expect(plan.missing).toEqual([]);
});

it('does not mistake comments, regex, markup/CSS strings, non-executable scripts or computed paths for literal images', async () => {
  const root = await fixture({ 'index.html': `<!-- <script>const fake="comment.png";</script> -->
<style>.a{color:red}</style><script type="application/ld+json">{"image":"json.png"}</script>
<script src="real.js">const ignored="ignored.png";</script><script>
// const comment = 'comment.png';
const regex = /regex.png/;
const markup = '<img src="markup.png">';
const css = 'url(style.png)';
const dynamic = 'prefix/' + 'computed.png';
const tpl = \`images/\${name}.png\`;
const remote = new URL('remote-local-name.png', 'https://cdn.test/');
const ambiguous = new URL('ambiguous-base.png', base);
</script>`, 'real.js': 'console.log("ok");',
    'remote-local-name.png': 'private', 'ambiguous-base.png': 'private',
    'comment.png': 'private', 'json.png': 'private', 'ignored.png': 'private', 'regex.png': 'private',
  });
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(plan)).toEqual(['index.html', 'real.js']); expect(plan.missing).toEqual([]);
});

it('does not broaden standalone deployment discovery or introduce a new JavaScript syntax gate', async () => {
  const root = await fixture({ 'index.html': '<img src="static.png"><script src="app.js"></script><script>const broken = ; const image="missing.png";</script>',
    'app.js': 'const image="other-missing.png";', 'static.png': 'static',
  });
  const standalone = await buildDeployFilePlan(root, 'p', 'index.html', { hookScriptUrl: '' });
  expect(names(standalone)).toEqual(['app.js', 'index.html', 'static.png']);
  expect(standalone.missing).toEqual([]);
  // Invalid inline JS remains untouched; a valid external script still contributes its literal.
  const share = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(share)).toEqual(['app.js', 'index.html', 'static.png']);
  expect(share.missing).toEqual(['other-missing.png']);
});

it('preserves external/data/blob URLs and reports missing or escaping literal assets through the existing planner', async () => {
  const root = await fixture({ 'index.html': '<script>const paths=["https://cdn.test/a.png","//cdn.test/b.jpg","data:image/svg+xml,external.svg","blob:external.png","images/missing.png","../../outside.png"];</script>',
  });
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(names(plan)).toEqual(['index.html']);
  expect(plan.missing).toEqual(['images/missing.png']); expect(plan.invalid).toContain('../../outside.png');
});

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('refuses unreadable JS-discovered images instead of publishing a partial snapshot', async () => {
  const root = await fixture({ 'index.html': '<script>const image="images/bag.jpg";</script>', 'images/bag.jpg': 'bag' });
  const image = path.join(root, 'p/images/bag.jpg');
  await chmod(image, 0);
  try { await expect(buildDeployFilePlan(root, 'p', 'index.html', SHARE)).rejects.toMatchObject({ code: 'EACCES' }); }
  finally { await chmod(image, 0o644); }
  expect(names(await buildDeployFilePlan(root, 'p', 'index.html', SHARE))).toContain('images/bag.jpg');
});

it.skipIf(process.platform === 'win32')('rejects image symlinks escaping the project and terminates module symlink cycles', async () => {
  const root = await fixture({ 'index.html': '<script type="module" src="app.js"></script>',
    'app.js': 'import "./loop/app.js"; const image="images/leak.png";',
  });
  await mkdir(path.join(root, 'p/images'));
  await writeFile(path.join(root, 'outside.png'), 'private');
  await symlink(path.join(root, 'outside.png'), path.join(root, 'p/images/leak.png'));
  await symlink('.', path.join(root, 'p/loop'));
  const plan = await buildDeployFilePlan(root, 'p', 'index.html', SHARE);
  expect(plan.files.some(f => f.file.endsWith('leak.png'))).toBe(false);
  expect(plan.invalid).toContain('images/leak.png');
  expect(plan.files.length).toBeLessThanOrEqual(3);
});

it('3881 production publish HTTP sends all JS-only images in the exact resource push staging directory', async () => {
  const root = await fixture({ 'index.html': '<script>const products=["images/bag.jpg","images/shoes.jpg","images/lipstick.jpg"];</script>',
    'images/bag.jpg': 'bag', 'images/shoes.jpg': 'shoes', 'images/lipstick.jpg': 'lipstick',
    'images/private.png': 'do not publish', 'private.json': 'do not publish',
  });
  const db = new Database(':memory:');
  migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
  const store = createSqlitePublicFilePublicationStore(db);
  const context: WorkspaceCollabContext = {
    workspaceId: 'w', workspaceMemberId: 'owner', workspaceType: 'personal', role: 'owner',
    memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
  const runtime = createCollabRuntime({ workspaceContext: { current: async () => context } });
  let uploads = 0;
  const commands: string[][] = [];
  const publishing = createPublicSharePublishingFixture(db, store, async args => {
    expect(args[0]).toBe('push');
    const directory = args[3]; if (!directory) throw new Error('missing staged directory');
    expect((await readdir(directory)).sort()).toEqual(['images', 'index.html']);
    expect((await readdir(path.join(directory, 'images'))).sort()).toEqual(['bag.jpg', 'lipstick.jpg', 'shoes.jpg']);
    for (const image of ['bag', 'shoes', 'lipstick']) expect(await readFile(path.join(directory, `images/${image}.jpg`), 'utf8')).toBe(image);
    uploads++;
    return JSON.stringify({ id: 'version-js-images', version: 1 });
  }, undefined, { commands });
  const app = express(); app.use(express.json());
  registerCollabSyncRoutes(app, { collab: runtime, publicFilePublicationStore: store, ...publishing,
    verifyWorkspaceRequest: async () => context,
    resolveSharedProject: async projectId => ({ projectId, ownerMemberId: 'owner', sharedAt: new Date(1).toISOString() }),
    resolveProjectDir: () => path.join(root, 'p'),
  });
  const server = createServer(app);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('no listener');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/p/files/index.html/publish-public`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'published', receipt: { versionId: 'version-js-images' } });
    expect(uploads).toBe(1);
    const publish = commands.find(args => args[0] === 'share' && args[1] === 'publish');
    expect(publish?.[publish.indexOf('--version-id') + 1]).toBe('version-js-images');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    runtime.dispose(); db.close();
  }
});
