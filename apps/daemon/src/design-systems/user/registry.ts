import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';

import {
  classifyDesignSystemFile,
  collectDesignSystemFiles,
  fileExists,
  readFileOptional,
  sanitizeRelativeFilePath,
  stripPrefixAndValidateId,
} from '../core/file-utils.js';
import {
  buildDraftDesignSystemBody,
  cleanMultiline,
  cleanText,
  extractCategory,
  extractMarkdownSections,
  extractSurface,
  firstHeading,
  normalizeBody,
  normalizeProvenance,
  normalizeSwatches,
  normalizeTitle,
  provenanceToNotes,
  renderColorPreviewHtml,
  renderComponentCatalogHtml,
  renderComponentPreviewHtml,
  renderCssTokens,
  renderLogoPreviewHtml,
  renderLogoSvg,
  renderOverviewHtml,
  renderProvenanceMarkdown,
  renderReadme,
  renderReferenceComponent,
  renderSkill,
  renderSpacingPreviewHtml,
  renderTypographyPreviewHtml,
  renderUiKitReadme,
  slugify,
  summarize,
  withDesignSystemHeader,
} from '../core/body.js';
import {
  hasAnyLegacyDesignSystemArtifact,
  removeLegacyDesignSystemArtifacts,
  rewriteLegacyPackageDocumentationReferences,
} from './migration.js';
import { cleanProjectIdForMetadata, normalizeArtifactMode, readUserMetadata } from '../core/metadata.js';
import {
  isDesignSystemArtifactMode,
  normalizeRevisionFileChanges,
  parseDesignSystemRevision,
  revisionFileChangeWrites,
  sanitizeRevisionId,
  writeTextFilesAtomically,
  writeUserDesignSystemRevision,
  writeUserMetadata,
} from './revisions.js';
import { defaultUiKitComponentSpecs, isReplaceableUiKitScaffold, renderUiKitComponent } from './ui-kit.js';
import { listDesignSystems } from '../catalog/index.js';
import type {
  AtomicTextFileWrite,
  DesignSystemFileSummary,
  DesignSystemFileDetail,
  GeneratedPalette,
  DesignSystemProvenance,
  DesignSystemRevision,
  DesignSystemSource,
  DesignSystemStatus,
  DesignSystemSummary,
  DesignSystemSurface,
  UserDesignSystemInput,
  UserDesignSystemMetadata,
  UserDesignSystemRevisionInput,
} from '../core/types.js';

export function workspaceRenameDesignSystemId(project: { designSystemId?: string | null; metadata?: unknown }): string | null {
  const id = typeof project.designSystemId === 'string' ? project.designSystemId : '';
  if (!id.startsWith('user:')) return null;
  const metadata = project.metadata;
  const importedFrom = metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>).importedFrom : undefined;
  return importedFrom === 'design-system' ? id : null;
}

export type WorkspaceRenamePropagation = 'not-applicable' | 'propagated' | 'failed';

export async function propagateWorkspaceProjectRename(
  root: string,
  project: { designSystemId?: string | null; metadata?: unknown },
  name: unknown,
): Promise<WorkspaceRenamePropagation> {
  const id = workspaceRenameDesignSystemId(project);
  const title = typeof name === 'string' ? name.trim() : '';
  if (!id || !title) return 'not-applicable';
  return (await updateUserDesignSystem(root, id, { title })) ? 'propagated' : 'failed';
}

/**
 * Returns a directory name derived from `base` that does not yet exist under
 * `root`. Appends `-2`, `-3`, … when collisions are found.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param base - Desired base slug (e.g. from `slugify(title)`).
 */
export async function uniqueSlug(root: string, base: string): Promise<string> {
  let candidate = base || 'design-system';
  let index = 2;
  for (;;) {
    try {
      await stat(path.join(root, candidate));
      candidate = `${base}-${index++}`;
    } catch {
      return candidate;
    }
  }
}

/**
 * @internal
 * Builds the complete list of `AtomicTextFileWrite` entries for the generated
 * artifact layer of a design system (README, SKILL, CSS tokens, preview pages,
 * provenance, package.json, SVG logo, TSX reference, and UI kit).
 */
