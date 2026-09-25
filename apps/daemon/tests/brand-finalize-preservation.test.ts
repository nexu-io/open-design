// Regression coverage for #8144: re-running `od brand finalize` must follow the
// same ownership invariant #5472 established for design systems — a file is only
// replaced while it is still byte-identical to what the generator last wrote.
// Hand-edited files and files the generator never produced survive, both in the
// backing project and in the linked `user:<id>` design system.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Brand } from '@open-design/contracts';

import { closeDatabase, openDatabase } from '../src/db.js';
import { finalizeBrand, startBrandExtraction } from '../src/brands/index.js';

const SKILLS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../skills',
);

const NO_LOGO_FALLBACK = async () => ({ changed: false });
const NO_IMAGERY_FALLBACK = async () => ({ changed: false });
const NO_SEED_FALLBACK = async () => ({ changed: false });

const VALID_BRAND = {
  name: 'Acme',
  tagline: 'We make things',
  description: 'Acme makes excellent things for everyone.',
  sourceUrl: 'https://acme.com/',
  logo: { primary: null, alternates: [], notes: '' },
  colors: [
    { role: 'background', hex: '#f5f4ed', oklch: 'oklch(96% 0.01 90)', name: 'Parchment', usage: 'page background' },
    { role: 'surface', hex: '#ffffff', oklch: 'oklch(100% 0 0)', name: 'Card', usage: 'cards' },
    { role: 'foreground', hex: '#141413', oklch: 'oklch(17% 0.005 90)', name: 'Ink', usage: 'text' },
    { role: 'muted', hex: '#87867f', oklch: 'oklch(60% 0.01 90)', name: 'Stone', usage: 'secondary text' },
    { role: 'border', hex: '#e8e6dc', oklch: 'oklch(92% 0.01 90)', name: 'Hairline', usage: 'borders' },
    { role: 'accent', hex: '#d97757', oklch: 'oklch(67% 0.13 40)', name: 'Terracotta', usage: 'CTAs' },
    { role: 'accent-secondary', hex: '#3d7a4f', oklch: 'oklch(50% 0.09 150)', name: 'Moss', usage: 'success' },
  ],
  typography: {
    display: { family: 'Tiempos', fallbacks: ['Georgia', 'serif'], weights: [400, 600] },
    body: { family: 'Inter', fallbacks: ['system-ui'], weights: [400, 700] },
  },
  voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
  imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
  layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
} satisfies Brand;

// Same brand, different accent: every palette-derived file changes, so an
// untouched `system/variables.css` must visibly refresh on re-finalize.
const RECOLORED_BRAND = {
  ...VALID_BRAND,
  colors: VALID_BRAND.colors.map((color) =>
    color.role === 'accent'
      ? { ...color, hex: '#2255cc', oklch: 'oklch(50% 0.18 260)', name: 'Cobalt' }
      : color,
  ),
} satisfies Brand;

