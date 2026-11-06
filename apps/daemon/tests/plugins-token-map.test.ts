// Phase 6/7 entry slice — token-map atom impl.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseDesignSystemTokens,
  runTokenMap,
  type DesignSystemTokenBag,
} from '../src/plugins/atoms/token-map.js';
import type { DesignExtractReport } from '../src/plugins/atoms/design-extract.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), 'od-token-map-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const ds: DesignSystemTokenBag = {
  id: 'fixture-ds',
  tokens: [
    { name: '--ds-color-primary', value: '#5b8def', kind: 'color' },
    { name: '--ds-color-fg',      value: '#111111', kind: 'color' },
    { name: '--ds-radius-md',     value: '12px',    kind: 'radius' },
    { name: 'ds-spacing-2',       value: '8px',     kind: 'spacing' },
    { name: 'ds-font-body',       value: 'Inter',   kind: 'typography' },
  ],
};

const codeTokens = (over: Partial<DesignExtractReport> = {}): DesignExtractReport => ({
  colors:     [],
  typography: [],
  spacing:    [],
  radius:     [],
  shadow:     [],
  scannedFiles: [],
  warnings: [],
  endedAt: new Date().toISOString(),
  ...over,
});

describe('runTokenMap — match strategies', () => {
  it('matches by exact value', async () => {
    const source = codeTokens({
      colors: [{ kind: 'color', value: '#5b8def', sources: ['Button.tsx:3'], usage: ['Button.tsx'] }],
    });
    const report = await runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: ds });
    expect(report.colors).toHaveLength(1);
    expect(report.colors[0]?.target).toBe('--ds-color-primary');
    expect(report.colors[0]?.via).toBe('exact');
    expect(report.colors[0]?.sources).toEqual(['Button.tsx:3']);
    expect(report.unmatched).toEqual([]);
  });

  it('matches by normalised hex (#abc → #aabbcc)', async () => {
    const dsShort: DesignSystemTokenBag = {
      tokens: [{ name: '--ds-fg', value: '#abc', kind: 'color' }],
    };
    const source = codeTokens({
      colors: [{ kind: 'color', value: '#aabbcc', sources: [], usage: [] }],
    });
    const report = await runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: dsShort });
    expect(report.colors[0]?.via).toBe('normalised-hex');
    expect(report.colors[0]?.target).toBe('--ds-fg');
  });

  it('matches by fuzzy name when source carries a name', async () => {
    const source = codeTokens({
      colors: [{ kind: 'color', name: '--color-primary', value: '#999999', sources: [], usage: [] }],
    });
    const report = await runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: ds });
    // Falls back to name match because the value doesn't match exact / normalised.
    expect(report.colors[0]?.via).toBe('name');
    expect(report.colors[0]?.target).toBe('--ds-color-primary');
  });

  it("records unmatched tokens with reason='no-target-equivalent'", async () => {
    const source = codeTokens({
      colors: [{ kind: 'color', value: '#abc999', sources: ['x.css:1'], usage: ['x.css'] }],
    });
    const report = await runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: ds });
    expect(report.colors).toEqual([]);
    expect(report.unmatched).toHaveLength(1);
    expect(report.unmatched[0]).toMatchObject({
      source: '#abc999',
      kind:   'color',
      reason: 'no-target-equivalent',
    });
  });

  it("records target collisions when multiple sources map to the same target", async () => {
    const source = codeTokens({
      colors: [
        { kind: 'color', value: '#5B8DEF', sources: ['a.css:1'], usage: ['a.css'] },
        { kind: 'color', value: '#5b8def', sources: ['b.css:1'], usage: ['b.css'] },
      ],
    });
    const report = await runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: ds });
    expect(report.colors).toHaveLength(1);
    expect(report.unmatched).toHaveLength(1);
    expect(report.unmatched[0]).toMatchObject({
      reason: 'target-collision',
      hint:   expect.stringMatching(/already mapped/),
    });
  });

  it('throws under strict mode when any source is unmatched', async () => {
    const source = codeTokens({
      colors: [{ kind: 'color', value: '#deadbe', sources: [], usage: [] }],
    });
    await expect(runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: ds, strict: true }))
      .rejects.toThrow(/strict/);
  });
});

