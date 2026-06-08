export function resolveHtmlArtifactFileName(input: {
  baseName: string;
  ext: '.html' | '.jsx' | '.tsx';
  existingFileNames: ReadonlySet<string>;
  savedArtifactName?: string | null;
  canOverwriteExistingEntry?: boolean;
}): string {
  const preferredFileName = `${input.baseName}${input.ext}`;
  if (
    input.ext === '.html' &&
    input.baseName.toLowerCase() === 'index' &&
    (!input.existingFileNames.has(preferredFileName) ||
      input.savedArtifactName === preferredFileName ||
      input.canOverwriteExistingEntry === true)
  ) {
    return 'index.html';
  }

  let fileName = preferredFileName;
  let n = 2;
  while (input.existingFileNames.has(fileName) && input.savedArtifactName !== fileName) {
    fileName = `${input.baseName}-${n}${input.ext}`;
    n += 1;
  }
  return fileName;
}

interface HtmlLinkProjectFile {
  name: string;
  path?: string;
  kind?: string;
  mime?: string;
  mtime: number;
  artifactManifest?: {
    entry: string;
    metadata?: Record<string, unknown>;
  };
}

interface HtmlLinkRewriteOptions {
  artifactGroupIdentifier?: string;
}

export function canOverwriteHtmlArtifactEntry(input: {
  baseName: string;
  ext: '.html' | '.jsx' | '.tsx';
  projectFiles: readonly HtmlLinkProjectFile[];
  savedArtifactName?: string | null;
}): boolean {
  if (input.ext !== '.html' || input.baseName.toLowerCase() !== 'index') return false;
  if (input.savedArtifactName === 'index.html') return true;
  const existingIndex = input.projectFiles.find((file) => {
    return file.name === 'index.html' || file.path === 'index.html';
  });
  return !existingIndex;
}

export function rewriteHtmlLinksToCurrentProjectFiles(
  html: string,
  projectFiles: readonly HtmlLinkProjectFile[],
  options: HtmlLinkRewriteOptions = {},
): string {
  const latestByTarget = buildLatestHtmlFileIndex(projectFiles, options);
  if (latestByTarget.size === 0) return html;

  return html.replace(
    /\b(href)\s*=\s*(["'])([^"']+)\2/gi,
    (match, attr: string, quote: string, rawValue: string) => {
      const rewritten = rewriteHtmlLinkTarget(rawValue, latestByTarget);
      return rewritten === rawValue ? match : `${attr}=${quote}${rewritten}${quote}`;
    },
  );
}

function buildLatestHtmlFileIndex(
  projectFiles: readonly HtmlLinkProjectFile[],
  options: HtmlLinkRewriteOptions,
): Map<string, string> {
  const groupedLatest = new Map<string, HtmlLinkProjectFile>();
  const legacyLatest = new Map<string, HtmlLinkProjectFile>();
  const groupedFamilies = new Set<string>();
  const artifactGroupIdentifier = normalizeOptionalIdentifier(options.artifactGroupIdentifier);
  for (const file of projectFiles) {
    if (!isHtmlProjectFile(file)) continue;
    const key = htmlFileFamilyKey(file.name);
    if (!key) continue;
    const manifestMatch = htmlFileManifestFamilyMatch(file, key);
    if (!manifestMatch) continue;

    if (manifestMatch.artifactGroupIdentifier !== null) {
      groupedFamilies.add(key);
    }

    if (
      artifactGroupIdentifier !== null &&
      manifestMatch.artifactGroupIdentifier === artifactGroupIdentifier
    ) {
      const current = groupedLatest.get(key);
      if (!current || file.mtime > current.mtime) groupedLatest.set(key, file);
      continue;
    }

    if (manifestMatch.artifactGroupIdentifier === null) {
      const current = legacyLatest.get(key);
      if (!current || file.mtime > current.mtime) legacyLatest.set(key, file);
    }
  }

  const latest = new Map<string, HtmlLinkProjectFile>();
  for (const [key, file] of legacyLatest) {
    if (!groupedFamilies.has(key)) latest.set(key, file);
  }
  for (const [key, file] of groupedLatest) {
    latest.set(key, file);
  }
  return new Map(Array.from(latest, ([key, file]) => [key, file.name]));
}

function htmlFileManifestFamilyMatch(
  file: HtmlLinkProjectFile,
  familyKey: string,
): { artifactGroupIdentifier: string | null } | null {
  const identifier = file.artifactManifest?.metadata?.identifier;
  if (typeof identifier !== 'string') return null;
  const normalizedIdentifier = normalizeArtifactIdentifier(identifier);
  if (!normalizedIdentifier) return null;
  if (normalizedIdentifier !== htmlFileFamilyIdentifier(familyKey)) return null;

  return {
    artifactGroupIdentifier: normalizeOptionalIdentifier(
      file.artifactManifest?.metadata?.artifactGroupIdentifier,
    ),
  };
}

function isHtmlProjectFile(file: HtmlLinkProjectFile): boolean {
  const name = file.name.toLowerCase();
  return (
    (file.kind === undefined || file.kind === 'html') &&
    (file.mime === undefined || file.mime === 'text/html') &&
    (name.endsWith('.html') || name.endsWith('.htm'))
  );
}

function rewriteHtmlLinkTarget(
  value: string,
  latestByTarget: ReadonlyMap<string, string>,
): string {
  if (!value || value.startsWith('#') || isExternalOrOpaqueUrl(value)) return value;

  const parsed = splitRelativeReference(value);
  if (!isHtmlPath(parsed.pathname)) return value;
  const key = htmlFileFamilyKey(parsed.pathname);
  if (!key) return value;

  const latest = latestByTarget.get(key);
  if (!latest || latest === parsed.pathname) return value;

  const rewrittenPath = preserveRelativePrefix(parsed.pathname, latest);
  return `${rewrittenPath}${parsed.search}${parsed.hash}`;
}

function isExternalOrOpaqueUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//');
}

function splitRelativeReference(value: string): {
  pathname: string;
  search: string;
  hash: string;
} {
  const hashIndex = value.indexOf('#');
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  return {
    pathname: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    search: queryIndex >= 0 ? beforeHash.slice(queryIndex) : '',
    hash,
  };
}

function isHtmlPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}

function htmlFileFamilyKey(pathname: string): string | null {
  const slash = pathname.lastIndexOf('/');
  const directory = slash >= 0 ? pathname.slice(0, slash + 1) : '';
  const fileName = slash >= 0 ? pathname.slice(slash + 1) : pathname;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return null;
  const stem = fileName.slice(0, dot);
  const ext = fileName.slice(dot).toLowerCase();
  const familyStem = stem.replace(/-\d+$/, '');
  return `${directory}${familyStem}${ext}`.replace(/^\.\//, '');
}

function htmlFileFamilyIdentifier(familyKey: string): string {
  const slash = familyKey.lastIndexOf('/');
  const fileName = slash >= 0 ? familyKey.slice(slash + 1) : familyKey;
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return normalizeArtifactIdentifier(stem);
}

function normalizeArtifactIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeOptionalIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeArtifactIdentifier(value);
  return normalized || null;
}

function preserveRelativePrefix(originalPathname: string, latestName: string): string {
  if (originalPathname.startsWith('./') && !latestName.startsWith('./')) {
    return `./${latestName}`;
  }
  return latestName;
}
