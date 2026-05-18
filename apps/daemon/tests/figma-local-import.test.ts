import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import {
  FigmaDecisionRequiredError,
  importLocalFigmaFile,
} from '../src/figma-local-import.js';

let projectDir: string;

beforeEach(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-figma-import-'));
  projectDir = path.join(root, 'project');
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await rm(path.dirname(projectDir), { recursive: true, force: true });
});

describe('importLocalFigmaFile', () => {
  it('writes manifest/dtcg-tokens/raw artifacts for a .fig payload', async () => {
    await writeFile(
      path.join(projectDir, 'design.fig'),
      JSON.stringify({
        fileKey: 'abc123456789',
        document: {
          fills: [{ color: '#3366ff' }],
          cornerRadius: '8px',
          spacing: '16px',
          shadow: '0 1px 2px rgba(0,0,0,.12)',
          fontSize: '16px',
        },
      }),
      'utf8',
    );

    const report = await importLocalFigmaFile({
      projectDir,
      sourcePath: 'design.fig',
    });

    expect(report.generatedFiles).toEqual([
      expect.stringMatching(/manifest\.json$/),
      expect.stringMatching(/tokens\.dtcg\.json$/),
      expect.stringMatching(/tailwind\.preset\.ts$/),
      expect.stringMatching(/tailwind-map\.json$/),
      expect.stringMatching(/unmatched\.json$/),
      expect.stringMatching(/raw\.json$/),
      expect.stringMatching(/preview\.svg$/),
      expect.stringMatching(/summary\.md$/),
      expect.stringMatching(/tokens\.json$/),
    ]);
    const tokens = JSON.parse(await readFile(path.join(projectDir, report.generatedFiles[1]!), 'utf8')) as {
      color: Array<{ $value: string }>;
      spacing: Array<{ $value: string }>;
    };
    expect(tokens.color.map((t) => t.$value)).toContain('#3366ff');
    expect(tokens.spacing.map((t) => t.$value)).toContain('16px');
    const manifest = JSON.parse(
      await readFile(path.join(projectDir, report.manifestPath), 'utf8'),
    ) as {
      generatedArtifacts: string[];
      sourceKind: string;
      stats: { colors: number; unmatched: number; tailwindThemeKeys: number };
      unmatchedPath: string;
    };
    expect(manifest.sourceKind).toBe('figma-local');
    expect(manifest.generatedArtifacts).toContain('tokens.dtcg.json');
    expect(manifest.generatedArtifacts).toContain('tailwind.preset.ts');
    expect(manifest.generatedArtifacts).toContain('unmatched.json');
    expect(manifest.generatedArtifacts).toContain('preview.svg');
    expect(manifest.generatedArtifacts).toContain('summary.md');
    expect(manifest.stats.colors).toBeGreaterThan(0);
    expect(manifest.stats.tailwindThemeKeys).toBeGreaterThan(0);
    expect(manifest.unmatchedPath).toBe('unmatched.json');
  });

  it('requires a re-import decision when the same file is imported again', async () => {
    await writeFile(path.join(projectDir, 'design.fig'), JSON.stringify({ fileKey: 'abc123456789' }), 'utf8');
    await importLocalFigmaFile({ projectDir, sourcePath: 'design.fig' });
    await expect(importLocalFigmaFile({ projectDir, sourcePath: 'design.fig' })).rejects.toBeInstanceOf(FigmaDecisionRequiredError);
  });

  it('supports create_version and update_generated decisions', async () => {
    await writeFile(path.join(projectDir, 'design.fig'), JSON.stringify({ fileKey: 'abc123456789', document: { spacing: '8px' } }), 'utf8');
    const first = await importLocalFigmaFile({ projectDir, sourcePath: 'design.fig' });
    const createVersion = await importLocalFigmaFile({
      projectDir,
      sourcePath: 'design.fig',
      decision: 'create_version',
    });
    expect(createVersion.importId).not.toBe(first.importId);

    const update = await importLocalFigmaFile({
      projectDir,
      sourcePath: 'design.fig',
      decision: 'update_generated',
    });
    expect(update.importId).toBe(first.importId);
    expect(update.importVersion).toBeGreaterThan(first.importVersion);
  });

  it('applies overrides.tokens.json when regenerating existing import artifacts', async () => {
    await writeFile(
      path.join(projectDir, 'design.fig'),
      JSON.stringify({ fileKey: 'overridekey123', document: { fills: [{ color: '#3366ff' }], spacing: '8px' } }),
      'utf8',
    );
    const first = await importLocalFigmaFile({ projectDir, sourcePath: 'design.fig' });
    const importDir = path.join(projectDir, first.manifestPath.replace(/\/manifest\.json$/, ''));
    await writeFile(
      path.join(importDir, 'overrides.tokens.json'),
      JSON.stringify({ color: ['#ff0000'], spacing: ['12px'] }, null, 2),
      'utf8',
    );

    const update = await importLocalFigmaFile({
      projectDir,
      sourcePath: 'design.fig',
      decision: 'update_generated',
    });
    const tokens = JSON.parse(
      await readFile(path.join(projectDir, update.generatedFiles.find((f) => f.endsWith('/tokens.dtcg.json'))!), 'utf8'),
    ) as {
      color: Array<{ $value: string }>;
      spacing: Array<{ $value: string }>;
    };
    expect(tokens.color.map((t) => t.$value)).toEqual(['#ff0000']);
    expect(tokens.spacing.map((t) => t.$value)).toEqual(['12px']);

    const manifest = JSON.parse(
      await readFile(path.join(projectDir, update.manifestPath), 'utf8'),
    ) as { warnings: string[]; overridesPath?: string };
    expect(manifest.overridesPath).toBe('overrides.tokens.json');
    expect(manifest.warnings.some((w) => /Applied 2 token override/.test(w))).toBe(true);
  });
});
