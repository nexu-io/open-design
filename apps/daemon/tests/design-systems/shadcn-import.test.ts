import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  importShadcnDesignSystemProject,
  parseShadcnReference,
  renderShadcnSourceCss,
  wrapShadcnColorValue,
  type ShadcnFetch,
} from '../../src/design-systems/shadcn-import.js';

// A minimal fetch stub: serve a fixed map of URL -> value, 404 otherwise.
// Object values are returned as JSON (registry documents); string values are
// returned verbatim (raw source files).
function fetchStub(routes: Record<string, unknown>): ShadcnFetch {
  return async (url) => {
    if (!(url in routes)) {
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => 'not found' };
    }
    const value = routes[url];
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    return { ok: true, status: 200, statusText: 'OK', text: async () => body };
  };
}

describe('parseShadcnReference', () => {
  it('parses the "<owner>/<repo>/<item>" shorthand', () => {
    expect(parseShadcnReference('shadcn/ui/theme-zinc')).toEqual({
      kind: 'github',
      owner: 'shadcn',
      repo: 'ui',
      item: 'theme-zinc',
    });
  });

  it('captures an explicit git ref from the shorthand', () => {
    expect(parseShadcnReference('acme/toolkit/button#v1.2.0')).toEqual({
      kind: 'github',
      owner: 'acme',
      repo: 'toolkit',
      item: 'button',
      ref: 'v1.2.0',
    });
  });

  it('parses a direct registry-item URL', () => {
    expect(parseShadcnReference('https://example.com/r/theme.json')).toEqual({
      kind: 'url',
      url: 'https://example.com/r/theme.json',
    });
  });

  it('captures the item selector from a registry index URL fragment', () => {
    expect(parseShadcnReference('https://example.com/registry.json#button')).toEqual({
      kind: 'url',
      url: 'https://example.com/registry.json',
      item: 'button',
    });
  });

  it('allows http only for loopback hosts', () => {
    expect(parseShadcnReference('http://127.0.0.1:8080/r/x.json')).toMatchObject({ kind: 'url' });
    expect(() => parseShadcnReference('http://example.com/r/x.json')).toThrow(/https/i);
  });

  it('rejects empty and malformed references', () => {
    expect(() => parseShadcnReference('')).toThrow(/required/i);
    expect(() => parseShadcnReference('only/two')).toThrow(/<owner>\/<repo>\/<item>/);
  });

  it('rejects a URL fragment with malformed percent-encoding as a bad request', () => {
    expect(() => parseShadcnReference('https://example.com/registry.json#%E0%A4%A')).toThrow(
      /percent-encoding|fragment/i,
    );
  });

  it('refuses https references to private / link-local / internal IPs (SSRF)', () => {
    for (const ref of [
      'https://169.254.169.254/latest/meta-data/x.json',
      'https://10.0.0.5/r/x.json',
      'https://192.168.1.10/r/x.json',
      'https://172.16.0.1/r/x.json',
      'https://[fd00::1]/r/x.json',
      'https://0.0.0.0/r/x.json',
      'https://167772161/r/x.json', // decimal form of 10.0.0.1 (URL parser canonicalizes it)
    ]) {
      expect(() => parseShadcnReference(ref), ref).toThrow(/not allowed|private|refus/i);
    }
  });

  it('still allows loopback references (self-hosted local registry)', () => {
    expect(parseShadcnReference('https://[::1]/r/x.json')).toMatchObject({ kind: 'url' });
    expect(parseShadcnReference('http://localhost:4000/r/x.json')).toMatchObject({ kind: 'url' });
    expect(parseShadcnReference('http://127.0.0.1:5000/r/x.json')).toMatchObject({ kind: 'url' });
  });
});

