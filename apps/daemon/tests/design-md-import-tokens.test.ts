import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Brand } from '@open-design/contracts';

import { brandFromDesignMd } from '../src/brands/design-md-input.js';
import { deriveTokens, seedFromBrand } from '../src/brands/engine/index.js';
import { writeBrand } from '../src/brands/store.js';
import { rebuildSystem } from '../src/brands/system.js';

// Synthetic locked design system from issue #7409: every value below is
// explicit and must survive the paste → brand → seed → system pipeline
// unchanged (square corners, 8px grid, system-ui, authored warning color).
const DESIGN_MD = `---
name: Rectilinear Test System
radius: 0px
spacing: 8px
---
# Rectilinear Test System

This is a locked design system. Explicit values must be preserved exactly.

## Colors
- Background: #ffffff
- Foreground: #161616
- Primary accent: #0055cc
- Success: #006b3c
- Warning: #8e6a00
- Border: #8d8d8d

## Typography
Use system-ui for all interface text.

## Geometry
All corner radii are exactly 0px. Buttons, inputs, cards, tags, and panels must remain square. Never create pills.

## Depth
Use no shadows.

## Motion
Use linear easing only. Do not use cubic-bezier easing.

## Components
Buttons and controls must use 0px radius and the explicit semantic colors above.
`;

const BRAND_ID = 'rectilinear-test-system';
const SOURCE_URL = 'designmd://rectilinear-test-system';

function parseFixture(): Brand {
  const brand = brandFromDesignMd({ markdown: DESIGN_MD, sourceUrl: SOURCE_URL });
  if (!brand) throw new Error('DESIGN.md fixture failed to parse');
  return brand;
}

function writeRectilinearBrand(brandsRoot: string): Brand {
  const brand = parseFixture();
  writeBrand(brandsRoot, BRAND_ID, brand);
  return brand;
}

function systemFile(brandsRoot: string, file: string): string {
  return readFileSync(path.join(brandsRoot, BRAND_ID, 'system', file), 'utf8');
}

