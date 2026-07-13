import { rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fileExists, isAbsenceError, readFileOptional } from '../core/file-utils.js';
import { LEGACY_DESIGN_SYSTEM_ARTIFACTS } from '../core/types.js';

/**
 * Returns `true` if any legacy artifact path exists inside `dir`.
 * Used to decide whether migration work is needed before touching a package.
 *
 * @param dir - Absolute path to the design-system directory.
 */
export async function hasAnyLegacyDesignSystemArtifact(dir: string): Promise<boolean> {
  for (const artifact of LEGACY_DESIGN_SYSTEM_ARTIFACTS) {
    try {
      await stat(path.join(dir, ...artifact.legacyPath.split('/')));
      return true;
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
    }
  }
  return false;
}

/**
 * Removes each legacy artifact only after confirming all its declared
 * replacement paths exist. Partial replacements are left untouched.
 *
 * @param dir - Absolute path to the design-system directory.
 */
export async function removeLegacyDesignSystemArtifacts(dir: string): Promise<void> {
  await Promise.all(
    LEGACY_DESIGN_SYSTEM_ARTIFACTS.map(async (artifact) => {
      const replacementReady = await Promise.all(
        artifact.replacementPaths.map((replacementPath) =>
          fileExists(path.join(dir, ...replacementPath.split('/'))),
        ),
      );
      if (!replacementReady.every(Boolean)) return;
      await rm(path.join(dir, ...artifact.legacyPath.split('/')), {
        recursive: 'removeDirectory' in artifact && (artifact as { removeDirectory?: boolean }).removeDirectory === true,
        force: true,
      });
    }),
  );
}

/**
 * Rewrites stale file-path references in documentation files (DESIGN.md,
 * README.md, SKILL.md, ui_kits/app/README.md). Files that do not contain
 * legacy references are left unchanged.
 *
 * @param dir - Absolute path to the design-system directory.
 */
export async function rewriteLegacyPackageDocumentationReferences(dir: string): Promise<void> {
  await Promise.all(['DESIGN.md', 'README.md', 'SKILL.md', 'ui_kits/app/README.md'].map(async (relativePath) => {
    const target = path.join(dir, ...relativePath.split('/'));
    const current = await readFileOptional(target);
    if (current === undefined) return;
    const next = rewriteLegacyPackageReferences(current);
    if (next !== current) await writeFile(target, next, 'utf8');
  }));
}

/**
 * Pure string replacement that maps every known legacy artifact path to its
 * current equivalent. Safe to call on any text without side effects.
 *
 * @param text - Raw file content to rewrite.
 * @returns Updated content with all legacy references replaced.
 */
export function rewriteLegacyPackageReferences(text: string): string {
  return text
    .replaceAll('preview/colors-ui-palette.html', 'preview/colors-primary.html')
    .replaceAll('preview/colors-node-types.html', 'preview/colors-theme-light.html and preview/colors-theme-dark.html')
    .replaceAll('preview/typography-scale.html', 'preview/typography-specimens.html')
    .replaceAll('preview/spacing-system.html', 'preview/spacing-tokens.html, preview/spacing-radius.html, and preview/spacing-shadows.html')
    .replaceAll('preview/logo-variants.html', 'preview/brand-assets.html')
    .replaceAll('ui_kits/generated_interface/index.html', 'ui_kits/app/index.html')
    .replaceAll('ui_kits/generated_interface/', 'ui_kits/app/')
    .replaceAll('ui_kits/generated_interface', 'ui_kits/app');
}
