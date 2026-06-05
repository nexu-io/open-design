import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import type {
  ProjectFile,
  ProjectUiExternalDependency,
  ProjectUiExternalDependencyKind,
  ProjectUiSurface,
  ProjectUiSurfaceConfidence,
  ProjectUiSurfaceKind,
  ProjectUiSurfacePreviewStatus,
} from '@open-design/contracts';

const MAX_GRAPH_FILES = 120;
const MAX_READ_BYTES = 1_500_000;

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.vue', '.svelte'];
const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.pcss', '.postcss'];
const ASSET_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico',
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a',
];
const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const RESOLVE_EXTENSIONS = [
  ...SOURCE_EXTENSIONS,
  ...STYLE_EXTENSIONS,
  ...ASSET_EXTENSIONS,
  ...FONT_EXTENSIONS,
  '.json',
  '.html',
  '.htm',
];

const FRAME_WRAPPER_FILE_RE = /(^|\/)(frames?\/|device-frames?\/)|(^|\/)(browser-chrome|device-frame)\.html?$/i;
const GENERATED_EDITABLE_SNAPSHOT_RE = /^design-snapshots\//u;
const IMPORT_SPEC_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CSS_IMPORT_RE = /@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/g;
const CSS_URL_RE = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
const JSX_STATIC_ASSET_RE = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/g;

type FileMap = Map<string, ProjectFile>;

interface PackageInfo {
  dir: string;
  name: string;
  version?: string;
  dependencies: Record<string, string>;
  entryCandidates: string[];
}

interface DiscoveryContext {
  projectRoot: string;
  files: ProjectFile[];
  fileMap: FileMap;
  packages: PackageInfo[];
  rootPackage: PackageInfo | null;
  framework: string | null;
  hasNodeModules: boolean;
}

interface GraphResult {
  files: Set<string>;
  externalDependencies: Map<string, ProjectUiExternalDependency>;
}

export async function discoverProjectUiSurfaces(input: {
  projectRoot: string;
  files: ProjectFile[];
  entryFile?: string | null;
}): Promise<ProjectUiSurface[]> {
  const fileMap = new Map(input.files.map((file) => [normalizeProjectPath(file.name), file]));
  const packages = await readPackageInfos(input.projectRoot, input.files, fileMap);
  const rootPackage = packages.find((pkg) => pkg.dir === '') ?? packages[0] ?? null;
  const framework = detectFramework(rootPackage, input.files);
  const hasNodeModules = await exists(path.join(input.projectRoot, 'node_modules'));
  const ctx: DiscoveryContext = {
    projectRoot: input.projectRoot,
    files: input.files,
    fileMap,
    packages,
    rootPackage,
    framework,
    hasNodeModules,
  };

  const surfaces: ProjectUiSurface[] = [];
  const htmlShells = await findAppShellHtmlFiles(ctx);

  for (const page of findNextRouteFiles(input.files)) {
    surfaces.push(await buildCodeSurface(ctx, page, {
      kind: 'next-route',
      route: routeForNextFile(page),
      framework: 'Next.js',
      confidence: 'high',
      reasons: ['Next.js route file detected'],
      includeLayouts: true,
    }));
  }

  const reactEntry = findReactAppEntry(ctx);
  if (reactEntry) {
    surfaces.push(await buildCodeSurface(ctx, reactEntry.entryFile, {
      kind: 'react-app',
      route: '/',
      framework: framework ?? reactEntry.framework,
      previewFile: reactEntry.previewFile,
      confidence: 'medium',
      reasons: reactEntry.reasons,
      includeHtmlRefs: reactEntry.previewFile,
    }));
  }

  for (const html of findHtmlScreenFiles(input.files)) {
    if (htmlShells.has(html)) continue;
    surfaces.push(await buildHtmlSurface(ctx, html, input.entryFile === html));
  }

  if (surfaces.length === 0) {
    const fallback = input.entryFile && fileMap.has(input.entryFile)
      ? input.entryFile
      : findFallbackSourceEntry(input.files);
    if (fallback) {
      surfaces.push(await buildCodeSurface(ctx, fallback, {
        kind: isHtmlFile(fallback) ? 'static-html' : 'source-entry',
        route: null,
        framework,
        confidence: 'low',
        reasons: ['Best available frontend-like file'],
      }));
    }
  }

  return dedupeSurfaces(surfaces).sort((a, b) => surfaceSortRank(a) - surfaceSortRank(b));
}

