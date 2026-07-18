import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  listMemoryEntries,
  memoryDir,
  readMemoryConfig,
  readMemoryEntry,
  readMemoryIndex,
  upsertMemoryEntry,
  writeMemoryConfig,
} from '../src/memory.js';
import { runAutoExtractionCleanup } from '../src/memory-cleanup.js';

let dataDir = '';

// Verbatim replicas of entries the retired heuristic regex pack wrote in
// production (real garbage observed on a stable-channel install).
const HEURISTIC_GARBAGE = [
  {
    id: 'user_n19fd1zz',
    name: '用户所在地',
    description: '用户所在地：开做：',
    type: 'user',
    body: '- 所在地：开做：\n\n何时适用：在时区、货币、文化语境相关的回答里把这一点纳入考虑。',
  },
  {
    id: 'user_hero',
    name: '用户所在地',
    description: '用户所在地：补一张决定性 hero 图',
    type: 'user',
    body: '- 所在地：补一张决定性 hero 图\n\n何时适用：在时区、货币、文化语境相关的回答里把这一点纳入考虑。',
  },
  {
    id: 'project_n1ckt8ze',
    name: '用户目标',
    description: '用户希望：先和你确认，避免返工：',
    type: 'project',
    body: '- 目标：先和你确认，避免返工：\n\n何时适用：当对话靠近这一目标时主动呼应它，并把建议与目标对齐。',
  },
  {
    id: 'project_ship_course',
    name: 'User goal',
    description: 'User wants to ship a course',
    type: 'project',
    body: '- Goal: ship a course\n\nWhen to apply: surface relevance to this goal whenever the conversation drifts close to it.',
  },
  {
    id: 'reference_scratch',
    name: '速记备忘',
    description: '发布窗口是周四',
    type: 'reference',
    body: '- 发布窗口是周四',
  },
] as const;

// Entries the cleanup must PRESERVE: LLM-extracted project facts (product
// decision: keep), connector/brand output, and anything a user typed by hand.
const KEEP_ENTRIES = [
  {
    id: 'project_meridian_launch_deck',
    name: 'Meridian launch deck',
    description: '10-slide product launch deck for Meridian sleep-tracking ring.',
    type: 'project',
    body: 'The user is creating a 10-slide product launch/pitch deck for Meridian, a sleep-tracking ring. Audience is tech press.',
  },
  {
    id: 'rule_brand_ai_palette',
    name: '钉钉 palette only',
    description: "Only 钉钉's registered palette is used for color.",
    type: 'rule',
    body: '- Palette: Background #000000, Accent #007fff.',
  },
  {
    id: 'feedback_n1q6pme',
    name: '体制内材料风格偏好',
    description: '做体制内演讲/PPT时偏好说人话、逻辑清楚。',
    type: 'feedback',
    body: '用户在制作档案工作会议演讲配套PPT时明确偏好：说人话、逻辑清楚，突出基层真实感。',
  },
] as const;

const MIXED_PROFILE_BODY = [
  '- Role: 产品经理',
  '- Domain: design tools',
  '- 要做什么？: Prototype',
  '- 目标用户是谁？: 宝可梦粉丝',
  '- 目标平台: iOS App',
  '- What should I build?: Prototype',
].join('\n');

