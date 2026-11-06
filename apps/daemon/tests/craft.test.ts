import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadCraftSections, resolveCraftRequirements } from '../src/craft.js';

let craftDir: string;

beforeAll(async () => {
  craftDir = await mkdtemp(path.join(tmpdir(), 'od-craft-test-'));
  await writeFile(
    path.join(craftDir, 'typography.md'),
    '# typography\n\nALL CAPS ≥ 0.06em.\n',
    'utf8',
  );
  await writeFile(
    path.join(craftDir, 'color.md'),
    '# color\n\nAccent ≤ 2 per screen.\n',
    'utf8',
  );
  await writeFile(path.join(craftDir, 'empty.md'), '   \n\n', 'utf8');
});

afterAll(async () => {
  if (craftDir) await rm(craftDir, { recursive: true, force: true });
});

describe('loadCraftSections', () => {
  it('returns empty when nothing requested', async () => {
    const r = await loadCraftSections(craftDir, []);
    expect(r.body).toBe('');
    expect(r.sections).toEqual([]);
  });

  it('concatenates requested sections in order with section headers', async () => {
    const r = await loadCraftSections(craftDir, ['typography', 'color']);
    expect(r.sections).toEqual(['typography', 'color']);
    expect(r.body.startsWith('### typography')).toBe(true);
    expect(r.body.includes('### color')).toBe(true);
    expect(r.body.indexOf('### typography')).toBeLessThan(r.body.indexOf('### color'));
  });

  it('drops missing files silently (forward-compatible)', async () => {
    const r = await loadCraftSections(craftDir, ['typography', 'motion', 'color']);
    expect(r.sections).toEqual(['typography', 'color']);
  });

  it('drops empty files silently', async () => {
    const r = await loadCraftSections(craftDir, ['empty', 'typography']);
    expect(r.sections).toEqual(['typography']);
  });

  it('rejects bogus slugs (path traversal, special chars)', async () => {
    const r = await loadCraftSections(craftDir, [
      '../etc/passwd',
      'typo/graphy',
      'typography',
    ]);
    expect(r.sections).toEqual(['typography']);
  });

  it('dedupes repeated requests', async () => {
    const r = await loadCraftSections(craftDir, [
      'typography',
      'TYPOGRAPHY',
      'typography',
    ]);
    expect(r.sections).toEqual(['typography']);
  });
});

describe('resolveCraftRequirements', () => {
  it('adds typography for a deck project even when no skill requested craft', () => {
    expect(resolveCraftRequirements({
      metadataKind: 'deck',
      skillModes: [],
      skillRequires: [],
      designSystemApplies: [],
      designSystemExemptions: [],
    })).toEqual(['typography']);
  });

  it('adds typography for a freeform request whose user-authored text signals a deck', () => {
    expect(resolveCraftRequirements({
      metadataKind: 'other',
      skillModes: [],
      freeformDeckSignal: true,
      skillRequires: [],
      designSystemApplies: [],
      designSystemExemptions: [],
    })).toEqual(['typography']);
  });

  it('does not add deck craft to unrelated freeform requests', () => {
    expect(resolveCraftRequirements({
      metadataKind: 'other',
      skillModes: [],
      freeformDeckSignal: false,
      skillRequires: ['color'],
      designSystemApplies: [],
      designSystemExemptions: [],
    })).toEqual(['color']);
  });

  it('preserves declarations, dedupes them, and lets design systems exempt defaults', () => {
    expect(resolveCraftRequirements({
      metadataKind: 'deck',
      skillModes: ['deck'],
      skillRequires: ['color', 'typography'],
      designSystemApplies: ['color', 'anti-ai-slop'],
      designSystemExemptions: [],
    })).toEqual(['color', 'typography', 'anti-ai-slop']);

    expect(resolveCraftRequirements({
      metadataKind: 'deck',
      skillModes: [],
      skillRequires: [],
      designSystemApplies: [],
      designSystemExemptions: ['typography'],
    })).toEqual([]);
  });

  it('keeps web-clone runs craft-free for source fidelity', () => {
    expect(resolveCraftRequirements({
      isWebCloneRun: true,
      metadataKind: 'deck',
      skillModes: ['deck'],
      skillRequires: ['typography'],
      designSystemApplies: ['color'],
      designSystemExemptions: [],
    })).toEqual([]);
  });
});
