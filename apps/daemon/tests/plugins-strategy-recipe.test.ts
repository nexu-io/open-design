import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  composeSystemPrompt as composeContractsSystemPrompt,
  type AppliedPluginSnapshot,
  type InstalledPluginRecord,
  type OdNextStrategyRequestRecipeV2,
  type PluginPipeline,
} from '@open-design/contracts';
import { applyPlugin, InternalBundledStrategyApplyError } from '../src/plugins/apply.js';
import { loadBundledAtomBodiesStrict } from '../src/plugins/atom-bodies.js';
import { registerBundledPlugins } from '../src/plugins/bundled.js';
import { migratePlugins } from '../src/plugins/persistence.js';
import { resolvePluginFolder } from '../src/plugins/registry.js';
import {
  InvalidOdNextStrategyPromptRecipeV2Error,
  resolveOdNextStrategyRequestRecipeV2,
} from '../src/plugins/strategy-recipe.js';
import { createBundledStrategyBindingV2 } from '../src/plugins/strategy-package.js';
import { enforceOdNextStrategyPipelineV2 } from '../src/plugins/strategy-stage-policy.js';
import { buildPromptStackTelemetry } from '../src/prompt-telemetry.js';
import { computeStableSectionHashes } from '../src/prompts/stable-sections.js';
import { composeSystemPrompt } from '../src/prompts/system.js';
import { loadCraftSections } from '../src/craft.js';

const BUNDLED_ROOT = path.resolve(import.meta.dirname, '../../../plugins/_official');
const CRAFT_ROOT = path.resolve(import.meta.dirname, '../../../craft');
const SOURCE = path.join(BUNDLED_ROOT, 'scenarios/od-next-strategy');
const EMPTY_REGISTRY = {
  skills: [],
  designSystems: [],
  craft: [],
  atoms: [],
  scenarios: [],
};

let db: Database.Database;
let plugin: InstalledPluginRecord;
let snapshot: AppliedPluginSnapshot;

async function resolveStrategyRecord(folder = SOURCE): Promise<InstalledPluginRecord> {
  const resolved = await resolvePluginFolder({
    folder,
    folderId: 'od-next-strategy',
    sourceKind: 'bundled',
    source: folder,
    trust: 'bundled',
  });
  if (!resolved.ok) throw new Error(resolved.errors.join('; '));
  return resolved.record;
}

async function resolveRecipe(input: {
  activeSnapshot?: AppliedPluginSnapshot;
  bundledPluginsDir?: string;
  enabled?: boolean;
  loadAtomBodies?: typeof loadBundledAtomBodiesStrict;
} = {}): Promise<OdNextStrategyRequestRecipeV2 | null> {
  const loader = input.loadAtomBodies ?? loadBundledAtomBodiesStrict;
  return resolveOdNextStrategyRequestRecipeV2({
    bundledPluginsDir: input.bundledPluginsDir ?? BUNDLED_ROOT,
    snapshot: input.activeSnapshot ?? snapshot,
    executionProfile: 'filesystem',
    atomPromptsEnabled: input.enabled ?? true,
    loadAtomBodies: (ids) => loader(db, ids),
  });
}

beforeAll(async () => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  const registered = await registerBundledPlugins({ db, bundledRoot: BUNDLED_ROOT });
  expect(registered.registered.map((record) => record.id)).toEqual(
    expect.arrayContaining([
      'discovery-question-form',
      'direction-picker',
      'todo-write',
    ]),
  );
  plugin = await resolveStrategyRecord();
  const binding = createBundledStrategyBindingV2({ plugin, taskType: 'prototype' });
  snapshot = applyPlugin({
    plugin,
    inputs: {},
    registry: EMPTY_REGISTRY,
    internalStrategyBinding: binding,
  }).result.appliedPlugin;
  snapshot = { ...snapshot, snapshotId: 'snapshot-daemon-recipe' };
});

afterAll(() => {
  db.close();
});

