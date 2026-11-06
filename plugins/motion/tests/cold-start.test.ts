import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../server.ts';
import { callTool } from '../mcp.ts';
import { fixture } from './fixtures.ts';

test('a cold background service applies the selected template using the original empty revision', { timeout: 90_000 }, () => fixture(async store => {
  const before = await store.get();
  const running = await startServer(store, 0, { editor: false });
  const address = running.server.address(); assert.ok(address && typeof address !== 'string');
  await writeFile(path.join(store.directory, 'preview.json'), JSON.stringify({ port: address.port }));
  try {
    assert.equal(running.studio, undefined);
    assert.deepEqual(await store.get(), before, 'service startup must not initialize the active project');
    const applied = await callTool('motion_apply_template', { templateId: 'product-promo', expectedRevision: before.revision }, store);
    assert.match(applied.project!.html!, /Product Promo/);
    assert.equal(store.projectCatalog().projects.filter(p => p.templateId === 'product-promo').length, 1);
    assert.ok(running.studio?.alive());
    const active = store.projectDirectory;
    await assert.rejects(callTool('motion_apply_template', { templateId: 'product-promo', expectedRevision: before.revision }, store), /重新读取 revision/);
    assert.equal(store.projectDirectory, active);
    assert.equal(store.projectCatalog().projects.length, 2, 'a rejected stale request cannot create another project');
  } finally { await running.close(); }
}, false));
