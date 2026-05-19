import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractComponentsManifest } from '@open-design/contracts';

export type LocalDesignSystemImportResult = {
  id: string;
  dir: string;
  files: string[];
};

export type LocalDesignSystemImportOptions = {
  now?: Date;
  name?: string;
  fallbackName?: string;
  reservedIds?: Iterable<string>;
  source?: DesignSystemProjectSource;
  importMode?: 'normalized' | 'hybrid' | 'verbatim';
  craftApplies?: string[];
};

export type DesignSystemProjectSource =
  | {
      type: 'local';
      path: string;
      importedAt?: string;
    }
  | {
      type: 'github';
      url: string;
      branch?: string;
      commit?: string;
      importedAt?: string;
    };

type ProjectScan = {
  sourceRoot: string;
  packageName: string | undefined;
  packageDescription: string | undefined;
  packageTech: string[];
  readmeExcerpt: string | undefined;
  cssVariables: CssVariable[];
  tailwindSignals: string[];
  assets: AssetCandidate[];
  fonts: FileCandidate[];
  components: ComponentSignal[];
  files: ProjectFile[];
};

type CssVariable = {
  name: string;
  value: string;
  source: string;
};

type AssetCandidate = {
  absPath: string;
  relPath: string;
  size: number;
};

type FileCandidate = {
  absPath: string;
  relPath: string;
  size: number;
};

type ProjectFile = {
  absPath: string;
  relPath: string;
  size: number;
};

type ComponentSignal = {
  name: string;
  relPath: string;
  absPath: string;
  size: number;
};

const IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.od',
  '.tmp',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);

const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const COMPONENT_EXTENSIONS = new Set(['.tsx', '.jsx', '.vue', '.svelte']);
const ASSET_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico']);
const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf']);
const COMPONENT_NAMES = ['Button', 'Input', 'Card', 'Nav', 'Navbar', 'Sidebar'];
const TOKEN_FALLBACKS = {
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceWarm: '#f3f4f6',
  fg: '#111827',
  fg2: '#374151',
  muted: '#6b7280',
  meta: '#9ca3af',
  border: '#d1d5db',
  borderSoft: '#e5e7eb',
  accent: '#2563eb',
  accentOn: '#ffffff',
  accentHover: '#1d4ed8',
  accentActive: '#1e40af',
  success: '#16a34a',
  warn: '#d97706',
  danger: '#dc2626',
  fontSans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSerif: 'Georgia, "Times New Roman", serif',
  fontMono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  radius: '10px',
};