async function buildHtmlSurface(
  ctx: DiscoveryContext,
  entryFile: string,
  preferred: boolean,
): Promise<ProjectUiSurface> {
  const graph = await collectDependencyGraph(ctx, [entryFile], { htmlEntry: entryFile });
  return buildSurface(ctx, entryFile, graph, {
    kind: 'static-html',
    route: routeForHtmlFile(entryFile),
    framework: null,
    previewFile: entryFile,
    previewStatus: 'live-preview',
    confidence: preferred ? 'high' : 'medium',
    reasons: preferred ? ['Imported project entry file'] : ['HTML screen file detected'],
  });
}

async function buildCodeSurface(
  ctx: DiscoveryContext,
  entryFile: string,
  options: {
    kind: ProjectUiSurfaceKind;
    route: string | null;
    framework: string | null;
    previewFile?: string | null;
    previewStatus?: ProjectUiSurfacePreviewStatus;
    confidence: ProjectUiSurfaceConfidence;
    reasons: string[];
    includeLayouts?: boolean;
    includeHtmlRefs?: string | null;
  },
): Promise<ProjectUiSurface> {
  const seedFiles = [entryFile];
  if (options.includeLayouts) seedFiles.push(...layoutFilesForNextRoute(ctx, entryFile));
  if (options.includeHtmlRefs) seedFiles.push(options.includeHtmlRefs);
  const graph = await collectDependencyGraph(ctx, seedFiles, {
    htmlEntry: options.includeHtmlRefs ?? null,
  });
  const previewStatus = options.previewStatus ?? frameworkPreviewStatus(options.framework, ctx.hasNodeModules);
  return buildSurface(ctx, entryFile, graph, {
    kind: options.kind,
    route: options.route,
    framework: options.framework,
    previewFile: options.previewFile ?? null,
    previewStatus,
    confidence: options.confidence,
    reasons: options.reasons,
  });
}

function buildSurface(
  ctx: DiscoveryContext,
  entryFile: string,
  graph: GraphResult,
  options: {
    kind: ProjectUiSurfaceKind;
    route: string | null;
    framework: string | null;
    previewFile: string | null;
    previewStatus: ProjectUiSurfacePreviewStatus;
    confidence: ProjectUiSurfaceConfidence;
    reasons: string[];
  },
): ProjectUiSurface {
  const files = [...graph.files].filter((name) => ctx.fileMap.has(name));
  const styleFiles = files.filter(isStyleFile).sort(compareProjectPaths);
  const fontFiles = files.filter(isFontFile).sort(compareProjectPaths);
  const assetFiles = files.filter((file) => isAssetFile(file) && !isFontFile(file)).sort(compareProjectPaths);
  const scriptFiles = files.filter((file) => isPlainScriptFile(file)).sort(compareProjectPaths);
  const sourceFiles = files
    .filter((file) => isHtmlFile(file) || isComponentSourceFile(file))
    .sort(compareProjectPaths);
  const entry = ctx.fileMap.get(entryFile);
  const mtime = Math.max(
    entry?.mtime ?? 0,
    ...files.map((file) => ctx.fileMap.get(file)?.mtime ?? 0),
  );
  return {
    id: surfaceId(entryFile, options.route),
    label: labelForSurface(entryFile, options.route),
    route: options.route,
    kind: options.kind,
    confidence: options.confidence,
    framework: options.framework,
    entryFile,
    previewFile: options.previewFile,
    previewRuntimeRoot: previewRuntimeRootForSurface(ctx, entryFile, options.kind),
    previewPath: previewPathForRoute(options.route),
    previewStatus: options.previewStatus,
    sourceFiles,
    styleFiles,
    scriptFiles,
    assetFiles,
    fontFiles,
    externalDependencies: [...graph.externalDependencies.values()].sort((a, b) =>
      a.packageName.localeCompare(b.packageName) || (a.importPath ?? '').localeCompare(b.importPath ?? ''),
    ),
    reasons: options.reasons,
    mtime,
  };
}