async function seedStore() {
  for (const entry of [...HEURISTIC_GARBAGE, ...KEEP_ENTRIES]) {
    await upsertMemoryEntry(dataDir, entry, { silent: true });
  }
  await upsertMemoryEntry(
    dataDir,
    {
      id: 'user_profile',
      name: 'Work profile',
      description: 'Role, audience, domain, and delivery defaults captured at onboarding.',
      type: 'profile',
      body: MIXED_PROFILE_BODY,
    },
    { silent: true },
  );
}

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-memory-cleanup-'));
  await seedStore();
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('one-time auto-extraction cleanup', () => {
  it('deletes heuristic-pack artifacts and keeps LLM / brand / manual entries', async () => {
    const result = await runAutoExtractionCleanup(dataDir);
    expect(result.ran).toBe(true);
    expect([...result.deletedIds].sort()).toEqual(
      HEURISTIC_GARBAGE.map((e) => e.id).sort(),
    );

    const remaining = (await listMemoryEntries(dataDir)).map((e) => e.id).sort();
    expect(remaining).toEqual(
      [...KEEP_ENTRIES.map((e) => e.id), 'user_profile'].sort(),
    );
  });

  it('prunes user_profile down to canonical labels, preserving hand-filled fields', async () => {
    await runAutoExtractionCleanup(dataDir);
    const profile = await readMemoryEntry(dataDir, 'user_profile');
    expect(profile).not.toBeNull();
    expect(profile!.body).toContain('- Role: 产品经理');
    expect(profile!.body).toContain('- Domain: design tools');
    expect(profile!.body).not.toContain('要做什么？');
    expect(profile!.body).not.toContain('宝可梦粉丝');
    expect(profile!.body).not.toContain('What should I build?');
  });

  it('deletes user_profile entirely when no canonical field survives', async () => {
    await upsertMemoryEntry(
      dataDir,
      {
        id: 'user_profile',
        name: 'Work profile',
        description: 'Role, audience, domain, and delivery defaults captured at onboarding.',
        type: 'profile',
        body: '- 要做什么？: Prototype\n- 目标平台: iOS App',
      },
      { silent: true },
    );
    await runAutoExtractionCleanup(dataDir);
    expect(await readMemoryEntry(dataDir, 'user_profile')).toBeNull();
  });

  it('drops index bullets for deleted entries and keeps the survivors linked', async () => {
    await runAutoExtractionCleanup(dataDir);
    const index = await readMemoryIndex(dataDir);
    for (const gone of HEURISTIC_GARBAGE) {
      expect(index).not.toContain(`(${gone.id}.md)`);
    }
    for (const kept of KEEP_ENTRIES) {
      expect(index).toContain(`(${kept.id}.md)`);
    }
  });

  it('forces chatExtractionEnabled off exactly once, then respects a re-opt-in', async () => {
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: true });
    await runAutoExtractionCleanup(dataDir);
    expect((await readMemoryConfig(dataDir)).chatExtractionEnabled).toBe(false);

    // A user who consciously re-enables extraction after the migration must
    // not be flipped back by later boots.
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: true });
    const second = await runAutoExtractionCleanup(dataDir);
    expect(second.ran).toBe(false);
    expect((await readMemoryConfig(dataDir)).chatExtractionEnabled).toBe(true);
  });

  it('is idempotent: the second run is a no-op and resurrects nothing', async () => {
    const first = await runAutoExtractionCleanup(dataDir);
    expect(first.ran).toBe(true);

    // Re-seed one garbage entry AFTER the migration marker exists; a later
    // boot must not delete it (one-time semantics, not a standing GC).
    await upsertMemoryEntry(dataDir, HEURISTIC_GARBAGE[0], { silent: true });
    const second = await runAutoExtractionCleanup(dataDir);
    expect(second.ran).toBe(false);
    expect(await readMemoryEntry(dataDir, HEURISTIC_GARBAGE[0].id)).not.toBeNull();
  });

  it('records a marker file inside the memory dir', async () => {
    const result = await runAutoExtractionCleanup(dataDir);
    const markerRaw = await fsp.readFile(
      path.join(memoryDir(dataDir), '.cleanup_auto_extracted_v1.json'),
      'utf8',
    );
    const marker = JSON.parse(markerRaw);
    expect(marker.deletedIds.sort()).toEqual([...result.deletedIds].sort());
    expect(typeof marker.ranAt).toBe('number');
  });
});

describe('source provenance on new writes', () => {
  it('persists the writer source into frontmatter so future audits are precise', async () => {
    await upsertMemoryEntry(
      dataDir,
      {
        id: 'feedback_from_llm',
        name: 'LLM extracted preference',
        description: 'prefers dark noir palettes',
        type: 'feedback',
        body: 'Prefers dark noir palettes.',
      },
      { silent: true, source: 'llm' },
    );
    const raw = await fsp.readFile(
      path.join(memoryDir(dataDir), 'feedback_from_llm.md'),
      'utf8',
    );
    expect(raw).toContain('source: llm');
    const entry = await readMemoryEntry(dataDir, 'feedback_from_llm');
    expect(entry!.source).toBe('llm');
  });

  it('defaults source to manual for direct API writes', async () => {
    // Third arg mirrors the HTTP routes, which pass `undefined` options.
    await upsertMemoryEntry(
      dataDir,
      {
        id: 'user_hand_written',
        name: 'Hand written fact',
        description: 'typed in settings',
        type: 'user',
        body: 'I ship decks on Fridays.',
      },
      undefined,
    );
    const entry = await readMemoryEntry(dataDir, 'user_hand_written');
    expect(entry!.source).toBe('manual');
  });
});