export async function importLocalDesignSystemProject(
  sourceRootInput: string,
  userDesignSystemsRoot: string,
  options: LocalDesignSystemImportOptions = {},
): Promise<LocalDesignSystemImportResult> {
  const sourceRoot = await realpath(sourceRootInput);
  const sourceStats = await stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'local project path must be a directory');
  }

  const scan = await scanProject(sourceRoot);
  const displayName = cleanDisplayName(options.name ?? scan.packageName ?? options.fallbackName ?? path.basename(sourceRoot));
  const id = await nextAvailableSlug(userDesignSystemsRoot, slugify(displayName), options.reservedIds);
  const outDir = path.join(userDesignSystemsRoot, id);
  await mkdir(outDir, { recursive: true });
  const importMode = normalizeImportMode(options.importMode);
  const craftApplies = normalizeCraftList(options.craftApplies);

  const files = ['USAGE.md', 'DESIGN.md', 'tokens.css', 'components.html', 'components.manifest.json', 'manifest.json'];
  const designMd = renderDesignMd(id, displayName, scan);
  const tokensCss = renderTokensCss(scan);
  const componentsHtml = renderComponentsHtml(displayName);
  const componentsManifest = extractComponentsManifest({
    brandId: id,
    fixtureHtml: componentsHtml,
    tokensCss,
  });

  await writeFile(path.join(outDir, 'USAGE.md'), renderUsageMd(displayName, scan), 'utf8');
  await writeFile(path.join(outDir, 'DESIGN.md'), designMd, 'utf8');
  await writeFile(path.join(outDir, 'tokens.css'), tokensCss, 'utf8');
  await writeFile(path.join(outDir, 'components.html'), componentsHtml, 'utf8');
  await writeFile(
    path.join(outDir, 'components.manifest.json'),
    `${JSON.stringify(componentsManifest, null, 2)}\n`,
    'utf8',
  );
  files.push(...(await writePreviewFiles(outDir, displayName, scan)));
  files.push(...(await writeSourceEvidenceFiles(outDir, scan)));
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(
      renderManifest(id, displayName, scan, options.now ?? new Date(), options.source, importMode, craftApplies),
      null,
      2,
    )}\n`,
    'utf8',
  );

  const copiedAssets = await copyAssets(scan.assets, outDir);
  const copiedFonts = await copyFonts(scan.fonts, outDir);
  files.push(...copiedAssets);
  files.push(...copiedFonts);
  return { id, dir: outDir, files };
}

export class LocalDesignSystemImportError extends Error {
  constructor(
    readonly code: 'BAD_REQUEST' | 'INTERNAL_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'LocalDesignSystemImportError';
  }
}

async function scanProject(sourceRoot: string): Promise<ProjectScan> {
  const [packageJson, readmeExcerpt, files] = await Promise.all([
    readPackageJson(sourceRoot),
    readReadme(sourceRoot),
    walkProject(sourceRoot),
  ]);
  const styleFiles = files
    .filter((file) => STYLE_EXTENSIONS.has(path.extname(file.absPath).toLowerCase()))
    .slice(0, 80);
  const cssVariables = (await Promise.all(styleFiles.map((file) => readCssVariables(file.absPath, file.relPath))))
    .flat()
    .slice(0, 80);
  return {
    sourceRoot,
    packageName: packageJson.name,
    packageDescription: packageJson.description,
    packageTech: packageJson.tech,
    readmeExcerpt,
    cssVariables,
    tailwindSignals: await readTailwindSignals(sourceRoot),
    assets: await findAssets(sourceRoot, files),
    fonts: findFonts(sourceRoot, files),
    components: findComponentSignals(files),
    files,
  };
}

async function readPackageJson(
  sourceRoot: string,
): Promise<{ name: string | undefined; description: string | undefined; tech: string[] }> {
  try {
    const parsed = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
    const deps = {
      ...(isRecord(parsed.dependencies) ? parsed.dependencies : {}),
      ...(isRecord(parsed.devDependencies) ? parsed.devDependencies : {}),
    };
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      tech: Object.keys(deps).filter((name) =>
        ['@tailwindcss', 'tailwindcss', 'react', 'vue', 'svelte', 'next', 'vite', 'framer-motion'].some((needle) =>
          name.includes(needle),
        ),
      ),
    };
  } catch {
    return { name: undefined, description: undefined, tech: [] };
  }
}

async function readReadme(sourceRoot: string): Promise<string | undefined> {
  for (const name of ['README.md', 'README.zh-CN.md', 'readme.md']) {
    try {
      const raw = await readFile(path.join(sourceRoot, name), 'utf8');
      return compactMarkdown(raw).slice(0, 1400);
    } catch {
      // Try the next common readme name.
    }
  }
  return undefined;
}

async function walkProject(sourceRoot: string): Promise<Array<{ absPath: string; relPath: string; size: number }>> {
  const out: Array<{ absPath: string; relPath: string; size: number }> = [];
  const queue = [sourceRoot];
  while (queue.length > 0 && out.length < 900) {
    const current = queue.shift()!;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.storybook') continue;
      const absPath = path.join(current, entry.name);
      const relPath = path.relative(sourceRoot, absPath);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) queue.push(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const info = await stat(absPath);
        if (info.size > 512 * 1024) continue;
        out.push({ absPath, relPath, size: info.size });
      } catch {
        // Skip files that disappear during the scan.
      }
    }
  }
  return out;
}

async function readCssVariables(absPath: string, relPath: string): Promise<CssVariable[]> {
  try {
    const raw = await readFile(absPath, 'utf8');
    const vars: CssVariable[] = [];
    for (const match of raw.matchAll(/(--[a-zA-Z0-9-_]+)\s*:\s*([^;{}]+);/g)) {
      const name = match[1];
      const value = match[2]?.trim();
      if (name === undefined || value === undefined) continue;
      if (value.length === 0 || value.length > 120) continue;
      vars.push({ name, value, source: relPath });
    }
    return vars;
  } catch {
    return [];
  }
}

async function readTailwindSignals(sourceRoot: string): Promise<string[]> {
  const candidates = [
    'tailwind.config.ts',
    'tailwind.config.js',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
  ];
  for (const candidate of candidates) {
    try {
      const raw = await readFile(path.join(sourceRoot, candidate), 'utf8');
      const signals = new Set<string>();
      for (const key of ['colors', 'fontFamily', 'borderRadius', 'spacing', 'boxShadow']) {
        if (new RegExp(`\\b${key}\\s*:`).test(raw)) signals.add(key);
      }
      return Array.from(signals);
    } catch {
      // Try the next config name.
    }
  }
  return [];
}

async function findAssets(
  sourceRoot: string,
  files: Array<{ absPath: string; relPath: string; size: number }>,
): Promise<AssetCandidate[]> {
  return files
    .filter((file) => {
      const ext = path.extname(file.relPath).toLowerCase();
      const rel = normalizeRel(file.relPath);
      if (!ASSET_EXTENSIONS.has(ext) || file.size > 2 * 1024 * 1024) return false;
      const isAssetRoot =
        rel.startsWith('assets/') || rel.startsWith('public/') || rel.startsWith('src/assets/');
      return isAssetRoot && /(logo|icon|favicon|mark|brand|avatar)/i.test(path.basename(file.relPath));
    })
    .slice(0, 12)
    .map((file) => ({
      absPath: file.absPath,
      relPath: normalizeRel(path.relative(sourceRoot, file.absPath)),
      size: file.size,
    }));
}

function findComponentSignals(files: ProjectFile[]): ComponentSignal[] {
  const found = new Map<string, ComponentSignal>();
  for (const file of files) {
    if (!COMPONENT_EXTENSIONS.has(path.extname(file.relPath).toLowerCase())) continue;
    const basename = path.basename(file.relPath).replace(/\.[^.]+$/, '');
    const component = COMPONENT_NAMES.find((name) => basename.toLowerCase().includes(name.toLowerCase()));
    if (component && !found.has(component)) {
      found.set(component, { name: component, relPath: normalizeRel(file.relPath), absPath: file.absPath, size: file.size });
    }
  }
  return Array.from(found.values()).slice(0, 10);
}

function findFonts(sourceRoot: string, files: ProjectFile[]): FileCandidate[] {
  return files
    .filter((file) => FONT_EXTENSIONS.has(path.extname(file.relPath).toLowerCase()) && file.size <= 2 * 1024 * 1024)
    .slice(0, 8)
    .map((file) => ({
      absPath: file.absPath,
      relPath: normalizeRel(path.relative(sourceRoot, file.absPath)),
      size: file.size,
    }));
}

async function copyAssets(assets: AssetCandidate[], outDir: string): Promise<string[]> {
  if (assets.length === 0) return [];
  const assetsDir = path.join(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  const copied: string[] = [];
  for (const asset of assets) {
    const targetName = slugify(path.basename(asset.relPath, path.extname(asset.relPath))) + path.extname(asset.relPath).toLowerCase();
    await copyFile(asset.absPath, path.join(assetsDir, targetName));
    copied.push(`assets/${targetName}`);
  }
  return copied;
}

async function copyFonts(fonts: FileCandidate[], outDir: string): Promise<string[]> {
  if (fonts.length === 0) return [];
  const fontsDir = path.join(outDir, 'fonts');
  await mkdir(fontsDir, { recursive: true });
  const copied: string[] = [];
  for (const font of fonts) {
    const targetName = slugify(path.basename(font.relPath, path.extname(font.relPath))) + path.extname(font.relPath).toLowerCase();
    await copyFile(font.absPath, path.join(fontsDir, targetName));
    copied.push(`fonts/${targetName}`);
  }
  return copied;
}

async function nextAvailableSlug(
  root: string,
  preferred: string,
  reservedIds: Iterable<string> = [],
): Promise<string> {
  await mkdir(root, { recursive: true });
  const base = preferred || 'imported-design-system';
  const reserved = new Set(reservedIds);
  for (let index = 1; index < 1000; index += 1) {
    const id = index === 1 ? base : `${base}-${index}`;
    if (reserved.has(id)) continue;
    try {
      await stat(path.join(root, id));
    } catch {
      return id;
    }
  }
  throw new LocalDesignSystemImportError('INTERNAL_ERROR', 'could not allocate design system id');
}

function renderManifest(
  id: string,
  name: string,
  scan: ProjectScan,
  now: Date,
  sourceOverride: DesignSystemProjectSource | undefined,
  importMode: 'normalized' | 'hybrid' | 'verbatim',
  craftApplies: string[],
) {
  const importedAt = now.toISOString();
  const source = sourceOverride ?? {
    type: 'local',
    path: scan.sourceRoot,
    importedAt,
  };
  return {
    schemaVersion: 'od-design-system-project/v1',
    id,
    name,
    category: 'Imported',
    description: scan.packageDescription ?? `Extracted from local project ${path.basename(scan.sourceRoot)}.`,
    source: {
      ...source,
      importedAt: source.importedAt ?? importedAt,
    },
    files: {
      design: 'DESIGN.md',
      tokens: 'tokens.css',
      components: 'components.html',
    },
    usage: 'USAGE.md',
    componentsManifest: 'components.manifest.json',
    importMode,
    craft: {
      applies: craftApplies,
      suggested: craftApplies.includes('color') ? [] : ['color'],
      exemptions: [],
    },
    ...(scan.assets.length > 0 ? { assetsDir: 'assets' } : {}),
    ...(scan.fonts.length > 0
      ? {
          fonts: scan.fonts.map((font) => ({
            family: cleanDisplayName(path.basename(font.relPath, path.extname(font.relPath))),
            file: `fonts/${slugify(path.basename(font.relPath, path.extname(font.relPath)))}${path.extname(font.relPath).toLowerCase()}`,
          })),
        }
      : {}),
    preview: {
      dir: 'preview',
      pages: [
        { path: 'preview/colors.html', role: 'colors', title: 'Colors' },
        { path: 'preview/typography.html', role: 'typography', title: 'Typography' },
        { path: 'preview/spacing.html', role: 'spacing', title: 'Spacing' },
        { path: 'preview/components-buttons.html', role: 'buttons', title: 'Buttons' },
        { path: 'preview/components-inputs.html', role: 'inputs', title: 'Inputs' },
        { path: 'preview/app.html', role: 'app', title: 'App Preview' },
      ],
    },
    sourceFiles: {
      scanned: 'source/scanned-files.json',
      evidence: 'source/evidence.md',
      tokens: 'source/tokens.source.json',
      snippets: 'source/snippets/INDEX.json',
    },
  };
}

function normalizeImportMode(value: unknown): 'normalized' | 'hybrid' | 'verbatim' {
  return value === 'normalized' || value === 'verbatim' || value === 'hybrid' ? value : 'hybrid';
}

function normalizeCraftList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const slug = entry.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function renderDesignMd(id: string, name: string, scan: ProjectScan): string {
  const colors = tokenCandidates(scan.cssVariables, ['color', 'accent', 'primary', 'background', 'surface', 'border'])
    .slice(0, 16)
    .map((token) => `- \`${token.name}: ${token.value}\` from \`${token.source}\``);
  const components = scan.components.map((component) => `- ${component.name}: \`${component.relPath}\``);
  const assets = scan.assets.map((asset) => `- \`${asset.relPath}\``);
  return [
    `# ${name}`,
    '',
    '> Category: Imported',
    '> Surface: web',
    '',
    scan.packageDescription ?? `Imported design system extracted from \`${scan.sourceRoot}\`.`,
    '',
    '## Source',
    '',
    `- Project path: \`${scan.sourceRoot}\``,
    `- Design system id: \`${id}\``,
    scan.packageTech.length > 0 ? `- Detected stack: ${scan.packageTech.map((item) => `\`${item}\``).join(', ')}` : '- Detected stack: not declared',
    scan.tailwindSignals.length > 0 ? `- Tailwind signals: ${scan.tailwindSignals.join(', ')}` : '- Tailwind signals: none detected',
    '',
    '## Product Notes',
    '',
    scan.readmeExcerpt ?? 'No README summary was found. Preserve the imported tokens and component proportions when generating new work.',
    '',
    '## Visual Tokens',
    '',
    colors.length > 0 ? colors.join('\n') : '- No CSS custom properties were found; tokens.css uses a neutral fallback palette.',
    '',
    '## Component Signals',
    '',
    components.length > 0 ? components.join('\n') : '- No common Button/Input/Card/Nav/Sidebar component files were detected.',
    '',
    '## Assets',
    '',
    assets.length > 0 ? assets.join('\n') : '- No logo/icon assets were copied for this import.',
    '',
    '## Agent Guidance',
    '',
    '- Use `tokens.css` as the first source of truth for color, radius, spacing, and type.',
    '- Treat `components.html` as a compact fixture for proportions and state styling.',
    '- When a token is a direct extraction from the source project, preserve its semantic role before inventing new values.',
    '',
  ].join('\n');
}

function renderUsageMd(name: string, scan: ProjectScan): string {
  const highlights = [
    scan.packageDescription,
    scan.packageTech.length > 0 ? `Detected stack: ${scan.packageTech.join(', ')}` : undefined,
    scan.cssVariables.length > 0 ? `${scan.cssVariables.length} CSS custom properties found` : undefined,
    scan.components.length > 0 ? `Representative source components: ${scan.components.map((component) => component.name).join(', ')}` : undefined,
  ].filter((line): line is string => line !== undefined);

  return [
    `# ${name} Usage`,
    '',
    '> Auto-generated by Open Design importer. Review and edit before treating it as a canonical brand guide.',
    '',
    '## Read Order',
    '',
    '1. Read `DESIGN.md` for product context and visual principles.',
    '2. Paste `tokens.css` into the first `<style>` block of generated artifacts.',
    '3. Use `components.manifest.json` for available component patterns.',
    '4. Pull `preview/app.html` when layout fidelity matters.',
    '5. Pull `source/snippets/*` only when verbatim source behavior matters.',
    '',
    '## Design Highlights',
    '',
    ...(highlights.length > 0 ? highlights.map((line) => `- ${line}`) : ['- Imported web design system with generated OD tokens.']),
    '',
    '## Do',
    '',
    '- Preserve semantic roles from the source project before inventing new values.',
    '- Use `tokens.css` as the normalized OD token contract.',
    '- Check `source/tokens.source.json` when a source variable name matters.',
    '',
    '## Avoid',
    '',
    '- Do not paste source snippets blindly into production code.',
    '- Do not treat fallback token values as high-confidence source evidence.',
    '- Do not rename OD standard tokens in generated artifacts.',
    '',
  ].join('\n');
}

