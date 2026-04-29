import path from 'node:path';

const MANIFEST_VERSION = 1;
const MAX_TITLE_LENGTH = 200;
const MAX_ENTRY_LENGTH = 260;
const MAX_SOURCE_SKILL_ID_LENGTH = 128;
const MAX_DESIGN_SYSTEM_ID_LENGTH = 128;
const MAX_SUPPORTING_FILE_LENGTH = 260;
const MAX_SUPPORTING_FILES = 128;
const MAX_METADATA_BYTES = 16 * 1024;

const ALLOWED_KINDS = new Set([
  'html',
  'deck',
  'react-component',
  'markdown-document',
  'svg',
  'diagram',
  'code-snippet',
  'mini-app',
  'design-system',
]);

const ALLOWED_RENDERERS = new Set([
  'html',
  'deck-html',
  'react-component',
  'markdown',
  'svg',
  'diagram',
  'code',
  'mini-app',
  'design-system',
]);

const ALLOWED_EXPORTS = new Set(['html', 'pdf', 'zip', 'pptx', 'jsx', 'md', 'svg', 'txt']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateBoundedString(value, field, maxLen, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return `${field} must be a string`;
  if (!allowEmpty && value.length === 0) return `${field} is required`;
  if (value.length > maxLen) return `${field} exceeds max length (${maxLen})`;
  return null;
}

function validateSupportingPath(value) {
  if (typeof value !== 'string') return 'supportingFiles entries must be strings';
  if (value.length === 0) return 'supportingFiles entries cannot be empty';
  if (value.length > MAX_SUPPORTING_FILE_LENGTH) {
    return `supportingFiles entries exceed max length (${MAX_SUPPORTING_FILE_LENGTH})`;
  }
  if (/^[A-Za-z]:/.test(value) || value.startsWith('/')) {
    return 'supportingFiles cannot contain absolute paths';
  }
  if (value.includes('\u0000')) return 'supportingFiles cannot contain null bytes';
  const normalized = value.replace(/\\/g, '/');
  if (normalized.includes('..')) return 'supportingFiles cannot contain traversal segments';
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === '.' || p === '..')) {
    return 'supportingFiles cannot contain traversal segments';
  }
  return null;
}