async function collectDependencyGraph(
  ctx: DiscoveryContext,
  seedFiles: string[],
  options: { htmlEntry?: string | null } = {},
): Promise<GraphResult> {
  const files = new Set<string>();
  const externalDependencies = new Map<string, ProjectUiExternalDependency>();
  const queue = seedFiles.map(normalizeProjectPath).filter((file) => ctx.fileMap.has(file));

  while (queue.length > 0 && files.size < MAX_GRAPH_FILES) {
    const current = queue.shift()!;
    if (files.has(current)) continue;
    files.add(current);
    const refs = await referencesForFile(ctx, current, options.htmlEntry === current);
    for (const local of refs.localFiles) {
      if (!files.has(local) && ctx.fileMap.has(local)) queue.push(local);
    }
    for (const dep of refs.externalDependencies) {
      externalDependencies.set(`${dep.packageName}:${dep.importPath ?? dep.packageName}`, dep);
    }
  }

  return { files, externalDependencies };
}

async function referencesForFile(
  ctx: DiscoveryContext,
  file: string,
  forceHtmlRefs: boolean,
): Promise<{ localFiles: string[]; externalDependencies: ProjectUiExternalDependency[] }> {
  const text = await readProjectText(ctx, file);
  if (text == null) return { localFiles: [], externalDependencies: [] };
  if (isHtmlFile(file) || forceHtmlRefs) return parseHtmlReferences(ctx, file, text);
  if (isStyleFile(file)) return parseCssReferences(ctx, file, text);
  if (isScriptLikeFile(file)) return parseScriptReferences(ctx, file, text);
  return { localFiles: [], externalDependencies: [] };
}

function parseHtmlReferences(
  ctx: DiscoveryContext,
  file: string,
  text: string,
): { localFiles: string[]; externalDependencies: ProjectUiExternalDependency[] } {
  const $ = load(text);
  const refs = new Set<string>();
  const addAttr = (selector: string, attr: string) => {
    $(selector).each((_, el) => {
      const value = $(el).attr(attr);
      if (value) refs.add(value);
    });
  };
  addAttr('link[href]', 'href');
  addAttr('script[src]', 'src');
  addAttr('img[src]', 'src');
  addAttr('source[src]', 'src');
  addAttr('video[src]', 'src');
  addAttr('video[poster]', 'poster');
  addAttr('audio[src]', 'src');
  const localFiles = [...refs]
    .map((specifier) => resolveReference(ctx, file, specifier))
    .filter((resolved): resolved is string => typeof resolved === 'string');
  return { localFiles, externalDependencies: [] };
}

function parseCssReferences(
  ctx: DiscoveryContext,
  file: string,
  text: string,
): { localFiles: string[]; externalDependencies: ProjectUiExternalDependency[] } {
  const importRefs = new Set<string>();
  const urlRefs = new Set<string>();
  for (const match of text.matchAll(CSS_IMPORT_RE)) importRefs.add(match[1] ?? '');
  for (const match of text.matchAll(CSS_URL_RE)) urlRefs.add(match[1] ?? '');
  const localFiles = [...importRefs, ...urlRefs]
    .map((specifier) => resolveReference(ctx, file, specifier))
    .filter((resolved): resolved is string => typeof resolved === 'string');
  const externalDependencies = [...importRefs]
    .map((specifier) => externalDependencyForCssImport(ctx, file, specifier))
    .filter((dep): dep is ProjectUiExternalDependency => dep != null);
  return { localFiles, externalDependencies };
}