function renderTokensCss(scan: ProjectScan): string {
  const picked = pickDesignTokens(scan.cssVariables);
  const cssVarLines = scan.cssVariables
    .slice(0, 40)
    .map((token) => `  ${token.name}: ${token.value};`)
    .join('\n');
  return `:root {
  --bg: ${picked.bg};
  --surface: ${picked.surface};
  --surface-warm: ${picked.surfaceWarm};
  --fg: ${picked.fg};
  --fg-2: ${picked.fg2};
  --muted: ${picked.muted};
  --meta: ${picked.meta};
  --border: ${picked.border};
  --border-soft: ${picked.borderSoft};
  --accent: ${picked.accent};
  --accent-on: ${picked.accentOn};
  --accent-hover: ${picked.accentHover};
  --accent-active: ${picked.accentActive};
  --success: ${picked.success};
  --warn: ${picked.warn};
  --danger: ${picked.danger};

  --font-sans: ${picked.fontSans};
  --font-serif: ${picked.fontSerif};
  --font-mono: ${picked.fontMono};
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.25rem;
  --leading-tight: 1.15;
  --leading-body: 1.55;
  --tracking-tight: 0;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-8: 3rem;
  --section-y: clamp(3rem, 7vw, 6rem);

  --radius-sm: 6px;
  --radius-md: ${picked.radius};
  --radius-lg: 14px;
  --elev-1: 0 1px 2px rgb(15 23 42 / 8%);
  --elev-2: 0 18px 45px rgb(15 23 42 / 14%);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
  --motion-fast: 140ms ease;
  --motion-med: 220ms ease;
  --container: 1120px;
  --grid-gap: var(--space-5);
${cssVarLines ? `\n  /* Extracted source variables */\n${cssVarLines}` : ''}
}
`;
}

function renderComponentsHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(name)} components</title>
    <link rel="stylesheet" href="./tokens.css" />
    <style>
      body { margin: 0; font-family: var(--font-sans); color: var(--fg); background: var(--bg); }
      main { max-width: 960px; margin: 0 auto; padding: var(--space-8) var(--space-5); }
      nav { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); border-bottom: 1px solid var(--border-soft); padding-bottom: var(--space-4); }
      .brand { font-weight: 700; font-size: var(--text-lg); }
      .card { margin-top: var(--space-6); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--elev-1); padding: var(--space-6); }
      .row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
      button { border: 1px solid transparent; border-radius: var(--radius-md); padding: 0.7rem 1rem; font: inherit; cursor: pointer; transition: background var(--motion-fast), border-color var(--motion-fast); }
      .primary { background: var(--accent); color: var(--accent-on); }
      .secondary { background: var(--surface-warm); border-color: var(--border); color: var(--fg); }
      input { min-width: 240px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.7rem 0.85rem; font: inherit; color: var(--fg); background: var(--surface); }
      h1 { margin: var(--space-6) 0 var(--space-2); font-size: var(--text-3xl); line-height: var(--leading-tight); }
      p { color: var(--fg-2); line-height: var(--leading-body); }
    </style>
  </head>
  <body>
    <main>
      <nav>
        <div class="brand">${escapeHtml(name)}</div>
        <div class="row"><button class="secondary">Preview</button><button class="primary">Create</button></div>
      </nav>
      <section class="card">
        <h1>Component fixture</h1>
        <p>This fixture gives agents a compact reference for imported tokens, common controls, and card proportions.</p>
        <div class="row">
          <button class="primary">Primary action</button>
          <button class="secondary">Secondary</button>
          <input value="Input value" aria-label="Example input" />
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

