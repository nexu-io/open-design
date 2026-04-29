import type {
  ArtifactExportKind,
  ArtifactKind,
  ArtifactManifest,
  ArtifactRendererId,
} from './types';

const MANIFEST_VERSION = 1;

function normalizeExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function inferKindFromEntry(entry: string): ArtifactKind | null {
  const ext = normalizeExt(entry);
  if (['.html', '.htm'].includes(ext)) return 'html';
  if (ext === '.svg') return 'svg';
  if (ext === '.md') return 'markdown-document';
  if (['.jsx', '.tsx'].includes(ext)) return 'react-component';
  if (['.js', '.ts', '.json', '.css'].includes(ext)) return 'code-snippet';
  return null;
}

function exportsForKind(kind: ArtifactKind): ArtifactExportKind[] {
  if (kind === 'deck') return ['html', 'pdf', 'pptx', 'zip'];
  if (kind === 'react-component') return ['jsx', 'html', 'zip'];
  if (kind === 'markdown-document') return ['md', 'html', 'pdf', 'zip'];
  if (kind === 'svg' || kind === 'diagram') return ['svg', 'zip'];
  if (kind === 'code-snippet') return ['txt', 'zip'];
  return ['html', 'pdf', 'zip'];
}

export function artifactManifestNameFor(entry: string): string {
  return entry.replace(/\.[^/.]+$/, '') + '.artifact.json';
}

export function createHtmlArtifactManifest(input: {
  entry: string;
  title: string;
  metadata?: Record<string, unknown>;
  sourceSkillId?: string;
  designSystemId?: string | null;
}): ArtifactManifest {
  const now = new Date().toISOString();
  return {
    version: MANIFEST_VERSION,
    kind: 'html',
    title: input.title,
    entry: input.entry,
    renderer: 'html',
    exports: ['html', 'pdf', 'zip'],
    createdAt: now,
    updatedAt: now,
    sourceSkillId: input.sourceSkillId,
    designSystemId: input.designSystemId,
    metadata: input.metadata,
  };
}

export function serializeArtifactManifest(manifest: ArtifactManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function parseArtifactManifest(raw: string): ArtifactManifest | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ArtifactManifest>;
    if (parsed?.version !== MANIFEST_VERSION) return null;
    if (typeof parsed.entry !== 'string' || !parsed.entry) return null;
    if (typeof parsed.title !== 'string') return null;
    if (!Array.isArray(parsed.exports)) return null;
    if (typeof parsed.kind !== 'string' || typeof parsed.renderer !== 'string') {
      return null;
    }
    return parsed as ArtifactManifest;
  } catch {
    return null;
  }
}

export function inferLegacyManifest(input: {
  entry: string;
  title?: string;
  metadata?: Record<string, unknown>;
}): ArtifactManifest | null {
  const kind = inferKindFromEntry(input.entry);
  if (!kind) return null;
  const lowerEntry = input.entry.toLowerCase();
  const isDeck =
    kind === 'html' &&
    (lowerEntry.includes('deck') || lowerEntry.includes('slides') || lowerEntry.includes('pitch'));
  const renderer: ArtifactRendererId =
    isDeck
      ? 'deck-html'
      : kind === 'html'
        ? 'html'
        : kind === 'markdown-document'
          ? 'markdown'
          : kind === 'react-component'
            ? 'react-component'
            : kind === 'code-snippet'
              ? 'code'
              : kind === 'deck'
                ? 'deck-html'
                : kind;
  const resolvedKind = isDeck ? 'deck' : kind;
  return {
    version: MANIFEST_VERSION,
    kind: resolvedKind,
    title: input.title || input.entry,
    entry: input.entry,
    renderer,
    exports: exportsForKind(resolvedKind),
    metadata: input.metadata,
  };
}
