import { describe, expect, it } from 'vitest';

import { parseDesignMd } from '../../src/runtime/design-md-parse';
import { brandToKit, mergeBrandKitWithDesignMd, parsedToKit } from '../../src/runtime/design-kit';

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

describe('package brand kit overlays DESIGN.md', () => {
  const BRAND_JSON = JSON.stringify({
    name: 'Stale Package Name',
    tagline: 'stale tagline',
    logo: { primary: 'logos/mark.svg', alternates: [] },
    colors: [{ role: 'accent', name: 'Old Accent', hex: '#000000', usage: '' }],
  });

  const DESIGN_MD = [
    '# Renamed System',
    '',
    '## Color Palette',
    '',
    '| Role | Name | Hex | Usage |',
    '| --- | --- | --- | --- |',
    '| accent | New Accent | #ff0000 | buttons |',
    '',
  ].join('\n');

  it('keeps DESIGN.md name and colors while taking the logo from brand.json', () => {
    // brand.json is the durable ASSET source for an extracted brand; DESIGN.md
    // is what renames and edits write to, so it must win on text.
    const packageKit = brandToKit(JSON.parse(BRAND_JSON) as Parameters<typeof brandToKit>[0], {
      designSystemId: 'user:acme',
      editable: false,
      assetUrl: (rel) => `/api/design-systems/user%3Aacme/static?path=${rel}`,
    });
    expect(packageKit.logoSrc).toBe('/api/design-systems/user%3Aacme/static?path=logos/mark.svg');

    const merged = mergeBrandKitWithDesignMd(packageKit, DESIGN_MD, {
      designSystemId: 'user:acme',
      editable: false,
    });

    expect(merged.name).toBe('Renamed System');
    expect(merged.colors.map((c) => c.hex)).toContain('#ff0000');
    expect(merged.logoSrc).toBe('/api/design-systems/user%3Aacme/static?path=logos/mark.svg');
  });

  it('resolves brand assets through the design-system package, not a project route', () => {
    const kit = brandToKit(JSON.parse(BRAND_JSON) as Parameters<typeof brandToKit>[0], {
      designSystemId: 'user:acme',
      editable: false,
      assetUrl: (rel) => `/pkg/${rel}`,
    });
    expect(kit.logoSrc).toBe('/pkg/logos/mark.svg');
  });
});