async function writePreviewFiles(outDir: string, name: string, scan: ProjectScan): Promise<string[]> {
  const previewDir = path.join(outDir, 'preview');
  await mkdir(previewDir, { recursive: true });
  const pages: Array<[string, string]> = [
    ['colors.html', renderColorsPreview(name, scan)],
    ['typography.html', renderTypographyPreview(name)],
    ['spacing.html', renderSpacingPreview(name)],
    ['components-buttons.html', renderButtonsPreview(name)],
    ['components-inputs.html', renderInputsPreview(name)],
    ['app.html', renderAppPreview(name, scan)],
  ];
  await Promise.all(pages.map(([fileName, html]) => writeFile(path.join(previewDir, fileName), html, 'utf8')));
  return pages.map(([fileName]) => `preview/${fileName}`);
}

async function writeSourceEvidenceFiles(outDir: string, scan: ProjectScan): Promise<string[]> {
  const sourceDir = path.join(outDir, 'source');
  const snippetsDir = path.join(sourceDir, 'snippets');
  await mkdir(snippetsDir, { recursive: true });

  const snippetEntries: Array<{
    path: string;
    role: string;
    language: string;
    sourcePath: string;
    bytes: number;
    reason: string;
  }> = [];
  const writtenSnippetFiles: string[] = [];

  for (const component of scan.components.slice(0, 10)) {
    const ext = path.extname(component.relPath);
    const targetName = `${slugify(path.basename(component.relPath, ext))}${ext}`;
    const targetRel = `source/snippets/${targetName}`;
    await copyFile(component.absPath, path.join(outDir, targetRel));
    snippetEntries.push({
      path: targetRel,
      role: component.name.toLowerCase(),
      language: ext.replace(/^\./, '') || 'text',
      sourcePath: component.relPath,
      bytes: component.size,
      reason: `Representative ${component.name} component detected by filename.`,
    });
    writtenSnippetFiles.push(targetRel);
  }

  await Promise.all([
    writeFile(
      path.join(sourceDir, 'scanned-files.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        sourceRoot: scan.sourceRoot,
        files: scan.files.map((file) => ({
          path: normalizeRel(file.relPath),
          bytes: file.size,
          kind: classifyScannedFile(file.relPath),
        })),
      }, null, 2)}\n`,
      'utf8',
    ),
    writeFile(path.join(sourceDir, 'evidence.md'), renderEvidenceMd(scan), 'utf8'),
    writeFile(
      path.join(sourceDir, 'tokens.source.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        strategy: ['css-vars', ...(scan.tailwindSignals.length > 0 ? ['tailwind-config'] : [])],
        tokenCount: scan.cssVariables.length,
        confidence: {
          color: scan.cssVariables.some((token) => isColorValue(token.value)) ? 'high' : 'low',
          type: scan.fonts.length > 0 ? 'medium' : 'low',
          spacing: scan.tailwindSignals.includes('spacing') ? 'medium' : 'low',
        },
        tokens: scan.cssVariables.map((token) => ({
          name: token.name,
          value: token.value,
          source: token.source,
          normalizedRole: inferTokenRole(token),
        })),
      }, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(snippetsDir, 'INDEX.json'),
      `${JSON.stringify({ schemaVersion: 1, snippets: snippetEntries }, null, 2)}\n`,
      'utf8',
    ),
  ]);

  return [
    'source/scanned-files.json',
    'source/evidence.md',
    'source/tokens.source.json',
    'source/snippets/INDEX.json',
    ...writtenSnippetFiles,
  ];
}

function renderColorsPreview(name: string, scan: ProjectScan): string {
  const colors = pickDesignTokens(scan.cssVariables);
  return renderPreviewPage(
    `${name} colors`,
    'Color evidence',
    ([
      ['Background', '--bg', colors.bg],
      ['Surface', '--surface', colors.surface],
      ['Foreground', '--fg', colors.fg],
      ['Muted', '--muted', colors.muted],
      ['Border', '--border', colors.border],
      ['Accent', '--accent', colors.accent],
      ['Success', '--success', colors.success],
      ['Warning', '--warn', colors.warn],
      ['Danger', '--danger', colors.danger],
    ] satisfies Array<[string, string, string]>).map(([label, token, value]) => `<article class="swatch"><div style="background:${escapeHtml(value)}"></div><strong>${label}</strong><code>${token}: ${escapeHtml(value)}</code></article>`).join('\n'),
  );
}

function renderTypographyPreview(name: string): string {
  return renderPreviewPage(
    `${name} typography`,
    'Typography',
    '<h1>Build focused product surfaces</h1><h2>Section heading</h2><p>Body text uses the imported body token stack and normalized rhythm.</p><code>Code and metadata use the mono token.</code>',
  );
}

function renderSpacingPreview(name: string): string {
  return renderPreviewPage(
    `${name} spacing`,
    'Spacing and radius',
    [1, 2, 3, 4, 5, 6, 8].map((step) => `<article class="meter"><strong>--space-${step}</strong><span style="width:var(--space-${step})"></span></article>`).join('\n'),
  );
}

function renderButtonsPreview(name: string): string {
  return renderPreviewPage(
    `${name} buttons`,
    'Buttons',
    '<p><button class="primary">Primary action</button> <button class="secondary">Secondary action</button></p>',
  );
}

function renderInputsPreview(name: string): string {
  return renderPreviewPage(
    `${name} inputs`,
    'Inputs',
    '<label>Project name<input value="Imported design system" /></label><label>Notes<textarea>Preserve source evidence.</textarea></label>',
  );
}

function renderAppPreview(name: string, scan: ProjectScan): string {
  const componentItems = scan.components.map((component) => `<li>${escapeHtml(component.name)} <code>${escapeHtml(component.relPath)}</code></li>`).join('');
  return renderPreviewPage(
    `${name} app preview`,
    'App preview',
    `<section class="app-shell"><aside><strong>${escapeHtml(name)}</strong><nav>Overview<br/>Components<br/>Assets</nav></aside><main><h1>${escapeHtml(name)}</h1><p>${escapeHtml(scan.packageDescription ?? 'Imported design system preview.')}</p><ul>${componentItems || '<li>No representative components detected.</li>'}</ul></main></section>`,
  );
}

function renderPreviewPage(title: string, heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="../tokens.css" />
    <style>
      body { margin: 0; font-family: var(--font-sans); color: var(--fg); background: var(--bg); }
      main { max-width: 1040px; margin: 0 auto; padding: var(--space-8) var(--space-5); }
      h1 { font-size: var(--text-3xl); line-height: var(--leading-tight); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-4); }
      .swatch, .meter, label { display: grid; gap: var(--space-2); padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
      .swatch div { height: 96px; border-radius: var(--radius-sm); border: 1px solid var(--border-soft); }
      .meter span { display: block; height: 20px; background: var(--accent); border-radius: var(--radius-sm); }
      button { border: 1px solid transparent; border-radius: var(--radius-md); padding: .7rem 1rem; font: inherit; }
      .primary { background: var(--accent); color: var(--accent-on); }
      .secondary { background: var(--surface-warm); border-color: var(--border); color: var(--fg); }
      input, textarea { border: 1px solid var(--border); border-radius: var(--radius-md); padding: .75rem; font: inherit; color: var(--fg); background: var(--surface); }
      .app-shell { display: grid; grid-template-columns: 240px 1fr; min-height: 420px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
      aside { padding: var(--space-5); background: var(--surface-warm); border-right: 1px solid var(--border); }
      aside nav { margin-top: var(--space-5); color: var(--muted); line-height: 2; }
      .app-shell main { margin: 0; padding: var(--space-6); }
    </style>
  </head>
  <body>
    <main>
      <p>Generated preview</p>
      <h1>${escapeHtml(heading)}</h1>
      <section class="grid">${body}</section>
    </main>
  </body>
</html>
`;
}

function renderEvidenceMd(scan: ProjectScan): string {
  return [
    '# Import Evidence',
    '',
    `- Source root: \`${scan.sourceRoot}\``,
    `- Package: ${scan.packageName === undefined ? 'not declared' : `\`${scan.packageName}\``}`,
    `- Description: ${scan.packageDescription ?? 'not declared'}`,
    `- CSS variables: ${scan.cssVariables.length}`,
    `- Tailwind signals: ${scan.tailwindSignals.length > 0 ? scan.tailwindSignals.join(', ') : 'none detected'}`,
    `- Assets copied: ${scan.assets.length}`,
    `- Fonts copied: ${scan.fonts.length}`,
    `- Representative snippets: ${scan.components.length}`,
    '',
    '## Representative Components',
    '',
    scan.components.length > 0
      ? scan.components.map((component) => `- ${component.name}: \`${component.relPath}\``).join('\n')
      : '- None detected.',
    '',
    '## Token Evidence',
    '',
    scan.cssVariables.length > 0
      ? scan.cssVariables.slice(0, 40).map((token) => `- \`${token.name}: ${token.value}\` from \`${token.source}\``).join('\n')
      : '- No CSS custom properties detected; normalized tokens use fallback values.',
    '',
  ].join('\n');
}