function generatedDesignSystemFileWrites(
  dir: string,
  input: {
    title: string;
    category: string;
    surface: DesignSystemSurface;
    summary: string;
    sourceNotes?: string;
    provenance?: DesignSystemProvenance;
    body: string;
  },
): AtomicTextFileWrite[] {
  const palette = normalizeSwatches(input.body);
  const summary = input.summary || 'A user-created Open Design design system.';
  const sections = extractMarkdownSections(input.body);
  const provenance = input.provenance ?? normalizeProvenance(undefined, {
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const specs = defaultUiKitComponentSpecs();
  return [
    {
      targetPath: path.join(dir, 'README.md'),
      content: renderReadme({ ...input, summary, palette, sections }),
    },
    {
      targetPath: path.join(dir, 'SKILL.md'),
      content: renderSkill({ ...input, summary, palette }),
    },
    {
      targetPath: path.join(dir, 'context', 'provenance.json'),
      content: `${JSON.stringify(provenance ?? {}, null, 2)}\n`,
    },
    {
      targetPath: path.join(dir, 'context', 'provenance.md'),
      content: renderProvenanceMarkdown(provenance, input.title),
    },
    {
      targetPath: path.join(dir, 'colors_and_type.css'),
      content: renderCssTokens({ title: input.title, palette }),
    },
    {
      targetPath: path.join(dir, 'package.json'),
      content: `${JSON.stringify(
        {
          name: slugify(input.title),
          private: true,
          type: 'module',
          scripts: {
            preview: 'open index.html',
          },
        },
        null,
        2,
      )}\n`,
    },
    { targetPath: path.join(dir, 'assets', 'logo.svg'), content: renderLogoSvg(input.title, palette) },
    {
      targetPath: path.join(dir, 'src', 'components', 'design-system-reference.tsx'),
      content: renderReferenceComponent(input.title),
    },
    {
      targetPath: path.join(dir, 'src', 'assets', 'README.md'),
      content: '# Assets\n\nPlace product screenshots, icons, logos, fonts, and brand references here.\n',
    },
    {
      targetPath: path.join(dir, 'index.html'),
      content: renderOverviewHtml(input.title, summary, palette, sections),
    },
    {
      targetPath: path.join(dir, 'preview', 'colors-primary.html'),
      content: renderColorPreviewHtml('Primary Colors', palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'colors-theme-light.html'),
      content: renderColorPreviewHtml('Light Theme Palette', palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'colors-theme-dark.html'),
      content: renderColorPreviewHtml('Dark Theme Palette', {
        ...palette,
        background: palette.foreground,
        foreground: '#ffffff',
        muted: '#d6d6d6',
        border: '#3f3f46',
      }),
    },
    {
      targetPath: path.join(dir, 'preview', 'typography-specimens.html'),
      content: renderTypographyPreviewHtml(input.title),
    },
    {
      targetPath: path.join(dir, 'preview', 'spacing-tokens.html'),
      content: renderSpacingPreviewHtml('Spacing Tokens'),
    },
    {
      targetPath: path.join(dir, 'preview', 'spacing-radius.html'),
      content: renderSpacingPreviewHtml('Border Radius'),
    },
    {
      targetPath: path.join(dir, 'preview', 'spacing-shadows.html'),
      content: renderSpacingPreviewHtml('Shadow Elevation'),
    },
    {
      targetPath: path.join(dir, 'preview', 'components-buttons.html'),
      content: renderComponentCatalogHtml('Buttons', input.title, summary, palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'components-inputs.html'),
      content: renderComponentCatalogHtml('Inputs', input.title, summary, palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'brand-assets.html'),
      content: renderLogoPreviewHtml(input.title, palette),
    },
    {
      targetPath: path.join(dir, 'ui_kits', 'app', 'index.html'),
      content: renderComponentPreviewHtml(input.title, summary, palette, specs),
    },
    {
      targetPath: path.join(dir, 'ui_kits', 'app', 'README.md'),
      content: renderUiKitReadme(input.title),
    },
    ...specs.map(({ fileName, componentName, purpose }) => ({
      targetPath: path.join(dir, 'ui_kits', 'app', 'components', fileName),
      content: renderUiKitComponent(componentName, input.title, purpose),
    })),
  ];
}

/**
 * @internal
 * Creates the full directory scaffold and writes all generated artifact files for
 * a new or updated design system. Must be called after the DESIGN.md exists.
 */
async function writeGeneratedDesignSystemFiles(
  root: string,
  id: string,
  input: {
    title: string;
    category: string;
    surface: DesignSystemSurface;
    summary: string;
    sourceNotes?: string;
    provenance?: DesignSystemProvenance;
    body: string;
  },
): Promise<void> {
  const dir = path.join(root, id);
  await Promise.all([
    mkdir(path.join(dir, 'assets'), { recursive: true }),
    mkdir(path.join(dir, 'context'), { recursive: true }),
    mkdir(path.join(dir, 'preview'), { recursive: true }),
    mkdir(path.join(dir, 'src', 'assets'), { recursive: true }),
    mkdir(path.join(dir, 'src', 'components'), { recursive: true }),
    mkdir(path.join(dir, 'ui_kits', 'app'), { recursive: true }),
    mkdir(path.join(dir, 'ui_kits', 'app', 'components'), { recursive: true }),
  ]);

  const manifestPath = path.join(dir, '.od-generated.json');
  const previous = await readFileOptional(manifestPath);
  let manifest: Record<string, string> = {};
  try { manifest = previous ? JSON.parse(previous) : {}; } catch { manifest = {}; }
  const next: Record<string, string> = {};
  const writes = generatedDesignSystemFileWrites(dir, input);
  for (const write of writes) {
    const key = path.relative(dir, write.targetPath).split(path.sep).join('/');
    const current = await readFileOptional(write.targetPath);
    const hash = createHash('sha256').update(write.content, 'utf8').digest('hex');
    if (current === undefined || (manifest[key] && createHash('sha256').update(current, 'utf8').digest('hex') === manifest[key])) {
      await writeFile(write.targetPath, write.content, 'utf8');
      next[key] = hash;
    } else if (manifest[key]) {
      next[key] = manifest[key];
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(next, Object.keys(next).sort(), 2)}\n`, 'utf8');
}

/**
 * @internal
 * Writes any missing or replaceable UI kit component files under
 * `<dir>/ui_kits/app/components/`. Returns `true` when at least one file was written.
 */
async function writeDefaultUiKitComponentsIfMissing(dir: string, title: string): Promise<boolean> {
  const componentDir = path.join(dir, 'ui_kits', 'app', 'components');
  let wroteAny = false;
  await mkdir(componentDir, { recursive: true });
  for (const { fileName, componentName, purpose } of defaultUiKitComponentSpecs()) {
    const target = path.join(componentDir, fileName);
    try {
      const existing = await stat(target);
      if (existing.isFile()) {
        let current: string;
        try {
          current = await readFile(target, 'utf8');
        } catch {
          current = '';
        }
        if (!isReplaceableUiKitScaffold(current)) continue;
      }
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err;
    }
    await writeFile(target, renderUiKitComponent(componentName, title, purpose), 'utf8');
    wroteAny = true;
  }
  return wroteAny;
}

/**
 * @internal
 * Migrates a legacy design-system package in place: copies old preview files to
 * their new paths, regenerates missing component previews, and rewrites stale
 * path references in documentation files. Called lazily before any file listing.
 */
async function migrateLegacyDesignSystemPackage(
  root: string,
  id: string,
  metadata: UserDesignSystemMetadata,
): Promise<void> {
  const dir = path.join(root, id);
  let body = '';
  try {
    body = await readFile(path.join(dir, 'DESIGN.md'), 'utf8');
  } catch {
    return;
  }
  const title = normalizeTitle(metadata.title ?? firstHeading(body) ?? id);
  const summary = summarize(body) || 'A reusable Open Design design system.';
  const palette = normalizeSwatches(body);

  const copyIfMissing = async (from: string, to: string): Promise<boolean> => {
    const fromPath = path.join(dir, ...from.split('/'));
    const toPath = path.join(dir, ...to.split('/'));
    try {
      const existing = await stat(toPath);
      if (existing.isFile()) return false;
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err;
    }
    let content: Buffer;
    try {
      content = await readFile(fromPath);
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return false;
      throw err;
    }
    await mkdir(path.dirname(toPath), { recursive: true });
    await writeFile(toPath, content);
    return true;
  };

  const writeIfMissing = async (relativePath: string, content: string): Promise<boolean> => {
    const target = path.join(dir, ...relativePath.split('/'));
    try {
      const existing = await stat(target);
      if (existing.isFile()) return false;
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    return true;
  };

  const migratedArtifacts = await Promise.all([
    copyIfMissing('preview/colors-ui-palette.html', 'preview/colors-primary.html'),
    copyIfMissing('preview/colors-node-types.html', 'preview/colors-theme-light.html'),
    copyIfMissing('preview/colors-node-types.html', 'preview/colors-theme-dark.html'),
    copyIfMissing('preview/typography-scale.html', 'preview/typography-specimens.html'),
    copyIfMissing('preview/spacing-system.html', 'preview/spacing-tokens.html'),
    copyIfMissing('preview/spacing-system.html', 'preview/spacing-radius.html'),
    copyIfMissing('preview/spacing-system.html', 'preview/spacing-shadows.html'),
    copyIfMissing('preview/logo-variants.html', 'preview/brand-assets.html'),
    copyIfMissing('ui_kits/generated_interface/index.html', 'ui_kits/app/index.html'),
  ]);

  const appKitExists = await fileExists(path.join(dir, 'ui_kits', 'app', 'index.html'));
  const hasLegacyArtifacts = await hasAnyLegacyDesignSystemArtifact(dir);
  if (!hasLegacyArtifacts && !migratedArtifacts.some(Boolean)) {
    await rewriteLegacyPackageDocumentationReferences(dir);
    if (appKitExists) await writeDefaultUiKitComponentsIfMissing(dir, title);
    return;
  }

  await Promise.all([
    writeIfMissing(
      'preview/components-buttons.html',
      renderComponentCatalogHtml('Buttons', title, summary, palette),
    ),
    writeIfMissing(
      'preview/components-inputs.html',
      renderComponentCatalogHtml('Inputs', title, summary, palette),
    ),
    appKitExists
      ? writeIfMissing(
          'ui_kits/app/README.md',
          `# ${title} UI Kit\n\nThis package was migrated from an earlier Open Design design-system workspace. Use \`index.html\` as the applied interface example and replace it with source-backed modular components when new repository evidence is available.\n`,
        )
      : Promise.resolve(false),
    appKitExists
      ? writeDefaultUiKitComponentsIfMissing(dir, title)
      : Promise.resolve(false),
  ]);
  await rewriteLegacyPackageDocumentationReferences(dir);
  await removeLegacyDesignSystemArtifacts(dir);
}