function parseScriptReferences(
  ctx: DiscoveryContext,
  file: string,
  text: string,
): { localFiles: string[]; externalDependencies: ProjectUiExternalDependency[] } {
  const localFiles = new Set<string>();
  const externalDependencies = new Map<string, ProjectUiExternalDependency>();
  for (const match of text.matchAll(IMPORT_SPEC_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';
    if (!specifier) continue;
    const resolved = resolveImportSpecifier(ctx, file, specifier);
    if (typeof resolved === 'string') {
      localFiles.add(resolved);
    } else if (resolved) {
      externalDependencies.set(`${resolved.packageName}:${resolved.importPath ?? resolved.packageName}`, resolved);
    }
  }
  for (const match of text.matchAll(JSX_STATIC_ASSET_RE)) {
    const resolved = resolveReference(ctx, file, match[1] ?? '');
    if (resolved) localFiles.add(resolved);
  }
  return { localFiles: [...localFiles], externalDependencies: [...externalDependencies.values()] };
}

function resolveImportSpecifier(
  ctx: DiscoveryContext,
  fromFile: string,
  specifier: string,
): string | ProjectUiExternalDependency | null {
  if (isExternalUrl(specifier) || specifier.startsWith('data:')) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return resolveLocalModule(ctx, fromFile, specifier);
  }
  if (specifier.startsWith('@/')) {
    return resolveModulePath(ctx, `src/${specifier.slice(2)}`);
  }
  if (specifier.startsWith('~/')) {
    return resolveModulePath(ctx, specifier.slice(2));
  }
  const localPackage = resolveLocalPackageImport(ctx, specifier);
  if (localPackage) return localPackage;
  const packageName = packageNameForImport(specifier);
  const version = versionForPackage(ctx.rootPackage, packageName);
  return {
    packageName,
    importPath: specifier,
    kind: classifyExternalDependency(packageName, specifier),
    ...(version ? { version } : {}),
  };
}

function resolveReference(ctx: DiscoveryContext, fromFile: string, raw: string): string | null {
  const cleaned = cleanReference(raw);
  if (!cleaned || isExternalUrl(cleaned) || cleaned.startsWith('data:') || cleaned.startsWith('#')) return null;
  if (cleaned.startsWith('/')) return resolveModulePath(ctx, cleaned.slice(1));
  return resolveLocalModule(ctx, fromFile, cleaned);
}

function externalDependencyForCssImport(
  ctx: DiscoveryContext,
  fromFile: string,
  raw: string,
): ProjectUiExternalDependency | null {
  const cleaned = cleanReference(raw);
  if (
    !cleaned ||
    cleaned.startsWith('.') ||
    cleaned.startsWith('/') ||
    cleaned.startsWith('#') ||
    cleaned.startsWith('data:') ||
    isExternalUrl(cleaned)
  ) {
    return null;
  }
  if (resolveLocalModule(ctx, fromFile, cleaned)) return null;
  const packageName = packageNameForImport(cleaned);
  const version = versionForPackage(ctx.rootPackage, packageName);
  return {
    packageName,
    importPath: cleaned,
    kind: classifyExternalDependency(packageName, cleaned),
    ...(version ? { version } : {}),
  };
}

function cleanReference(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '').split('#')[0]!.split('?')[0]!;
}

function resolveLocalModule(ctx: DiscoveryContext, fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('/')
    ? specifier.slice(1)
    : normalizeProjectPath(path.posix.join(path.posix.dirname(fromFile), specifier));
  return resolveModulePath(ctx, base);
}

function resolveLocalPackageImport(ctx: DiscoveryContext, specifier: string): string | null {
  const pkg = ctx.packages.find((candidate) =>
    specifier === candidate.name || specifier.startsWith(`${candidate.name}/`),
  );
  if (!pkg) return null;
  if (specifier === pkg.name) {
    for (const candidate of pkg.entryCandidates) {
      const resolved = resolveModulePath(ctx, normalizeProjectPath(path.posix.join(pkg.dir, candidate)));
      if (resolved) return resolved;
    }
    return resolveModulePath(ctx, normalizeProjectPath(path.posix.join(pkg.dir, 'src/index')));
  }
  const suffix = specifier.slice(pkg.name.length + 1);
  return resolveModulePath(ctx, normalizeProjectPath(path.posix.join(pkg.dir, suffix)));
}

function resolveModulePath(ctx: DiscoveryContext, base: string): string | null {
  const normalized = normalizeProjectPath(base);
  if (ctx.fileMap.has(normalized)) return normalized;
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = `${normalized}${ext}`;
    if (ctx.fileMap.has(candidate)) return candidate;
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = normalizeProjectPath(path.posix.join(normalized, `index${ext}`));
    if (ctx.fileMap.has(candidate)) return candidate;
  }
  return null;
}