export function validateArtifactManifestInput(manifest, entry) {
  if (manifest == null) return { ok: true, value: null };
  if (!isPlainObject(manifest)) {
    return { ok: false, error: 'artifactManifest must be an object' };
  }

  const kindErr = validateBoundedString(manifest.kind, 'artifactManifest.kind', 64);
  if (kindErr) return { ok: false, error: kindErr };
  if (!ALLOWED_KINDS.has(manifest.kind)) {
    return { ok: false, error: 'artifactManifest.kind is not allowed' };
  }

  const rendererErr = validateBoundedString(manifest.renderer, 'artifactManifest.renderer', 64);
  if (rendererErr) return { ok: false, error: rendererErr };
  if (!ALLOWED_RENDERERS.has(manifest.renderer)) {
    return { ok: false, error: 'artifactManifest.renderer is not allowed' };
  }

  if (!Array.isArray(manifest.exports) || manifest.exports.length === 0) {
    return { ok: false, error: 'artifactManifest.exports must be a non-empty array' };
  }
  for (const exp of manifest.exports) {
    if (typeof exp !== 'string') {
      return { ok: false, error: 'artifactManifest.exports must contain strings' };
    }
    if (!ALLOWED_EXPORTS.has(exp)) {
      return { ok: false, error: `artifactManifest.exports contains unsupported value: ${exp}` };
    }
  }

  if (manifest.supportingFiles !== undefined) {
    if (!Array.isArray(manifest.supportingFiles)) {
      return { ok: false, error: 'artifactManifest.supportingFiles must be an array' };
    }
    if (manifest.supportingFiles.length > MAX_SUPPORTING_FILES) {
      return {
        ok: false,
        error: `artifactManifest.supportingFiles exceeds max items (${MAX_SUPPORTING_FILES})`,
      };
    }
    for (const rel of manifest.supportingFiles) {
      const relErr = validateSupportingPath(rel);
      if (relErr) return { ok: false, error: relErr };
    }
  }

  if (manifest.title !== undefined) {
    const titleErr = validateBoundedString(
      manifest.title,
      'artifactManifest.title',
      MAX_TITLE_LENGTH,
      { allowEmpty: false },
    );
    if (titleErr) return { ok: false, error: titleErr };
  }

  if (manifest.sourceSkillId !== undefined) {
    const skillErr = validateBoundedString(
      manifest.sourceSkillId,
      'artifactManifest.sourceSkillId',
      MAX_SOURCE_SKILL_ID_LENGTH,
      { allowEmpty: true },
    );
    if (skillErr) return { ok: false, error: skillErr };
  }

  if (manifest.designSystemId !== undefined && manifest.designSystemId !== null) {
    const dsErr = validateBoundedString(
      manifest.designSystemId,
      'artifactManifest.designSystemId',
      MAX_DESIGN_SYSTEM_ID_LENGTH,
      { allowEmpty: true },
    );
    if (dsErr) return { ok: false, error: dsErr };
  }

  if (manifest.metadata !== undefined) {
    if (!isPlainObject(manifest.metadata)) {
      return { ok: false, error: 'artifactManifest.metadata must be a plain object' };
    }
    const serialized = JSON.stringify(manifest.metadata);
    if (typeof serialized !== 'string') {
      return { ok: false, error: 'artifactManifest.metadata must be JSON-serializable' };
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
      return {
        ok: false,
        error: `artifactManifest.metadata exceeds max size (${MAX_METADATA_BYTES} bytes)`,
      };
    }
  }

  const safeEntry = typeof entry === 'string' ? entry : '';
  if (!safeEntry || safeEntry.length > MAX_ENTRY_LENGTH) {
    return { ok: false, error: `artifact entry exceeds max length (${MAX_ENTRY_LENGTH})` };
  }

  return { ok: true, value: sanitizeManifest(manifest, safeEntry) };
}

export function sanitizeManifest(manifest, entry) {
  const now = new Date().toISOString();
  return {
    version: MANIFEST_VERSION,
    kind: manifest.kind,
    title: manifest.title || entry,
    entry,
    renderer: manifest.renderer,
    exports: manifest.exports,
    supportingFiles: Array.isArray(manifest.supportingFiles)
      ? manifest.supportingFiles.map((x) => x.replace(/\\/g, '/'))
      : undefined,
    createdAt: typeof manifest.createdAt === 'string' ? manifest.createdAt : now,
    updatedAt: now,
    sourceSkillId: manifest.sourceSkillId,
    designSystemId: manifest.designSystemId ?? undefined,
    metadata: manifest.metadata,
  };
}

export function parsePersistedManifest(raw, fallbackEntry) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== MANIFEST_VERSION) return null;
    const entry = typeof parsed.entry === 'string' && parsed.entry ? parsed.entry : fallbackEntry;
    const result = validateArtifactManifestInput(parsed, entry);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export function inferLegacyManifest(entry) {
  const lower = entry.toLowerCase();
  const ext = path.extname(lower);
  // NOTE: This duplicate heuristic must stay in sync with
  // src/artifacts/manifest.ts::inferLegacyManifest() until frontend+daemon
  // inference is moved to a shared runtime-safe module.
  const isDeck = ext === '.html' && (lower.includes('deck') || lower.includes('slides') || lower.includes('pitch'));
  if (ext === '.html' || ext === '.htm') {
    return {
      version: MANIFEST_VERSION,
      kind: isDeck ? 'deck' : 'html',
      title: entry,
      entry,
      renderer: isDeck ? 'deck-html' : 'html',
      exports: isDeck ? ['html', 'pdf', 'pptx', 'zip'] : ['html', 'pdf', 'zip'],
      metadata: { inferred: true },
    };
  }
  return null;
}
