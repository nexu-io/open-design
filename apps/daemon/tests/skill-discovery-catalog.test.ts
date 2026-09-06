import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { InstalledPluginRecord } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolvePluginFolder } from '../src/plugins/registry.js';
import { parseFrontmatter } from '../src/design-systems/frontmatter.js';
import { checkPromptArgvBudget } from '../src/runtimes/prompt-budget.js';
import { aiderAgentDef } from '../src/runtimes/defs/aider.js';
import {
  OfficialSkillDiscoveryCatalogError,
  readOfficialSkillDiscoveryCatalogV1,
  readOfficialSkillDiscoveryPromptContextV1,
  renderOfficialSkillDiscoveryCatalogMarkdownV1,
  resolveOfficialSkillDiscoveryLoadV1,
  resolveOfficialSkillDiscoveryResourceBundleV1,
  searchOfficialSkillDiscoveryCatalogV1,
} from '../src/skill-discovery/catalog.js';

const STRATEGY_SOURCE = path.resolve(
  import.meta.dirname,
  '../../../plugins/_official/scenarios/od-next-strategy',
);
const FUNCTIONAL_SKILLS_ROOT = path.resolve(import.meta.dirname, '../../../skills');
const DESIGN_TEMPLATES_ROOT = path.resolve(import.meta.dirname, '../../../design-templates');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-skill-discovery-catalog-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function resolveStrategyRecord(folder = STRATEGY_SOURCE): Promise<InstalledPluginRecord> {
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

async function createFunctionalSkill(input: {
  root: string;
  sourceFolder: string;
  id?: string;
  body?: string;
  resources?: Record<string, string>;
}): Promise<void> {
  const id = input.id ?? input.sourceFolder;
  const folder = path.join(input.root, input.sourceFolder);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'SKILL.md'), `---
name: ${id}
description: Official ${id} workflow
---

${input.body ?? `Follow the ${id} workflow.`}
`, 'utf8');
  for (const [relativePath, content] of Object.entries(input.resources ?? {})) {
    const target = path.join(folder, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

function functionalDeclaration(input: {
  sourceFolder: string;
  id?: string;
  resources?: string[];
  role?: string;
}) {
  const id = input.id ?? input.sourceFolder;
  return {
    sourceFolder: input.sourceFolder,
    id,
    autoSelectable: true,
    role: input.role ?? 'auxiliary',
    outputKinds: ['prototype'],
    positiveExamples: [`use ${id}`],
    negativeExamples: [
      `Explain ${id} without creating or changing anything.`,
      `Analyze ${id}, but do not perform the workflow.`,
    ],
    conflictsWith: [],
    version: '1.0.0',
    resources: input.resources ?? [],
  };
}

async function writeFunctionalCatalog(
  strategyFolder: string,
  skills: unknown[],
): Promise<void> {
  await writeFile(
    path.join(strategyFolder, 'agent-discovery/functional-catalog.json'),
    `${JSON.stringify({
      schema: 'open-design.official-functional-skill-discovery-catalog/v1',
      version: '1.0.0',
      skills,
    }, null, 2)}\n`,
    'utf8',
  );
}

async function readOfficialRootIdentity(root: string): Promise<{
  sourceFolders: string[];
  ids: string[];
}> {
  const entries = await readdir(root, { withFileTypes: true });
  const identities: Array<{ sourceFolder: string; id: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, 'SKILL.md');
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseFrontmatter(raw);
    if (typeof parsed.data['name'] !== 'string') {
      throw new Error(`Official Skill ${entry.name} has no canonical name.`);
    }
    identities.push({ sourceFolder: entry.name, id: parsed.data['name'] });
  }
  return {
    sourceFolders: identities.map((identity) => identity.sourceFolder).sort(),
    ids: identities.map((identity) => identity.id).sort(),
  };
}

describe('official Skill Discovery catalog v1', () => {
  it('keeps discovery bootstrap independent from the frozen OD Next v2 package identity', async () => {
    const [manifest, discoverySkill] = await Promise.all([
      readFile(path.join(STRATEGY_SOURCE, 'open-design.json'), 'utf8'),
      readFile(path.join(STRATEGY_SOURCE, 'agent-discovery/SKILL.md'), 'utf8'),
    ]);
    expect(manifest).not.toContain('agent-discovery');
    expect(discoverySkill).toContain('Wrong selection is more harmful than a missed selection');
    expect(discoverySkill).toContain('tools skills resolve --none');
    expect(discoverySkill).toContain('same Agent turn');
    expect(discoverySkill).toContain('one active primary Skill');
    expect(discoverySkill).toContain('two distinct auxiliary Skills');
    expect(discoverySkill).toContain('帮我做一个官网');
    expect(discoverySkill).toContain('task-dependent operation');
    expect(discoverySkill).toContain('external side effect');
  });

  it('exposes four basic task profiles and the sixty source-authored template Skills exactly once', async () => {
    const bundledStrategyPlugin = await resolveStrategyRecord();
    const builtInFunctionalSkillsRoot = FUNCTIONAL_SKILLS_ROOT;
    const builtInDesignTemplatesRoot = DESIGN_TEMPLATES_ROOT;
    const promptContext = readOfficialSkillDiscoveryPromptContextV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
      builtInDesignTemplatesRoot,
    });
    const catalog = promptContext.catalog;
    const bootstrap = promptContext.policyMarkdown;
    const catalogMarkdown = promptContext.catalogMarkdown;
    const officialIdentity = await readOfficialRootIdentity(DESIGN_TEMPLATES_ROOT);
    const functionalDeclaration = JSON.parse(await readFile(
      path.join(STRATEGY_SOURCE, 'agent-discovery/functional-catalog.json'),
      'utf8',
    )) as { skills: Array<{ source: string; sourceFolder: string; id: string }> };
    const functionalCandidates = catalog.candidates.filter(
      (candidate) => candidate.origin.kind === 'built-in-design-template',
    );
    const taskProfileCandidates = catalog.candidates.filter(
      (candidate) => candidate.origin.kind === 'bundled-task-profile',
    );

    expect(catalog.schema).toBe('open-design.official-skill-discovery-catalog/v1');
    expect(bootstrap).toContain('# Agent-native Skill Discovery');
    expect(bootstrap).toContain('帮我做一个官网');
    expect(bootstrap).not.toContain('name: agent-skill-discovery');
    expect(catalog.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(officialIdentity.ids).toHaveLength(60);
    expect((await readOfficialRootIdentity(FUNCTIONAL_SKILLS_ROOT)).ids).toEqual([]);
    expect(functionalDeclaration.skills.every((skill) => skill.source === 'design-templates')).toBe(true);
    expect(functionalDeclaration.skills.map((skill) => skill.sourceFolder).sort()).toEqual(
      officialIdentity.sourceFolders,
    );
    expect(functionalDeclaration.skills.map((skill) => skill.id).sort()).toEqual(
      officialIdentity.ids,
    );
    expect(functionalCandidates.map((candidate) => candidate.id).sort()).toEqual(
      officialIdentity.ids,
    );
    expect(catalog.candidates).toHaveLength(officialIdentity.ids.length + 4);
    expect(catalogMarkdown).toContain('# Official Skill metadata catalog');
    expect(catalogMarkdown).toContain(`- Catalog revision: \`${catalog.revision}\``);
    expect(catalogMarkdown).toContain(`- Candidate count: ${catalog.candidates.length}`);
    const promptRecords = catalogMarkdown
      .split('\n')
      .filter((line) => line.startsWith('    {'))
      .map((line) => JSON.parse(line.trim()) as {
        id: string;
        role: string;
        allowedRoles: string[];
        candidateDigest: string;
        useWhen: string[];
        avoidWhen: string[];
      });
    expect(promptRecords).toHaveLength(catalog.candidates.length);
    expect(promptRecords.slice(0, 4).map((candidate) => candidate.id)).toEqual([
      'hyperframes',
      'marketing',
      'ppt',
      'prototype',
    ]);
    expect(promptRecords.slice(0, 4).every((candidate) => candidate.role === 'primary')).toBe(true);
    expect(promptRecords.every((candidate) => candidate.allowedRoles.length >= 1)).toBe(true);
    expect(promptRecords.every((candidate) => candidate.allowedRoles.length <= 2)).toBe(true);
    expect(promptRecords.every((candidate) => candidate.useWhen.length <= 2)).toBe(true);
    expect(promptRecords.every((candidate) => candidate.avoidWhen.length <= 2)).toBe(true);
    expect(promptRecords.find((candidate) => candidate.id === 'ppt')?.candidateDigest)
      .toBe(catalog.candidates.find((candidate) => candidate.id === 'ppt')?.candidateDigest);
    expect(catalogMarkdown).not.toContain('profileMarkdown');
    expect(catalogMarkdown).not.toContain('generalOrchestration');
    expect(catalogMarkdown).not.toContain('SKILL.md');
    expect(catalogMarkdown).not.toContain(STRATEGY_SOURCE);

    const fullLifecyclePrompt = `${bootstrap}\n\n---\n\n${catalogMarkdown}`;
    const posixArgvBudgetError = checkPromptArgvBudget(
      aiderAgentDef,
      fullLifecyclePrompt,
      'linux',
    );
    expect(posixArgvBudgetError).toBeNull();
    expect(Buffer.byteLength(fullLifecyclePrompt, 'utf8')).toBeLessThan(120_000);
    expect(checkPromptArgvBudget(aiderAgentDef, 'x'.repeat(120_001), 'linux'))
      .toMatchObject({ code: 'AGENT_PROMPT_TOO_LARGE', limit: 120_000 });

    const eitherCatalogMarkdown = renderOfficialSkillDiscoveryCatalogMarkdownV1({
      ...catalog,
      candidates: catalog.candidates.map((candidate) => candidate.id === 'document-decision-memo'
        ? { ...candidate, role: 'either' as const }
        : candidate),
    });
    const eitherRecord = eitherCatalogMarkdown
      .split('\n')
      .find((line) => line.startsWith('    {"id":"document-decision-memo"'));
    expect(eitherRecord).toBeDefined();
    expect(JSON.parse(eitherRecord!.trim())).toMatchObject({
      role: 'either',
      allowedRoles: ['primary', 'auxiliary'],
    });
    expect(taskProfileCandidates.map((candidate) => candidate.id).sort()).toEqual([
      'hyperframes',
      'marketing',
      'ppt',
      'prototype',
    ]);
    expect(taskProfileCandidates.every((candidate) => candidate.role === 'primary')).toBe(true);
    expect(functionalCandidates.every((candidate) => candidate.role === 'auxiliary')).toBe(true);
    expect(functionalCandidates.every((candidate) => candidate.routingMetadata?.taskType)).toBe(true);
    expect(functionalCandidates.find((candidate) => candidate.id === 'document-decision-memo')
      ?.routingMetadata).toMatchObject({
      enName: 'Decision Memo',
      zhName: '决策备忘录',
      taskType: 'document',
      platform: 'desktop',
      scenario: 'product',
      category: 'document',
      examplePrompt: expect.stringContaining('one-page decision memo'),
    });
    expect(catalogMarkdown).toContain('单页决策备忘录');
    for (const candidate of catalog.candidates) {
      expect(candidate.autoSelectable).toBe(true);
      expect(candidate.positiveExamples.length).toBeGreaterThan(0);
      expect(candidate.negativeExamples.length).toBeGreaterThan(0);
      expect(candidate.outputKinds.length).toBeGreaterThan(0);
      expect(candidate.conflictsWith).toBeInstanceOf(Array);
      expect(candidate.candidateDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(candidate.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(candidate.resourceRosterDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }

    const first = searchOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
      builtInDesignTemplatesRoot,
      request: { query: '帮我做一个官网', role: 'primary', limit: 5 },
    });
    const repeated = searchOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
      builtInDesignTemplatesRoot,
      request: { query: '帮我做一个官网', role: 'primary', limit: 5 },
    });
    expect(repeated).toEqual(first);
    expect(first.candidates[0]?.id).toBe('prototype');
    expect(first.candidates[0]?.matchedPositiveExamples).toContain('帮我做一个官网');
    expect(first.candidates.length).toBeLessThanOrEqual(5);
    const negative = searchOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
      builtInDesignTemplatesRoot,
      request: { query: '帮我分析现有官网的数据', role: 'primary', limit: 5 },
    });
    expect(negative.candidates.map((candidate) => candidate.id)).not.toContain('prototype');

    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('profileMarkdown');
    expect(serialized).not.toContain('generalOrchestration');
    expect(serialized).not.toContain('SKILL.md');
    expect(serialized).not.toContain(STRATEGY_SOURCE);
  });

  it('revalidates task-profile identity and separates public metadata from verified bytes', async () => {
    const strategyFolder = path.join(tmpDir, 'strategy');
    const builtInFunctionalSkillsRoot = FUNCTIONAL_SKILLS_ROOT;
    await cp(STRATEGY_SOURCE, strategyFolder, { recursive: true });
    const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);
    const sources = {
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
      builtInDesignTemplatesRoot: DESIGN_TEMPLATES_ROOT,
    };
    const catalog = readOfficialSkillDiscoveryCatalogV1(sources);
    const prototype = catalog.candidates.find((candidate) => candidate.id === 'prototype');
    expect(prototype).toBeDefined();

    const loaded = resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: 'prototype',
        revision: catalog.revision,
        candidateDigest: prototype!.candidateDigest,
        role: 'primary',
      },
    });
    expect(loaded.profileMarkdown).toBe(await readFile(
      path.join(strategyFolder, 'assets/task-profiles/prototype.md'), 'utf8',
    ));
    expect(loaded.generalOrchestration?.markdown).toContain(
      'OD Next General Orchestration v2',
    );
    expect(loaded.generalOrchestration?.markdown).toBe(await readFile(
      path.join(strategyFolder, 'assets/general-orchestration.md'), 'utf8',
    ));
    expect(loaded.generalOrchestration).not.toBeNull();
    if (!loaded.generalOrchestration) throw new Error('Prototype orchestration missing.');
    expect(loaded.generalOrchestration?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loaded.profileDigest).toBe(
      `sha256:${createHash('sha256').update(loaded.profileMarkdown).digest('hex')}`,
    );
    expect(loaded.generalOrchestration?.digest).toBe(
      `sha256:${createHash('sha256')
        .update(loaded.generalOrchestration.markdown)
        .digest('hex')}`,
    );
    expect(loaded.attestation.schema).toBe(
      'open-design.official-skill-discovery-attestation/v1',
    );
    expect(loaded.attestation.candidateDigest).toBe(prototype!.candidateDigest);
    expect(loaded.materialization.materializedRoot).toBeNull();
    expect(loaded.materialization.resources.map((resource) => resource.relativePath)).toEqual([
      'device-frames/iphone.html',
      'device-frames/android.html',
      'device-frames/neutral.html',
      'layout.css',
    ]);
    for (const resource of loaded.materialization.resources) {
      expect(path.isAbsolute(resource.relativePath)).toBe(false);
      expect(resource.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(resource.size).toBeGreaterThan(0);
    }
    const taskBundle = resolveOfficialSkillDiscoveryResourceBundleV1({
      ...sources,
      request: {
        id: 'prototype',
        revision: catalog.revision,
        candidateDigest: prototype!.candidateDigest,
        role: 'primary',
      },
    });
    expect(taskBundle.files.map((resource) => resource.relativePath)).toEqual(
      loaded.materialization.resources.map((resource) => resource.relativePath),
    );
    for (const resource of taskBundle.files) {
      expect(resource.digest).toBe(
        `sha256:${createHash('sha256').update(resource.bytes).digest('hex')}`,
      );
      expect(resource.mode).toBe(
        (await stat(path.join(taskBundle.sourceRoot, resource.relativePath))).mode & 0o777,
      );
    }
    expect(JSON.stringify(loaded)).not.toContain(taskBundle.sourceRoot);
    expect(loaded.materialization.resources.every(
      (resource) => !Object.hasOwn(resource, 'mode'),
    )).toBe(true);

    const adapterPath = path.join(
      strategyFolder,
      'assets/task-profiles/prototype.md',
    );
    const adapter = await readFile(adapterPath, 'utf8');
    await writeFile(adapterPath, `${adapter}\n<!-- adapter drift -->\n`, 'utf8');
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: 'prototype',
        revision: catalog.revision,
        candidateDigest: prototype!.candidateDigest,
        role: 'primary',
      },
    })).toThrow(/revision|digest|changed/i);
    await writeFile(adapterPath, adapter, 'utf8');

    const bootstrapPath = path.join(strategyFolder, 'agent-discovery/SKILL.md');
    const bootstrap = await readFile(bootstrapPath, 'utf8');
    await writeFile(bootstrapPath, `${bootstrap}\n<!-- bootstrap drift -->\n`, 'utf8');
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: 'prototype',
        revision: catalog.revision,
        candidateDigest: prototype!.candidateDigest,
        role: 'primary',
      },
    })).toThrow(/revision|changed/i);
    await writeFile(bootstrapPath, bootstrap, 'utf8');

    const profilePath = path.join(strategyFolder, 'assets/task-profiles/prototype.md');
    await writeFile(profilePath, `${await readFile(profilePath, 'utf8')}\n<!-- drift -->\n`, 'utf8');
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: 'prototype',
        revision: catalog.revision,
        candidateDigest: prototype!.candidateDigest,
        role: 'primary',
      },
    })).toThrow(/revision|digest|changed/i);
  });

  it('rejects task-profile declarations that are not primary', async () => {
    const strategyFolder = path.join(tmpDir, 'strategy');
    await cp(STRATEGY_SOURCE, strategyFolder, { recursive: true });
    const catalogPath = path.join(strategyFolder, 'agent-discovery/catalog.json');
    const declaration = JSON.parse(await readFile(catalogPath, 'utf8')) as {
      taskProfiles: Array<{ role: string }>;
    };
    declaration.taskProfiles[0]!.role = 'auxiliary';
    await writeFile(catalogPath, `${JSON.stringify(declaration, null, 2)}\n`, 'utf8');
    const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);

    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot: FUNCTIONAL_SKILLS_ROOT,
    })).toThrow(/role|metadata validation/i);
  });

  it('loads unmodified document and image template bodies with their complete reference packages', async () => {
    const bundledStrategyPlugin = await resolveStrategyRecord();
    const sources = {
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot: FUNCTIONAL_SKILLS_ROOT,
      builtInDesignTemplatesRoot: DESIGN_TEMPLATES_ROOT,
    };
    const catalog = readOfficialSkillDiscoveryCatalogV1(sources);
    const loadAuxiliary = (id: string) => {
      const candidate = catalog.candidates.find((item) => item.id === id);
      expect(candidate, id).toBeDefined();
      const request = {
        id,
        revision: catalog.revision,
        candidateDigest: candidate!.candidateDigest,
        role: 'auxiliary' as const,
      };
      return {
        loaded: resolveOfficialSkillDiscoveryLoadV1({
          ...sources,
          request,
        }),
        bundle: resolveOfficialSkillDiscoveryResourceBundleV1({
          ...sources,
          request,
        }),
      };
    };

    const document = loadAuxiliary('document-branded-pdf-report');
    expect(document.loaded.materialization.resources.map((resource) => resource.relativePath))
      .toEqual(['example.html', 'example.webp', 'template.json']);
    const image = loadAuxiliary('image-event-poster');
    expect(image.bundle.files.find((resource) => resource.relativePath === 'example.webp')?.size)
      .toBe(417_378);

    for (const result of [document, image]) {
      const source = await readFile(path.join(result.bundle.sourceRoot, 'SKILL.md'), 'utf8');
      expect(result.loaded.profileMarkdown).toBe(parseFrontmatter(source).body);
      expect(result.loaded.generalOrchestration).toBeNull();
      expect(result.loaded.materialization.resources).toEqual(result.bundle.files.map((resource) => ({
        relativePath: resource.relativePath,
        digest: resource.digest,
        size: resource.size,
      })));
      for (const resource of result.bundle.files) {
        expect(path.isAbsolute(resource.relativePath)).toBe(false);
        expect(resource.digest).toBe(
          `sha256:${createHash('sha256').update(resource.bytes).digest('hex')}`,
        );
        expect(resource.mode).toBe(
          (await stat(path.join(result.bundle.sourceRoot, resource.relativePath))).mode & 0o777,
        );
      }
      expect(JSON.stringify(result.loaded)).not.toContain(result.bundle.sourceRoot);
      expect(result.loaded.materialization.resources.every(
        (resource) => !Object.hasOwn(resource, 'mode'),
      )).toBe(true);
    }
  });

  it('loads a declared functional Skill with frozen relative resources and auxiliary-only role', async () => {
    const strategyFolder = path.join(tmpDir, 'strategy');
    const builtInFunctionalSkillsRoot = path.join(tmpDir, 'built-ins');
    await Promise.all([
      cp(STRATEGY_SOURCE, strategyFolder, { recursive: true }),
      mkdir(builtInFunctionalSkillsRoot),
    ]);
    await createFunctionalSkill({
      root: builtInFunctionalSkillsRoot,
      sourceFolder: 'official-helper-folder',
      id: 'official-helper',
      body: 'Read references/guide.md before polishing.',
      resources: {
        'references/guide.md': 'Official guide bytes.',
        'templates/unmentioned.html': '<main>Transitive template bytes.</main>',
      },
    });
    await writeFunctionalCatalog(strategyFolder, [functionalDeclaration({
      sourceFolder: 'official-helper-folder',
      id: 'official-helper',
      resources: ['references/guide.md'],
    })]);

    const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);
    const sources = { bundledStrategyPlugin, builtInFunctionalSkillsRoot };
    expect(() => readOfficialSkillDiscoveryCatalogV1(sources)).toThrow(/resource declaration is stale/i);
    await writeFunctionalCatalog(strategyFolder, [functionalDeclaration({
      sourceFolder: 'official-helper-folder',
      id: 'official-helper',
      resources: ['references/guide.md', 'templates/unmentioned.html'],
    })]);
    const catalog = readOfficialSkillDiscoveryCatalogV1(sources);
    const candidate = catalog.candidates.find((item) => item.id === 'official-helper')!;
    expect(candidate.origin.kind).toBe('built-in-functional');
    expect(candidate.role).toBe('auxiliary');
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: candidate.id,
        revision: catalog.revision,
        candidateDigest: `sha256:${'0'.repeat(64)}`,
        role: 'auxiliary',
      },
    })).toThrow(/digest/i);
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: candidate.id,
        revision: catalog.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'primary',
      },
    })).toThrow(/role/i);
    const loaded = resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: candidate.id,
        revision: catalog.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'auxiliary',
      },
    });
    expect(loaded.profileMarkdown).toContain('Read references/guide.md');
    expect(loaded.generalOrchestration).toBeNull();
    expect(loaded.materialization.materializedRoot).toBeNull();
    const bundle = resolveOfficialSkillDiscoveryResourceBundleV1({
      ...sources,
      request: {
        id: candidate.id,
        revision: catalog.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'auxiliary',
      },
    });
    expect(loaded.materialization.resources).toEqual(bundle.files.map((resource) => ({
      relativePath: resource.relativePath,
      digest: resource.digest,
      size: resource.size,
    })));
    expect(bundle.files.map((resource) => [resource.relativePath, resource.bytes.toString('utf8')]))
      .toEqual([
        ['references/guide.md', 'Official guide bytes.'],
        ['templates/unmentioned.html', '<main>Transitive template bytes.</main>'],
      ]);
    expect(JSON.stringify(loaded)).not.toContain(builtInFunctionalSkillsRoot);
    expect(JSON.stringify(loaded)).not.toContain('Official guide bytes.');
    expect(loaded.materialization.resources.every(
      (resource) => !Object.hasOwn(resource, 'mode'),
    )).toBe(true);

    await writeFile(
      path.join(builtInFunctionalSkillsRoot, 'official-helper-folder/references/guide.md'),
      'Changed guide bytes.',
      'utf8',
    );
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources,
      request: {
        id: candidate.id,
        revision: catalog.revision,
        candidateDigest: candidate.candidateDigest,
        role: 'auxiliary',
      },
    })).toThrow(/revision|digest|changed/i);
  });

  it('requires the official template source and revalidates its metadata, roster, and pinned bytes', async () => {
    const strategyFolder = path.join(tmpDir, 'strategy');
    const builtInFunctionalSkillsRoot = path.join(tmpDir, 'built-ins');
    const builtInDesignTemplatesRoot = path.join(tmpDir, 'templates');
    await Promise.all([
      cp(STRATEGY_SOURCE, strategyFolder, { recursive: true }),
      mkdir(builtInFunctionalSkillsRoot),
      mkdir(builtInDesignTemplatesRoot),
    ]);
    await cp(
      path.join(DESIGN_TEMPLATES_ROOT, 'image-event-poster'),
      path.join(builtInDesignTemplatesRoot, 'image-event-poster'),
      { recursive: true },
    );
    const resources = (await readdir(path.join(builtInDesignTemplatesRoot, 'image-event-poster')))
      .filter((file) => file !== 'SKILL.md').sort();
    const declaration = {
      ...functionalDeclaration({ sourceFolder: 'image-event-poster', resources }),
      source: 'design-templates',
    };
    await writeFunctionalCatalog(strategyFolder, [declaration]);
    const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);
    const sources = { bundledStrategyPlugin, builtInFunctionalSkillsRoot, builtInDesignTemplatesRoot };
    expect(() => readOfficialSkillDiscoveryCatalogV1({ bundledStrategyPlugin, builtInFunctionalSkillsRoot }))
      .toThrow(/design template root is required/i);
    const catalog = readOfficialSkillDiscoveryCatalogV1(sources);
    const candidate = catalog.candidates.find((item) => item.id === 'image-event-poster')!;
    expect(candidate.origin.kind).toBe('built-in-design-template');
    const request = {
      id: candidate.id,
      revision: catalog.revision,
      candidateDigest: candidate.candidateDigest,
      role: 'auxiliary' as const,
    };
    expect(() => resolveOfficialSkillDiscoveryLoadV1({
      ...sources, request: { ...request, role: 'primary' },
    })).toThrow(/role/i);

    await writeFunctionalCatalog(strategyFolder, [{ ...declaration, resources: [] }]);
    expect(() => readOfficialSkillDiscoveryCatalogV1(sources)).toThrow(/resource declaration is stale/i);
    await writeFunctionalCatalog(strategyFolder, [declaration]);
    const manifestPath = path.join(builtInDesignTemplatesRoot, 'image-event-poster/SKILL.md');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(manifestPath, manifest.replace(/^zh_name:.*$/m, 'zh_name: []'));
    expect(() => readOfficialSkillDiscoveryCatalogV1(sources)).toThrow(/routing metadata is invalid/i);
    await writeFile(manifestPath, manifest.replace('Event Poster', 'Event Poster Updated'));
    expect(() => resolveOfficialSkillDiscoveryLoadV1({ ...sources, request })).toThrow(/revision/i);
    await writeFile(manifestPath, manifest);
    const previewPath = path.join(builtInDesignTemplatesRoot, 'image-event-poster/example.webp');
    await writeFile(previewPath, Buffer.alloc(512 * 1024 + 1));
    expect(() => readOfficialSkillDiscoveryCatalogV1(sources)).toThrow(/large|limit|exceed/i);
  });

  it('rejects a functional resource package above the reviewed 2 MiB raw-byte cap', async () => {
    const strategyFolder = path.join(tmpDir, 'strategy');
    const builtInFunctionalSkillsRoot = path.join(tmpDir, 'built-ins');
    await Promise.all([
      cp(STRATEGY_SOURCE, strategyFolder, { recursive: true }),
      mkdir(builtInFunctionalSkillsRoot),
    ]);
    const resourcePaths = Array.from(
      { length: 9 },
      (_, index) => `assets/chunk-${String(index + 1).padStart(2, '0')}.txt`,
    );
    await createFunctionalSkill({
      root: builtInFunctionalSkillsRoot,
      sourceFolder: 'oversized-helper',
      resources: Object.fromEntries(resourcePaths.map((relativePath) => [
        relativePath,
        'x'.repeat(240 * 1024),
      ])),
    });
    await writeFunctionalCatalog(strategyFolder, [functionalDeclaration({
      sourceFolder: 'oversized-helper',
      resources: resourcePaths,
    })]);

    const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);
    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
    })).toThrow(/resource package is too large/i);
  });

  it('fails closed for missing, unknown, duplicate, or malformed central declarations', async () => {
    const strategyFolder = path.join(tmpDir, 'strategy');
    const builtInFunctionalSkillsRoot = path.join(tmpDir, 'built-ins');
    await Promise.all([
      cp(STRATEGY_SOURCE, strategyFolder, { recursive: true }),
      mkdir(builtInFunctionalSkillsRoot),
    ]);
    await createFunctionalSkill({
      root: builtInFunctionalSkillsRoot,
      sourceFolder: 'declared-helper',
    });
    await createFunctionalSkill({
      root: builtInFunctionalSkillsRoot,
      sourceFolder: 'missing-helper',
    });
    await writeFunctionalCatalog(strategyFolder, [functionalDeclaration({
      sourceFolder: 'declared-helper',
    })]);

    const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);
    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
    })).toThrow(/missing its discovery declaration/i);

    await writeFunctionalCatalog(strategyFolder, [
      functionalDeclaration({ sourceFolder: 'declared-helper' }),
      functionalDeclaration({ sourceFolder: 'missing-helper' }),
      functionalDeclaration({ sourceFolder: 'unknown-helper' }),
    ]);
    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
    })).toThrow(/has no official SKILL\.md/i);

    await writeFunctionalCatalog(strategyFolder, [
      functionalDeclaration({ sourceFolder: 'declared-helper' }),
      functionalDeclaration({ sourceFolder: 'missing-helper', role: 'primary' }),
    ]);
    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
    })).toThrow(OfficialSkillDiscoveryCatalogError);

    await writeFunctionalCatalog(strategyFolder, [
      functionalDeclaration({ sourceFolder: 'declared-helper' }),
      functionalDeclaration({ sourceFolder: 'declared-helper' }),
    ]);
    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
    })).toThrow(OfficialSkillDiscoveryCatalogError);

    await writeFunctionalCatalog(strategyFolder, [
      functionalDeclaration({ sourceFolder: 'declared-helper', id: 'duplicate-id' }),
      functionalDeclaration({ sourceFolder: 'missing-helper', id: 'duplicate-id' }),
    ]);
    expect(() => readOfficialSkillDiscoveryCatalogV1({
      bundledStrategyPlugin,
      builtInFunctionalSkillsRoot,
    })).toThrow(OfficialSkillDiscoveryCatalogError);
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a referenced functional side file that crosses a symlink',
    async () => {
      const builtInFunctionalSkillsRoot = path.join(tmpDir, 'built-ins');
      const outside = path.join(tmpDir, 'outside.md');
      await mkdir(builtInFunctionalSkillsRoot);
      await writeFile(outside, 'outside', 'utf8');
      await createFunctionalSkill({
        root: builtInFunctionalSkillsRoot,
        sourceFolder: 'symlinked-helper',
        body: 'Read references/guide.md.',
      });
      await mkdir(path.join(builtInFunctionalSkillsRoot, 'symlinked-helper/references'));
      await symlink(
        outside,
        path.join(builtInFunctionalSkillsRoot, 'symlinked-helper/references/guide.md'),
      );

      const strategyFolder = path.join(tmpDir, 'strategy');
      await cp(STRATEGY_SOURCE, strategyFolder, { recursive: true });
      await writeFunctionalCatalog(strategyFolder, [functionalDeclaration({
        sourceFolder: 'symlinked-helper',
        resources: ['references/guide.md'],
      })]);
      const bundledStrategyPlugin = await resolveStrategyRecord(strategyFolder);
      expect(() => readOfficialSkillDiscoveryCatalogV1({
        bundledStrategyPlugin,
        builtInFunctionalSkillsRoot,
      })).toThrow(/symbolic|symlink|unavailable/i);
    },
  );
});
