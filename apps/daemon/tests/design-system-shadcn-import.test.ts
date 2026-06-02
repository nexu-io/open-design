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
} from '../src/design-system-shadcn-import.js';

// A minimal fetch stub: serve a fixed map of URL -> JSON value, 404 otherwise.
function fetchStub(routes: Record<string, unknown>): ShadcnFetch {
  return async (url) => {
    if (!(url in routes)) {
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => 'not found' };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(routes[url]),
    };
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
});
