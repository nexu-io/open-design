import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repairGeneratedRegistry } from '../hyperframes.ts';
import { fixture } from './fixtures.ts';

test('new projects use the native catalog default; the old generated URL migrates without changing project settings', () => fixture(async store => {
  const filename = path.join(store.projectDirectory, 'hyperframes.json');
  const config = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(config.registry, undefined);
  const legacy = { ...config, registry: 'https://hyperframes.heygen.com/registry', custom: { name: 'keep this' } };
  await writeFile(filename, JSON.stringify(legacy));
  assert.equal(await repairGeneratedRegistry(store.projectDirectory), true);
  const migrated = JSON.parse(await readFile(filename, 'utf8'));
  assert.deepEqual(migrated, { ...config, custom: legacy.custom });
  assert.equal(await repairGeneratedRegistry(store.projectDirectory), false);
}));

test('registry migration preserves custom registry URLs and invalid configs for native diagnostics', () => fixture(async store => {
  const filename = path.join(store.projectDirectory, 'hyperframes.json');
  for (const original of ['{ "registry": "https://registry.example.com/team", "name": "keep" }\n', '{ invalid json']) {
    await writeFile(filename, original);
    assert.equal(await repairGeneratedRegistry(store.projectDirectory), false);
    assert.equal(await readFile(filename, 'utf8'), original);
  }
}));
