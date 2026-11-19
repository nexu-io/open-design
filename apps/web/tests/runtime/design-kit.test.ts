import { describe, expect, it } from 'vitest';

import { parseDesignMd } from '../../src/runtime/design-md-parse';
import { parsedToKit } from '../../src/runtime/design-kit';

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

  it('exposes kit, token, manifest, and preview URLs for editable local imports without projectId', () => {
    const kit = parsedToKit(parseDesignMd('# Webomage'), {
      designSystemId: 'user:webomage',
      editable: true,
      packageInfo: {
        availableFiles: [
          'DESIGN.md',
          'tokens.css',
          'design-tokens.json',
          'components.html',
          'components.manifest.json',
          'preview/colors.html',
          'preview/app.html',
        ],
        manifest: {
          schemaVersion: 'od-design-system-project/v1',
          id: 'webomage',
          name: 'Webomage',
          category: 'Imported',
          files: {
            design: 'DESIGN.md',
            tokens: 'tokens.css',
            designTokens: 'design-tokens.json',
            components: 'components.html',
          },
          componentsManifest: 'components.manifest.json',
          preview: {
            dir: 'preview',
            pages: [
              { path: 'preview/colors.html', role: 'colors', title: 'Colors' },
              { path: 'preview/app.html', role: 'app', title: 'App Preview' },
            ],
          },
        },
      },
    });

    expect(kit.system).toMatchObject({
      kitUrl: '/api/design-systems/user%3Awebomage/static?path=components.html',
      designTokensUrl: '/api/design-systems/user%3Awebomage/static?path=design-tokens.json',
      componentsManifestUrl: '/api/design-systems/user%3Awebomage/static?path=components.manifest.json',
      kitLabel: 'components.html',
    });
    expect(kit.assets).toEqual([
      {
        kind: 'colors',
        label: 'Colors',
        url: '/api/design-systems/user%3Awebomage/static?path=preview%2Fcolors.html',
      },
      {
        kind: 'app',
        label: 'App Preview',
        url: '/api/design-systems/user%3Awebomage/static?path=preview%2Fapp.html',
      },
    ]);
  });
});
