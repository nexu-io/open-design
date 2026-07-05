import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Brand } from '@open-design/contracts';

import { brandToMemoryEntries, reflowBrandToMemory } from '../src/brands/memory.js';
import { listMemoryEntries, readMemoryEntry, writeMemoryConfig } from '../src/memory.js';

// A realistic two-stack editorial brand (modeled on the Economist brand pack):
// seven roles, serif display + sans body, a documented voice, square-corner
// layout posture, and logo usage notes.
const ECONOMIST: Brand = {
  name: 'The Economist',
  tagline: 'A severe contest between intelligence and ignorance.',
  description: 'A weekly international newspaper.',
  sourceUrl: 'https://economist.com/',
  logo: {
    primary: 'logos/service-google.png',
    alternates: ['logos/service-ddg.ico'],
    notes:
      "White serif 'E' knocked out of an Economist Red square. Never recolor the red field, never outline it.",
  },
  colors: [
    { role: 'background', hex: '#ffffff', oklch: '', name: 'Paper White', usage: 'page background' },
    { role: 'surface', hex: '#f2f2f2', oklch: '', name: 'London 95', usage: 'panels' },
    { role: 'foreground', hex: '#0d0d0d', oklch: '', name: 'London 5', usage: 'ink' },
    { role: 'muted', hex: '#595959', oklch: '', name: 'London 35', usage: 'captions' },
    { role: 'border', hex: '#d9d9d9', oklch: '', name: 'London 85', usage: 'hairlines' },
    { role: 'accent', hex: '#e3120b', oklch: '', name: 'Economist Red', usage: 'masthead' },
    { role: 'accent-secondary', hex: '#2e45b8', oklch: '', name: 'Chicago 30', usage: 'links' },
  ],
  typography: {
    display: { family: 'Milo TE', fallbacks: ['Georgia', 'Times New Roman', 'serif'], weights: [400, 700] },
    body: { family: 'Econ Sans', fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'], weights: [400, 700] },
  },
  voice: {
    adjectives: ['authoritative', 'concise', 'witty'],
    tone: 'A single unsigned house voice that argues a position.',
    messagingPillars: ['Analysis over breaking news', 'A global outlook'],
    vocabulary: { use: ['this newspaper', 'leader', 'briefing'], avoid: ['content', 'hot take', 'synergy'] },
  },
  imagery: {
    style: 'Editorial illustration and photojournalism in service of an argument.',
    subjects: ['world leaders', 'markets'],
    treatment: 'Bold conceptual illustration.',
    avoid: ['generic stock-photo handshakes', 'emoji and clip-art'],
  },
  layout: {
    radius: '0px',
    borderWeight: '1px',
    spacing: '8px baseline grid',
    postureRules: ['Square corners everywhere', 'Hairline rules separate stories'],
  },
};

describe('brandToMemoryEntries', () => {
  it('derives a coherent visual / voice / rule set with a stable slug', () => {
    const entries = brandToMemoryEntries(ECONOMIST);
    const byId = new Map(entries.map((e) => [e.id, e]));

    // One user visual-direction, one reference voice, four rules.
    expect(byId.has('user_brand_the_economist_visual')).toBe(true);
    expect(byId.has('reference_brand_the_economist_voice')).toBe(true);
    expect(byId.has('rule_brand_the_economist_palette')).toBe(true);
    expect(byId.has('rule_brand_the_economist_type')).toBe(true);
    expect(byId.has('rule_brand_the_economist_layout')).toBe(true);
    expect(byId.has('rule_brand_the_economist_logo')).toBe(true);

    const visual = byId.get('user_brand_the_economist_visual')!;
    expect(visual.type).toBe('user');
    expect(visual.body).toContain('#e3120b');
    expect(visual.body).toContain('Milo TE');

    // Palette rule reads as an enforceable Assertion/Check the self-verify pass
    // can score against, and lists every allowed hex.
    const palette = byId.get('rule_brand_the_economist_palette')!;
    expect(palette.type).toBe('rule');
    expect(palette.body).toMatch(/^Assertion:/);
    expect(palette.body).toContain('Check:');
    expect(palette.body).toContain('#2e45b8');

    const logo = byId.get('rule_brand_the_economist_logo')!;
    expect(logo.body).toContain('Never recolor the red field');
  });

  it('skips facets the brand does not carry', () => {
    const bare: Brand = {
      ...ECONOMIST,
      voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
      imagery: { style: '', subjects: [], treatment: '', avoid: [] },
      logo: { primary: null, alternates: [], notes: '' },
    };
    const ids = brandToMemoryEntries(bare).map((e) => e.id);
    expect(ids).not.toContain('reference_brand_the_economist_voice');
    expect(ids).not.toContain('rule_brand_the_economist_logo');
    // Visual + palette + type + layout still derive from the colors/type/layout.
    expect(ids).toContain('user_brand_the_economist_visual');
    expect(ids).toContain('rule_brand_the_economist_palette');
  });
});

describe('reflowBrandToMemory', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-memory-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes brand entries through the memory store and links them in the index', async () => {
    const result = await reflowBrandToMemory(dataDir, ECONOMIST);
    expect(result.written.length).toBeGreaterThanOrEqual(5);

    const stored = await listMemoryEntries(dataDir);
    const ids = stored.map((e) => e.id);
    expect(ids).toContain('user_brand_the_economist_visual');
    expect(ids).toContain('rule_brand_the_economist_palette');

    const palette = await readMemoryEntry(dataDir, 'rule_brand_the_economist_palette');
    expect(palette?.type).toBe('rule');
  });

  it('writes nothing when memory is disabled', async () => {
    await writeMemoryConfig(dataDir, { enabled: false });
    const result = await reflowBrandToMemory(dataDir, ECONOMIST);
    expect(result.skipped).toBe('memory-disabled');
    expect(result.written).toEqual([]);
    expect(await listMemoryEntries(dataDir)).toEqual([]);
  });
});
