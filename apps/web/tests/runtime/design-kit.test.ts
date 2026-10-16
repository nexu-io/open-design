import { describe, expect, it } from 'vitest';
import type { Brand, DesignSystemPackageInfo } from '@open-design/contracts';

import { parseDesignMd } from '../../src/runtime/design-md-parse';
import { brandToKit, parsedToKit } from '../../src/runtime/design-kit';

describe('parsedToKit package static assets', () => {
  it('falls back to declared components and omits missing artifacts when packaged system files are absent', () => {
    const kit = parsedToKit(parseDesignMd('# Tom Modern Design'), {
      designSystemId: 'tom-modern',
      editable: false,
      packageInfo: {
        availableFiles: [
          'DESIGN.md',
          'tokens.css',
          'components.html',
        ],
        manifest: {
          schemaVersion: 'od-design-system-project/v1',
          id: 'tom-modern',
          name: 'Tom Modern Design',
          category: 'Starter',
          files: {
            design: 'DESIGN.md',
            tokens: 'tokens.css',
            components: 'components.html',
          },
        },
      },
    });

    expect(kit.system).toMatchObject({
      kitUrl: '/api/design-systems/tom-modern/static?path=components.html',
      kitLabel: 'components.html',
    });
    expect(kit.system?.kitDarkUrl).toBeUndefined();
    expect(kit.assets).toBeUndefined();
  });

  it('keeps generated system kit and artifact URLs when the package includes them', () => {
    const kit = parsedToKit(parseDesignMd('# Bento'), {
      designSystemId: 'bento',
      editable: false,
      packageInfo: {
        availableFiles: [
          'system/kit.html',
          'system/kit.dark.html',
          'system/artifacts/landing.html',
        ],
        manifest: {
          schemaVersion: 'od-design-system-project/v1',
          id: 'bento',
          name: 'Bento',
          category: 'Layout',
          files: {
            design: 'DESIGN.md',
            tokens: 'tokens.css',
            components: 'components.html',
          },
        },
      },
    });

    expect(kit.system).toMatchObject({
      kitUrl: '/api/design-systems/bento/static?path=system%2Fkit.html',
      kitDarkUrl: '/api/design-systems/bento/static?path=system%2Fkit.dark.html',
      kitLabel: 'system/kit.html',
    });
    expect(kit.assets).toEqual([
      {
        kind: 'landing',
        label: 'Landing page',
        url: '/api/design-systems/bento/static?path=system%2Fartifacts%2Flanding.html',
      },
    ]);
  });
});

describe('brandToKit system files', () => {
  const brand = {
    name: 'Acme',
    tagline: '',
    description: '',
    sourceUrl: '',
    logo: { primary: null, alternates: [], notes: '' },
    colors: [],
    typography: {
      display: { family: 'Inter', fallbacks: [], weights: [] },
      body: { family: 'Inter', fallbacks: [], weights: [] },
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
  } as Brand;

  const packageInfo = (availableFiles: string[]): DesignSystemPackageInfo => ({
    availableFiles,
    manifest: {
      schemaVersion: 'od-design-system-project/v1',
      id: 'acme',
      name: 'Acme',
      category: 'Brands',
      files: { design: 'DESIGN.md', tokens: 'tokens.css', components: 'components.html' },
      preview: {
        dir: 'preview',
        pages: [
          { path: 'preview/colors.html', role: 'colors', title: 'Colors' },
          { path: 'preview/missing.html', role: 'missing', title: 'Missing' },
        ],
      },
    },
  });

  it('keeps every system file and artifact tile without package info', () => {
    const kit = brandToKit(brand, { designSystemId: 'user:acme', projectId: 'ds-acme', editable: true });

    expect(kit.system).toMatchObject({
      kitUrl: '/api/projects/ds-acme/raw/system/kit.html',
      kitDarkUrl: '/api/projects/ds-acme/raw/system/kit.dark.html',
      tokensUrl: '/api/projects/ds-acme/raw/system/tokens.default.json',
    });
    expect(kit.assets).toHaveLength(6);
  });

  it('shows only the system files the package has and falls back to its preview pages', () => {
    const kit = brandToKit(brand, {
      designSystemId: 'user:acme',
      projectId: 'ds-acme',
      editable: true,
      packageInfo: packageInfo(['DESIGN.md', 'system/kit.html', 'preview/colors.html']),
    });

    expect(kit.system?.kitUrl).toBe('/api/projects/ds-acme/raw/system/kit.html');
    expect(kit.system?.kitDarkUrl).toBeUndefined();
    expect(kit.system?.tokensUrl).toBeUndefined();
    expect(kit.assets).toEqual([
      {
        kind: 'colors',
        label: 'Colors',
        url: '/api/projects/ds-acme/raw/preview/colors.html',
      },
    ]);
  });

  it('drops the system section when the package has no kit', () => {
    const kit = brandToKit(brand, {
      designSystemId: 'user:acme',
      projectId: 'ds-acme',
      editable: true,
      packageInfo: packageInfo(['DESIGN.md']),
    });

    expect(kit.system).toBeUndefined();
    expect(kit.assets).toBeUndefined();
  });
});
