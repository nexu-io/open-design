import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs, { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateBrand } from '../src/brands/validate.js';
import { writeBrand } from '../src/brands/store.js';
import { brandSystemDir, rebuildSystem } from '../src/brands/system.js';
import { renderEmail } from '../src/brands/engine/artifacts/email.js';
import { defaultSeed, deriveTokens } from '../src/brands/engine/index.js';

const BRAND = {
  name: 'Acme',
  tagline: 'Infrastructure for teams that ship.',
  description:
    'Acme makes deployment infrastructure for engineering teams that need to ship without a platform group.',
  colors: [
    { role: 'background', hex: '#ffffff', oklch: '', name: 'White', usage: 'page' },
    { role: 'surface', hex: '#f6f6f6', oklch: '', name: 'Surface', usage: 'cards' },
    { role: 'foreground', hex: '#101010', oklch: '', name: 'Ink', usage: 'text' },
    { role: 'muted', hex: '#7a7a7a', oklch: '', name: 'Muted', usage: 'secondary text' },
    { role: 'border', hex: '#e6e6e6', oklch: '', name: 'Hairline', usage: 'borders' },
    { role: 'accent', hex: '#3a7a6f', oklch: '', name: 'Pine', usage: 'CTAs' },
    { role: 'accent-secondary', hex: '#0a7d22', oklch: '', name: 'Fern', usage: 'success' },
  ],
};

const brand = () => validateBrand({ ...BRAND }, 'https://acme.example');
const BRAND_ID = 'acme';
const EDITED = 'artifacts/email.html';

let brandsRoot: string;

beforeEach(() => {
  brandsRoot = mkdtempSync(path.join(os.tmpdir(), 'od-brand-system-'));
  writeBrand(brandsRoot, BRAND_ID, brand());
});

afterEach(() => {
  rmSync(brandsRoot, { recursive: true, force: true });
});

const systemFile = (rel: string) => path.join(brandSystemDir(brandsRoot, BRAND_ID), rel);

describe('rebuildSystem preserves work under system/', () => {
  it('keeps a hand-edited artifact and reports it in kept', async () => {
    await rebuildSystem(brandsRoot, BRAND_ID);
    const edited = `${readFileSync(systemFile(EDITED), 'utf8')}\n<!-- hand edited -->\n`;
    writeFileSync(systemFile(EDITED), edited);

    const result = await rebuildSystem(brandsRoot, BRAND_ID);

    expect(result.kept).toContain(EDITED);
    expect(readFileSync(systemFile(EDITED), 'utf8')).toBe(edited);
  });

  it('regenerates an unedited artifact when its template output changes', async () => {
    const first = await rebuildSystem(brandsRoot, BRAND_ID);
    const before = new Map(
      first.files.map((rel) => [rel, readFileSync(systemFile(rel), 'utf8')]),
    );

    writeBrand(brandsRoot, BRAND_ID, { ...brand(), name: 'Acme Renamed' });
    const second = await rebuildSystem(brandsRoot, BRAND_ID);

    expect(second.kept).toEqual([]);
    const changed = second.files.filter(
      (rel) => before.get(rel) !== readFileSync(systemFile(rel), 'utf8'),
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((rel) => !second.kept.includes(rel))).toBe(true);
  });

  it('keeps a differing file that predates the ledger', async () => {
    await rebuildSystem(brandsRoot, BRAND_ID);
    rmSync(path.join(brandSystemDir(brandsRoot, BRAND_ID), '.generated.json'));
    const legacy = `${readFileSync(systemFile(EDITED), 'utf8')}\n<!-- pre-ledger edit -->\n`;
    writeFileSync(systemFile(EDITED), legacy);

    const result = await rebuildSystem(brandsRoot, BRAND_ID);

    expect(result.kept).toContain(EDITED);
    expect(readFileSync(systemFile(EDITED), 'utf8')).toBe(legacy);
  });
});

describe('renderEmail', () => {
  it('resolves every attribute to a literal and invents no person', () => {
    const html = renderEmail(brand(), deriveTokens(defaultSeed));

    expect(html).not.toMatch(/="[^"]*var\(/);
    expect(html).not.toMatch(/Maya Chen|Northwind|Market Street/);
    expect(html).toContain('bgcolor="#3a7a6f"');
  });
});