/**
 * @internal
 * Ensures the generated artifact layer exists for a design system. Runs
 * migration first, then generates the full artifact set from DESIGN.md when
 * `README.md` is missing and `artifactMode` is not `'agent-managed'`.
 */
async function ensureGeneratedDesignSystemFiles(root: string, id: string): Promise<void> {
  const metadata = await readUserMetadata(root, id);
  await migrateLegacyDesignSystemPackage(root, id, metadata);
  if (metadata.artifactMode === 'agent-managed') return;
  try {
    const existing = await stat(path.join(root, id, 'README.md'));
    if (existing.isFile()) return;
  } catch {
    // Generate the derived review files below.
  }
  try {
    const body = await readFile(path.join(root, id, 'DESIGN.md'), 'utf8');
    const title = normalizeTitle(metadata.title ?? firstHeading(body) ?? id);
    const category = metadata.category ?? extractCategory(body) ?? 'Custom';
    const surface = metadata.surface ?? extractSurface(body) ?? 'web';
    await writeGeneratedDesignSystemFiles(root, id, {
      title,
      category,
      surface,
      summary: summarize(body),
      ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
      ...(metadata.provenance ? { sourceNotes: provenanceToNotes(metadata.provenance) } : {}),
      body,
    });
  } catch {
    // Listing/reading still returns whatever exists.
  }
}

