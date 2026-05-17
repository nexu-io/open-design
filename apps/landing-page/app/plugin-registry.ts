import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type TrustTier = 'official' | 'trusted' | 'restricted';

type RawMarketplace = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  trust?: unknown;
  plugins?: unknown;
};

type RawPluginEntry = {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  version?: unknown;
  tags?: unknown;
  source?: unknown;
  dist?: unknown;
  integrity?: unknown;
  publisher?: unknown;
  homepage?: unknown;
  license?: unknown;
  capabilitiesSummary?: unknown;
  mode?: unknown;
  taskKind?: unknown;
  preview?: unknown;
  yanked?: unknown;
  deprecated?: unknown;
};

type RawPluginManifest = {
  name?: unknown;
  title?: unknown;
  description?: unknown;
  version?: unknown;
  tags?: unknown;
  homepage?: unknown;
  license?: unknown;
  od?: unknown;
};

type RawOdMetadata = {
  kind?: unknown;
  mode?: unknown;
  surface?: unknown;
  taskKind?: unknown;
  capabilities?: unknown;
  preview?: unknown;
  useCase?: unknown;
};

export type PublicPluginPreview = {
  type: 'html' | 'image' | 'video';
  label: string;
  poster: string | undefined;
  frameHref: string | undefined;
  localHtmlPath: string | undefined;
};

export type PublicPluginEntry = {
  id: string;
  slug: string;
  title: string;
  description: string;
  version: string;
  registryId: string;
  registryName: string;
  trust: TrustTier;
  source: string;
  sourceUrl: string | undefined;
  registryUrl: string;
  detailHref: string;
  installCommand: string;
  directInstallCommand: string;
  tags: string[];
  capabilities: string[];
  publisher: string | undefined;
  homepage: string | undefined;
  license: string | undefined;
  integrity: string | undefined;
  mode: string | undefined;
  taskKind: string | undefined;
  surface: string | undefined;
  visualKind: string;
  preview: PublicPluginPreview | undefined;
  exampleQuery: string | undefined;
  yanked: boolean;
  deprecated: boolean;
  searchText: string;
};

const REPO = 'https://github.com/nexu-io/open-design';
const RAW_REPO = 'https://raw.githubusercontent.com/nexu-io/open-design/main';
const findRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
    fileURLToPath(new URL('../../..', import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'pnpm-workspace.yaml'))) {
      return candidate;
    }
  }

  return fileURLToPath(new URL('../../..', import.meta.url));
};

const REPO_ROOT = findRepoRoot();
const REGISTRY_ROOT = path.join(REPO_ROOT, 'plugins', 'registry');
const OFFICIAL_PLUGINS_ROOT = path.join(REPO_ROOT, 'plugins', '_official');

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asBoolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : false;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : [];

const toPosix = (value: string) => value.split(path.sep).join('/');