describe('wrapShadcnColorValue', () => {
  it('wraps bare HSL triplets so the OD scanner recognizes them as colors', () => {
    expect(wrapShadcnColorValue('222.2 47.4% 11.2%')).toBe('hsl(222.2 47.4% 11.2%)');
    expect(wrapShadcnColorValue('0 0% 100% / 50%')).toBe('hsl(0 0% 100% / 50%)');
  });

  it('passes already-wrapped and non-color values through untouched', () => {
    expect(wrapShadcnColorValue('oklch(0.5 0.1 200)')).toBe('oklch(0.5 0.1 200)');
    expect(wrapShadcnColorValue('#ffffff')).toBe('#ffffff');
    expect(wrapShadcnColorValue('0.5rem')).toBe('0.5rem');
    expect(wrapShadcnColorValue('Poppins, sans-serif')).toBe('Poppins, sans-serif');
  });
});

describe('renderShadcnSourceCss', () => {
  it('emits :root from theme+light vars and a .dark block from dark vars', () => {
    const css = renderShadcnSourceCss({
      theme: { radius: '0.5rem' },
      light: { background: '0 0% 100%' },
      dark: { background: '222 47% 11%' },
    });
    expect(css).toContain(':root {');
    expect(css).toContain('--radius: 0.5rem;');
    expect(css).toContain('--background: hsl(0 0% 100%);');
    expect(css).toContain('.dark {');
    expect(css).toContain('--background: hsl(222 47% 11%);');
  });

  it('normalizes an already-prefixed variable name without doubling the dashes', () => {
    expect(renderShadcnSourceCss({ light: { '--primary': '262 83% 58%' } })).toContain(
      '--primary: hsl(262 83% 58%);',
    );
  });

  it('rejects a cssVars key that is not a valid custom-property name (injection)', () => {
    expect(() => renderShadcnSourceCss({ light: { 'x}': 'red' } })).toThrow(
      /valid CSS custom property/i,
    );
  });

  it('rejects a cssVars value containing declaration-breaking characters (injection)', () => {
    expect(() => renderShadcnSourceCss({ light: { primary: 'red; --evil: stolen' } })).toThrow(
      /unsafe characters/i,
    );
  });
});