describe('design-md import preserves explicit tokens', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'design-md-tokens-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses explicit radius, spacing, fonts, palette and semantic seed overrides from pasted DESIGN.md', () => {
    const brand = parseFixture();

    expect(brand.layout.radius).toBe('0px');
    expect(brand.layout.spacing).toBe('8px');
    expect(brand.typography.body.family).toBe('system-ui');
    expect(brand.typography.display.family).toBe('system-ui');

    const hexByRole = new Map(brand.colors.map((color) => [color.role, color.hex] as const));
    expect(hexByRole.get('accent')).toBe('#0055cc');
    expect(hexByRole.get('background')).toBe('#ffffff');
    expect(hexByRole.get('foreground')).toBe('#161616');
    expect(hexByRole.get('border')).toBe('#8d8d8d');

    // Exact payload: success rides the accent-secondary role and the fixture
    // carries no error color, so nothing else may leak into the override channel.
    expect(brand.seed).toEqual({ colorWarning: '#8e6a00' });
  });

  it('maps the parsed brand onto a seed that keeps radius zero and the system-ui face', () => {
    const brand = parseFixture();
    const seed = seedFromBrand(brand);

    expect(seed.borderRadius).toBe(0);
    expect(seed.fontFamily.startsWith('system-ui')).toBe(true);
  });

  it('rebuilds the registered system with square geometry and the authored warning color', async () => {
    const brandsRoot = path.join(tempDir, 'brands');
    writeRectilinearBrand(brandsRoot);

    await rebuildSystem(brandsRoot, BRAND_ID);

    const seed = JSON.parse(systemFile(brandsRoot, 'seed.json')) as Record<string, unknown>;
    expect(seed.borderRadius).toBe(0);
    expect(seed.colorWarning).toBe('#8e6a00');
    expect(String(seed.fontFamily).startsWith('system-ui')).toBe(true);

    const tokens = JSON.parse(systemFile(brandsRoot, 'tokens.default.json')) as Record<string, unknown>;
    expect(tokens.borderRadius).toBe(0);
    expect(tokens.borderRadiusXS).toBe(0);
    expect(tokens.borderRadiusSM).toBe(0);
    expect(tokens.borderRadiusLG).toBe(0);
    expect(tokens.colorWarning).toBe('#8e6a00');

    // Square geometry must hold across every shipped theme file, not just the
    // default algorithm — rebuildSystem re-derives dark/compact from the seed.
    const darkTokens = JSON.parse(systemFile(brandsRoot, 'tokens.dark.json')) as Record<string, unknown>;
    expect(darkTokens.borderRadius).toBe(0);
  });

  it('produces byte-identical system output when rebuilt twice from the same brand.json', async () => {
    const brandsRoot = path.join(tempDir, 'brands');
    writeRectilinearBrand(brandsRoot);

    await rebuildSystem(brandsRoot, BRAND_ID);
    const seedFirst = systemFile(brandsRoot, 'seed.json');
    const tokensFirst = systemFile(brandsRoot, 'tokens.default.json');

    await rebuildSystem(brandsRoot, BRAND_ID);

    expect(systemFile(brandsRoot, 'seed.json')).toBe(seedFirst);
    expect(systemFile(brandsRoot, 'tokens.default.json')).toBe(tokensFirst);
  });

  it('falls back to default radii when the explicit radius is negative', () => {
    const markdown = DESIGN_MD.replace('radius: 0px', 'radius: -2px');
    const brand = brandFromDesignMd({ markdown, sourceUrl: SOURCE_URL });
    if (!brand) throw new Error('negative-radius fixture failed to parse');

    const seed = seedFromBrand(brand);
    expect(seed.borderRadius).toBe(6);

    const tokens = deriveTokens(seed, 'default');
    expect(tokens.borderRadius).toBe(6);
    expect(tokens.borderRadiusXS).toBe(2);
    expect(tokens.borderRadiusSM).toBe(4);
    expect(tokens.borderRadiusLG).toBe(8);
  });

  it('leaves brands without semantic color keys or generic font words untouched', () => {
    const markdown = `---
name: Plain System
radius: fluid
spacing: 4px
---

# Plain System

## Colors
- Background: #f8f9fa
- Foreground: #212529
- Primary accent: #3b5bdb

## Typography
font-family: Public Sans
`;
    const brand = brandFromDesignMd({ markdown, sourceUrl: 'designmd://plain-system' });
    if (!brand) throw new Error('minimal fixture failed to parse');

    expect(brand.seed).toBeUndefined();
    expect(brand.typography.body.family).toBe('Public Sans');

    const seed = seedFromBrand(brand);
    expect(seed.borderRadius).toBe(6);
    expect(seed.fontFamily.startsWith("'Public Sans'")).toBe(true);
  });

  it('prefers an explicit font-family declaration over a generic keyword later in the same stack', () => {
    const markdown = `---
name: Inter Stack System
radius: 8px
spacing: 8px
---

# Inter Stack System

## Typography
font-family: Inter, system-ui, sans-serif;
`;
    const brand = brandFromDesignMd({ markdown, sourceUrl: 'designmd://inter-stack-system' });
    if (!brand) throw new Error('Inter-stack fixture failed to parse');

    // Explicit declaration wins over the generic keyword on the same line.
    expect(brand.typography.body.family).toBe('Inter');
    expect(brand.typography.display.family).toBe('Inter');

    const seed = seedFromBrand(brand);
    expect(seed.fontFamily.startsWith('Inter')).toBe(true);
  });

  it('captures a bulleted Error color as the colorError seed override and token', async () => {
    const markdown = `---
name: Error Seed System
radius: 8px
spacing: 8px
---

# Error Seed System

## Colors
- Background: #ffffff
- Foreground: #161616
- Primary accent: #0055cc
- Error: #b30000

## Typography
Use system-ui for all interface text.
`;
    const brand = brandFromDesignMd({ markdown, sourceUrl: 'designmd://error-seed-system' });
    if (!brand) throw new Error('error-seed fixture failed to parse');

    expect(brand.seed).toEqual({ colorError: '#b30000' });

    const brandsRoot = path.join(tempDir, 'brands');
    writeBrand(brandsRoot, 'error-seed-system', brand);
    await rebuildSystem(brandsRoot, 'error-seed-system');

    const tokens = JSON.parse(
      readFileSync(path.join(brandsRoot, 'error-seed-system', 'system', 'tokens.default.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(tokens.colorError).toBe('#b30000');
  });

  it('keeps a later Error label even when it shares the Primary hex', async () => {
    const markdown = `---
name: Duplicate Hex System
radius: 8px
spacing: 8px
---

# Duplicate Hex System

## Colors
- Background: #ffffff
- Foreground: #161616
- Primary: #b30000
- Error: #b30000

## Typography
Use system-ui for all interface text.
`;
    const brand = brandFromDesignMd({ markdown, sourceUrl: 'designmd://duplicate-hex-system' });
    if (!brand) throw new Error('duplicate-hex fixture failed to parse');

    // The Error-labelled occurrence shares its hex with Primary, but the label
    // is explicit — the seed override channel must still carry colorError.
    expect(brand.seed).toEqual({ colorError: '#b30000' });

    const brandsRoot = path.join(tempDir, 'brands');
    writeBrand(brandsRoot, 'duplicate-hex-system', brand);
    await rebuildSystem(brandsRoot, 'duplicate-hex-system');

    const tokens = JSON.parse(
      readFileSync(path.join(brandsRoot, 'duplicate-hex-system', 'system', 'tokens.default.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(tokens.colorError).toBe('#b30000');
  });

  it('preserves an explicit non-green Success color as the colorSuccess seed override', async () => {
    const markdown = `---
name: Blue Success System
radius: 8px
spacing: 8px
---

# Blue Success System

## Colors
- Background: #ffffff
- Foreground: #161616
- Primary accent: #0055cc
- Success: #2563eb

## Typography
Use system-ui for all interface text.
`;
    const brand = brandFromDesignMd({ markdown, sourceUrl: 'designmd://blue-success-system' });
    if (!brand) throw new Error('blue-success fixture failed to parse');

    // Success rides the accent-secondary role, but seedFromBrand only derives
    // success from that role when it reads green — an authored non-green
    // Success must survive through the explicit override channel instead.
    expect(brand.seed).toEqual({ colorSuccess: '#2563eb' });

    const brandsRoot = path.join(tempDir, 'brands');
    writeBrand(brandsRoot, 'blue-success-system', brand);
    await rebuildSystem(brandsRoot, 'blue-success-system');

    const tokens = JSON.parse(
      readFileSync(path.join(brandsRoot, 'blue-success-system', 'system', 'tokens.default.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(tokens.colorSuccess).toBe('#2563eb');
  });

  it('accepts a true zero radius but falls back to the default for fractional radii', () => {
    const seedRadiusFor = (radius: string): number => {
      const brand = brandFromDesignMd({
        markdown: DESIGN_MD.replace('radius: 0px', `radius: ${radius}`),
        sourceUrl: SOURCE_URL,
      });
      if (!brand) throw new Error(`radius fixture ${radius} failed to parse`);
      return seedFromBrand(brand).borderRadius;
    };

    // Whole numbers keep their authored value, including true zero...
    expect(seedRadiusFor('0px')).toBe(0);
    expect(seedRadiusFor('12px')).toBe(12);
    // ...while fractional dimensions cannot be represented in the integer
    // seed and must fall back to 6 instead of truncating to square corners.
    expect(seedRadiusFor('0.5rem')).toBe(6);
    expect(seedRadiusFor('0.25em')).toBe(6);
    expect(seedRadiusFor('0.5px')).toBe(6);
  });
});