describe('brand finalize preserves user-owned files (#8144)', () => {
  let tempDir: string;
  let brandsRoot: string;
  let projectsRoot: string;
  let userDesignSystemsRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-preserve-'));
    brandsRoot = path.join(tempDir, 'brands');
    projectsRoot = path.join(tempDir, 'projects');
    userDesignSystemsRoot = path.join(tempDir, 'user-design-systems');
    mkdirSync(brandsRoot, { recursive: true });
    mkdirSync(projectsRoot, { recursive: true });
    mkdirSync(userDesignSystemsRoot, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function setup() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      seedFallback: NO_SEED_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });
    const projectDir = path.join(projectsRoot, started.projectId);
    const writeBrandJson = (brand: Brand) =>
      writeFileSync(
        path.join(projectDir, 'brand.json'),
        JSON.stringify({ ...brand, sourceUrl: started.sourceUrl }, null, 2),
        'utf8',
      );
    const finalize = () =>
      finalizeBrand({
        id: started.id,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot: SKILLS_ROOT,
        db,
        logoFallback: NO_LOGO_FALLBACK,
        imageryFallback: NO_IMAGERY_FALLBACK,
      });
    return { projectDir, writeBrandJson, finalize };
  }

  function dsDir(designSystemId: string): string {
    return path.join(userDesignSystemsRoot, designSystemId.slice('user:'.length));
  }

  it('keeps hand-edited and hand-authored files in the backing project', async () => {
    const { projectDir, writeBrandJson, finalize } = await setup();
    writeBrandJson(VALID_BRAND);
    await finalize();

    const variables = path.join(projectDir, 'system', 'variables.css');
    const editedCss = `${readFileSync(variables, 'utf8')}\n/* hand edit */\n`;
    writeFileSync(variables, editedCss, 'utf8');
    writeFileSync(path.join(projectDir, 'system', 'NOTES.md'), '# my notes\n', 'utf8');
    writeFileSync(path.join(projectDir, 'DESIGN.md'), '# Hand-written DESIGN.md\n', 'utf8');

    writeBrandJson(RECOLORED_BRAND);
    await finalize();

    expect(readFileSync(variables, 'utf8')).toBe(editedCss);
    expect(readFileSync(path.join(projectDir, 'system', 'NOTES.md'), 'utf8')).toBe('# my notes\n');
    expect(readFileSync(path.join(projectDir, 'DESIGN.md'), 'utf8')).toBe('# Hand-written DESIGN.md\n');
    // Untouched generated files still refresh to the recolored output.
    const themeJson = readFileSync(path.join(projectDir, 'system', 'theme.json'), 'utf8');
    expect(themeJson.toLowerCase()).toContain('#2255cc');
  });

  it('keeps hand-edited and hand-authored files in the linked user design system', async () => {
    const { projectDir, writeBrandJson, finalize } = await setup();
    writeBrandJson(VALID_BRAND);
    const first = await finalize();
    const dir = dsDir(first.designSystemId);
    // Registration normalizes DESIGN.md; the mirror still leaves the generator's exact bytes.
    expect(readFileSync(path.join(dir, 'DESIGN.md'), 'utf8')).toBe(
      readFileSync(path.join(projectDir, 'DESIGN.md'), 'utf8'),
    );

    const variables = path.join(dir, 'system', 'variables.css');
    const editedCss = `${readFileSync(variables, 'utf8')}\n/* hand edit */\n`;
    writeFileSync(variables, editedCss, 'utf8');
    writeFileSync(path.join(dir, 'system', 'NOTES.md'), '# my notes\n', 'utf8');
    writeFileSync(path.join(dir, 'DESIGN.md'), '# Hand-written DESIGN.md\n\n', 'utf8');
    writeFileSync(path.join(dir, 'brand.json'), '{"hand":"edited"}\n', 'utf8');

    writeBrandJson(RECOLORED_BRAND);
    const second = await finalize();
    expect(second.designSystemId).toBe(first.designSystemId);

    expect(readFileSync(variables, 'utf8')).toBe(editedCss);
    expect(readFileSync(path.join(dir, 'system', 'NOTES.md'), 'utf8')).toBe('# my notes\n');
    expect(readFileSync(path.join(dir, 'DESIGN.md'), 'utf8')).toBe('# Hand-written DESIGN.md\n\n');
    expect(readFileSync(path.join(dir, 'brand.json'), 'utf8')).toBe('{"hand":"edited"}\n');
    const themeJson = readFileSync(path.join(dir, 'system', 'theme.json'), 'utf8');
    expect(themeJson.toLowerCase()).toContain('#2255cc');
    // The project copy was not touched, so it follows the new generation.
    expect(readFileSync(path.join(projectDir, 'DESIGN.md'), 'utf8')).toContain('Cobalt');
    expect(readFileSync(path.join(projectDir, 'system', 'variables.css'), 'utf8')).not.toContain('hand edit');
  });

  it('still refreshes untouched files on the first re-finalize of a legacy brand with no manifest', async () => {
    const { projectDir, writeBrandJson, finalize } = await setup();
    writeBrandJson(VALID_BRAND);
    const first = await finalize();
    const dir = dsDir(first.designSystemId);
    // Simulate a brand finalized before the fix: no fingerprint manifests.
    rmSync(path.join(projectDir, '.od-generated.json'), { force: true });
    rmSync(path.join(dir, '.od-generated.json'), { force: true });

    const projectVariables = path.join(projectDir, 'system', 'variables.css');
    const editedCss = `${readFileSync(projectVariables, 'utf8')}\n/* hand edit */\n`;
    writeFileSync(projectVariables, editedCss, 'utf8');

    writeBrandJson(RECOLORED_BRAND);
    await finalize();

    expect(readFileSync(projectVariables, 'utf8')).toBe(editedCss);
    for (const root of [projectDir, dir]) {
      const themeJson = readFileSync(path.join(root, 'system', 'theme.json'), 'utf8');
      expect(themeJson.toLowerCase()).toContain('#2255cc');
      expect(readFileSync(path.join(root, 'DESIGN.md'), 'utf8')).toContain('Cobalt');
    }
    expect(readFileSync(path.join(dir, 'system', 'variables.css'), 'utf8')).not.toContain('hand edit');
    expect(readFileSync(path.join(dir, 'DESIGN.md'), 'utf8')).toBe(
      readFileSync(path.join(projectDir, 'DESIGN.md'), 'utf8'),
    );
  });

  it('never writes through a symlink planted in the design system bundle', async () => {
    const { writeBrandJson, finalize } = await setup();
    writeBrandJson(VALID_BRAND);
    const first = await finalize();
    const dir = dsDir(first.designSystemId);
    const outside = path.join(tempDir, 'outside.css');
    writeFileSync(outside, '/* not yours */\n', 'utf8');
    const variables = path.join(dir, 'system', 'variables.css');
    rmSync(variables);
    symlinkSync(outside, variables);

    writeBrandJson(RECOLORED_BRAND);
    await finalize();

    expect(lstatSync(variables).isSymbolicLink()).toBe(true);
    expect(readFileSync(outside, 'utf8')).toBe('/* not yours */\n');
  });

  it('still prunes generator-owned files the brand no longer produces from the design system', async () => {
    const { projectDir, writeBrandJson, finalize } = await setup();
    mkdirSync(path.join(projectDir, 'logos'), { recursive: true });
    writeFileSync(path.join(projectDir, 'logos', 'old.svg'), '<svg id="old"/>', 'utf8');
    writeFileSync(path.join(projectDir, 'logos', 'keep.svg'), '<svg id="keep"/>', 'utf8');
    writeBrandJson(VALID_BRAND);
    const first = await finalize();
    const dir = dsDir(first.designSystemId);
    expect(existsSync(path.join(dir, 'logos', 'old.svg'))).toBe(true);

    rmSync(path.join(projectDir, 'logos', 'old.svg'));
    writeFileSync(path.join(dir, 'logos', 'mine.svg'), '<svg id="mine"/>', 'utf8');
    await finalize();

    expect(existsSync(path.join(dir, 'logos', 'old.svg'))).toBe(false);
    expect(existsSync(path.join(dir, 'logos', 'keep.svg'))).toBe(true);
    expect(readFileSync(path.join(dir, 'logos', 'mine.svg'), 'utf8')).toBe('<svg id="mine"/>');
  });

  it('never deletes a path named by a crafted manifest key outside the design system', async () => {
    const { writeBrandJson, finalize } = await setup();
    writeBrandJson(VALID_BRAND);
    const first = await finalize();
    const dir = dsDir(first.designSystemId);
    const victim = path.join(tempDir, 'victim.txt');
    writeFileSync(victim, 'keep me\n', 'utf8');
    const manifestPath = path.join(dir, '.od-generated.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    manifest['system/../../../victim.txt'] = createHash('sha256').update('keep me\n').digest('hex');
    writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    await finalize();

    expect(readFileSync(victim, 'utf8')).toBe('keep me\n');
  });

  it('follows project logo changes into the design system of a legacy agent-finalized brand', async () => {
    const { projectDir, writeBrandJson, finalize } = await setup();
    const projectLogo = path.join(projectDir, 'logos', 'mark.svg');
    mkdirSync(path.dirname(projectLogo), { recursive: true });
    writeFileSync(projectLogo, '<svg id="v1"/>', 'utf8');
    writeBrandJson(VALID_BRAND);
    const first = await finalize();
    const dir = dsDir(first.designSystemId);
    rmSync(path.join(projectDir, '.od-generated.json'), { force: true });
    rmSync(path.join(dir, '.od-generated.json'), { force: true });

    for (const version of ['v2', 'v3']) {
      writeFileSync(projectLogo, `<svg id="${version}"/>`, 'utf8');
      await finalize();
      expect(readFileSync(path.join(dir, 'logos', 'mark.svg'), 'utf8')).toBe(`<svg id="${version}"/>`);
    }
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'keeps files that landed before a failed finalize refreshable',
    async () => {
      const { projectDir, writeBrandJson, finalize } = await setup();
      writeBrandJson(VALID_BRAND);
      await finalize();
      const themeJson = path.join(projectDir, 'system', 'theme.json');
      chmodSync(themeJson, 0o444);
      writeBrandJson(RECOLORED_BRAND);
      await expect(finalize()).rejects.toThrow();
      chmodSync(themeJson, 0o644);
      // DESIGN.md landed as the recolored output before the failure.
      expect(readFileSync(path.join(projectDir, 'DESIGN.md'), 'utf8')).toContain('Cobalt');

      writeBrandJson(VALID_BRAND);
      await finalize();

      expect(readFileSync(path.join(projectDir, 'DESIGN.md'), 'utf8')).not.toContain('Cobalt');
    },
  );
});
