import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { assertOdNextPlanningBuildOnlyV2, DELIVERABLE_SKILLS, OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS, resolveOdNextDeckFrameworkMode } from '@open-design/contracts';
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
  for (const name of ['core-system-prompt.md', 'general-orchestration.md', 'task-profiles/discovery.md']) {
    const body = await readFile(path.join(folder, 'assets', name), 'utf8');
    expect(() => assertOdNextPlanningBuildOnlyV2(body, name)).not.toThrow();
  }
  expect(assets.taskSkill).toContain('Query');
  // The loaded prompt must gate native reads before presenting catalog choices.
  const opening = assets.taskSkill.split('\n\n')[1];
  expect(opening).toContain('Before choosing a deliverable type or calling a tool');
  expect(opening).toContain('text-only planning');
  expect(assets.taskSkill).toContain('Only for a request that authorizes producing or editing an artifact');
  expect(assets.taskSkill).toContain('production-ready');
  expect(assets.taskSkill).not.toMatch(/requiredDeliverables|runtime-state|planContractHash/);
  expect(DELIVERABLE_SKILLS).toHaveLength(11);
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

// Prompt wiring regression; semantic routing is validated by frozen live evals.
it('exposes source-based recreation and fresh-design boundaries in the loaded Discovery prompt', async () => {
  const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
  if (!resolved.ok) throw Error(resolved.errors.join(';'));
  const binding = createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'discovery' });
  const { taskSkill } = loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding });
  const cloneEntry = taskSkill.split('\n').find(line => line.startsWith('- web-clone ('))!;
  const prototypeEntry = taskSkill.split('\n').find(line => line.startsWith('- prototype ('))!;
  expect(cloneEntry).toMatch(/HTML|source code/);
  expect(prototypeEntry).toContain('reference-page recreation');
  expect(taskSkill).toContain('Select web-clone, not prototype, when');
  expect(taskSkill).toContain('kind=prototype describes the output');
  expect(taskSkill).toContain('Style inspiration alone');
  expect(taskSkill).toContain('already in context');
  expect(taskSkill).toContain('Complete reference source is artifact input, not a loaded Skill');
  expect(taskSkill).toContain('Copying, translating, or saving that reference as a new output does not waive the read');
});

// These assertions cover prompt delivery; frozen evals separately assess adherence.
it('keeps output selection independent of shared HTML implementation and exposes video failure boundaries', async () => {
  const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
  if (!resolved.ok) throw Error(resolved.errors.join(';'));
  const binding = createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'discovery' });
  const { taskSkill } = loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding });
  expect(taskSkill).toContain('For authorized production, choose the smallest set of production Skills that covers the independently requested outputs before issuing any Skill reads');
  expect(taskSkill).toContain('An HTML presentation, including its layout and navigation, is one ppt output');
  expect(taskSkill).toContain('A separately requested website still needs prototype');
  const video = await readFile(path.join(folder, 'assets/task-profiles/video.md'), 'utf8');
  expect(video).toContain('An internal HTML composition for this renderer is part of the video task, not an independently requested HyperFrames deliverable');
  expect(taskSkill).toContain('not an internal renderer composition for MP4');
  expect(video).toContain('A failed render leaves the video undelivered');
  expect(video).toContain('Do not substitute an ad-hoc shell or ffmpeg animation');
  expect(video).toContain('A decodable container or successful encoder exit does not establish that the requested subject or motion is present');
});

it('keeps Motion export checks out of the planning protocol and exposes unsupported local refresh limits', async () => {
  const core = await readFile(path.join(folder, 'assets/core-system-prompt.md'), 'utf8');
  const motion = await readFile(path.join(folder, 'assets/task-profiles/motion-design.md'), 'utf8');
  expect(core).toContain('actual video-motion film requested');
  expect(motion).toContain('not a model-output planning contract');
  expect(motion).not.toContain('media declare-motion');
  const live = await readFile(path.join(folder, 'assets/task-profiles/live-artifact.md'), 'utf8');
  expect(live).toContain('ask before converting or substituting the format');
});

it('stops opaque media request failures without unrelated diagnostic generations', async () => {
  const video = await readFile(path.join(folder, 'assets/task-profiles/video.md'), 'utf8');
  expect(video).toContain('HTTP 400 invalid_request');
  expect(video).toContain('do not probe another media surface for connectivity');
});

// Prompt transport only: adherence is checked separately on frozen live cases.
it('delivers local-state, explicit-renderer and prototype action safeguards through Discovery', async () => {
  const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
  if (!resolved.ok) throw Error(resolved.errors.join(';'));
  const binding = createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'discovery' });
  const assets = loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding });
  expect(assets.taskSkill).toContain('Saving user edits or deriving totals from in-memory or browser-local state does not make a prototype a live-artifact');
  expect(assets.taskSkill).toContain('For explicitly requested HyperFrames source, read hyperframes only');
  const resources = await loadOdNextTaskResourcesForSnapshot({ bundledPluginsDir, snapshot: { pluginId: 'od-next-strategy', strategy: binding } });
  const prototype = resources.find(resource => resource.path.endsWith('/prototype.md'));
  const audio = resources.find(resource => resource.path.endsWith('/audio.md'));
  expect(prototype).toBeDefined();
  expect(audio).toBeDefined();
  const prototypeBody = prototype!.text;
  expect(prototypeBody).toContain('Commit each local mutation to the same state that renders the interface');
  expect(prototypeBody).toContain('Hot-search suggestions and typed searches use the same matching rules');
  expect(prototypeBody).toContain('Set both foreground and background on primary controls');
  expect(prototypeBody).toContain('do not relabel an unrelated image as the requested place or object');
  expect(prototypeBody).toContain('keep DOM lookup cardinality explicit');
  expect(prototypeBody).toMatch(/Results and their\s+empty state must never appear at the same time/);
  const audioBody = audio!.text;
  expect(audioBody).toContain('A request for an audio file alone does not authorize a local synthesis fallback');
});
