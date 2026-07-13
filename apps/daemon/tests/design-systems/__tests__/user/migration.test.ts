import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  hasAnyLegacyDesignSystemArtifact,
  removeLegacyDesignSystemArtifacts,
  rewriteLegacyPackageDocumentationReferences,
  rewriteLegacyPackageReferences,
} from '../../../../src/design-systems/user/migration.js';
import { LEGACY_DESIGN_SYSTEM_ARTIFACTS } from '../../../../src/design-systems/core/types.js';

// ── pure unit ────────────────────────────────────────────────────────────────

describe('rewriteLegacyPackageReferences', () => {
  it('replaces all known legacy paths', () => {
    const legacyText = [
      'See preview/colors-ui-palette.html',
      'See preview/colors-node-types.html',
      'See preview/typography-scale.html',
      'See preview/spacing-system.html',
      'See preview/logo-variants.html',
      'Ref ui_kits/generated_interface/index.html',
      'Ref ui_kits/generated_interface/',
      'Ref ui_kits/generated_interface',
    ].join('\n');

    const result = rewriteLegacyPackageReferences(legacyText);

    expect(result).toContain('preview/colors-primary.html');
    expect(result).toContain('preview/colors-theme-light.html');
    expect(result).toContain('preview/typography-specimens.html');
    expect(result).toContain('preview/spacing-tokens.html');
    expect(result).toContain('preview/brand-assets.html');
    expect(result).toContain('ui_kits/app/index.html');
    expect(result).toContain('ui_kits/app/');

    expect(result).not.toContain('colors-ui-palette.html');
    expect(result).not.toContain('colors-node-types.html');
    expect(result).not.toContain('typography-scale.html');
    expect(result).not.toContain('spacing-system.html');
    expect(result).not.toContain('logo-variants.html');
    expect(result).not.toContain('generated_interface');
  });

  it('is a no-op on text that has no legacy references', () => {
    const clean = 'See preview/colors-primary.html\nSee ui_kits/app/index.html';
    expect(rewriteLegacyPackageReferences(clean)).toBe(clean);
  });

  it('is idempotent', () => {
    const input = 'preview/colors-ui-palette.html';
    expect(rewriteLegacyPackageReferences(rewriteLegacyPackageReferences(input))).toBe(
      rewriteLegacyPackageReferences(input),
    );
  });
});

// ── filesystem integration ───────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `od-migration-test-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('hasAnyLegacyDesignSystemArtifact', () => {
  it('returns false when no legacy artifacts are present', async () => {
    expect(await hasAnyLegacyDesignSystemArtifact(tmpDir)).toBe(false);
  });

  it('returns true when at least one legacy artifact exists', async () => {
    const first = LEGACY_DESIGN_SYSTEM_ARTIFACTS[0];
    if (!first) return;
    const legacyPath = path.join(tmpDir, ...first.legacyPath.split('/'));
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, '', 'utf8');
    expect(await hasAnyLegacyDesignSystemArtifact(tmpDir)).toBe(true);
  });
});

describe('removeLegacyDesignSystemArtifacts', () => {
  it('does not remove a legacy artifact when replacement is not yet present', async () => {
    const first = LEGACY_DESIGN_SYSTEM_ARTIFACTS[0];
    if (!first) return;

    const legacyPath = path.join(tmpDir, ...first.legacyPath.split('/'));
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, 'old', 'utf8');

    await removeLegacyDesignSystemArtifacts(tmpDir);

    // legacy file must still be here because replacements are absent
    const { readFileOptional } = await import('../../../../src/design-systems/core/file-utils.js');
    expect(await readFileOptional(legacyPath)).toBe('old');
  });

  it('removes the legacy artifact once all replacements exist', async () => {
    const first = LEGACY_DESIGN_SYSTEM_ARTIFACTS[0];
    if (!first) return;

    const legacyPath = path.join(tmpDir, ...first.legacyPath.split('/'));
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, 'old', 'utf8');

    // create every replacement file declared for this artifact
    for (const rp of first.replacementPaths) {
      const replacementFull = path.join(tmpDir, ...rp.split('/'));
      await mkdir(path.dirname(replacementFull), { recursive: true });
      await writeFile(replacementFull, '', 'utf8');
    }

    await removeLegacyDesignSystemArtifacts(tmpDir);

    const { fileExists } = await import('../../../../src/design-systems/core/file-utils.js');
    expect(await fileExists(legacyPath)).toBe(false);
  });
});

describe('rewriteLegacyPackageDocumentationReferences', () => {
  it('rewrites DESIGN.md that contains legacy references', async () => {
    const designMd = path.join(tmpDir, 'DESIGN.md');
    await writeFile(designMd, 'See preview/colors-ui-palette.html for palette.', 'utf8');

    await rewriteLegacyPackageDocumentationReferences(tmpDir);

    const { readFileOptional } = await import('../../../../src/design-systems/core/file-utils.js');
    const content = await readFileOptional(designMd);
    expect(content).toContain('preview/colors-primary.html');
    expect(content).not.toContain('colors-ui-palette.html');
  });

  it('does not touch files that have no legacy references', async () => {
    const readmeMd = path.join(tmpDir, 'README.md');
    const original = '# Clean README with no legacy refs';
    await writeFile(readmeMd, original, 'utf8');

    await rewriteLegacyPackageDocumentationReferences(tmpDir);

    const { readFileOptional } = await import('../../../../src/design-systems/core/file-utils.js');
    expect(await readFileOptional(readmeMd)).toBe(original);
  });

  it('silently skips missing documentation files', async () => {
    // No files in tmpDir — should not throw
    await expect(rewriteLegacyPackageDocumentationReferences(tmpDir)).resolves.toBeUndefined();
  });
});
