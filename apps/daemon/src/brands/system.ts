import fs from 'node:fs';
import path from 'node:path';

import { assertDeckLayoutSafe } from '../qa/deck-layout.js';
import { injectFontFaces, readFontManifest, type FontFile } from './fonts.js';
import { readBrand, resolveBrandFile, writeBrand } from './store.js';
import { sanitizeSeedOverrides } from './schema.js';
import {
  brandFontAssets,
  buildBrandSystem,
  deriveTokens,
  renderArtifact,
  renderArtifactGallery,
  renderKitPage,
  tokensToCssVars,
  tokensToJson,
  tokensToThemeJson,
  writeBrandSystem,
  type BrandSystem,
  type DesignTokens,
  type SeedToken,
  type ThemeAlgorithm,
} from './engine/index.js';
import type { AssetKind, Brand } from './schema.js';

export const BRAND_ARTIFACT_KINDS: AssetKind[] = [
  'landing',
  'deck',
  'poster',
  'email',
  'newsletter',
  'form',
];

const THEME_ALGORITHMS: ThemeAlgorithm[] = ['default', 'dark', 'compact'];

function brandRoot(brandsRoot: string, id: string): string {
  const dir = resolveBrandFile(brandsRoot, id, []);
  if (!dir) throw new Error(`invalid brand id: ${id}`);
  return dir;
}

export function brandSystemDir(brandsRoot: string, id: string): string {
  return path.join(brandRoot(brandsRoot, id), 'system');
}

function reassembleWithSeed(
  base: BrandSystem,
  brand: Brand,
  seed: SeedToken,
  fontFiles: FontFile[],
): BrandSystem {
  const themes: Record<ThemeAlgorithm, DesignTokens> = {
    default: deriveTokens(seed, 'default'),
    dark: deriveTokens(seed, 'dark'),
    compact: deriveTokens(seed, 'compact'),
  };
  const withFonts = (html: string, depth: 1 | 2) =>
    injectFontFaces(html, fontFiles, depth === 1 ? '../fonts/' : '../../fonts/');

  const files: Record<string, string> = { ...base.files };
  files['seed.json'] = JSON.stringify(seed, null, 2);
  files['tokens.default.json'] = tokensToJson(themes.default);
  files['tokens.dark.json'] = tokensToJson(themes.dark);
  files['tokens.compact.json'] = tokensToJson(themes.compact);
  files['variables.css'] =
    tokensToCssVars(themes.default, ':root') + '\n' + tokensToCssVars(themes.dark, '.dark');
  files['variables.dark.css'] = tokensToCssVars(themes.dark, ':root');
  files['scripts/apply-design-tokens.mjs'] = applyDesignTokensScript();
  files['theme.json'] = tokensToThemeJson(seed, 'default');
  const fonts = brandFontAssets(brand);
  files['kit.html'] = withFonts(
    renderKitPage(themes.default, {
      title: `${brand.name} - component kit`,
      brandName: brand.name,
      fontLinks: fonts.links,
      displayFamily: fonts.displayFamily,
    }),
    1,
  );
  files['kit.dark.html'] = withFonts(
    renderKitPage(themes.dark, {
      title: `${brand.name} - component kit (dark)`,
      brandName: brand.name,
      fontLinks: fonts.links,
      displayFamily: fonts.displayFamily,
    }),
    1,
  );
  for (const kind of BRAND_ARTIFACT_KINDS) {
    files[`artifacts/${kind}.html`] = withFonts(renderArtifact(kind, brand, themes.default), 2);
  }
  files['index.html'] = withFonts(
    renderArtifactGallery(brand, themes.default, {
      decorate: (html) => injectFontFaces(html, fontFiles, '../fonts/'),
    }),
    1,
  );
  return { slug: base.slug, seed, themes, files };
}

function applyDesignTokensScript(): string {
  return `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/apply-design-tokens.mjs <target-css-path>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', 'variables.css');
const destination = path.resolve(process.cwd(), target);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log(\`Copied design tokens to \${destination}\`);
`;
}

export async function rebuildSystem(
  brandsRoot: string,
  id: string,
  seedOverrides?: Partial<SeedToken>,
): Promise<{ themes: string[]; files: string[] }> {
  const brand = readBrand(brandsRoot, id) as Brand | null;
  if (!brand) throw new Error(`brand.json not found for brand "${id}"`);

  if (seedOverrides !== undefined) {
    const merged = sanitizeSeedOverrides({ ...brand.seed, ...seedOverrides });
    if (merged) brand.seed = merged;
    else delete brand.seed;
    writeBrand(brandsRoot, id, brand);
  }

  const overrides = sanitizeSeedOverrides(brand.seed);
  const fontFiles = readFontManifest(brandRoot(brandsRoot, id));
  let system = buildBrandSystem(brand, { fontFiles });
  if (overrides) {
    system = reassembleWithSeed(system, brand, { ...system.seed, ...overrides }, fontFiles);
  }

  // Layout-validation guard: the deck lays content on fixed-size 16:9 slides,
  // so a regressed template can clip / truncate / overflow brand copy. Block
  // the rebuild before anything is written when the no-clip invariants fail.
  const deckHtml = system.files['artifacts/deck.html'];
  if (deckHtml) assertDeckLayoutSafe(deckHtml);

  const outDir = brandSystemDir(brandsRoot, id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const written = writeBrandSystem(system, outDir);
  return {
    themes: Object.keys(system.themes),
    files: written.map((abs) => path.relative(outDir, abs)).sort(),
  };
}

export function listSystemArtifacts(brandsRoot: string, id: string): AssetKind[] {
  const dir = path.join(brandSystemDir(brandsRoot, id), 'artifacts');
  return BRAND_ARTIFACT_KINDS.filter((kind) => fs.existsSync(path.join(dir, `${kind}.html`)));
}

export function readSystemSummary(
  brandsRoot: string,
  id: string,
): {
  hasSystem: boolean;
  seed: SeedToken | null;
  themes: string[];
} {
  const dir = brandSystemDir(brandsRoot, id);
  let seed: SeedToken | null = null;
  try {
    seed = JSON.parse(fs.readFileSync(path.join(dir, 'seed.json'), 'utf8')) as SeedToken;
  } catch {
    seed = null;
  }
  const themes = THEME_ALGORITHMS.filter((t) => fs.existsSync(path.join(dir, `tokens.${t}.json`)));
  return { hasSystem: seed !== null, seed, themes };
}
