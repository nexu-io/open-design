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
});
