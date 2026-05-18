import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importLocalDesignSystemProject } from '../src/design-system-import.js';
import { listDesignSystems, readDesignSystemAssets } from '../src/design-systems.js';

describe('importLocalDesignSystemProject', () => {
  let tempRoot: string;
  let sourceRoot: string;
  let userDesignSystemsRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-ds-import-'));
    sourceRoot = path.join(tempRoot, 'source-app');
    userDesignSystemsRoot = path.join(tempRoot, 'user-design-systems');
    fs.mkdirSync(path.join(sourceRoot, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'src', 'styles'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'public'), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, 'package.json'),
      JSON.stringify({
        name: '@acme/kami-app',
        description: 'A focused workspace for AI design reviews.',
        dependencies: { react: '^18.0.0', tailwindcss: '^3.0.0' },
      }),
    );
    fs.writeFileSync(
      path.join(sourceRoot, 'README.md'),
      '# Kami App\n\nA calm review surface with crisp cards and bright primary actions.\n',
    );
    fs.writeFileSync(
      path.join(sourceRoot, 'src', 'styles', 'tokens.css'),
      ':root { --color-primary: #ff3366; --color-background: #101014; --radius-card: 12px; }',
    );
    fs.writeFileSync(
      path.join(sourceRoot, 'tailwind.config.ts'),
      'export default { theme: { extend: { colors: {}, fontFamily: {}, borderRadius: {} } } }',
    );
    fs.writeFileSync(path.join(sourceRoot, 'src', 'components', 'Button.tsx'), 'export function Button() {}');
    fs.writeFileSync(path.join(sourceRoot, 'public', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" />');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('generates a design-system project from a local app directory', async () => {
    const result = await importLocalDesignSystemProject(sourceRoot, userDesignSystemsRoot, {
      now: new Date('2026-05-18T09:00:00.000Z'),
    });

    expect(result.id).toBe('kami-app');
    expect(result.files).toEqual(
      expect.arrayContaining(['DESIGN.md', 'tokens.css', 'components.html', 'manifest.json', 'assets/logo.svg']),
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 'od-design-system-project/v1',
      id: 'kami-app',
      name: 'kami app',
      category: 'Imported',
      source: {
        type: 'local',
        path: fs.realpathSync.native(sourceRoot),
        importedAt: '2026-05-18T09:00:00.000Z',
      },
      files: {
        design: 'DESIGN.md',
        tokens: 'tokens.css',
        components: 'components.html',
      },
      assetsDir: 'assets',
    });

    const design = fs.readFileSync(path.join(result.dir, 'DESIGN.md'), 'utf8');
    expect(design).toContain('A focused workspace for AI design reviews.');
    expect(design).toContain('Button: `src/components/Button.tsx`');
    expect(design).toContain('`--color-primary: #ff3366`');

    const assets = await readDesignSystemAssets(userDesignSystemsRoot, 'kami-app');
    expect(assets.tokensCss).toContain('--accent: #ff3366;');
    expect(assets.tokensCss).toContain('--bg: #101014;');
    expect(assets.fixtureHtml).toContain('Component fixture');

    const systems = await listDesignSystems(userDesignSystemsRoot);
    expect(systems).toMatchObject([
      {
        id: 'kami-app',
        title: 'kami app',
        category: 'Imported',
        summary: 'A focused workspace for AI design reviews.',
      },
    ]);
  });

  it('allocates a new slug instead of colliding with existing systems', async () => {
    const first = await importLocalDesignSystemProject(sourceRoot, userDesignSystemsRoot, {
      reservedIds: ['kami-app'],
    });
    const second = await importLocalDesignSystemProject(sourceRoot, userDesignSystemsRoot, {
      reservedIds: ['kami-app'],
    });

    expect(first.id).toBe('kami-app-2');
    expect(second.id).toBe('kami-app-3');
  });
});