async function readPackageInfos(
  projectRoot: string,
  files: ProjectFile[],
  fileMap: FileMap,
): Promise<PackageInfo[]> {
  const packageFiles = files
    .map((file) => normalizeProjectPath(file.name))
    .filter((file) => /(^|\/)package\.json$/u.test(file));
  const packages: PackageInfo[] = [];
  for (const file of packageFiles) {
    const parsed = await readJsonFile(projectRoot, file, fileMap);
    if (!parsed || typeof parsed !== 'object') continue;
    const record = parsed as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    const deps = {
      ...recordOfStrings(record.dependencies),
      ...recordOfStrings(record.devDependencies),
      ...recordOfStrings(record.peerDependencies),
      ...recordOfStrings(record.optionalDependencies),
    };
    packages.push({
      dir: normalizeProjectPath(path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file)),
      name,
      dependencies: deps,
      entryCandidates: [
        stringOrNull(record.source),
        stringOrNull(record.module),
        stringOrNull(record.main),
        stringOrNull(record.types),
        'src/index',
        'index',
      ].filter((value): value is string => Boolean(value)),
      ...(typeof record.version === 'string' ? { version: record.version } : {}),
    });
  }
  return packages;
}

async function readJsonFile(projectRoot: string, file: string, fileMap: FileMap): Promise<unknown | null> {
  const projectFile = fileMap.get(file);
  if (!projectFile || projectFile.size > MAX_READ_BYTES) return null;
  try {
    return JSON.parse(await readFile(path.join(projectRoot, file), 'utf8'));
  } catch {
    return null;
  }
}

async function readProjectText(ctx: DiscoveryContext, file: string): Promise<string | null> {
  const projectFile = ctx.fileMap.get(file);
  if (!projectFile || projectFile.size > MAX_READ_BYTES) return null;
  try {
    return await readFile(path.join(ctx.projectRoot, file), 'utf8');
  } catch {
    return null;
  }
}