describe('OD Next V2 request recipe wiring', () => {
  it('composes the real package and atom bodies as one planning/Build-only golden', async () => {
    const recipe = await resolveRecipe();
    expect(recipe).not.toBeNull();
    if (!recipe) throw new Error('expected OD Next recipe');

    const stableContext = {
      agentId: 'codex',
      sessionMode: 'design' as const,
      locale: 'zh-CN',
      metadata: {
        kind: 'prototype' as const,
        fidelity: 'high-fidelity' as const,
        platform: 'responsive' as const,
      },
      template: {
        id: 'operations-template',
        name: 'Operations console',
        createdAt: 1,
        files: [{ name: 'operations.html', content: '<main>Real project template</main>' }],
      },
      designSystemTitle: 'Acme Brand',
      designSystemBody: '# Acme Design\n\nCobalt actions and compact surfaces.',
      designSystemTokensCss: ':root { --brand-primary: #1255ee; }',
      memoryBody: 'The user prefers compact operator interfaces.',
      userInstructions: 'Use concise product language.',
      projectInstructions: 'Prioritize incident triage.',
    };
    const prompt = composeSystemPrompt({ odNextStrategyRecipe: recipe, ...stableContext });
    expect(prompt).toBe(composeContractsSystemPrompt({
      odNextStrategyRecipe: recipe,
      ...stableContext,
    }));
    expect(prompt.match(/^## Task Skill —/gm)).toHaveLength(1);
    expect(prompt).toContain('"fidelity": "high-fidelity"');
    expect(prompt).toContain('Real project template');
    expect(prompt).toContain('Acme Brand');
    expect(prompt).toContain('--brand-primary');
    expect(prompt).toContain('compact operator interfaces');
    expect(prompt).toContain('Use concise product language.');
    expect(prompt).toContain('Prioritize incident triage.');
    expect(prompt).toContain('open-design.plan-contract/v2');
    expect(prompt).toContain('open-design.strategy-state/v2');
    expect(prompt).toContain('capabilitySnapshotHash');
    expect(prompt).toContain('productionRoutes');
    expect(prompt).toContain('decisionSummary');
    expect(prompt.split('\n').filter((line) => (
      line.startsWith('## Active stage:') || line.startsWith('### ')
    ))).toEqual(expect.arrayContaining([
      '## Active stage: discovery',
      '### discovery-question-form',
      '## Active stage: plan',
      '### direction-picker',
      '### todo-write',
      '## Active stage: generate',
      '### file-write',
      '### live-artifact',
    ]));

    const forbidden = [
      /acceptanceChecklist/i,
      /evidence[ -]plan/i,
      /quality[ -]score/i,
      /judge(?:[ -]agent)?/i,
      /artifact[ -]repair/i,
      /candidate[ -]evidence[ -]bundle/i,
      /completion[ -]gate/i,
      /final[ -]evidence[ -]bundle/i,
      /repair[ -]required/i,
      /\bverification\b/i,
      /\bchecklist\b/i,
      /\brepeat\b[^\n]{0,60}\b(?:review|critique|verification)\b/i,
      /\bcritique\b/i,
      /revalidation/i,
      /post[- ]build[\s\S]{0,80}(?:verify|inspect|check|review)/i,
      /(?:screenshot|browser|dom)[\s\S]{0,80}(?:verify|inspect|check|review)/i,
    ];
    for (const pattern of forbidden) expect(prompt).not.toMatch(pattern);
  });

  it('keeps a forged local plugin on the ordinary quality pipeline and out of the recipe', async () => {
    const local: InstalledPluginRecord = {
      ...plugin,
      sourceKind: 'local',
      source: SOURCE,
      trust: 'trusted',
    };
    const ordinary = applyPlugin({
      plugin: local,
      inputs: {},
      registry: EMPTY_REGISTRY,
    }).result.appliedPlugin;
    expect(ordinary.strategy).toBeUndefined();
    expect(ordinary.pipeline?.stages.map((stage) => stage.id)).toEqual([
      'discovery',
      'plan',
      'generate',
      'critique',
    ]);
    expect(await resolveRecipe({ activeSnapshot: ordinary })).toBeNull();
    expect(() => applyPlugin({
      plugin: local,
      inputs: {},
      registry: EMPTY_REGISTRY,
      internalStrategyBinding: snapshot.strategy ?? undefined,
    })).toThrow(InternalBundledStrategyApplyError);
  });

  it('fails closed when atom prompts are disabled, incomplete, or contaminated', async () => {
    await expect(resolveRecipe({ enabled: false })).rejects.toThrow(
      /atom prompts are disabled/i,
    );
    await expect(resolveRecipe({
      loadAtomBodies: async (database, atomIds) => (
        (await loadBundledAtomBodiesStrict(database, atomIds))
          .filter((entry) => entry.atomId !== 'direction-picker')
      ),
    })).rejects.toThrow(/direction-picker/i);

    await expect(resolveRecipe({
      loadAtomBodies: async (database, atomIds) => (
        (await loadBundledAtomBodiesStrict(database, atomIds)).map((entry) => (
          entry.atomId === 'todo-write'
            ? { ...entry, body: `${entry.body}\n\n# Critique Theater` }
            : entry
        ))
      ),
    })).rejects.toThrow(/forbidden/i);

    await expect(resolveRecipe({
      loadAtomBodies: async (database, atomIds) => (
        (await loadBundledAtomBodiesStrict(database, atomIds)).map((entry) => (
          entry.atomId === 'todo-write'
            ? { ...entry, body: `${entry.body}\n\n### Hidden subsection` }
            : entry
        ))
      ),
    })).rejects.toThrow(/unexpected subsection heading/i);

    await expect(resolveRecipe({
      loadAtomBodies: async (database, atomIds) => (
        (await loadBundledAtomBodiesStrict(database, atomIds)).map((entry) => (
          entry.atomId === 'todo-write'
            ? {
                ...entry,
                body: `${entry.body}\n\nRender-and-inspect using a browser screenshot of the DOM, then fix after inspection.`,
              }
            : entry
        ))
      ),
    })).rejects.toThrow(/forbidden/i);
  });

  it('fails closed when a real loaded craft section restores a post-Build loop', async () => {
    const recipe = await resolveRecipe();
    expect(recipe).not.toBeNull();
    if (!recipe) throw new Error('expected OD Next recipe');

    const craft = await loadCraftSections(CRAFT_ROOT, ['state-coverage']);
    expect(craft.sections).toEqual(['state-coverage']);
    expect(craft.body).toContain('Render-and-screenshot test');
    expect(() => composeSystemPrompt({
      odNextStrategyRecipe: recipe,
      craftBody: craft.body,
      craftSections: craft.sections,
    })).toThrow(/active-craft-guidance.*forbidden render-and-screenshot test/i);

    expect(() => composeSystemPrompt({
      odNextStrategyRecipe: recipe,
      craftBody: 'Render loading, empty, error, populated, and edge states in the artifact.',
      craftSections: ['state-coverage'],
    })).not.toThrow();
  });

  it('rejects package, profile, and pipeline drift instead of falling back', async () => {
    await expect(resolveRecipe({
      activeSnapshot: { ...snapshot, snapshotId: '' },
    })).rejects.toThrow(/snapshot id is unavailable/i);

    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'od-next-recipe-'));
    try {
      const folder = path.join(tempRoot, 'scenarios/od-next-strategy');
      await cp(SOURCE, folder, { recursive: true });
      const copiedPlugin = await resolveStrategyRecord(folder);
      const copiedBinding = createBundledStrategyBindingV2({
        plugin: copiedPlugin,
        taskType: 'prototype',
      });
      const copiedSnapshot = {
        ...applyPlugin({
          plugin: copiedPlugin,
          inputs: {},
          registry: EMPTY_REGISTRY,
          internalStrategyBinding: copiedBinding,
        }).result.appliedPlugin,
        snapshotId: 'snapshot-copied-recipe',
      };

      await writeFile(
        path.join(folder, 'assets/core-system-prompt.md'),
        '# drifted core\n',
      );
      await expect(resolveRecipe({
        activeSnapshot: copiedSnapshot,
        bundledPluginsDir: tempRoot,
      })).rejects.toThrow(/no longer matches/i);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }

    const profileDrift: AppliedPluginSnapshot = {
      ...snapshot,
      strategy: {
        ...snapshot.strategy!,
        selectedTaskProfile: {
          ...snapshot.strategy!.selectedTaskProfile,
          sha256: 'f'.repeat(64),
        },
      },
    };
    await expect(resolveRecipe({ activeSnapshot: profileDrift })).rejects.toThrow(
      InvalidOdNextStrategyPromptRecipeV2Error,
    );

    const pipelineDrift: AppliedPluginSnapshot = {
      ...snapshot,
      pipeline: {
        stages: [
          ...snapshot.pipeline!.stages,
          { id: 'critique', atoms: ['critique-theater'], repeat: true },
        ],
      },
    };
    await expect(resolveRecipe({ activeSnapshot: pipelineDrift })).rejects.toThrow(
      /exactly discovery, plan, and generate/i,
    );

    const topLevelPollution = {
      ...snapshot.pipeline,
      repair: { enabled: true },
    } as PluginPipeline;
    expect(() => enforceOdNextStrategyPipelineV2({
      plugin,
      binding: snapshot.strategy!,
      pipeline: topLevelPollution,
    })).toThrow(/unsupported top-level policy fields/i);

    const stagePollution = {
      stages: snapshot.pipeline!.stages.map((stage, index) => (
        index === 2 ? { ...stage, acceptanceChecklist: ['review artifact'] } : stage
      )),
    } as PluginPipeline;
    expect(() => enforceOdNextStrategyPipelineV2({
      plugin,
      binding: snapshot.strategy!,
      pipeline: stagePollution,
    })).toThrow(/generate contract/i);
  });

  it('attributes package/profile identity changes in stable and prompt telemetry', async () => {
    const recipe = await resolveRecipe();
    expect(recipe).not.toBeNull();
    if (!recipe) throw new Error('expected OD Next recipe');
    const packageChanged = { ...recipe, packageHash: 'e'.repeat(64) };
    const profileChanged = { ...recipe, taskProfileDigest: 'd'.repeat(64) };

    const stable = computeStableSectionHashes({ odNextStrategyRecipe: recipe });
    expect(computeStableSectionHashes({
      odNextStrategyRecipe: packageChanged,
    }).strategy).not.toBe(stable.strategy);
    expect(computeStableSectionHashes({
      odNextStrategyRecipe: profileChanged,
    }).strategy).not.toBe(stable.strategy);

    const prompt = composeSystemPrompt({ odNextStrategyRecipe: recipe });
    const changedPrompt = composeSystemPrompt({ odNextStrategyRecipe: packageChanged });
    const telemetry = buildPromptStackTelemetry({
      composedPrompt: prompt,
      sections: [{ kind: 'clientSystemPrompt', content: prompt }],
    });
    const changedTelemetry = buildPromptStackTelemetry({
      composedPrompt: changedPrompt,
      sections: [{ kind: 'clientSystemPrompt', content: changedPrompt }],
    });
    expect(changedTelemetry.promptFingerprint).not.toBe(telemetry.promptFingerprint);
    expect(changedTelemetry.sections[0]?.fingerprint).not.toBe(
      telemetry.sections[0]?.fingerprint,
    );

    const contextInputs = {
      odNextStrategyRecipe: recipe,
      metadata: { kind: 'prototype' as const, fidelity: 'high-fidelity' as const },
      template: {
        id: 'template-a',
        name: 'Template A',
        createdAt: 1,
        files: [{ name: 'a.html', content: '<main>A</main>' }],
      },
      designSystemTitle: 'Brand A',
      designSystemBody: '# Brand A',
      memoryBody: 'Prefers compact layouts.',
      userInstructions: 'Use terse labels.',
      projectInstructions: 'Focus on triage.',
      locale: 'en',
      agentId: 'codex',
      sessionMode: 'design' as const,
    };
    const contextStable = computeStableSectionHashes(contextInputs);
    const contextCases = [
      [{ ...contextInputs, metadata: { ...contextInputs.metadata, fidelity: 'wireframe' as const } }, 'intent'],
      [{ ...contextInputs, designSystemBody: '# Brand B' }, 'design-system'],
      [{ ...contextInputs, memoryBody: 'Prefers generous layouts.' }, 'memory'],
      [{ ...contextInputs, userInstructions: 'Use detailed labels.' }, 'instructions'],
      [{ ...contextInputs, locale: 'zh-CN' }, 'locale'],
    ] as const;
    const baselineContextPrompt = composeSystemPrompt(contextInputs);
    for (const [changedInputs, expectedSection] of contextCases) {
      expect(computeStableSectionHashes(changedInputs)[expectedSection]).not.toBe(
        contextStable[expectedSection],
      );
      const nextPrompt = composeSystemPrompt(changedInputs);
      expect(nextPrompt).not.toBe(baselineContextPrompt);
      const nextTelemetry = buildPromptStackTelemetry({
        composedPrompt: nextPrompt,
        sections: [{ kind: 'clientSystemPrompt', content: nextPrompt }],
      });
      expect(nextTelemetry.promptFingerprint).not.toBe(
        buildPromptStackTelemetry({
          composedPrompt: baselineContextPrompt,
          sections: [{ kind: 'clientSystemPrompt', content: baselineContextPrompt }],
        }).promptFingerprint,
      );
    }
  });
});
