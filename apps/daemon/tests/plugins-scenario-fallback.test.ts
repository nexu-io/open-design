// Spec §23.3.3 / Plan §3.O1 — bundled-scenario pipeline fallback,
// driven through the live applyPlugin path with the daemon
// registry view.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledPluginRecord,
  PluginManifest,
} from '@open-design/contracts';
import { applyPlugin } from '../src/plugins/apply.js';
import { openDatabase } from '../src/db.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';
import { resolveAppliedPipeline, type ScenarioRegistryEntry } from '@open-design/plugin-runtime';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-scenario-fallback-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

const codeMigrationScenarioPipeline = {
  stages: [
    { id: 'import',   atoms: ['code-import'] },
    { id: 'tokens',   atoms: ['design-extract', 'token-map'] },
    { id: 'plan',     atoms: ['rewrite-plan'] },
    { id: 'verify',
      atoms: ['patch-edit', 'build-test'],
      repeat: true,
      until: '(build.passing && tests.passing) || iterations>=8' },
    { id: 'review',   atoms: ['diff-review'] },
    { id: 'handoff',  atoms: ['handoff'] },
  ],
};

const newGenerationScenarioPipeline = {
  stages: [
    { id: 'discovery', atoms: ['discovery-question-form'] },
    { id: 'plan',      atoms: ['direction-picker', 'todo-write'] },
    { id: 'generate',  atoms: ['file-write', 'live-artifact'] },
    { id: 'critique',  atoms: ['critique-theater'],
      repeat: true,
      until: 'critique.score>=4 || iterations>=3' },
  ],
};

const baseRegistry = (
  scenarios: ScenarioRegistryEntry[] = [],
) => ({
  skills: [],
  designSystems: [],
  craft: [],
  atoms: [],
  scenarios,
});

const consumerPlugin = (od: NonNullable<PluginManifest['od']>): InstalledPluginRecord => {
  const manifest: PluginManifest = {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: 'fixture-consumer',
    title: 'Fixture consumer',
    version: '0.1.0',
    od,
  } as PluginManifest;
  return {
    id: 'fixture-consumer',
    title: 'Fixture consumer',
    version: '0.1.0',
    sourceKind: 'local',
    source: '/tmp/fixture',
    fsPath: '/tmp/fixture',
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: Date.now(),
    updatedAt: Date.now(),
    manifest,
  };
};

describe('apply: bundled-scenario pipeline fallback (spec §23.3.3)', () => {
  it("uses the consumer's declared pipeline when present", () => {
    const plugin = consumerPlugin({
      taskKind: 'code-migration',
      pipeline: { stages: [{ id: 'custom', atoms: ['todo-write'] }] },
    });
    const out = applyPlugin({
      plugin,
      inputs: {},
      registry: baseRegistry([
        { id: 'od-code-migration', taskKind: 'code-migration', pipeline: codeMigrationScenarioPipeline },
      ]),
    });
    expect(out.result.pipeline?.stages?.[0]?.id).toBe('custom');
    expect(out.result.appliedPlugin.pipeline?.stages?.[0]?.id).toBe('custom');
  });

  it('falls back to the matching scenario pipeline when the consumer omits it', () => {
    const plugin = consumerPlugin({ taskKind: 'code-migration' });
    const out = applyPlugin({
      plugin,
      inputs: {},
      registry: baseRegistry([
        { id: 'od-new-generation',  taskKind: 'new-generation',  pipeline: newGenerationScenarioPipeline },
        { id: 'od-code-migration',  taskKind: 'code-migration',  pipeline: codeMigrationScenarioPipeline },
      ]),
    });
    expect(out.result.pipeline?.stages?.map((s) => s.id)).toEqual([
      'import', 'tokens', 'plan', 'verify', 'review', 'handoff',
    ]);
    // Snapshot must carry the same fallback-resolved pipeline so a
    // replay reproduces the same stages without consulting the
    // scenario registry again.
    expect(out.result.appliedPlugin.pipeline).toEqual(out.result.pipeline);
  });

  it("defaults to 'new-generation' when the consumer omits both pipeline and taskKind", () => {
    const plugin = consumerPlugin({});
    const out = applyPlugin({
      plugin,
      inputs: {},
      registry: baseRegistry([
        { id: 'od-new-generation', taskKind: 'new-generation', pipeline: newGenerationScenarioPipeline },
      ]),
    });
    expect(out.result.pipeline?.stages?.[0]?.id).toBe('discovery');
  });

  it('keeps pipeline undefined when no scenario matches the taskKind', () => {
    const plugin = consumerPlugin({ taskKind: 'code-migration' });
    const out = applyPlugin({ plugin, inputs: {}, registry: baseRegistry([]) });
    expect(out.result.pipeline).toBeUndefined();
    expect(out.result.appliedPlugin.pipeline).toBeUndefined();
  });

  it("does not fall back when the consumer is itself a scenario plugin", () => {
    const plugin = consumerPlugin({
      kind: 'scenario',
      taskKind: 'new-generation',
    });
    const out = applyPlugin({
      plugin,
      inputs: {},
      registry: baseRegistry([
        { id: 'od-new-generation', taskKind: 'new-generation', pipeline: newGenerationScenarioPipeline },
      ]),
    });
    expect(out.result.pipeline).toBeUndefined();
  });

  it('produces stable manifestSourceDigest across two applies of the consumer + same registry', () => {
    const plugin = consumerPlugin({ taskKind: 'code-migration' });
    const reg = baseRegistry([
      { id: 'od-code-migration', taskKind: 'code-migration', pipeline: codeMigrationScenarioPipeline },
    ]);
    const a = applyPlugin({ plugin, inputs: {}, registry: reg });
    const b = applyPlugin({ plugin, inputs: {}, registry: reg });
    // The fallback does not alter the manifestSourceDigest input
    // (digest covers the manifest + inputs + resolvedContext refs;
    // pipeline source is downstream). e2e-2 invariant holds.
    expect(a.manifestSourceDigest).toBe(b.manifestSourceDigest);
  });
});