function pickDesignTokens(tokens: CssVariable[]): typeof TOKEN_FALLBACKS {
  const valueFor = (needles: string[], fallback: string, validator: (value: string) => boolean = Boolean) =>
    tokenCandidates(tokens, needles).find((token) => validator(token.value))?.value ?? fallback;
  return {
    ...TOKEN_FALLBACKS,
    bg: valueFor(['background', 'bg'], TOKEN_FALLBACKS.bg, isColorValue),
    surface: valueFor(['surface', 'card', 'popover'], TOKEN_FALLBACKS.surface, isColorValue),
    surfaceWarm: valueFor(['muted', 'subtle', 'secondary'], TOKEN_FALLBACKS.surfaceWarm, isColorValue),
    fg: valueFor(['foreground', 'text', 'fg'], TOKEN_FALLBACKS.fg, isColorValue),
    fg2: valueFor(['text-secondary', 'secondary-foreground'], TOKEN_FALLBACKS.fg2, isColorValue),
    muted: valueFor(['muted', 'placeholder'], TOKEN_FALLBACKS.muted, isColorValue),
    border: valueFor(['border'], TOKEN_FALLBACKS.border, isColorValue),
    accent: valueFor(['accent', 'primary', 'brand'], TOKEN_FALLBACKS.accent, isColorValue),
    success: valueFor(['success', 'positive'], TOKEN_FALLBACKS.success, isColorValue),
    warn: valueFor(['warning', 'warn'], TOKEN_FALLBACKS.warn, isColorValue),
    danger: valueFor(['danger', 'error', 'destructive'], TOKEN_FALLBACKS.danger, isColorValue),
    radius: valueFor(['radius'], TOKEN_FALLBACKS.radius, (value) => /^\d/.test(value)),
    fontSans: valueFor(['font-sans', 'font-family', 'font'], TOKEN_FALLBACKS.fontSans),
  };
}

