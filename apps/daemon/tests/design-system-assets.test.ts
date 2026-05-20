// Focused test for readDesignSystemAssets — the new sibling-file reader
// that lets the daemon ship the compiled (tokens.css + components.html)
// form of a brand alongside its DESIGN.md prose. The legacy reader
// (`readDesignSystem`, returning DESIGN.md content) already has implicit
// coverage through the showcase + chat-route tests; this file pins the
// new helper's contract so future changes can't silently regress the
// "either or both files may be absent" semantics that PR-C relies on
// for graceful fallback across the ~138 brands without compiled tokens
// today.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isDesignTokenChannelEnabled,
  listDesignSystems,
  readDesignSystem,
  readDesignSystemAssets,
  readDesignSystemPackageInfo,
  readDesignSystemPullFile,
  resolveDesignSystemAssets,
} from '../src/design-systems.js';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-design-system-assets-'));
}

function brandDir(root: string, id: string): string {
  const dir = path.join(root, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeDesignSystemProject(
  root: string,
  id: string,
  {
    manifest,
    design = '# Markdown Title\n\n> Category: Markdown Category\n> Markdown summary.\n',
    tokens = ':root { --bg: #fff; }',
    components = '<button>fixture</button>',
  }: {
    manifest?: Record<string, unknown>;
    design?: string;
    tokens?: string;
    components?: string | null;
  } = {},
): string {
  const dir = brandDir(root, id);
  writeFileSync(path.join(dir, 'DESIGN.md'), design);
  writeFileSync(path.join(dir, 'tokens.css'), tokens);
  if (components !== null) writeFileSync(path.join(dir, 'components.html'), components);
  if (manifest) writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}

describe('readDesignSystemAssets', () => {
  it('returns both fields when tokens.css and components.html are both present', async () => {
    const root = fresh();
    const dir = brandDir(root, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root {\n  --bg: #fff;\n}\n');
    writeFileSync(
      path.join(dir, 'components.html'),
      '<!doctype html><html><body>fixture</body></html>\n',
    );

    const assets = await readDesignSystemAssets(root, 'sample');
    expect(assets.tokensCss).toContain('--bg: #fff');
    expect(assets.fixtureHtml).toContain('fixture');
    expect(assets.componentsManifest).toContain('components.manifest schema v1 for sample');
  });

  it('returns the single field that exists when its sibling is missing (per-file independence)', async () => {
    const root = fresh();
    const dir = brandDir(root, 'tokens-only');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --x: 1; }');

    const tokensOnly = await readDesignSystemAssets(root, 'tokens-only');
    expect(tokensOnly.tokensCss).toBe(':root { --x: 1; }');
    expect(tokensOnly.fixtureHtml).toBeUndefined();

    const fixtureDir = brandDir(root, 'fixture-only');
    writeFileSync(path.join(fixtureDir, 'components.html'), '<p>only</p>');

    const fixtureOnly = await readDesignSystemAssets(root, 'fixture-only');
    expect(fixtureOnly.tokensCss).toBeUndefined();
    expect(fixtureOnly.fixtureHtml).toBe('<p>only</p>');
    expect(fixtureOnly.componentsManifest).toContain('components.manifest schema v1 for fixture-only');
  });

  it('returns an empty object when the brand directory has neither file', async () => {
    const root = fresh();
    brandDir(root, 'prose-only');

    const assets = await readDesignSystemAssets(root, 'prose-only');
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });

  it('returns an empty object when the brand directory itself does not exist (legacy ~138-brand fallback)', async () => {
    const root = fresh();
    const assets = await readDesignSystemAssets(root, 'nonexistent-brand');
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
  });

  // Reviewer feedback (nettee, PR-C #1385): the prior implementation
  // swallowed every readFile() error as "absent", which would silently
  // hide non-absence failures (EACCES, EISDIR, broken packaged
  // resource paths, transient I/O) and ship the legacy DESIGN.md-only
  // prompt as if the token channel had succeeded. That corrupts the
  // exact signal the smoke-test rollout depends on. The reader now
  // only swallows ENOENT / ENOTDIR; everything else must surface.
  it('rejects on non-absence read failures so token-channel misconfigurations surface', async () => {
    const root = fresh();
    const dir = brandDir(root, 'broken-tokens');
    // Plant a DIRECTORY at the tokens.css path. readFile() rejects
    // with EISDIR — a real-world stand-in for permission / packaged-
    // resource path bugs that should fail visibly, not silently fall
    // back. EACCES would be more lifelike but is hard to simulate
    // portably across CI runners; EISDIR exercises the exact same
    // "non-absence error" branch.
    mkdirSync(path.join(dir, 'tokens.css'));

    await expect(readDesignSystemAssets(root, 'broken-tokens')).rejects.toThrow(
      /EISDIR|illegal operation|directory/i,
    );
  });

  it('still treats ENOENT as absence even when one sibling is present (per-file independence holds under the stricter contract)', async () => {
    // Pin the flip side of the rejection test above: tightening the
    // catch must NOT regress the legacy ~138-brand fallback. With
    // tokens.css present and components.html absent, the reader
    // returns the present side and undefined for the missing one,
    // exactly as before.
    const root = fresh();
    const dir = brandDir(root, 'partial');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --x: 1; }');

    const assets = await readDesignSystemAssets(root, 'partial');
    expect(assets.tokensCss).toBe(':root { --x: 1; }');
    expect(assets.fixtureHtml).toBeUndefined();
  });
});

describe('Design System Project manifest runtime consumption', () => {
  it('uses manifest name/category/description for listings while still reading DESIGN.md body', async () => {
    const root = fresh();
    writeDesignSystemProject(root, 'project-system', {
      manifest: {
        schemaVersion: 'od-design-system-project/v1',
        id: 'project-system',
        name: 'Project System',
        category: 'Imported',
        description: 'Description from manifest.',
        source: { type: 'local', path: '/tmp/project' },
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
          components: 'components.html',
        },
      },
      design: '# Markdown Title\n\n> Category: Markdown Category\n> Markdown summary.\n\nBody.\n',
    });

    const systems = await listDesignSystems(root);
    expect(systems).toHaveLength(1);
    expect(systems[0]).toMatchObject({
      id: 'project-system',
      title: 'Project System',
      category: 'Imported',
      summary: 'Description from manifest.',
      body: '# Markdown Title\n\n> Category: Markdown Category\n> Markdown summary.\n\nBody.\n',
    });

    await expect(readDesignSystem(root, 'project-system')).resolves.toContain('# Markdown Title');
  });

  it('keeps DESIGN.md-only systems working next to project manifests', async () => {
    const root = fresh();
    writeDesignSystemProject(root, 'project-system', {
      manifest: {
        schemaVersion: 'od-design-system-project/v1',
        id: 'project-system',
        name: 'Project System',
        category: 'Imported',
        description: 'Description from manifest.',
        source: { type: 'bundled' },
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
        },
      },
      components: null,
    });
    writeDesignSystemProject(root, 'legacy-system', {
      design: '# Legacy System\n\n> Category: Legacy\n> Legacy summary.\n\nBody.\n',
      components: null,
    });

    const systems = await listDesignSystems(root);
    expect(systems.map((s) => s.id).sort()).toEqual(['legacy-system', 'project-system']);
    expect(systems.find((s) => s.id === 'legacy-system')).toMatchObject({
      title: 'Legacy System',
      category: 'Legacy',
      summary: 'Legacy summary.',
    });
    expect(systems.find((s) => s.id === 'project-system')).toMatchObject({
      title: 'Project System',
      category: 'Imported',
      summary: 'Description from manifest.',
    });
  });

  it('reads manifest-declared tokens and skips missing optional components.html', async () => {
    const root = fresh();
    writeDesignSystemProject(root, 'tokens-only-project', {
      manifest: {
        schemaVersion: 'od-design-system-project/v1',
        id: 'tokens-only-project',
        name: 'Tokens Only Project',
        category: 'Imported',
        source: { type: 'bundled' },
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
        },
      },
      tokens: ':root { --accent: #2F6FEB; }',
      components: null,
    });

    const assets = await readDesignSystemAssets(root, 'tokens-only-project');
    expect(assets.tokensCss).toBe(':root { --accent: #2F6FEB; }');
    expect(assets.fixtureHtml).toBeUndefined();
  });

  it('reads USAGE.md, committed component cache, and manifest pull index without loading rich files', async () => {
    const root = fresh();
    const dir = writeDesignSystemProject(root, 'hybrid-project', {
      manifest: {
        schemaVersion: 'od-design-system-project/v1',
        id: 'hybrid-project',
        name: 'Hybrid Project',
        category: 'Imported',
        source: { type: 'local', path: '/tmp/project' },
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
          components: 'components.html',
        },
        usage: 'USAGE.md',
        componentsManifest: 'components.manifest.json',
        importMode: 'verbatim',
        craft: {
          applies: ['color'],
          suggested: [],
          exemptions: ['typography'],
        },
        assetsDir: 'assets',
        fonts: [{ family: 'Inter', weight: 500, file: 'fonts/Inter-Medium.woff2' }],
        preview: {
          dir: 'preview',
          pages: [
            { path: 'preview/colors.html', role: 'colors', title: 'Colors' },
            { path: 'preview/app.html', role: 'app', title: 'App Preview' },
          ],
        },
        sourceFiles: {
          scanned: 'source/scanned-files.json',
          evidence: 'source/evidence.md',
          tokens: 'source/tokens.source.json',
          snippets: 'source/snippets/INDEX.json',
        },
      },
      tokens: ':root { --accent: #00aa55; }',
      components: '<button class="btn">Derived should lose to cache</button>',
    });
    writeFileSync(path.join(dir, 'USAGE.md'), '## Read Order\n\nUse cache first.');
    writeFileSync(
      path.join(dir, 'components.manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        brandId: 'cache-brand',
        source: { componentsHtml: 'components.html', tokensCss: 'tokens.css' },
        fixture: {
          styleBlockCount: 1,
          selectorCount: 3,
          classCount: 2,
          elementCount: 1,
        },
        tokens: {
          declared: ['--accent'],
          referenced: ['--accent'],
          unusedDeclared: [],
          undeclaredReferenced: [],
        },
        selectors: ['.cached-button'],
        classes: ['cached-button'],
        elements: ['button'],
        groups: [
          {
            id: 'buttons',
            label: 'Cached buttons',
            present: true,
            selectors: ['.cached-button'],
            classes: ['cached-button'],
            elements: ['button'],
            tokenReferences: ['--accent'],
          },
        ],
        literals: {
          colorExpressions: 0,
          pixelValues: 0,
          hardcodedFontFamilies: 0,
        },
      }, null, 2)}\n`,
    );

    const assets = await readDesignSystemAssets(root, 'hybrid-project');
    expect(assets.usageMd).toContain('Use cache first');
    expect(assets.importMode).toBe('verbatim');
    expect(assets.craftApplies).toEqual(['color']);
    expect(assets.craftExemptions).toEqual(['typography']);
    expect(assets.componentsManifest).toContain('components.manifest schema v1 for cache-brand');
    expect(assets.componentsManifest).toContain('Cached buttons');
    expect(assets.pullIndex).toContain('preview/colors.html: Colors; colors');
    expect(assets.pullIndex).toContain('fonts/Inter-Medium.woff2: font: Inter 500');
    expect(assets.pullIndex).toContain('source/snippets/INDEX.json: source snippet index');
  });

  it('allows pull reads only for manifest-declared rich-layer files', async () => {
    const root = fresh();
    const dir = writeDesignSystemProject(root, 'pull-project', {
      manifest: {
        schemaVersion: 'od-design-system-project/v1',
        id: 'pull-project',
        name: 'Pull Project',
        category: 'Imported',
        source: { type: 'local', path: '/tmp/project' },
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
          components: 'components.html',
        },
        assetsDir: 'assets',
        preview: {
          dir: 'preview',
          pages: [{ path: 'preview/colors.html', role: 'colors', title: 'Colors' }],
        },
        sourceFiles: {
          snippets: 'source/snippets/INDEX.json',
        },
      },
    });
    mkdirSync(path.join(dir, 'preview'), { recursive: true });
    mkdirSync(path.join(dir, 'source', 'snippets'), { recursive: true });
    mkdirSync(path.join(dir, 'assets', 'icons'), { recursive: true });
    writeFileSync(path.join(dir, 'preview', 'colors.html'), '<h1>Colors</h1>');
    writeFileSync(path.join(dir, 'preview', 'spacing.html'), '<h1>Spacing</h1>');
    writeFileSync(path.join(dir, 'source', 'snippets', 'INDEX.json'), `${JSON.stringify({
      schemaVersion: 1,
      snippets: [{ path: 'source/snippets/Button.tsx', role: 'button' }],
    })}\n`);
    writeFileSync(path.join(dir, 'source', 'snippets', 'Button.tsx'), 'export function Button() {}');
    writeFileSync(path.join(dir, 'assets', 'icons', 'mark.svg'), '<svg />');

    await expect(readDesignSystemPullFile(root, 'pull-project', 'preview/colors.html')).resolves.toMatchObject({
      path: 'preview/colors.html',
      encoding: 'utf8',
      content: '<h1>Colors</h1>',
    });
    await expect(readDesignSystemPullFile(root, 'pull-project', 'source/snippets/Button.tsx')).resolves.toMatchObject({
      path: 'source/snippets/Button.tsx',
      content: 'export function Button() {}',
    });
    await expect(readDesignSystemPullFile(root, 'pull-project', 'assets/icons/mark.svg')).resolves.toMatchObject({
      path: 'assets/icons/mark.svg',
      content: '<svg />',
    });
    await expect(readDesignSystemPullFile(root, 'pull-project', 'preview/spacing.html')).resolves.toBeNull();
    await expect(readDesignSystemPullFile(root, 'pull-project', '../pull-project/preview/colors.html')).resolves.toBeNull();
  });

  it('summarizes manifest and source evidence for the detail page', async () => {
    const root = fresh();
    const dir = writeDesignSystemProject(root, 'detail-project', {
      manifest: {
        schemaVersion: 'od-design-system-project/v1',
        id: 'detail-project',
        name: 'Detail Project',
        category: 'Imported',
        source: { type: 'local', path: '/tmp/project' },
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
          components: 'components.html',
        },
        usage: 'USAGE.md',
        componentsManifest: 'components.manifest.json',
        importMode: 'hybrid',
        preview: {
          dir: 'preview',
          pages: [{ path: 'preview/colors.html', role: 'colors', title: 'Colors' }],
        },
        sourceFiles: {
          scanned: 'source/scanned-files.json',
          evidence: 'source/evidence.md',
          tokens: 'source/tokens.source.json',
          snippets: 'source/snippets/INDEX.json',
        },
      },
    });
    mkdirSync(path.join(dir, 'source', 'snippets'), { recursive: true });
    writeFileSync(path.join(dir, 'source', 'scanned-files.json'), JSON.stringify({ files: [{ path: 'Button.tsx' }] }));
    writeFileSync(path.join(dir, 'source', 'evidence.md'), '# Evidence\n\n- Buttons matched source.');
    writeFileSync(path.join(dir, 'source', 'tokens.source.json'), JSON.stringify({
      tokenCount: 7,
      confidence: { color: 'high', spacing: 0.4 },
    }));
    writeFileSync(path.join(dir, 'source', 'snippets', 'INDEX.json'), JSON.stringify({
      snippets: [{ path: 'source/snippets/Button.tsx' }],
    }));

    await expect(readDesignSystemPackageInfo(root, 'detail-project')).resolves.toMatchObject({
      manifest: {
        usage: 'USAGE.md',
        importMode: 'hybrid',
        preview: { pages: [{ path: 'preview/colors.html' }] },
      },
      sourceEvidence: {
        scannedFileCount: 1,
        tokenCount: 7,
        snippetCount: 1,
        confidence: { color: 'high', spacing: 0.4 },
      },
    });
  });
});

// Reviewer feedback (nettee, PR-D #1544): the parity guard at
// `scripts/check-design-system-flag-parity.ts` exercises the prompt
// composer directly and therefore does NOT cover the server-layer env
// gate that PR-D actually flipped — a future regression that restored
// `=== '1'`, used a typo'd env name, or stopped reading assets when
// the var is unset would still let the guard pass green. These tests
// pin the predicate that wraps the gate so the default-on flip itself
// is locked into the test suite.
describe('isDesignTokenChannelEnabled (PR-D env gate)', () => {
  it('is true when OD_DESIGN_TOKEN_CHANNEL is unset (PR-D default-on)', () => {
    expect(isDesignTokenChannelEnabled({})).toBe(true);
  });

  it('is true for the legacy explicit opt-in `1`', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '1' })).toBe(true);
  });

  it('is true for any non-`0` truthy-looking value (forward compatibility)', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: 'true' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: 'on' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '2' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: 'yes' })).toBe(true);
  });

  it('is true for an empty string (operator typed `=` and forgot the value — fail open, not closed)', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '' })).toBe(true);
  });

  it('is false ONLY for the literal kill-switch value `0`', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '0' })).toBe(false);
  });

  it('is true for whitespace-padded `0` — strict literal match prevents accidental kill-switch tripping', () => {
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: ' 0' })).toBe(true);
    expect(isDesignTokenChannelEnabled({ OD_DESIGN_TOKEN_CHANNEL: '0 ' })).toBe(true);
  });
});

// Reviewer feedback (lefarcen, PR-D #1544 round 2): the predicate
// suite above pins the env-flag boolean but does NOT exercise the
// server's asset-resolution path that PR-D actually flipped — i.e.
// the seam where the daemon decides whether to read tokens.css /
// components.html from disk and hand them to composeSystemPrompt.
//
// `resolveDesignSystemAssets` IS that seam: server.ts at the
// prompt-assembly site is now a thin caller of this function, so a
// regression that restored the old `=== '1'` semantics, swapped in a
// wrong env name, or silently dropped the asset-read branch flips
// observable behaviour here against real disk fixtures. These tests
// run that whole pipeline (env gate → readDesignSystemAssets per
// root → fallback chain → DesignSystemAssets shape) end-to-end.
describe('resolveDesignSystemAssets (PR-D server-layer asset resolution)', () => {
  it('returns the built-in assets when the channel is enabled (env unset, default-on)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
    writeFileSync(path.join(dir, 'components.html'), '<button>btn</button>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBe(':root { --bg: #fff; }');
    expect(assets.fixtureHtml).toBe('<button>btn</button>');
    expect(assets.componentsManifest).toContain('Buttons and calls to action');
  });

  it('returns empty (kill switch) when OD_DESIGN_TOKEN_CHANNEL is `0`, even if files are on disk', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
    writeFileSync(path.join(dir, 'components.html'), '<button>btn</button>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {
      OD_DESIGN_TOKEN_CHANNEL: '0',
    });
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
    expect(assets.componentsManifest).toBeUndefined();
  });

  it('still returns the assets under the legacy explicit opt-in `OD_DESIGN_TOKEN_CHANNEL=1`', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
    writeFileSync(path.join(dir, 'components.html'), '<button>btn</button>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {
      OD_DESIGN_TOKEN_CHANNEL: '1',
    });
    expect(assets.tokensCss).toContain('--bg: #fff');
    expect(assets.fixtureHtml).toContain('<button>');
    expect(assets.componentsManifest).toContain('Buttons and calls to action');
  });

  it('falls back to user-installed root for files missing in built-in (per-file independence)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const builtInDir = brandDir(builtInRoot, 'split');
    writeFileSync(path.join(builtInDir, 'tokens.css'), ':root { --bg: built-in; }');
    const userDir = brandDir(userRoot, 'split');
    writeFileSync(path.join(userDir, 'components.html'), '<from-user-installed/>');

    const assets = await resolveDesignSystemAssets('split', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBe(':root { --bg: built-in; }');
    expect(assets.fixtureHtml).toBe('<from-user-installed/>');
    expect(assets.componentsManifest).toContain('components.manifest schema v1 for split');
  });

  it('returns the built-in assets verbatim when both files are present built-in (skips the user-installed roundtrip)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const dir = brandDir(builtInRoot, 'sample');
    writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: built-in; }');
    writeFileSync(path.join(dir, 'components.html'), '<from-built-in/>');
    // Plant different content under user-installed root — if the
    // fallback chain mistakenly merges, the test below would catch it.
    const userDir = brandDir(userRoot, 'sample');
    writeFileSync(path.join(userDir, 'tokens.css'), ':root { --bg: user-installed; }');
    writeFileSync(path.join(userDir, 'components.html'), '<from-user-installed/>');

    const assets = await resolveDesignSystemAssets('sample', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBe(':root { --bg: built-in; }');
    expect(assets.fixtureHtml).toBe('<from-built-in/>');
    expect(assets.componentsManifest).toContain('components.manifest schema v1 for sample');
  });

  it('returns undefined for both fields when the brand ships neither file in either root (legacy ~138-brand fallback)', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    brandDir(builtInRoot, 'prose-only');

    const assets = await resolveDesignSystemAssets('prose-only', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
    expect(assets.componentsManifest).toBeUndefined();
  });

  it('returns undefined for both fields when the brand directory does not exist in either root', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();

    const assets = await resolveDesignSystemAssets('nonexistent', builtInRoot, userRoot, {});
    expect(assets.tokensCss).toBeUndefined();
    expect(assets.fixtureHtml).toBeUndefined();
    expect(assets.componentsManifest).toBeUndefined();
  });
});
