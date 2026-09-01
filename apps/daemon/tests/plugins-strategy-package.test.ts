import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, cp, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { migratePlugins } from '../src/plugins/persistence.js';
import { resolvePluginFolder } from '../src/plugins/registry.js';
import {
  StrategyPackageAssetPathError,
  createBundledStrategyBindingV2,
  loadBundledStrategyPromptAssetsV2,
} from '../src/plugins/strategy-package.js';
import { resolvePluginSnapshot } from '../src/plugins/resolve-snapshot.js';

const SOURCE = path.resolve(
  import.meta.dirname,
  '../../../plugins/_official/scenarios/od-next-strategy',
);
const REGISTRY = {
  skills: [],
  designSystems: [],
  craft: [],
  atoms: [],
  scenarios: [],
};

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-strategy-package-'));
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Project 1');
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

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

describe('bundled OD Next strategy package identity', () => {
  it('reads only the explicit manifest, skill, core, orchestration, selected profile, its resources, and reference', async () => {
    const plugin = await resolveStrategyRecord();
    const prototype = createBundledStrategyBindingV2({ plugin, taskType: 'prototype' });
    const repeated = createBundledStrategyBindingV2({ plugin, taskType: 'prototype' });
    const hyperframes = createBundledStrategyBindingV2({ plugin, taskType: 'hyperframes' });

    expect(repeated).toEqual(prototype);
    expect(prototype.assetDigests.map((asset) => asset.path)).toEqual([
      './SKILL.md',
      './assets/core-system-prompt.md',
      './assets/general-orchestration.md',
      './assets/task-profiles/prototype.md',
      './assets/task-profiles/prototype/device-frames/android.html',
      './assets/task-profiles/prototype/device-frames/iphone.html',
      './assets/task-profiles/prototype/device-frames/neutral.html',
      './assets/task-profiles/prototype/layout.css',
      './open-design.json',
      './references/task-profile-mapping.md',
    ]);
    // Resources travel with the profile that declares them only.
    expect(hyperframes.assetDigests.map((asset) => asset.path)).toEqual([
      './SKILL.md',
      './assets/core-system-prompt.md',
      './assets/general-orchestration.md',
      './assets/task-profiles/hyperframes.md',
      './open-design.json',
      './references/task-profile-mapping.md',
    ]);
    expect(prototype.selectedTaskProfile).toEqual(expect.objectContaining({
      taskType: 'prototype',
      version: '2.2.0',
      path: './assets/task-profiles/prototype.md',
    }));
    expect(hyperframes.packageHash).not.toBe(prototype.packageHash);
    expect(hyperframes.selectedTaskProfile.sha256).not.toBe(
      prototype.selectedTaskProfile.sha256,
    );
  });

  it('decodes the prototype device shells as task resources and locks them into the package identity', async () => {
    const plugin = await resolveStrategyRecord();
    const binding = createBundledStrategyBindingV2({ plugin, taskType: 'prototype' });
    const assets = loadBundledStrategyPromptAssetsV2({ plugin, binding });
    expect(assets.taskResources.map((resource) => resource.path)).toEqual([
      './assets/task-profiles/prototype/device-frames/iphone.html',
      './assets/task-profiles/prototype/device-frames/android.html',
      './assets/task-profiles/prototype/device-frames/neutral.html',
      './assets/task-profiles/prototype/layout.css',
    ]);
    for (const resource of assets.taskResources) {
      if (resource.path.endsWith('layout.css')) {
        expect(resource.text).toContain('OD-LAYOUT-PRIMITIVES v1');
        expect(resource.text).toContain('@layer od-layout');
        expect(resource.text).not.toMatch(/color\s*:|font-family|border-radius|box-shadow/);
        continue;
      }
      expect(resource.text).toContain('data-phone-shell');
      expect(resource.text).toContain('APP CONTENT START');
      expect(resource.text).toContain('class="phone-content"');
    }
    expect(loadBundledStrategyPromptAssetsV2({
      plugin,
      binding: createBundledStrategyBindingV2({ plugin, taskType: 'hyperframes' }),
    }).taskResources).toEqual([]);

    // A shell edit moves the prototype package hash exactly like a rule-card
    // edit, and leaves a profile that does not declare the shell untouched.
    const folder = path.join(tmpDir, 'strategy');
    await cp(SOURCE, folder, { recursive: true });
    const copied = await resolveStrategyRecord(folder);
    const prototypeBaseline = createBundledStrategyBindingV2({ plugin: copied, taskType: 'prototype' });
    const hyperframesBaseline = createBundledStrategyBindingV2({ plugin: copied, taskType: 'hyperframes' });
    const shellPath = path.join(folder, 'assets/task-profiles/prototype/device-frames/neutral.html');
    await writeFile(shellPath, `${await readFile(shellPath, 'utf8')}\n<!-- edited -->\n`);
    expect(createBundledStrategyBindingV2({ plugin: copied, taskType: 'prototype' }).packageHash)
      .not.toBe(prototypeBaseline.packageHash);
    expect(createBundledStrategyBindingV2({ plugin: copied, taskType: 'hyperframes' }).packageHash)
      .toBe(hyperframesBaseline.packageHash);
    expect(() => loadBundledStrategyPromptAssetsV2({ plugin: copied, binding: prototypeBaseline }))
      .toThrow(/no longer matches/i);
  });

  it('changes for a declared byte but ignores an undeclared file', async () => {
    const folder = path.join(tmpDir, 'strategy');
    await cp(SOURCE, folder, { recursive: true });
    const plugin = await resolveStrategyRecord(folder);
    const baseline = createBundledStrategyBindingV2({ plugin, taskType: 'prototype' });

    await writeFile(path.join(folder, 'undeclared.txt'), 'not part of identity');
    expect(createBundledStrategyBindingV2({ plugin, taskType: 'prototype' }).packageHash)
      .toBe(baseline.packageHash);

    const referencePath = path.join(folder, 'references/task-profile-mapping.md');
    const reference = await readFile(referencePath);
    const changedReference = Buffer.from(reference);
    changedReference[0] = changedReference[0] === 0x23 ? 0x20 : 0x23;
    await writeFile(referencePath, changedReference);
    expect(createBundledStrategyBindingV2({ plugin, taskType: 'prototype' }).packageHash)
      .not.toBe(baseline.packageHash);
    await writeFile(referencePath, reference);

    const corePath = path.join(folder, 'assets/core-system-prompt.md');
    const core = await readFile(corePath);
    core[0] = core[0] === 0x23 ? 0x20 : 0x23;
    await writeFile(corePath, core);
    expect(createBundledStrategyBindingV2({ plugin, taskType: 'prototype' }).packageHash)
      .not.toBe(baseline.packageHash);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'normalizes an unreadable declared asset into the narrow identity error',
    async () => {
      const folder = path.join(tmpDir, 'strategy');
      await cp(SOURCE, folder, { recursive: true });
      const plugin = await resolveStrategyRecord(folder);
      const corePath = path.join(folder, 'assets/core-system-prompt.md');
      await chmod(corePath, 0o000);
      try {
        expect(() => createBundledStrategyBindingV2({
          plugin,
          taskType: 'prototype',
        })).toThrow(/unavailable/i);
      } finally {
        await chmod(corePath, 0o600);
      }
    },
  );

  it.each(['../escape.md', '/absolute.md'])('rejects declaration path %s', async (assetPath) => {
    const plugin = await resolveStrategyRecord();
    const strategy = (plugin.manifest.od as Record<string, unknown>)['strategy'] as {
      assets: { core: { path: string } };
    };
    const mutated: InstalledPluginRecord = {
      ...plugin,
      manifest: {
        ...plugin.manifest,
        od: {
          ...plugin.manifest.od,
          strategy: {
            ...strategy,
            assets: {
              ...strategy.assets,
              core: { ...strategy.assets.core, path: assetPath },
            },
          },
        },
      },
    };

    expect(() => createBundledStrategyBindingV2({
      plugin: mutated,
      taskType: 'prototype',
    })).toThrow(StrategyPackageAssetPathError);
  });

  it.skipIf(process.platform === 'win32')('rejects a declared symlink that escapes the plugin root', async () => {
    const folder = path.join(tmpDir, 'strategy');
    await cp(SOURCE, folder, { recursive: true });
    const outside = path.join(tmpDir, 'outside.md');
    await writeFile(outside, 'outside bytes');
    const corePath = path.join(folder, 'assets/core-system-prompt.md');
    await unlink(corePath);
    await symlink(outside, corePath);
    const plugin = await resolveStrategyRecord(folder);

    expect(() => createBundledStrategyBindingV2({
      plugin,
      taskType: 'prototype',
    })).toThrow(/symbolic link|escape/i);
  });

  it.skipIf(process.platform === 'win32')('rejects an intermediate symlink before reading a declared asset', async () => {
    const folder = path.join(tmpDir, 'strategy');
    await cp(SOURCE, folder, { recursive: true });
    const plugin = await resolveStrategyRecord(folder);
    const outsideAssets = path.join(tmpDir, 'outside-assets');
    await cp(path.join(folder, 'assets'), outsideAssets, { recursive: true });
    await rm(path.join(folder, 'assets'), { recursive: true });
    await symlink(outsideAssets, path.join(folder, 'assets'));

    expect(() => createBundledStrategyBindingV2({
      plugin,
      taskType: 'prototype',
    })).toThrow(/symbolic link|escape/i);
  });
});

describe('hash-gated internal strategy activation and snapshot persistence', () => {
  it('keeps ordinary apply closed and persists a verified binding only through the internal owner', async () => {
    const plugin = await resolveStrategyRecord();
    const unavailableThroughRegistry = resolvePluginSnapshot({
      db,
      body: { pluginId: 'od-next-strategy' },
      projectId: 'project-1',
      registry: REGISTRY,
    });
    expect(unavailableThroughRegistry).toEqual(expect.objectContaining({
      ok: false,
      body: { error: expect.objectContaining({ code: 'plugin-not-found' }) },
    }));

    const ordinary = resolvePluginSnapshot({
      db,
      body: { pluginId: 'od-next-strategy' },
      projectId: 'project-1',
      plugin,
      registry: REGISTRY,
    });
    expect(ordinary).toEqual(expect.objectContaining({
      ok: false,
      body: { error: expect.objectContaining({ code: 'strategy-inactive' }) },
    }));

    const activated = resolvePluginSnapshot({
      db,
      body: { pluginId: 'od-next-strategy' },
      projectId: 'project-1',
      registry: REGISTRY,
      internalStrategyActivation: { taskType: 'prototype', plugin },
    });
    expect(activated).toEqual(expect.objectContaining({ ok: true, created: true }));
    if (!activated || !activated.ok) throw new Error('expected strategy snapshot');
    expect(activated.snapshot.strategy).toEqual(expect.objectContaining({
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      selectedTaskProfile: expect.objectContaining({ taskType: 'prototype' }),
    }));
    expect(activated.applyResult?.appliedPlugin.strategy).toEqual(
      activated.snapshot.strategy,
    );
  });

  it('normalizes missing declared content into a structured fail-closed result', async () => {
    const folder = path.join(tmpDir, 'strategy');
    await cp(SOURCE, folder, { recursive: true });
    const plugin = await resolveStrategyRecord(folder);
    await unlink(path.join(folder, 'assets/core-system-prompt.md'));

    const result = resolvePluginSnapshot({
      db,
      body: { pluginId: 'od-next-strategy' },
      projectId: 'project-1',
      registry: REGISTRY,
      internalStrategyActivation: { taskType: 'prototype', plugin },
    });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      body: { error: expect.objectContaining({ code: 'strategy-content-invalid' }) },
    }));
  });
});