async function findAppShellHtmlFiles(ctx: DiscoveryContext): Promise<Set<string>> {
  const shellFiles = new Set<string>();
  for (const html of findHtmlScreenFiles(ctx.files)) {
    const text = await readProjectText(ctx, html);
    if (!text) continue;
    const hasRoot = /\bid=["'](?:root|app|__next)["']/i.test(text);
    const hasSourceScript = /<script\b[^>]+src=["']\/?src\/[^"']+\.[cm]?[jt]sx?["']/i.test(text);
    if (hasRoot && hasSourceScript && (ctx.framework === 'Vite' || ctx.framework === 'React')) {
      shellFiles.add(html);
    }
  }
  return shellFiles;
}

function findReactAppEntry(ctx: DiscoveryContext): { entryFile: string; previewFile: string | null; framework: string; reasons: string[] } | null {
  const candidates = [
    'src/main.tsx',
    'src/main.jsx',
    'src/main.ts',
    'src/main.js',
    'src/index.tsx',
    'src/index.jsx',
    'src/App.tsx',
    'src/App.jsx',
    'app/main.tsx',
    'app/main.jsx',
  ];
  const entryFile = candidates.find((candidate) => ctx.fileMap.has(candidate));
  if (!entryFile) return null;
  if (ctx.framework === 'Next.js') return null;
  const previewFile = ctx.fileMap.has('index.html') ? 'index.html' : null;
  return {
    entryFile,
    previewFile,
    framework: ctx.framework ?? 'React',
    reasons: [previewFile ? 'React app entry and HTML shell detected' : 'React app entry detected'],
  };
}

function findNextRouteFiles(files: ProjectFile[]): string[] {
  return files
    .map((file) => normalizeProjectPath(file.name))
    .filter((file) =>
      /(^|\/)(src\/)?app\/.*page\.[cm]?[jt]sx?$/u.test(file) ||
      /(^|\/)(src\/)?pages\/.+\.[cm]?[jt]sx?$/u.test(file),
    )
    .filter((file) => !/\/(?:_app|_document|_error)\.[cm]?[jt]sx?$/u.test(file))
    .sort(compareProjectPaths);
}

function findHtmlScreenFiles(files: ProjectFile[]): string[] {
  return files
    .map((file) => normalizeProjectPath(file.name))
    .filter(isHtmlFile)
    .filter((file) => !GENERATED_EDITABLE_SNAPSHOT_RE.test(file))
    .filter((file) => !FRAME_WRAPPER_FILE_RE.test(file))
    .sort(compareProjectPaths);
}

function findFallbackSourceEntry(files: ProjectFile[]): string | null {
  const names = files.map((file) => normalizeProjectPath(file.name));
  return names.find((file) => /^src\/App\.[tj]sx$/u.test(file))
    ?? names.find((file) => /^src\/main\.[tj]sx$/u.test(file))
    ?? names.find((file) => /^src\/index\.[tj]sx$/u.test(file))
    ?? names.find((file) => isHtmlFile(file) && !GENERATED_EDITABLE_SNAPSHOT_RE.test(file))
    ?? null;
}

function layoutFilesForNextRoute(ctx: DiscoveryContext, entryFile: string): string[] {
  if (!/(^|\/)(src\/)?app\//u.test(entryFile)) return [];
  const parts = entryFile.split('/');
  const appIndex = parts.findIndex((part) => part === 'app');
  if (appIndex < 0) return [];
  const layouts: string[] = [];
  for (let end = appIndex; end < parts.length - 1; end++) {
    const dir = parts.slice(0, end + 1).join('/');
    for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
      const candidate = `${dir}/layout${ext}`;
      if (ctx.fileMap.has(candidate)) layouts.push(candidate);
    }
  }
  return layouts;
}

function routeForNextFile(file: string): string {
  const normalized = normalizeProjectPath(file);
  const appMatch = /(?:^|\/)(?:src\/)?app\/(.+)\/page\.[cm]?[jt]sx?$/u.exec(normalized);
  if (appMatch) return routeFromSegments(appMatch[1] ?? '');
  const appRootMatch = /(?:^|\/)(?:src\/)?app\/page\.[cm]?[jt]sx?$/u.exec(normalized);
  if (appRootMatch) return '/';
  const pagesMatch = /(?:^|\/)(?:src\/)?pages\/(.+)\.[cm]?[jt]sx?$/u.exec(normalized);
  if (!pagesMatch) return normalized;
  const route = pagesMatch[1] ?? '';
  if (route === 'index') return '/';
  return routeFromSegments(route.replace(/\/index$/u, ''));
}

function routeFromSegments(value: string): string {
  const route = value
    .split('/')
    .filter((segment) => segment && !segment.startsWith('('))
    .map((segment) => segment.replace(/^\[(.+)\]$/u, ':$1'))
    .join('/');
  return `/${route}`.replace(/\/+/g, '/') || '/';
}

function previewPathForRoute(route: string | null): string | null {
  if (!route) return null;
  return route
    .split('/')
    .map((segment) => segment.startsWith(':') ? 'preview' : segment)
    .join('/')
    .replace(/\/+/g, '/') || '/';
}

function previewRuntimeRootForSurface(
  ctx: DiscoveryContext,
  entryFile: string,
  kind: ProjectUiSurfaceKind,
): string | null {
  if (kind === 'static-html') return null;
  const pkg = packageInfoForFile(ctx, entryFile);
  return pkg?.dir ?? '';
}

function packageInfoForFile(ctx: DiscoveryContext, file: string): PackageInfo | null {
  const normalized = normalizeProjectPath(file);
  const matches = ctx.packages
    .filter((pkg) => pkg.dir === '' || normalized === pkg.dir || normalized.startsWith(`${pkg.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length);
  return matches[0] ?? ctx.rootPackage;
}

function routeForHtmlFile(file: string): string {
  const normalized = normalizeProjectPath(file);
  if (/^index\.html?$/iu.test(normalized)) return '/';
  return `/${normalized.replace(/\.html?$/iu, '').replace(/\/index$/iu, '')}`;
}

function detectFramework(rootPackage: PackageInfo | null, files: ProjectFile[]): string | null {
  const deps = rootPackage?.dependencies ?? {};
  if ('next' in deps) return 'Next.js';
  if ('vite' in deps) return 'Vite';
  if ('react' in deps) return 'React';
  if ('vue' in deps) return 'Vue';
  if ('svelte' in deps || '@sveltejs/kit' in deps) return 'Svelte';
  if (files.some((file) => /(^|\/)next\.config\.(mjs|js|ts)$/u.test(file.name))) return 'Next.js';
  if (files.some((file) => /(^|\/)vite\.config\.(mjs|js|ts)$/u.test(file.name))) return 'Vite';
  return null;
}

function frameworkPreviewStatus(framework: string | null, hasNodeModules: boolean): ProjectUiSurfacePreviewStatus {
  if (!framework) return 'source-mapped';
  return hasNodeModules ? 'source-mapped' : 'needs-setup';
}

function classifyExternalDependency(packageName: string, importPath: string): ProjectUiExternalDependencyKind {
  const value = `${packageName} ${importPath}`.toLowerCase();
  if (value.includes('font')) return 'font';
  if (/(lucide|icon|heroicons|phosphor|tabler)/u.test(value)) return 'icons';
  if (/(motion|framer|gsap|anime|spring|lottie)/u.test(value)) return 'animation';
  if (/(tailwind|styled|emotion|stitches|vanilla-extract|sass)/u.test(value)) return 'styling';
  if (/(radix|headlessui|ariakit|chakra|mui|antd|shadcn|react-aria)/u.test(value)) return 'ui';
  if (/(chart|d3|recharts|visx|echarts|nivo)/u.test(value)) return 'chart';
  if (/(react|next|vue|svelte|vite)/u.test(value)) return 'runtime';
  return 'unknown';
}

function packageNameForImport(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return [scope, name].filter(Boolean).join('/');
  }
  return specifier.split('/')[0] ?? specifier;
}

function versionForPackage(rootPackage: PackageInfo | null, packageName: string): string | undefined {
  return rootPackage?.dependencies[packageName];
}

function dedupeSurfaces(surfaces: ProjectUiSurface[]): ProjectUiSurface[] {
  const seen = new Set<string>();
  const result: ProjectUiSurface[] = [];
  for (const surface of surfaces) {
    const key = `${surface.kind}:${surface.route ?? surface.entryFile}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(surface);
  }
  return result;
}

function surfaceSortRank(surface: ProjectUiSurface): number {
  const routeRank = surface.route === '/' ? 0 : 20;
  const kindRank = surface.kind === 'next-route' || surface.kind === 'react-app' ? 0 : surface.kind === 'static-html' ? 10 : 30;
  return routeRank + kindRank + (surface.confidence === 'high' ? 0 : surface.confidence === 'medium' ? 4 : 8);
}

function labelForSurface(entryFile: string, route: string | null): string {
  if (route === '/') return 'Home screen';
  const source = route && route !== '/' ? route : entryFile.replace(/\.[^.]+$/u, '');
  const last = source.split('/').filter(Boolean).pop() ?? source;
  const label = last
    .replace(/^page$/iu, path.posix.basename(path.posix.dirname(entryFile)))
    .replace(/^\[(.+)\]$/u, '$1')
    .replace(/^:(.+)$/u, '$1')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
  return label ? `${label} screen` : entryFile;
}

function surfaceId(entryFile: string, route: string | null): string {
  return `${route ?? entryFile}:${entryFile}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ui-surface';
}

function isHtmlFile(file: string): boolean {
  return /\.html?$/iu.test(file);
}

function isStyleFile(file: string): boolean {
  return STYLE_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));
}

function isFontFile(file: string): boolean {
  return FONT_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));
}

function isAssetFile(file: string): boolean {
  return ASSET_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext)) || isFontFile(file);
}

function isScriptLikeFile(file: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));
}

function isComponentSourceFile(file: string): boolean {
  return /\.(tsx|jsx|vue|svelte)$/iu.test(file) || /\.(ts|js|mjs|cjs)$/iu.test(file);
}

function isPlainScriptFile(file: string): boolean {
  return /\.(js|mjs|cjs|ts)$/iu.test(file) && !/\.d\.ts$/iu.test(file);
}

function isExternalUrl(value: string): boolean {
  return /^(?:https?:|mailto:|tel:|\/\/)/iu.test(value);
}

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function compareProjectPaths(a: string, b: string): number {
  return a.localeCompare(b);
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw;
  }
  return out;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