const isFile = (filePath: string) => {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const normalizeTrust = (value: unknown, fallback: TrustTier): TrustTier => {
  const trust = asString(value);
  if (trust === 'official' || trust === 'trusted' || trust === 'restricted') {
    return trust;
  }
  return fallback;
};

const registryTrustFallback = (registryId: string): TrustTier =>
  registryId === 'official' ? 'official' : 'restricted';

const titleize = (value: string) =>
  value
    .split(/[-_/]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const slugSegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plugin';

const detailHrefFor = (id: string) =>
  `/plugins/${id.split('/').map(slugSegment).join('/')}/`;

const previewHrefFor = (id: string) =>
  `/plugins/previews/${id.split('/').map(slugSegment).join('/')}/`;

const sourceUrlFromSource = (source: string): string | undefined => {
  const match = /^github:([^/]+)\/([^@]+)@([^/]+)\/(.+)$/.exec(source);
  if (!match) {
    return source.startsWith('http://') || source.startsWith('https://')
      ? source
      : undefined;
  }
  const [, owner, repo, ref, repoPath] = match;
  return `https://github.com/${owner}/${repo}/tree/${ref}/${repoPath}`;
};

const registryUrlFor = (registryId: string) =>
  `${RAW_REPO}/plugins/registry/${registryId}/open-design-marketplace.json`;

const previewLabelFor = (type: string | undefined) => {
  if (type === 'image') return 'Image preview';
  if (type === 'video') return 'Video poster';
  return 'Live HTML preview';
};

const localizedString = (value: unknown): string | undefined => {
  const text = asString(value);
  if (text) {
    return text;
  }

  const record = asRecord(value);
  return (
    asString(record?.en) ??
    asString(record?.['zh-CN']) ??
    asString(record?.['zh']) ??
    Object.values(record ?? {})
      .map((item) => asString(item))
      .find(Boolean)
  );
};

const useCaseQuery = (value: unknown): string | undefined => {
  const record = asRecord(value);
  return localizedString(record?.query);
};

const localPluginPath = (pluginDir: string, entry: string): string | undefined => {
  const resolved = path.resolve(pluginDir, entry);
  const root = path.resolve(pluginDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }
  return isFile(resolved) ? resolved : undefined;
};

const canRenderHtmlPreview = (filePath: string) => {
  try {
    const html = readFileSync(filePath, 'utf8');
    return !/(?:src|href)=["'](?!https?:|\/\/|data:|#|mailto:|tel:)[^"']+/i.test(html);
  } catch {
    return false;
  }
};

const previewFrom = (
  pluginDir: string | undefined,
  id: string,
  rawPreview: unknown,
): PublicPluginPreview | undefined => {
  const preview = asRecord(rawPreview);
  const rawType = asString(preview?.type);
  const poster = asString(preview?.poster);
  const entry = asString(preview?.entry);
  const url = asString(preview?.url);

  if (rawType === 'image' || (!rawType && poster)) {
    return {
      type: 'image',
      label: previewLabelFor('image'),
      poster,
      frameHref: undefined,
      localHtmlPath: undefined,
    };
  }

  if (rawType === 'video') {
    return {
      type: 'video',
      label: previewLabelFor('video'),
      poster,
      frameHref: undefined,
      localHtmlPath: undefined,
    };
  }

  if (rawType === 'html') {
    const localHtmlPath =
      pluginDir && entry ? localPluginPath(pluginDir, entry) : undefined;
    if (localHtmlPath) {
      const frameHref = canRenderHtmlPreview(localHtmlPath)
        ? previewHrefFor(id)
        : undefined;
      return {
        type: 'html',
        label: previewLabelFor('html'),
        poster,
        frameHref,
        localHtmlPath: frameHref ? localHtmlPath : undefined,
      };
    }
  }

  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    return {
      type: 'html',
      label: previewLabelFor('html'),
      poster,
      frameHref: url,
      localHtmlPath: undefined,
    };
  }

  return undefined;
};

const visualKindFor = (
  title: string,
  tags: string[],
  capabilities: string[],
  mode: string | undefined,
  surface: string | undefined,
  preview: PublicPluginPreview | undefined,
) => {
  const haystack = [
    title,
    mode,
    surface,
    preview?.type,
    ...tags,
    ...capabilities,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (preview?.type === 'image' || haystack.includes('image')) return 'image';
  if (preview?.type === 'video' || haystack.includes('video')) return 'video';
  if (
    haystack.includes('deck') ||
    haystack.includes('ppt') ||
    haystack.includes('slide') ||
    haystack.includes('presentation')
  ) {
    return 'deck';
  }
  if (haystack.includes('dashboard') || haystack.includes('report')) return 'dashboard';
  if (haystack.includes('design-system') || haystack.includes('system')) return 'system';
  if (haystack.includes('atom')) return 'atom';
  return 'workflow';
};

const readJson = <T>(filePath: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const findManifestFiles = (dir: string): string[] => {
  if (!existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findManifestFiles(entryPath));
    } else if (entry.isFile() && entry.name === 'open-design.json') {
      files.push(entryPath);
    }
  }
  return files;
};

const entryFromMarketplace = (
  registryId: string,
  registryName: string,
  registryTrust: TrustTier,
  rawEntry: RawPluginEntry,
): PublicPluginEntry | undefined => {
  const id = asString(rawEntry.name);
  const source = asString(rawEntry.source ?? rawEntry.dist);
  if (!id || !source) {
    return undefined;
  }

  const trust = registryTrust;
  const title = asString(rawEntry.title) ?? titleize(id.split('/').at(-1) ?? id);
  const description =
    asString(rawEntry.description) ??
    'Agent-native Open Design workflow packaged as a portable plugin.';
  const tags = asStringArray(rawEntry.tags);
  const capabilities = asStringArray(rawEntry.capabilitiesSummary);
  const version = asString(rawEntry.version) ?? '0.1.0';
  const publisher = publisherLabel(rawEntry.publisher);
  const detailHref = detailHrefFor(id);
  const mode = asString(rawEntry.mode);
  const taskKind = asString(rawEntry.taskKind);
  const surface = undefined;
  const preview = previewFrom(undefined, id, rawEntry.preview);

  return {
    id,
    slug: id.split('/').map(slugSegment).join('/'),
    title,
    description,
    version,
    registryId,
    registryName,
    trust,
    source,
    sourceUrl: sourceUrlFromSource(source),
    registryUrl: registryUrlFor(registryId),
    detailHref,
    installCommand: `od plugin install ${id}`,
    directInstallCommand: `od plugin install ${source}`,
    tags,
    capabilities,
    publisher,
    homepage: asString(rawEntry.homepage),
    license: asString(rawEntry.license),
    integrity: asString(rawEntry.integrity),
    mode,
    taskKind,
    surface,
    visualKind: visualKindFor(title, tags, capabilities, mode, surface, preview),
    preview,
    exampleQuery: undefined,
    yanked: asBoolean(rawEntry.yanked),
    deprecated: asBoolean(rawEntry.deprecated),
    searchText: [
      id,
      title,
      description,
      registryName,
      trust,
      publisher,
      mode,
      taskKind,
      ...tags,
      ...capabilities,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
};

const publisherLabel = (publisher: unknown): string | undefined => {
  const text = asString(publisher);
  if (text) {
    return text;
  }
  const record = asRecord(publisher);
  return asString(record?.name) ?? asString(record?.id) ?? asString(record?.github);
};

const loadRegistryEntries = (): PublicPluginEntry[] => {
  if (!existsSync(REGISTRY_ROOT)) {
    return [];
  }

  const entries: PublicPluginEntry[] = [];
  for (const dirent of readdirSync(REGISTRY_ROOT, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }

    const registryId = dirent.name;
    const manifestPath = path.join(REGISTRY_ROOT, registryId, 'open-design-marketplace.json');
    const manifest = readJson<RawMarketplace>(manifestPath);
    const rawPlugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    const registryName = asString(manifest?.name) ?? titleize(registryId);
    const registryTrust = normalizeTrust(
      manifest?.trust,
      registryTrustFallback(registryId),
    );

    for (const item of rawPlugins) {
      const rawEntry = asRecord(item) as RawPluginEntry | undefined;
      if (!rawEntry) {
        continue;
      }
      const entry = entryFromMarketplace(
        registryId,
        registryName,
        registryTrust,
        rawEntry,
      );
      if (entry) {
        entries.push(entry);
      }
    }
  }

  return entries;
};

const officialEntryFromManifest = (manifestPath: string): PublicPluginEntry | undefined => {
  const manifest = readJson<RawPluginManifest>(manifestPath);
  const pluginName = asString(manifest?.name) ?? path.basename(path.dirname(manifestPath));
  const id = `open-design/${pluginName}`;
  const pluginDir = path.dirname(manifestPath);
  const repoPath = toPosix(path.relative(REPO_ROOT, pluginDir));
  const source = `github:nexu-io/open-design@main/${repoPath}`;
  const od = asRecord(manifest?.od) as RawOdMetadata | undefined;
  const capabilities = asStringArray(od?.capabilities);
  const tags = asStringArray(manifest?.tags);
  const title = asString(manifest?.title) ?? titleize(pluginName);
  const description =
    asString(manifest?.description) ??
    'First-party Open Design workflow packaged as a portable plugin.';
  const detailHref = detailHrefFor(id);
  const mode = asString(od?.mode);
  const taskKind = asString(od?.taskKind);
  const surface = asString(od?.surface);
  const preview = previewFrom(pluginDir, id, od?.preview);
  const exampleQuery = useCaseQuery(od?.useCase);

  return {
    id,
    slug: id.split('/').map(slugSegment).join('/'),
    title,
    description,
    version: asString(manifest?.version) ?? '0.1.0',
    registryId: 'official',
    registryName: 'Official',
    trust: 'official',
    source,
    sourceUrl: `${REPO}/tree/main/${repoPath}`,
    registryUrl: registryUrlFor('official'),
    detailHref,
    installCommand: `od plugin install ${id}`,
    directInstallCommand: `od plugin install ${source}`,
    tags,
    capabilities,
    publisher: undefined,
    homepage: asString(manifest?.homepage),
    license: asString(manifest?.license),
    integrity: undefined,
    mode,
    taskKind,
    surface,
    visualKind: visualKindFor(title, tags, capabilities, mode, surface, preview),
    preview,
    exampleQuery,
    yanked: false,
    deprecated: false,
    searchText: [
      id,
      title,
      description,
      'Official',
      'official',
      mode,
      taskKind,
      surface,
      exampleQuery,
      ...tags,
      ...capabilities,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
};

const loadBundledOfficialEntries = (): PublicPluginEntry[] =>
  findManifestFiles(OFFICIAL_PLUGINS_ROOT)
    .map(officialEntryFromManifest)
    .filter((entry): entry is PublicPluginEntry => Boolean(entry));

export const getPublicPlugins = (): PublicPluginEntry[] => {
  const byId = new Map<string, PublicPluginEntry>();

  for (const entry of loadRegistryEntries()) {
    byId.set(entry.id, entry);
  }

  for (const entry of loadBundledOfficialEntries()) {
    const existing = byId.get(entry.id);
    if (existing) {
      const preview = existing.preview ?? entry.preview;
      const mode = existing.mode ?? entry.mode;
      const taskKind = existing.taskKind ?? entry.taskKind;
      const surface = existing.surface ?? entry.surface;
      const tags = existing.tags.length > 0 ? existing.tags : entry.tags;
      const capabilities =
        existing.capabilities.length > 0 ? existing.capabilities : entry.capabilities;

      byId.set(entry.id, {
        ...existing,
        mode,
        taskKind,
        surface,
        tags,
        capabilities,
        preview,
        exampleQuery: existing.exampleQuery ?? entry.exampleQuery,
        visualKind: visualKindFor(
          existing.title,
          tags,
          capabilities,
          mode,
          surface,
          preview,
        ),
      });
    } else {
      byId.set(entry.id, entry);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const sourceOrder = (entry: PublicPluginEntry) =>
      entry.registryId === 'official' ? 0 : entry.registryId === 'community' ? 1 : 2;
    const order = sourceOrder(left) - sourceOrder(right);
    if (order !== 0) {
      return order;
    }
    return left.title.localeCompare(right.title, 'en');
  });
};

export const getRegistryCounts = (plugins = getPublicPlugins()) => ({
  all: plugins.length,
  official: plugins.filter((plugin) => plugin.registryId === 'official').length,
  community: plugins.filter((plugin) => plugin.registryId === 'community').length,
  restricted: plugins.filter((plugin) => plugin.trust === 'restricted').length,
});

export const getPluginPreviewHtml = (plugin: PublicPluginEntry): string | undefined => {
  const filePath = plugin.preview?.localHtmlPath;
  if (!filePath) {
    return undefined;
  }

  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
};
