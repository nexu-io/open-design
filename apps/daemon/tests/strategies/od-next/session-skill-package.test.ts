import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectMetadata } from '@open-design/contracts';

import { resolveFrozenSkillBundleBodies } from '../../../src/strategies/od-next/frozen-skill-package.js';
import { captureOdNextSessionSkillPackage } from '../../../src/strategies/od-next/session-skill-package.js';
import { digestExampleSkillManifest } from '../../../src/plugins/example-binding.js';
import type { SkillInfo } from '../../../src/skills.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'plugins', '_official', 'examples');

/**
 * The default example card of every task type OD Next routes. `marketing`
 * shares Prototype's card; Home has no chip for it, but the daemon does route
 * it, so it belongs in this table.
 */
const ROUTED_TASK_TYPES = [
  { taskType: 'prototype', folder: 'web-prototype', pluginId: 'example-web-prototype' },
  { taskType: 'ppt', folder: 'simple-deck', pluginId: 'example-simple-deck' },
  { taskType: 'marketing', folder: 'web-prototype', pluginId: 'example-web-prototype' },
  { taskType: 'hyperframes', folder: 'hyperframes', pluginId: 'example-hyperframes' },
] as const;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

async function scratchSkill(input: {
  id: string;
  body: string;
  sideFiles?: Record<string, string>;
}): Promise<SkillInfo> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `od-session-skill-${input.id}-`));
  temporaryRoots.push(dir);
  await writeFile(
    path.join(dir, 'SKILL.md'),
    ['---', `name: ${input.id}`, 'description: scratch', '---', input.body].join('\n'),
    'utf8',
  );
  for (const [relative, content] of Object.entries(input.sideFiles ?? {})) {
    const target = path.join(dir, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return { id: input.id, name: input.id, dir } as unknown as SkillInfo;
}

function metadataWithExample(input: {
  dir: string;
  digest: string;
  pluginId: string;
}): ProjectMetadata {
  return {
    kind: 'prototype',
    exampleBinding: {
      schemaVersion: 1,
      provenance: 'example_card',
      pluginId: input.pluginId,
      pluginSource: input.dir,
      manifestSourceDigest: input.digest,
      boundAt: 1,
    },
  } as ProjectMetadata;
}

describe('a mentioned Skill enters OD Next alongside whatever else the session picked', () => {
  it('freezes the named Skill even with no example card in play', async () => {
    const skill = await scratchSkill({ id: 'frontend-design', body: 'MENTIONED_BODY' });
    const frozen = await captureOdNextSessionSkillPackage({
      metadata: { kind: 'prototype' } as ProjectMetadata,
      getLocalPluginBySource: async () => null,
      selection: { skillId: 'frontend-design' },
      listSkillCatalog: async () => [skill],
    });

    const bodies = resolveFrozenSkillBundleBodies(frozen);
    expect(bodies?.skillNames).toEqual(['frontend-design']);
    expect(bodies?.body).toContain('MENTIONED_BODY');
  });

  // ACCEPTANCE for all four routed task types: the card the type binds and a
  // Skill the user @-mentioned reach the Agent together, in authority order.
  it.each(ROUTED_TASK_TYPES)(
    'carries a mentioned Skill ahead of the $taskType card in one package',
    async ({ folder, pluginId }) => {
      const dir = path.join(EXAMPLES_DIR, folder);
      const skill = await scratchSkill({ id: 'frontend-design', body: 'MENTIONED_BODY' });
      const frozen = await captureOdNextSessionSkillPackage({
        metadata: metadataWithExample({
          dir,
          digest: await digestExampleSkillManifest(dir),
          pluginId,
        }),
        getLocalPluginBySource: async (id, source) => ({
          id,
          source,
          fsPath: dir,
          title: pluginId,
        }),
        selection: { skillIds: ['frontend-design'] },
        listSkillCatalog: async () => [skill],
      });

      const bodies = resolveFrozenSkillBundleBodies(frozen);
      // The @-mention outranks material that came along with a picked card,
      // and `skill_names` is that order verbatim.
      expect(bodies?.skillNames[0]).toBe('frontend-design');
      expect(bodies?.skillNames).toHaveLength(2);
      expect(bodies?.body.indexOf('MENTIONED_BODY')).toBeGreaterThanOrEqual(0);
      expect(frozen.selections.map((selection) => selection.name))
        .toEqual(['frontend-design', pluginId]);
    },
  );

  it('deduplicates a Skill named through both request fields', async () => {
    const skill = await scratchSkill({ id: 'frontend-design', body: 'MENTIONED_BODY' });
    const frozen = await captureOdNextSessionSkillPackage({
      metadata: { kind: 'prototype' } as ProjectMetadata,
      getLocalPluginBySource: async () => null,
      selection: { skillId: 'frontend-design', skillIds: ['frontend-design'] },
      listSkillCatalog: async () => [skill],
    });
    expect(frozen.selections).toHaveLength(1);
  });

  it('carries the Skill folder side files the SKILL.md names', async () => {
    const skill = await scratchSkill({
      id: 'frontend-design',
      body: 'Follow references/layouts.md before building.',
      sideFiles: { 'references/layouts.md': 'LAYOUT_RULES' },
    });
    const frozen = await captureOdNextSessionSkillPackage({
      metadata: { kind: 'prototype' } as ProjectMetadata,
      getLocalPluginBySource: async () => null,
      selection: { skillId: 'frontend-design' },
      listSkillCatalog: async () => [skill],
    });
    expect(frozen.selections[0]?.files.map((file) => file.path))
      .toEqual(['references/layouts.md']);
  });

  describe('never fails or diverts the run', () => {
    it('drops a Skill the catalogue cannot resolve', async () => {
      const frozen = await captureOdNextSessionSkillPackage({
        metadata: { kind: 'prototype' } as ProjectMetadata,
        getLocalPluginBySource: async () => null,
        selection: { skillIds: ['deleted-between-pick-and-run'] },
        listSkillCatalog: async () => [],
      });
      expect(frozen.selections).toEqual([]);
    });

    it('drops the Skills when the catalogue itself will not list', async () => {
      const frozen = await captureOdNextSessionSkillPackage({
        metadata: { kind: 'prototype' } as ProjectMetadata,
        getLocalPluginBySource: async () => null,
        selection: { skillIds: ['frontend-design'] },
        listSkillCatalog: async () => {
          throw new Error('catalogue is offline');
        },
      });
      expect(frozen.selections).toEqual([]);
    });

    it('rejects more Skills than the package bounds allow without losing the card', async () => {
      const dir = path.join(EXAMPLES_DIR, 'web-prototype');
      const catalog = await Promise.all(
        Array.from({ length: 9 }, (_unused, index) => scratchSkill({
          id: `bulk-skill-${index}`,
          body: `BULK_BODY_${index}`,
        })),
      );
      const frozen = await captureOdNextSessionSkillPackage({
        metadata: metadataWithExample({
          dir,
          digest: await digestExampleSkillManifest(dir),
          pluginId: 'example-web-prototype',
        }),
        getLocalPluginBySource: async (id, source) => ({
          id,
          source,
          fsPath: dir,
          title: 'example-web-prototype',
        }),
        selection: { skillIds: catalog.map((skill) => skill.id) },
        listSkillCatalog: async () => catalog,
      });
      // The over-large selection is refused wholesale, but the card the
      // project was created from survives it.
      expect(frozen.selections.map((selection) => selection.name))
        .toEqual(['example-web-prototype']);
    });
  });
});
