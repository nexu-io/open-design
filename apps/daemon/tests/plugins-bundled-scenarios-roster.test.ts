// Plan §3.N4 / spec §23.3.3 — bundled scenario plugins roster.
//
// Each `taskKind` enum value (new-generation / code-migration /
// figma-migration / tune-collab) maps to exactly one *canonical* bundled
// `od.kind: 'scenario'` plugin under `plugins/_official/scenarios/`.
// The daemon's bundled boot walker registers all sibling scenarios; the
// canonical winner per taskKind is selected by `collectBundledScenarios`
// using the `od-<taskKind>` id rule, so additional scenarios (e.g.
// `od-media-generation`) can ride along without hijacking the
// pipeline-fallback.

import path from 'node:path';
import url from 'node:url';
import { readFile, readdir, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const scenariosRoot = path.join(repoRoot, 'plugins', '_official', 'scenarios');

const CANONICAL = new Map<string, { taskKind: string; pipelineStages: string[] }>([
  ['od-new-generation',  { taskKind: 'new-generation',  pipelineStages: ['discovery', 'plan', 'generate', 'critique'] }],
  ['od-figma-migration', { taskKind: 'figma-migration', pipelineStages: ['extract', 'tokens', 'generate', 'critique'] }],
  ['od-code-migration',  { taskKind: 'code-migration',  pipelineStages: ['import', 'tokens', 'plan', 'verify', 'review', 'handoff'] }],
  ['od-tune-collab',     { taskKind: 'tune-collab',     pipelineStages: ['direction', 'patch', 'critique', 'handoff'] }],
]);

// Non-canonical scenarios. These ride on a canonical taskKind but
// don't win the pipeline-fallback for it. The kind → scenario map in
// `@open-design/contracts/scenario-defaults` is what routes UX
// project kinds (image / video / audio) onto these plugins. Export
// starters sit here too: they are user-facing plugins for downstream
// handoff, but they must not become the canonical tune-collab fallback.
const SIBLINGS = new Map<string, { taskKind: string }>([
  ['od-default',          { taskKind: 'new-generation' }],
  ['od-media-generation', { taskKind: 'new-generation' }],
  ['od-plugin-authoring', { taskKind: 'new-generation' }],
  ['od-design-refine',    { taskKind: 'tune-collab' }],
  ['od-react-export',     { taskKind: 'tune-collab' }],
  ['od-nextjs-export',    { taskKind: 'tune-collab' }],
  ['od-vue-export',       { taskKind: 'tune-collab' }],
]);

describe('plugins/_official/scenarios roster', () => {
  it('contains every canonical scenario folder (plus the documented siblings)', async () => {
    const entries = await readdir(scenariosRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const expected = [...CANONICAL.keys(), ...SIBLINGS.keys()].sort();
    expect(dirs).toEqual(expected);
  });

  for (const [folder, expected] of CANONICAL) {
    it(`${folder} declares od.kind='scenario' + the canonical pipeline shape`, async () => {
      const manifestPath = path.join(scenariosRoot, folder, 'open-design.json');
      const skillPath = path.join(scenariosRoot, folder, 'SKILL.md');
      expect((await stat(manifestPath)).isFile()).toBe(true);
      expect((await stat(skillPath)).isFile()).toBe(true);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      expect(manifest.name).toBe(folder);
      expect(manifest.od.kind).toBe('scenario');
      expect(manifest.od.taskKind).toBe(expected.taskKind);
      const stageIds = manifest.od.pipeline.stages.map((s: { id: string }) => s.id);
      expect(stageIds).toEqual(expected.pipelineStages);
    });
  }

  for (const [folder, expected] of SIBLINGS) {
    it(`${folder} declares od.kind='scenario' + a non-empty pipeline + the documented taskKind`, async () => {
      const manifestPath = path.join(scenariosRoot, folder, 'open-design.json');
      const skillPath = path.join(scenariosRoot, folder, 'SKILL.md');
      expect((await stat(manifestPath)).isFile()).toBe(true);
      expect((await stat(skillPath)).isFile()).toBe(true);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      expect(manifest.name).toBe(folder);
      expect(manifest.od.kind).toBe('scenario');
      expect(manifest.od.taskKind).toBe(expected.taskKind);
      expect(Array.isArray(manifest.od.pipeline?.stages)).toBe(true);
      expect(manifest.od.pipeline.stages.length).toBeGreaterThan(0);
      // Sibling scenarios MUST NOT use the canonical id, otherwise the
      // pipeline-fallback dedupe rule (`id === od-<taskKind>`) would
      // mis-select the sibling as the canonical winner.
      expect(folder).not.toBe(`od-${expected.taskKind}`);
    });
  }

  it('od-default is hidden and asks for task type through a GenUI surface', async () => {
    const manifestPath = path.join(scenariosRoot, 'od-default', 'open-design.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(manifest.od.hidden).toBe(true);
    expect(manifest.od.pipeline.stages[0].id).toBe('task-type');
    expect(manifest.od.genui.surfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-type',
          kind: 'choice',
          trigger: expect.objectContaining({ stageId: 'task-type' }),
        }),
      ]),
    );
  });
});
