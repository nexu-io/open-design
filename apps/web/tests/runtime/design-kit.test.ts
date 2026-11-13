import { describe, expect, it } from 'vitest';

import { parseDesignMd } from '../../src/runtime/design-md-parse';
import { fontStack, mergeBrandKitWithDesignMd, parsedToKit, type DesignKit } from '../../src/runtime/design-kit';

describe('fontStack', () => {
  it('normalizes parsed family tokens before building CSS stacks', () => {
    expect(fontStack({
      family: 'Nunito Sans,',
      fallbacks: ['system-ui', '-apple-system', 'sans-serif'],
    })).toBe("'Nunito Sans', system-ui, -apple-system, sans-serif");

    expect(fontStack({
      family: 'JetBrains Mono,',
      fallbacks: ['ui-monospace', 'Menlo', 'monospace'],
    })).toBe("'JetBrains Mono', ui-monospace, Menlo, monospace");
  });
});

describe('mergeBrandKitWithDesignMd', () => {
  it('preserves extracted font metadata when DESIGN.md repeats the same family with punctuation', () => {
    const base: DesignKit = {
      name: 'Content Jams',
      projectId: 'ds-content-jams-content-jams-design-system',
      editable: true,
      canUpload: true,
      logoAlternates: [],
      colors: [],
      typography: {
        display: {
          family: 'Nunito Sans',
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700;800;900&display=swap',
          fallbacks: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
          weights: [400, 700, 800, 900],
        },
        body: {
          family: 'Inter',
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
          fallbacks: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
          weights: [400, 500, 600, 700],
        },
        mono: {
          family: 'JetBrains Mono',
          googleFontsUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
          fallbacks: ['SFMono-Regular', 'ui-monospace', 'Menlo', 'monospace'],
          weights: [400, 500],
        },
      },
      fonts: [],
    };

    const merged = mergeBrandKitWithDesignMd(base, `# Content Jams Design System

## Typography

- **Display / headings:** Nunito Sans, \`system-ui\`, \`-apple-system\`, sans-serif.
- **Body / UI:** Inter, \`-apple-system\`, BlinkMacSystemFont, \`Segoe UI\`, system-ui, sans-serif.
- **Mono / data:** JetBrains Mono, \`SFMono-Regular\`, ui-monospace, Menlo, monospace.
`, {
      editable: true,
      projectId: 'ds-content-jams-content-jams-design-system',
    });

    expect(merged.fonts).toEqual([
      base.typography.display,
      base.typography.body,
      base.typography.mono,
    ]);
    expect(merged.fonts.map(fontStack)).toEqual([
      "'Nunito Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      "'JetBrains Mono', SFMono-Regular, ui-monospace, Menlo, monospace",
    ]);
  });
});

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
