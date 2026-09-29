import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { DELIVERABLE_SKILLS, OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS, resolveOdNextDeckFrameworkMode } from '@open-design/contracts';
import { resolvePluginFolder } from '../../../src/plugins/registry.js';
import { createBundledStrategyBindingV2, loadBundledStrategyPromptAssetsV2 } from '../../../src/plugins/strategy-package.js';
import { loadOdNextTaskResourcesForSnapshot, materializeOdNextDeviceFrames } from '../../../src/strategies/od-next/device-frames.js';
const bundledPluginsDir = path.resolve(import.meta.dirname, '../../../../../plugins/_official');
const folder = path.join(bundledPluginsDir, 'scenarios/od-next-strategy');

it('loads the deck framework lazily for Discovery while preserving the existing PPT route', () => {
  expect(resolveOdNextDeckFrameworkMode({ taskType: 'discovery', deckIntent: true })).toBeUndefined();
  expect(resolveOdNextDeckFrameworkMode({ taskType: 'ppt' })).toBe('canonical');
  expect(resolveOdNextDeckFrameworkMode({ taskType: 'ppt', hasExistingDeckArtifact: true })).toBe('legacy_compatible');
});

it('ships ten loadable main Skills without restoring the retired machine protocol', async () => {
  const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
  if (!resolved.ok) throw Error(resolved.errors.join(';'));
  const binding = createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'discovery' });
  const assets = loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding });
  expect(assets.taskSkill).toContain('Query');
  expect(assets.taskSkill).toContain('production-ready');
  expect(assets.taskSkill).not.toMatch(/requiredDeliverables|runtime-state|planContractHash/);
  expect(DELIVERABLE_SKILLS).toHaveLength(10);
  for (const skill of DELIVERABLE_SKILLS) {
    expect(assets.taskSkill).toContain(`${folder}/assets/task-profiles/${skill.id}.md`);
    const body = await readFile(path.join(folder, `assets/task-profiles/${skill.id}.md`), 'utf8');
    expect(body).not.toMatch(/requiredDeliverables|resultRef=|outcome=completed/);
    expect(assets.taskResources.some(r => r.path.endsWith(`/${skill.id}.md`))).toBe(true);
  }
  expect(OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS).toContain('Do not emit Plan Contract');
  const resources = await loadOdNextTaskResourcesForSnapshot({ bundledPluginsDir, snapshot: { pluginId: 'od-next-strategy', strategy: binding } });
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'discovery-marker-'));
  try {
    await materializeOdNextDeviceFrames({ cwd, resources });
    const deck = await readFile(path.join(cwd, '.od-frames/deck-framework.md'), 'utf8');
    expect(deck).toContain('data-od-deck-protocol');
    expect(deck).toContain('Existing deck or selected template');
    expect(await readFile(path.join(cwd, '.od-frames/iphone.html'), 'utf8')).toContain('data-phone-shell');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