describe('daemon scenarios collector (registry view source)', () => {
  it('handles a fresh DB without scenarios installed', async () => {
    const dataDir = path.join(tmpRoot, 'fresh');
    await mkdir(dataDir, { recursive: true });
    const db = openDatabase(tmpRoot, { dataDir });
    expect(
      db.prepare("SELECT count(*) as c FROM installed_plugins").get(),
    ).toEqual({ c: 0 });
    db.close();
  });

  it('reads bundled-scenario rows from installed_plugins', async () => {
    const dataDir = path.join(tmpRoot, 'scenario');
    await mkdir(dataDir, { recursive: true });
    const db = openDatabase(tmpRoot, { dataDir });
    const folder = path.join(tmpRoot, 'od-code-migration');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'open-design.json'), JSON.stringify({
      name: 'od-code-migration',
      version: '0.0.1',
      od: {
        kind: 'scenario',
        taskKind: 'code-migration',
        pipeline: codeMigrationScenarioPipeline,
      },
    }));
    upsertInstalledPlugin(db, {
      id: 'od-code-migration',
      title: 'Code migration scenario',
      version: '0.0.1',
      sourceKind: 'bundled',
      source: folder,
      fsPath: folder,
      trust: 'bundled',
      capabilitiesGranted: [],
      installedAt: Date.now(),
      updatedAt: Date.now(),
      manifest: {
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: 'od-code-migration',
        version: '0.0.1',
        od: {
          kind: 'scenario',
          taskKind: 'code-migration',
          pipeline: codeMigrationScenarioPipeline,
        },
      } as PluginManifest,
    });
    // Direct read mirrors what loadPluginRegistryView does, sanity-
    // checking the round trip.
    const rows = db.prepare(
      "SELECT id, source_kind, manifest_json FROM installed_plugins WHERE source_kind='bundled'"
    ).all() as Array<{ id: string; source_kind: string; manifest_json: string }>;
    expect(rows.length).toBe(1);
    const manifest = JSON.parse(rows[0]!.manifest_json) as PluginManifest;
    expect(manifest.od?.kind).toBe('scenario');
    expect(resolveAppliedPipeline({
      manifest: { $schema: '', name: 'consumer', version: '0.1.0', od: { taskKind: 'code-migration' } } as PluginManifest,
      scenarios: [{ id: 'od-code-migration', taskKind: 'code-migration', pipeline: manifest.od!.pipeline! }],
    }).source).toBe('scenario');
    db.close();
  });
});
