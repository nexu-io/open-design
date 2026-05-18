import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  components: ComponentSignal[];
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

type ComponentSignal = {
  name: string;
  relPath: string;
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

  const files = ['DESIGN.md', 'tokens.css', 'components.html', 'manifest.json'];
  await writeFile(path.join(outDir, 'DESIGN.md'), renderDesignMd(id, displayName, scan), 'utf8');
  await writeFile(path.join(outDir, 'tokens.css'), renderTokensCss(scan), 'utf8');
  await writeFile(path.join(outDir, 'components.html'), renderComponentsHtml(displayName), 'utf8');
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(renderManifest(id, displayName, scan, options.now ?? new Date(), options.source), null, 2)}\n`,
    'utf8',
  );

  const copiedAssets = await copyAssets(scan.assets, outDir);
  files.push(...copiedAssets);
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
    components: findComponentSignals(files),
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

function findComponentSignals(files: Array<{ absPath: string; relPath: string }>): ComponentSignal[] {
  const found = new Map<string, ComponentSignal>();
  for (const file of files) {
    if (!COMPONENT_EXTENSIONS.has(path.extname(file.relPath).toLowerCase())) continue;
    const basename = path.basename(file.relPath).replace(/\.[^.]+$/, '');
    const component = COMPONENT_NAMES.find((name) => basename.toLowerCase().includes(name.toLowerCase()));
    if (component && !found.has(component)) {
      found.set(component, { name: component, relPath: normalizeRel(file.relPath) });
    }
  }
  return Array.from(found.values()).slice(0, 10);
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
    ...(scan.assets.length > 0 ? { assetsDir: 'assets' } : {}),
  };
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