describe('importShadcnDesignSystemProject', () => {
  let tempRoot: string;
  let tmpRoot: string;
  let userDesignSystemsRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-ds-shadcn-import-'));
    tmpRoot = path.join(tempRoot, '.tmp');
    userDesignSystemsRoot = path.join(tempRoot, 'user-design-systems');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('imports a direct registry-item URL, preserving theme colors and shadcn provenance', async () => {
    const url = 'https://example.com/r/theme-test.json';
    const item = {
      $schema: 'https://ui.shadcn.com/schema/registry-item.json',
      name: 'theme-test',
      type: 'registry:theme',
      title: 'Theme Test',
      description: 'A test shadcn theme.',
      cssVars: {
        theme: { radius: '0.5rem' },
        light: {
          background: '0 0% 100%',
          foreground: '222.2 47.4% 11.2%',
          primary: '262 83% 58%',
          border: '214 32% 91%',
        },
        dark: { background: '222.2 47.4% 11.2%', foreground: '0 0% 100%' },
      },
    };

    const result = await importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
      fetchImpl: fetchStub({ [url]: item }),
      now: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(result.id).toBe('theme-test');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 'od-design-system-project/v1',
      id: 'theme-test',
      source: {
        type: 'shadcn',
        reference: url,
        registryUrl: url,
        item: 'theme-test',
        importedAt: '2026-06-02T00:00:00.000Z',
      },
    });

    // The bare HSL primary must survive as a wrapped color, not fall back.
    const tokens = fs.readFileSync(path.join(result.dir, 'tokens.css'), 'utf8');
    expect(tokens).toContain('--accent: hsl(262 83% 58%)');
    expect(tokens).toContain('--bg: hsl(0 0% 100%)');

    const design = fs.readFileSync(path.join(result.dir, 'DESIGN.md'), 'utf8');
    expect(design).toContain('A test shadcn theme.');
  });

  it('resolves the "<owner>/<repo>/<item>" shorthand against registry.json on the default branch', async () => {
    const registryUrl = 'https://raw.githubusercontent.com/shadcn/ui/main/registry.json';
    const registry = {
      name: 'ui',
      homepage: 'https://ui.shadcn.com',
      items: [
        {
          name: 'theme-zinc',
          type: 'registry:theme',
          title: 'Theme Zinc',
          description: 'Zinc theme.',
          cssVars: { light: { primary: '240 5.9% 10%' } },
        },
      ],
    };

    const result = await importShadcnDesignSystemProject(
      'shadcn/ui/theme-zinc',
      tmpRoot,
      userDesignSystemsRoot,
      { fetchImpl: fetchStub({ [registryUrl]: registry }), now: new Date('2026-06-02T00:00:00.000Z') },
    );

    expect(result.id).toBe('theme-zinc');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.source).toMatchObject({
      type: 'shadcn',
      reference: 'shadcn/ui/theme-zinc',
      registryUrl,
      item: 'theme-zinc',
      homepage: 'https://ui.shadcn.com',
    });
  });

  it('honors a display-name override', async () => {
    const url = 'https://example.com/r/named.json';
    const item = { name: 'raw-name', type: 'registry:theme', cssVars: { light: { primary: '200 80% 50%' } } };
    const result = await importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
      fetchImpl: fetchStub({ [url]: item }),
      name: 'My Brand',
    });
    expect(result.id).toBe('my-brand');
  });

  it('surfaces a BAD_REQUEST when the registry item cannot be fetched', async () => {
    await expect(
      importShadcnDesignSystemProject('https://example.com/r/missing.json', tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({}),
      }),
    ).rejects.toThrow(/could not fetch/i);
  });

  it('resolves an item through the registry `include` layout, relative to the including file', async () => {
    const root = 'https://raw.githubusercontent.com/acme/ui/main/registry.json';
    const included = 'https://raw.githubusercontent.com/acme/ui/main/registry/blocks/registry.json';
    const buttonFile = 'https://raw.githubusercontent.com/acme/ui/main/registry/blocks/button.tsx';
    const result = await importShadcnDesignSystemProject('acme/ui/button', tmpRoot, userDesignSystemsRoot, {
      fetchImpl: fetchStub({
        [root]: { name: 'ui', include: ['registry/blocks/registry.json'] },
        [included]: {
          items: [
            {
              name: 'button',
              type: 'registry:component',
              title: 'Button',
              cssVars: { light: { primary: '200 80% 50%' } },
              files: [{ path: 'button.tsx', type: 'registry:component' }],
            },
          ],
        },
        // Resolved relative to registry/blocks/ (the declaring registry.json),
        // not the repo root.
        [buttonFile]: 'export const Button = () => null;\n',
      }),
    });

    expect(result.id).toBe('button');
    expect(fs.existsSync(path.join(result.dir, 'source', 'snippets', 'button.tsx'))).toBe(true);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest.source).toMatchObject({ type: 'shadcn', registryUrl: root, item: 'button' });
  });

  it('fails the import when a declared registry file 404s instead of silently dropping it', async () => {
    const root = 'https://raw.githubusercontent.com/acme/ui/main/registry.json';
    await expect(
      importShadcnDesignSystemProject('acme/ui/broken#main', tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({
          [root]: {
            items: [
              {
                name: 'broken',
                type: 'registry:component',
                cssVars: { light: { primary: '1 2% 3%' } },
                files: [{ path: 'missing.tsx', type: 'registry:component' }],
              },
            ],
          },
          // raw file URL deliberately absent -> 404
        }),
      }),
    ).rejects.toThrow(/missing\.tsx|could not fetch/i);
  });

  it('fails the import when a declared inline file exceeds the size cap', async () => {
    const url = 'https://example.com/r/big.json';
    await expect(
      importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({
          [url]: {
            name: 'big',
            type: 'registry:component',
            cssVars: { light: { primary: '1 2% 3%' } },
            files: [{ path: 'big.tsx', type: 'registry:file', content: 'x'.repeat(300 * 1024) }],
          },
        }),
      }),
    ).rejects.toThrow(/exceeds/i);
  });

  it('rejects an include target that points at a disallowed (non-loopback http) host', async () => {
    const root = 'https://raw.githubusercontent.com/acme/ui/main/registry.json';
    await expect(
      importShadcnDesignSystemProject('acme/ui/button#main', tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({
          [root]: { include: ['http://evil.example/registry.json'] },
        }),
      }),
    ).rejects.toThrow(/https/i);
  });

  it('fails the import when two declared files resolve to the same destination', async () => {
    const url = 'https://example.com/r/dup.json';
    await expect(
      importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({
          [url]: {
            name: 'dup',
            type: 'registry:component',
            cssVars: { light: { primary: '1 2% 3%' } },
            files: [
              { path: 'button.tsx', type: 'registry:component', content: 'export const A = 1;' },
              { target: '@/button.tsx', type: 'registry:component', content: 'export const B = 2;' },
            ],
          },
        }),
      }),
    ).rejects.toThrow(/both resolve to/i);
  });

  it('refuses an include target that points at a private https host (SSRF)', async () => {
    const root = 'https://raw.githubusercontent.com/acme/ui/main/registry.json';
    await expect(
      importShadcnDesignSystemProject('acme/ui/button#main', tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({
          [root]: { include: ['https://169.254.169.254/registry.json'] },
        }),
      }),
    ).rejects.toThrow(/not allowed|private|refus/i);
  });

  it('fails the import when a declared file object has no path or target', async () => {
    const url = 'https://example.com/r/nodest.json';
    await expect(
      importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
        fetchImpl: fetchStub({
          [url]: {
            name: 'nodest',
            type: 'registry:component',
            cssVars: { light: { primary: '1 2% 3%' } },
            files: [{ content: 'orphaned content' }],
          },
        }),
      }),
    ).rejects.toThrow(/no path or target/i);
  });

  it('does not let a crafted file target overwrite the importer-generated package.json', async () => {
    const url = 'https://example.com/r/safe.json';
    const result = await importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
      fetchImpl: fetchStub({
        [url]: {
          name: 'safe',
          type: 'registry:component',
          title: 'Safe Theme',
          cssVars: { light: { primary: '262 83% 58%' } },
          files: [{ target: 'package.json', type: 'registry:file', content: '{"name":"attacker"}' }],
        },
      }),
    });
    // Display name comes from the item title, not the crafted package.json that
    // tried to overwrite the importer's generated one.
    expect(result.id).toBe('safe-theme');
  });

  it('resolves a slashed git ref without corrupting the raw path', async () => {
    const registryUrl = 'https://raw.githubusercontent.com/acme/ui/feature/x/registry.json';
    const result = await importShadcnDesignSystemProject('acme/ui/button#feature/x', tmpRoot, userDesignSystemsRoot, {
      fetchImpl: fetchStub({
        [registryUrl]: {
          items: [
            { name: 'button', type: 'registry:theme', title: 'Button', cssVars: { light: { primary: '200 80% 50%' } } },
          ],
        },
      }),
    });
    expect(result.id).toBe('button');
  });

  it('fetches a direct-URL item path-only file relative to the item URL', async () => {
    const url = 'https://example.com/r/button.json';
    const fileUrl = 'https://example.com/r/button.tsx';
    const result = await importShadcnDesignSystemProject(url, tmpRoot, userDesignSystemsRoot, {
      fetchImpl: fetchStub({
        [url]: {
          name: 'button',
          type: 'registry:component',
          title: 'Button',
          cssVars: { light: { primary: '1 2% 3%' } },
          files: [{ path: 'button.tsx', type: 'registry:component' }],
        },
        [fileUrl]: 'export const Button = () => null;\n',
      }),
    });
    expect(result.id).toBe('button');
    expect(fs.existsSync(path.join(result.dir, 'source', 'snippets', 'button.tsx'))).toBe(true);
  });

  it('rejects a registry document whose body streams past the size cap', async () => {
    let emitted = 0;
    const streamingFetch: ShadcnFetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emitted >= 64) {
            controller.close();
            return;
          }
          emitted += 1;
          controller.enqueue(new Uint8Array(64 * 1024));
        },
      }),
    });
    await expect(
      importShadcnDesignSystemProject('https://example.com/r/huge.json', tmpRoot, userDesignSystemsRoot, {
        fetchImpl: streamingFetch,
      }),
    ).rejects.toThrow(/exceeds/i);
  });
});
