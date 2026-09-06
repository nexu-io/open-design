import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  renderActiveStageBlocks,
  type AppliedPluginSnapshot,
  type PluginManifest,
  type PluginPipeline,
} from '@open-design/contracts';
import {
  parseManifest,
  resolveAppliedPipeline,
  type ScenarioRegistryEntry,
} from '@open-design/plugin-runtime';
import { composeSystemPrompt } from '../../src/prompts/system.js';
import { loadAtomBodies } from '../../src/plugins/atom-bodies.js';
import { registerBundledPlugins } from '../../src/plugins/bundled.js';
import { migratePlugins } from '../../src/plugins/persistence.js';
import { pluginPromptBlock } from '../../src/plugins/index.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

// This is the prompt-section golden, not the manifest-stage golden. The
// current bundled registry has prompt bodies for discovery, plan, and
// critique; generate remains frozen separately by the pipeline fixture.
/**
 * `critique-theater` 的 SKILL.md 正文首行,用来证明这一节**真的被内联进来了**
 * (而不是渲染出一个空壳)。
 *
 * W17(2026-09-02)改过一次:原来是 `# Critique Theater`。那份正文当时逐字写着
 * 线格式(`<CRITIQUE_RUN>` / `<PANELIST>` / `<ROUND_END>`)和「Do not emit prose
 * outside the envelope」,而剧场的协议注入 2026-08-26 就已经在总闸上关掉了 ——
 * 模型被要求严格遵守一份它永远拿不到的协议,只好照着这段散文把语法现编出来,
 * 原样打进聊天正文(连撞五次)。现在这一节改成描述质量门槛、不描述线格式,
 * 标题也就跟着变了。判据没变:仍然是"这一节的正文在不在"。
 *
 * 这个 witness 直接调 `loadAtomBodies`,**不过**生产环境那道
 * `plugins/critique-prompt-gate.ts` 的门 —— 它钉的是"把 body 内联进来会长什么样"。
 * "生产环境根本不该内联它"由 `tests/critique-grammar-never-in-prompt.test.ts` 钉。
 * 两条各管一头,别合并。
 */
const CRITIQUE_ATOM_BODY_HEADING = '# Design review';

const expectedQualitySections = [
  '### 4. Pre-Delivery Verification',
  '## Active stage: discovery',
  '### discovery-question-form',
  '## Active stage: plan',
  '### direction-picker',
  '### todo-write',
  '## Active stage: critique',
  '### critique-theater',
];

let db: Database.Database;
let officialManifest: PluginManifest;
let communityManifest: PluginManifest;

function loadManifest(relativePath: string): PluginManifest {
  const parsed = parseManifest(
    readFileSync(path.join(repoRoot, relativePath), 'utf8'),
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.manifest;
}

async function renderStageBlocks(pipeline: PluginPipeline): Promise<string[]> {
  const stageViews = [];
  for (const stage of pipeline.stages) {
    stageViews.push({
      stageId: stage.id,
      bodies: await loadAtomBodies(db, stage.atoms),
    });
  }
  return renderActiveStageBlocks(stageViews);
}

function snapshot(
  manifest: PluginManifest,
  pipeline: PluginPipeline,
): AppliedPluginSnapshot {
  return {
    snapshotId: `snapshot-${manifest.name}`,
    pluginId: manifest.name,
    pluginVersion: manifest.version,
    pluginTitle: manifest.title,
    pluginDescription: manifest.description,
    manifestSourceDigest: 'fixture-digest',
    inputs: {},
    resolvedContext: {
      items: [],
      atoms: pipeline.stages.flatMap((stage) => stage.atoms),
    },
    capabilitiesGranted: [],
    capabilitiesRequired: [],
    assetsStaged: [],
    taskKind: manifest.od?.taskKind ?? 'new-generation',
    appliedAt: 1,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    pipeline,
    status: 'fresh',
  };
}

function qualitySectionGolden(prompt: string): string[] {
  return prompt
    .split('\n')
    .filter((line) => expectedQualitySections.includes(line));
}

async function composeDefaultPrompt(
  manifest: PluginManifest,
  pipeline: PluginPipeline,
): Promise<string> {
  return composeSystemPrompt({
    promptCoreVariant: 'slim',
    pluginBlock: pluginPromptBlock(snapshot(manifest, pipeline)),
    activeStageBlocks: await renderStageBlocks(pipeline),
  });
}

beforeAll(async () => {
  officialManifest = loadManifest(
    'plugins/_official/scenarios/od-new-generation/open-design.json',
  );
  communityManifest = loadManifest(
    'plugins/community/humanize-ppt/open-design.json',
  );
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  const registered = await registerBundledPlugins({
    db,
    bundledRoot: path.join(repoRoot, 'plugins/_official'),
  });
  expect(registered.registered.map((plugin) => plugin.id)).toEqual(
    expect.arrayContaining([
      'discovery-question-form',
      'direction-picker',
      'todo-write',
      'critique-theater',
    ]),
  );
});

afterAll(() => {
  db.close();
});

describe('non-OD-Next default quality prompt witness', () => {
  it('keeps ordinary verification and critique sections in the official scenario prompt', async () => {
    const resolved = resolveAppliedPipeline({ manifest: officialManifest });
    expect(resolved.source).toBe('declared');
    expect(resolved.pipeline).toBeDefined();

    const prompt = await composeDefaultPrompt(
      officialManifest,
      resolved.pipeline!,
    );
    expect(prompt).toContain('`od-new-generation@0.1.0`');
    expect(qualitySectionGolden(prompt)).toEqual(expectedQualitySections);
    expect(prompt).toContain(
      'After completing the design and before delivery, perform one full check',
    );
    expect(prompt).toContain(CRITIQUE_ATOM_BODY_HEADING);
  });

  it('keeps the same quality sections when a community plugin inherits the fallback', async () => {
    if (!officialManifest.od?.taskKind || !officialManifest.od.pipeline) {
      throw new Error('od-new-generation must declare taskKind and pipeline');
    }
    const scenarios: ScenarioRegistryEntry[] = [{
      id: officialManifest.name,
      taskKind: officialManifest.od.taskKind,
      pipeline: officialManifest.od.pipeline,
    }];
    const resolved = resolveAppliedPipeline({
      manifest: communityManifest,
      scenarios,
    });
    expect(resolved).toMatchObject({
      source: 'scenario',
      scenarioId: 'od-new-generation',
    });
    expect(resolved.pipeline).toBeDefined();

    const prompt = await composeDefaultPrompt(
      communityManifest,
      resolved.pipeline!,
    );
    expect(prompt).toContain('`community-humanize-ppt@1.1.2`');
    expect(qualitySectionGolden(prompt)).toEqual(expectedQualitySections);
    expect(prompt).toContain(
      'After completing the design and before delivery, perform one full check',
    );
    expect(prompt).toContain(CRITIQUE_ATOM_BODY_HEADING);
  });
});
