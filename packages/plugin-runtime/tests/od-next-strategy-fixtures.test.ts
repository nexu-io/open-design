import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@open-design/contracts';
import {
  parseManifest,
  resolveAppliedPipeline,
  type ScenarioRegistryEntry,
} from '../src/index.js';

type StrategyStage = 'request' | 'clarification' | 'contract_repair' | 'production';
type StrategyRoute = 'direct_edit' | 'full_plan';
type ExecutionMode = 'simple' | 'complex';

interface PrebuildCase {
  id: string;
  taskProfile: 'prototype' | 'hyperframes';
  input: {
    stage: StrategyStage;
    route: StrategyRoute;
    executionMode: ExecutionMode;
    prompt: string;
  };
  expect: Record<string, unknown> & {
    preserve: string[];
    nextStage: 'production' | 'completed';
  };
}

interface PrebuildFixture {
  fixtureVersion: number;
  source: {
    repository: string;
    commit: string;
    extraction: string;
  };
  taskProfileCoverage: {
    active: string[];
    reservedExtensionSlots: string[];
  };
  cases: PrebuildCase[];
}

interface ForbiddenMutation {
  id: string;
  targetCase: string;
  path: string;
  value: unknown;
  expectedError: string;
}

interface ForbiddenFixture {
  fixtureVersion: number;
  mutations: ForbiddenMutation[];
}

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureRoot = fileURLToPath(
  new URL('./fixtures/od-next-strategy-v2/', import.meta.url),
);

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T;

const prebuild = readJson<PrebuildFixture>(`${fixtureRoot}/prebuild-cases.json`);
const forbidden = readJson<ForbiddenFixture>(
  `${fixtureRoot}/forbidden-postbuild-cases.json`,
);

const forbiddenKeys = new Set([
  'acceptance',
  'acceptanceChecklist',
  'artifactRepair',
  'candidateEvidenceBundle',
  'completionGate',
  'evidencePlan',
  'finalEvidenceBundle',
  'judge',
  'judgeReport',
  'qualityGate',
  'qualityScore',
  'repairRequired',
  'repeat',
  'critique',
  'revalidation',
]);

const forbiddenInstructions: Array<{ code: string; pattern: RegExp }> = [
  {
    code: 'post_build_verification',
    pattern: /(?:after|post[- ]?)\s*(?:the\s+)?build[\s\S]{0,80}\b(?:verify|verification|inspect|check)\b/i,
  },
  {
    code: 'artifact_review',
    pattern: /(?:after\s+(?:the\s+)?deliverable|finished\s+artifact)[\s\S]{0,100}\b(?:screenshots?|browser|dom|visual\s+(?:review|score)|playback|review)\b/i,
  },
  {
    code: 'judge',
    pattern: /\bjudge(?:\s+agent)?\b[\s\S]{0,80}\b(?:artifact|score|approve|approval)\b/i,
  },
  {
    code: 'artifact_repair',
    pattern: /\b(?:repair|fix)\b[\s\S]{0,100}\b(?:artifact|deliverable)\b[\s\S]{0,100}\b(?:until|acceptance|passes)\b/i,
  },
  {
    code: 'revalidation',
    pattern: /\brevalidate\b[\s\S]{0,100}\b(?:artifact|deliverable)\b/i,
  },
  {
    code: 'critique_theater',
    pattern: /\bcritique-theater\b/i,
  },
  {
    code: 'critique',
    pattern: /\b(?:run|perform|conduct)\b[\s\S]{0,80}\b(?:five[- ]dimensional\s+)?critique\b(?!-)/i,
  },
  {
    code: 'repeat_stage',
    pattern: /\brepeat\b[\s\S]{0,80}\b(?:stage|critique|review|verification)\b/i,
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> | unknown[] = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    const next = Array.isArray(cursor)
      ? cursor[Number(part)]
      : cursor[part];
    if (typeof next !== 'object' || next === null) {
      throw new Error(`fixture mutation path is not an object: ${path}`);
    }
    cursor = next as Record<string, unknown> | unknown[];
  }
  const leaf = parts.at(-1)!;
  if (Array.isArray(cursor)) {
    cursor[Number(leaf)] = value;
  } else {
    cursor[leaf] = value;
  }
}

function findForbiddenStructure(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenStructure(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) return `forbidden_structure:${key}`;
    const found = findForbiddenStructure(child);
    if (found) return found;
  }
  return undefined;
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) collectStrings(child, output);
  }
  return output;
}

function validatePrebuildCase(fixture: PrebuildCase): string[] {
  const structureError = findForbiddenStructure(fixture);
  if (structureError) return [structureError];

  for (const text of collectStrings(fixture)) {
    for (const rule of forbiddenInstructions) {
      if (rule.pattern.test(text)) return [`forbidden_instruction:${rule.code}`];
    }
  }
  return [];
}

function loadManifest(path: string): PluginManifest {
  const parsed = parseManifest(readFileSync(path, 'utf8'));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.manifest;
}