/**
 * @internal
 * Atomically applies an accepted revision: writes the new DESIGN.md, updated
 * metadata, regenerated artifact layer (unless `agent-managed`), any declared
 * file changes, and the accepted revision JSON — all in a single atomic batch.
 *
 * @returns `true` on success, `false` when the existing DESIGN.md cannot be read.
 */
async function writeAcceptedUserDesignSystemRevision(
  root: string,
  dirId: string,
  revision: DesignSystemRevision,
  acceptedRevision: DesignSystemRevision,
): Promise<boolean> {
  const base = path.join(root, dirId);
  const designPath = path.join(base, 'DESIGN.md');
  let existingBody: string;
  try {
    existingBody = await readFile(designPath, 'utf8');
  } catch {
    return false;
  }
  const existingMeta = await readUserMetadata(root, dirId);
  const updatedAt = acceptedRevision.updatedAt;
  const title = normalizeTitle(existingMeta.title ?? firstHeading(existingBody) ?? dirId);
  const category = existingMeta.category || extractCategory(existingBody) || 'Custom';
  const surface = existingMeta.surface ?? extractSurface(existingBody) ?? 'web';
  const artifactMode = existingMeta.artifactMode;
  const provenance = existingMeta.provenance;
  const metadata: UserDesignSystemMetadata = {
    ...existingMeta,
    title,
    category,
    surface,
    status: existingMeta.status ?? 'draft',
    ...(artifactMode ? { artifactMode } : {}),
    createdAt: existingMeta.createdAt ?? updatedAt,
    updatedAt,
    ...(provenance ? { provenance } : {}),
  };
  const writes: AtomicTextFileWrite[] = [
    { targetPath: designPath, content: revision.proposedBody },
    {
      targetPath: path.join(base, 'metadata.json'),
      content: `${JSON.stringify(metadata, null, 2)}\n`,
    },
  ];
  const generatedInput = artifactMode !== 'agent-managed' ? {
    title, category, surface, summary: summarize(revision.proposedBody),
    ...(provenance ? { provenance } : {}), body: revision.proposedBody,
  } : null;
  writes.push(...revisionFileChangeWrites(root, dirId, revision.fileChanges));
  writes.push({
    targetPath: path.join(base, 'revisions', `${acceptedRevision.id}.json`),
    content: `${JSON.stringify(acceptedRevision, null, 2)}\n`,
  });
  await writeTextFilesAtomically(base, writes);
  if (generatedInput) await writeGeneratedDesignSystemFiles(root, dirId, generatedInput);
  return true;
}