describe('runTokenMap — multi-kind matching', () => {
  it('crosswalks spacing / radius / typography buckets', async () => {
    const source = codeTokens({
      spacing:    [{ kind: 'spacing', value: '8px', sources: [], usage: [] }],
      radius:     [{ kind: 'radius',  value: '12px', sources: [], usage: [] }],
      typography: [{ kind: 'typography', value: 'Inter', sources: [], usage: [] }],
    });
    const report = await runTokenMap({ cwd, source: { kind: 'code', report: source }, designSystem: ds });
    expect(report.spacing[0]?.target).toBe('ds-spacing-2');
    expect(report.radius[0]?.target).toBe('--ds-radius-md');
    expect(report.typography[0]?.target).toBe('ds-font-body');
  });
});

describe('runTokenMap — disk inputs + outputs', () => {
  it('reads code/tokens.json when source is omitted + persists every bucket file', async () => {
    await mkdir(path.join(cwd, 'code'), { recursive: true });
    const onDisk = codeTokens({
      colors: [{ kind: 'color', value: '#111111', sources: ['x:1'], usage: ['x'] }],
    });
    await writeFile(path.join(cwd, 'code', 'tokens.json'), JSON.stringify(onDisk));
    await runTokenMap({ cwd, designSystem: ds });
    const colors = JSON.parse(await readFile(path.join(cwd, 'token-map', 'colors.json'), 'utf8'));
    const meta   = JSON.parse(await readFile(path.join(cwd, 'token-map', 'meta.json'), 'utf8'));
    const unmatched = JSON.parse(await readFile(path.join(cwd, 'token-map', 'unmatched.json'), 'utf8'));
    expect(colors[0]?.target).toBe('--ds-color-fg');
    expect(meta.sourceKind).toBe('code');
    expect(meta.designSystemId).toBe('fixture-ds');
    expect(meta.atomDigest.length).toBe(40);
    expect(unmatched).toEqual([]);
  });

  it('falls back to figma/tokens.json when code/tokens.json is missing', async () => {
    await mkdir(path.join(cwd, 'figma'), { recursive: true });
    const onDisk = codeTokens({
      colors: [{ kind: 'color', value: '#111111', sources: [], usage: [] }],
    });
    await writeFile(path.join(cwd, 'figma', 'tokens.json'), JSON.stringify(onDisk));
    const report = await runTokenMap({ cwd, designSystem: ds });
    expect(report.meta.sourceKind).toBe('figma');
  });

  it('throws a clear error when neither input exists', async () => {
    await expect(runTokenMap({ cwd, designSystem: ds }))
      .rejects.toThrow(/run design-extract or figma-extract first/);
  });
});

describe('parseDesignSystemTokens', () => {
  it('extracts CSS custom properties from a DESIGN.md body', () => {
    const body = `
# Design system

\`\`\`css
:root {
  --ds-color-primary: #5b8def;
  --ds-radius-md: 12px;
}
\`\`\`
`;
    const out = parseDesignSystemTokens(body);
    expect(out.find((t) => t.name === '--ds-color-primary')?.value).toBe('#5b8def');
    expect(out.find((t) => t.name === '--ds-radius-md')?.kind).toBe('radius');
  });

  it('extracts markdown table rows', () => {
    const body = `
| ds-bg | #ffffff |
| ds-fg | #111111 |
`;
    const out = parseDesignSystemTokens(body);
    expect(out.map((t) => t.name)).toEqual(expect.arrayContaining(['ds-bg', 'ds-fg']));
  });
});