describe('OD Next Strategy V2 pre-Build fixture boundary', () => {
  const expectedPositiveCaseIds = [
    'request-direct-edit-simple',
    'request-full-plan-simple',
    'request-full-plan-complex',
    'clarification-full-plan',
    'contract-repair-full-plan',
    'production-simple',
    'production-complex',
  ];

  it('tracks the reviewed source and reserves independent profile extensions', () => {
    expect(prebuild.fixtureVersion).toBe(1);
    expect(prebuild.source).toEqual({
      repository: 'od_strategy',
      commit: '41dac86165f0504750f91fbc40a79d9d6b8a5a9d',
      extraction: 'prebuild-semantics-only',
    });
    expect(prebuild.taskProfileCoverage).toEqual({
      active: ['prototype', 'ppt', 'marketing', 'hyperframes'],
      reservedExtensionSlots: [],
    });
  });

  it('covers all four physical stages, both routes, and both Build modes', () => {
    expect(prebuild.cases).toHaveLength(7);
    expect(prebuild.cases.map((fixture) => fixture.id)).toEqual(
      expectedPositiveCaseIds,
    );
    expect(new Set(prebuild.cases.map((fixture) => fixture.input.stage))).toEqual(
      new Set<StrategyStage>([
        'request',
        'clarification',
        'contract_repair',
        'production',
      ]),
    );
    expect(new Set(prebuild.cases.map((fixture) => fixture.input.route))).toEqual(
      new Set<StrategyRoute>(['direct_edit', 'full_plan']),
    );
    expect(new Set(prebuild.cases.map((fixture) => fixture.input.executionMode))).toEqual(
      new Set<ExecutionMode>(['simple', 'complex']),
    );
  });

  it('keeps positive samples free of post-Build semantics without banning Build rendering', () => {
    for (const fixture of prebuild.cases) {
      expect(validatePrebuildCase(fixture), fixture.id).toEqual([]);
    }
    const hyperframes = prebuild.cases.find(
      (fixture) => fixture.id === 'production-complex',
    );
    expect(hyperframes?.expect['buildActions']).toContain(
      'Render the required HyperFrames MP4 as the Build output.',
    );
  });

  it('rejects every forbidden structure and instruction with a stable code', () => {
    expect(forbidden.fixtureVersion).toBe(prebuild.fixtureVersion);
    for (const mutation of forbidden.mutations) {
      const target = prebuild.cases.find(
        (fixture) => fixture.id === mutation.targetCase,
      );
      expect(target, mutation.id).toBeDefined();
      const contaminated = clone(target!);
      setAtPath(contaminated as unknown as Record<string, unknown>, mutation.path, mutation.value);
      expect(validatePrebuildCase(contaminated), mutation.id).toEqual([
        mutation.expectedError,
      ]);
    }
  });

  it('treats canonical deliverable facts as file facts, not a quality gate', () => {
    const completionCases = prebuild.cases.filter(
      (fixture) => fixture.expect.nextStage === 'completed',
    );
    expect(completionCases.length).toBeGreaterThan(0);
    for (const fixture of completionCases) {
      expect(fixture.expect['completionFacts']).toEqual([
        'required_deliverable_exists',
        'canonical_entry_recognized',
        'artifact_kind_matches',
      ]);
      expect(Object.keys(fixture.expect)).not.toContain('qualityGate');
    }
  });
});

describe('non-OD-Next scenario golden witness', () => {
  it('preserves the current official default and community fallback critique pipeline', () => {
    const official = loadManifest(
      `${repoRoot}/plugins/_official/scenarios/od-new-generation/open-design.json`,
    );
    const community = loadManifest(
      `${repoRoot}/plugins/community/humanize-ppt/open-design.json`,
    );
    if (!official.od?.taskKind || !official.od.pipeline) {
      throw new Error('od-new-generation must declare its task kind and pipeline');
    }
    const stages = official.od?.pipeline?.stages;
    expect(stages).toEqual([
      { id: 'discovery', atoms: ['discovery-question-form'] },
      { id: 'plan', atoms: ['direction-picker', 'todo-write'] },
      { id: 'generate', atoms: ['file-write', 'live-artifact'] },
      {
        id: 'critique',
        atoms: ['critique-theater'],
        repeat: true,
        until: 'critique.score>=4 || iterations>=3',
      },
    ]);

    const scenarios: ScenarioRegistryEntry[] = [
      {
        id: official.name,
        taskKind: official.od.taskKind,
        pipeline: official.od.pipeline,
      },
    ];
    const resolved = resolveAppliedPipeline({ manifest: community, scenarios });
    expect(resolved.source).toBe('scenario');
    expect(resolved.scenarioId).toBe('od-new-generation');
    expect(resolved.pipeline?.stages?.at(-1)).toEqual({
      id: 'critique',
      atoms: ['critique-theater'],
      repeat: true,
      until: 'critique.score>=4 || iterations>=3',
    });
  });

  it('does not add the demo repository to workspace or lockfile dependencies', () => {
    for (const path of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
      expect(readFileSync(`${repoRoot}/${path}`, 'utf8'), path).not.toMatch(
        /(?:workspace:|link:|file:)[^\n]*od_strategy/,
      );
    }
  });
});