/**
 * Creates a new user design system directory, writes DESIGN.md and
 * `metadata.json`, generates the artifact layer, and returns the created entry
 * as a `DesignSystemSummary`.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param input - Creation input from the API.
 */
export async function createUserDesignSystem(
  root: string,
  input: UserDesignSystemInput,
): Promise<DesignSystemSummary> {
  const title = normalizeTitle(input.title);
  const dirId = await uniqueSlug(root, slugify(title));
  const now = new Date().toISOString();
  const provenance = normalizeProvenance(input.provenance, {
    ...(input.summary ? { companyBlurb: input.summary } : {}),
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const sourceNotes = provenanceToNotes(provenance) || cleanMultiline(input.sourceNotes);
  const body = normalizeBody(input.body) ?? buildDraftDesignSystemBody({
    ...input,
    title,
    sourceNotes,
  });
  const surface = input.surface ?? extractSurface(body) ?? 'web';
  await mkdir(path.join(root, dirId), { recursive: true });
  await writeFile(path.join(root, dirId, 'DESIGN.md'), body, 'utf8');
  const artifactMode = normalizeArtifactMode(input.artifactMode);
  await writeUserMetadata(root, dirId, {
    title,
    category: cleanText(input.category) || extractCategory(body) || 'Custom',
    surface,
    status: input.status ?? 'draft',
    ...(artifactMode ? { artifactMode } : {}),
    createdAt: now,
    updatedAt: now,
    ...(provenance ? { provenance } : {}),
  });
  if (artifactMode !== 'agent-managed') {
    await writeGeneratedDesignSystemFiles(root, dirId, {
      title,
      category: cleanText(input.category) || extractCategory(body) || 'Custom',
      surface,
      summary: summarize(body),
      ...(provenance ? { provenance } : {}),
      ...(sourceNotes ? { sourceNotes } : {}),
      body,
    });
  }
  const listed = await listDesignSystems(root, {
    idPrefix: 'user:',
    source: 'user' as DesignSystemSource,
    isEditable: true,
    defaultStatus: 'draft' as DesignSystemStatus,
  });
  return listed.find((s) => s.id === `user:${dirId}`)!;
}

/**
 * Updates an existing user design system with new content or metadata. Rewrites
 * DESIGN.md and regenerates the artifact layer unless `artifactMode` is
 * `'agent-managed'`. Returns `null` when `id` is invalid or the entry does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 * @param input - Update input from the API.
 */
export async function updateUserDesignSystem(
  root: string,
  id: string,
  input: UserDesignSystemInput,
): Promise<DesignSystemSummary | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const dir = path.join(root, dirId);
  const designPath = path.join(dir, 'DESIGN.md');
  let existingBody: string;
  try {
    existingBody = await readFile(designPath, 'utf8');
  } catch {
    return null;
  }
  const existingMeta = await readUserMetadata(root, dirId);
  const now = new Date().toISOString();
  const title = normalizeTitle(input.title ?? existingMeta.title ?? firstHeading(existingBody) ?? dirId);
  const category = cleanText(input.category) || existingMeta.category || extractCategory(existingBody) || 'Custom';
  const surface = input.surface ?? existingMeta.surface ?? extractSurface(existingBody) ?? 'web';
  const nextProvenance = normalizeProvenance(input.provenance, {
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const provenance = nextProvenance ?? existingMeta.provenance;
  const artifactMode = normalizeArtifactMode(input.artifactMode) ?? existingMeta.artifactMode;
  const body =
    normalizeBody(input.body)
    ?? withDesignSystemHeader(existingBody, { title, category, surface });
  await writeFile(designPath, body, 'utf8');
  await writeUserMetadata(root, dirId, {
    ...existingMeta,
    title,
    category,
    surface,
    status: input.status ?? existingMeta.status ?? 'draft',
    ...(artifactMode ? { artifactMode } : {}),
    createdAt: existingMeta.createdAt ?? now,
    updatedAt: now,
    ...(provenance ? { provenance } : {}),
  });
  const sourceNotes = provenanceToNotes(provenance) || cleanMultiline(input.sourceNotes);
  if (artifactMode !== 'agent-managed') {
    await writeGeneratedDesignSystemFiles(root, dirId, {
      title,
      category,
      surface,
      summary: summarize(body),
      ...(provenance ? { provenance } : {}),
      ...(sourceNotes ? { sourceNotes } : {}),
      body,
    });
  }
  const listed = await listDesignSystems(root, {
    idPrefix: 'user:',
    source: 'user' as DesignSystemSource,
    isEditable: true,
    defaultStatus: 'draft' as DesignSystemStatus,
  });
  return listed.find((s) => s.id === `user:${dirId}`) ?? null;
}

/**
 * Associates a user design system with a project ID by writing `projectId` to
 * `metadata.json`. Returns `null` when `id` or `projectId` is invalid or the
 * DESIGN.md does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 * @param projectId - Project ID to link (validated via `cleanProjectIdForMetadata`).
 */
export async function linkUserDesignSystemProject(
  root: string,
  id: string,
  projectId: string,
): Promise<DesignSystemSummary | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  const cleanProjectId = cleanProjectIdForMetadata(projectId);
  if (!dirId || !cleanProjectId) return null;
  try {
    const stats = await stat(path.join(root, dirId, 'DESIGN.md'));
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  const existingMeta = await readUserMetadata(root, dirId);
  await writeUserMetadata(root, dirId, {
    ...existingMeta,
    projectId: cleanProjectId,
  });
  const listed = await listDesignSystems(root, {
    idPrefix: 'user:',
    source: 'user' as DesignSystemSource,
    isEditable: true,
    defaultStatus: 'draft' as DesignSystemStatus,
  });
  return listed.find((s) => s.id === `user:${dirId}`) ?? null;
}

/**
 * Creates and persists a new `pending` revision for the specified design system.
 * Returns `null` when `id` is invalid or the DESIGN.md does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 * @param input - Revision input from the API.
 */
export async function createUserDesignSystemRevision(
  root: string,
  id: string,
  input: UserDesignSystemRevisionInput,
): Promise<DesignSystemRevision | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const dir = path.join(root, dirId);
  try {
    const stats = await stat(path.join(dir, 'DESIGN.md'));
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  const feedback = cleanMultiline(input.feedback);
  const baseBody = normalizeBody(input.baseBody);
  const proposedBody = normalizeBody(input.proposedBody);
  if (!feedback || !baseBody || !proposedBody) return null;
  const fileChanges = normalizeRevisionFileChanges(input.fileChanges);
  const now = new Date().toISOString();
  const revision: DesignSystemRevision = {
    id: randomUUID(),
    designSystemId: `user:${dirId}`,
    status: 'pending',
    feedback,
    baseBody,
    proposedBody,
    createdAt: now,
    updatedAt: now,
    ...(cleanText(input.sectionTitle) ? { sectionTitle: cleanText(input.sectionTitle) } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(fileChanges.length > 0 ? { fileChanges } : {}),
  };
  await writeUserDesignSystemRevision(root, dirId, revision);
  return revision;
}

/**
 * Lists all revisions for a user design system, sorted newest-first.
 * Returns `null` when `id` is invalid or the DESIGN.md does not exist.
 * Returns `[]` when the design system exists but has no revisions.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 */
export async function listUserDesignSystemRevisions(
  root: string,
  id: string,
): Promise<DesignSystemRevision[] | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  try {
    const stats = await stat(path.join(root, dirId, 'DESIGN.md'));
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  let entries = [];
  try {
    entries = await readdir(path.join(root, dirId, 'revisions'), { withFileTypes: true });
  } catch {
    return [];
  }
  const revisions: DesignSystemRevision[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const revisionId = entry.name.slice(0, -'.json'.length);
    const revision = await readUserDesignSystemRevision(root, id, revisionId);
    if (revision) revisions.push(revision);
  }
  return revisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Reads a single revision by ID. Returns `null` when the design system or
 * revision does not exist, or when the stored JSON is invalid.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 * @param revisionId - Revision UUID string.
 */
export async function readUserDesignSystemRevision(
  root: string,
  id: string,
  revisionId: string,
): Promise<DesignSystemRevision | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  const cleanRevisionId = sanitizeRevisionId(revisionId);
  if (!dirId || !cleanRevisionId) return null;
  try {
    const raw = await readFile(
      path.join(root, dirId, 'revisions', `${cleanRevisionId}.json`),
      'utf8',
    );
    return parseDesignSystemRevision(JSON.parse(raw), `user:${dirId}`);
  } catch {
    return null;
  }
}

/**
 * Transitions a revision to `'accepted'` or `'rejected'`. Accepting a revision
 * triggers the full atomic write sequence (DESIGN.md + metadata + artifacts +
 * file changes). Returns `null` when the revision does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 * @param revisionId - Revision UUID string.
 * @param status - Target status (`'accepted'` or `'rejected'`).
 */
export async function updateUserDesignSystemRevisionStatus(
  root: string,
  id: string,
  revisionId: string,
  status: Extract<'accepted' | 'rejected', string>,
): Promise<DesignSystemRevision | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const revision = await readUserDesignSystemRevision(root, id, revisionId);
  if (!revision) return null;
  const next: DesignSystemRevision = {
    ...revision,
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'accepted') {
    const accepted = await writeAcceptedUserDesignSystemRevision(root, dirId, revision, next);
    if (!accepted) return null;
    return next;
  }
  await writeUserDesignSystemRevision(root, dirId, next);
  return next;
}

/**
 * Permanently deletes a user design system directory and all its contents.
 * Returns `false` when `id` is invalid or the directory cannot be removed.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 */
export async function deleteUserDesignSystem(root: string, id: string): Promise<boolean> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return false;
  try {
    await rm(path.join(root, dirId), { recursive: true, force: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all files and directories inside a user design system, triggering
 * generated-artifact backfill first. Returns `null` when `id` is invalid or
 * the directory does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 */
export async function listUserDesignSystemFiles(
  root: string,
  id: string,
): Promise<DesignSystemFileSummary[] | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const base = path.join(root, dirId);
  try {
    const baseStats = await stat(base);
    if (!baseStats.isDirectory()) return null;
  } catch {
    return null;
  }
  await ensureGeneratedDesignSystemFiles(root, dirId);
  const files: DesignSystemFileSummary[] = [];
  await collectDesignSystemFiles(base, '', files);
  return files.sort((a, b) => {
    if (a.kind === 'folder' && b.kind !== 'folder') return -1;
    if (a.kind !== 'folder' && b.kind === 'folder') return 1;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Reads a single file from a user design system, triggering generated-artifact
 * backfill first. Validates that the resolved path does not escape the design
 * system directory. Returns `null` when `id` or `relativePath` is invalid, or
 * the file does not exist.
 *
 * @param root - Absolute path to the user design-systems root directory.
 * @param id - Design-system identifier with `user:` prefix.
 * @param relativePath - File path relative to the design-system directory.
 */
export async function readUserDesignSystemFile(
  root: string,
  id: string,
  relativePath: string,
): Promise<DesignSystemFileDetail | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  const cleanPath = sanitizeRelativeFilePath(relativePath);
  if (!dirId || !cleanPath) return null;
  const base = path.join(root, dirId);
  const resolvedBase = path.resolve(base);
  const filePath = path.resolve(base, cleanPath);
  if (filePath !== resolvedBase && !filePath.startsWith(`${resolvedBase}${path.sep}`))
    return null;
  await ensureGeneratedDesignSystemFiles(root, dirId);
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const content = await readFile(filePath, 'utf8');
    return {
      path: cleanPath,
      name: path.basename(cleanPath),
      kind: classifyDesignSystemFile(cleanPath, false),
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      content,
    };
  } catch {
    return null;
  }
}

export async function buildUserDesignSystemArchive(
  root: string,
  id: string,
): Promise<{ buffer: Buffer; baseName: string; title: string } | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const base = path.join(root, dirId);
  try {
    if (!(await stat(base)).isDirectory()) return null;
  } catch {
    return null;
  }
  await ensureGeneratedDesignSystemFiles(root, dirId);
  const summaries: DesignSystemFileSummary[] = [];
  await collectDesignSystemFiles(base, '', summaries);
  const fileEntries = summaries.filter((entry) => entry.kind !== 'folder');
  const metadata = await readUserMetadata(root, dirId);
  let body = '';
  try { body = await readFile(path.join(base, 'DESIGN.md'), 'utf8'); } catch { /* optional */ }
  const title = normalizeTitle(metadata.title ?? firstHeading(body) ?? dirId);
  const zip = new JSZip();
  for (const entry of fileEntries) {
    zip.file(entry.path, await readFile(path.join(base, ...entry.path.split('/'))), {
      date: entry.updatedAt ? new Date(entry.updatedAt) : new Date(0), binary: true,
    });
  }
  if (!fileEntries.some((entry) => entry.path.toLowerCase() === 'skills.md')) {
    zip.file('SKILLS.md', buildDesignSystemSkillsMarkdown({
      title,
      summary: summarize(body),
      category: metadata.category ?? extractCategory(body) ?? 'Custom',
      surface: metadata.surface ?? extractSurface(body) ?? 'web',
      palette: normalizeSwatches(body),
      ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
    }), { date: new Date(0), binary: false });
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, baseName: title || dirId, title };
}

const DESIGN_SYSTEM_SURFACE_GUIDE: Record<DesignSystemSurface, { deliverables: string; goodFor: string[] }> = {
  web: { deliverables: 'websites, landing pages, dashboards, decks, and product UI', goodFor: ['Landing pages & marketing sites', 'Slide decks & pitch decks', 'Dashboards & product UI', 'Prototypes & component mockups'] },
  image: { deliverables: 'social posts, ads, posters, and other image creative', goodFor: ['Social posts & ad creative', 'Posters & one-pagers', 'Cover art & thumbnails', 'On-brand illustration prompts'] },
  video: { deliverables: 'video, motion, and animated creative', goodFor: ['Promo & explainer video', 'Motion graphics & title cards', 'Animated social clips', 'Storyboards & shot lists'] },
  audio: { deliverables: 'audio, podcast, and sonic-brand work', goodFor: ['Podcast & episode branding', 'Audio ad scripts', 'Sonic-logo & jingle direction', 'Voice & tone guidance'] },
};

export function buildDesignSystemSkillsMarkdown(input: { title: string; summary: string; category: string; surface: DesignSystemSurface; palette: GeneratedPalette; provenance?: DesignSystemProvenance }): string {
  const { title, summary, category, surface, palette } = input;
  const guide = DESIGN_SYSTEM_SURFACE_GUIDE[surface] ?? DESIGN_SYSTEM_SURFACE_GUIDE.web;
  const sourceUrls = (input.provenance?.sourceUrls ?? []).filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  const lines = [`# How to use the ${title} design system`, ''];
  if (summary) lines.push(summary, '');
  lines.push(`This package is a portable **${category}** design system for ${guide.deliverables}. Hand the unzipped folder to any AI coding agent alongside \`DESIGN.md\`, and it will produce on-brand work without further art direction.`, '', '## What it is good for', '');
  for (const item of guide.goodFor) lines.push(`- ${item}`);
  lines.push('', '## How to apply it', '', '1. Unzip this folder and open it in your AI coding tool.', '2. Tell the agent: "Use `DESIGN.md` as the design system for everything you generate."', '3. Ask for the artifact you want — e.g. "a pricing page" or "a 10-slide deck".', '', '## Palette quick reference', '', '| Role | Hex |', '| --- | --- |', `| Background | \`${palette.background}\` |`, `| Foreground | \`${palette.foreground}\` |`, `| Accent | \`${palette.accent}\` |`, `| Border | \`${palette.border}\` |`, `| Muted | \`${palette.muted}\` |`, '');
  if (sourceUrls.length > 0) lines.push('## Source', '', `Extracted from: ${sourceUrls.join(', ')}`, '');
  lines.push('---', '', 'Generated with **Open Design**.', '', 'https://github.com/nexu-io/open-design', '');
  return lines.join('\n');
}