function tokenCandidates(tokens: CssVariable[], needles: string[]): CssVariable[] {
  return tokens.filter((token) => needles.some((needle) => token.name.toLowerCase().includes(needle)));
}

function isColorValue(value: string): boolean {
  return /^(#(?:[0-9a-f]{3,8})|rgb[a]?\(|hsl[a]?\(|oklch\(|color-mix\(|var\()/i.test(value.trim());
}

function classifyScannedFile(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  if (STYLE_EXTENSIONS.has(ext)) return 'style';
  if (COMPONENT_EXTENSIONS.has(ext)) return 'component';
  if (ASSET_EXTENSIONS.has(ext)) return 'asset';
  if (FONT_EXTENSIONS.has(ext)) return 'font';
  if (path.basename(relPath).toLowerCase().includes('readme')) return 'readme';
  if (path.basename(relPath) === 'package.json') return 'package';
  return 'other';
}

function inferTokenRole(token: CssVariable): string | undefined {
  const name = token.name.toLowerCase();
  if (['background', 'bg'].some((needle) => name.includes(needle))) return 'background';
  if (['surface', 'card'].some((needle) => name.includes(needle))) return 'surface';
  if (['foreground', 'text', 'fg'].some((needle) => name.includes(needle))) return 'foreground';
  if (name.includes('border')) return 'border';
  if (['accent', 'primary', 'brand'].some((needle) => name.includes(needle))) return 'accent';
  if (name.includes('radius')) return 'radius';
  if (name.includes('font')) return 'font';
  if (name.includes('space') || name.includes('gap')) return 'spacing';
  return undefined;
}

function compactMarkdown(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[([^\]]+)].*$/, '$1'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 16)
    .join('\n');
}

function cleanDisplayName(value: string): string {
  return value.replace(/^@[^/]+\//, '').replace(/[-_]+/g, ' ').trim() || 'Imported Design System';
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'imported-design-system';
}

function normalizeRel(value: string): string {
  return value.split(path.sep).join('/');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
