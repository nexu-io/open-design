import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listDesignSystems } from '../src/design-systems.js';

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-design-systems-frontmatter-'));
}

function brandDir(root: string, id: string): string {
  const dir = path.join(root, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeDesignMd(root: string, id: string, body: string): void {
  const dir = brandDir(root, id);
  writeFileSync(path.join(dir, 'DESIGN.md'), body);
}

describe('listDesignSystems frontmatter parsing (issue #1857)', () => {
  it('uses frontmatter name/description/category/surface when no Markdown equivalents are present', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'google-only',
      [
        '---',
        'name: Google Material',
        'description: A clean material-inspired system.',
        'category: Productivity',
        'surface: web',
        '---',
        '',
        'Some rationale text without an H1 or Category blockquote.',
      ].join('\n'),
    );

    const out = await listDesignSystems(root);
    expect(out).toHaveLength(1);
    const ds = out[0]!;
    expect(ds.id).toBe('google-only');
    expect(ds.title).toBe('Google Material');
    expect(ds.category).toBe('Productivity');
    expect(ds.summary).toBe('A clean material-inspired system.');
    expect(ds.surface).toBe('web');
  });

  it('extracts swatches from frontmatter colors when the Markdown body has no hex swatches', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'colors-only',
      [
        '---',
        'name: Colors Only',
        'description: Frontmatter-driven palette.',
        'colors:',
        '  background: "#fafafa"',
        '  text: "#111111"',
        '  accent: "#ff3366"',
        '  border: "#dddddd"',
        '---',
        '',
        'Body prose with no hex codes at all.',
      ].join('\n'),
    );

    const [ds] = await listDesignSystems(root);
    expect(ds?.swatches).toEqual(['#fafafa', '#dddddd', '#111111', '#ff3366']);
  });

  it('returns identical summary shape for legacy Markdown-only DESIGN.md (no frontmatter, regression guard)', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'legacy',
      [
        '# Design System Inspired by Legacy',
        '',
        '> Category: Productivity',
        '',
        'A productivity-oriented system used by the picker today.',
        '',
        '- **Background:** `#ffffff`',
        '- **Text:** `#222222`',
        '- **Accent:** `#ff3366`',
        '- **Border:** `#dddddd`',
      ].join('\n'),
    );

    const [ds] = await listDesignSystems(root);
    expect(ds?.title).toBe('Legacy');
    expect(ds?.category).toBe('Productivity');
    expect(ds?.summary).toBe('A productivity-oriented system used by the picker today.');
    expect(ds?.swatches).toEqual(['#ffffff', '#dddddd', '#222222', '#ff3366']);
    expect(ds?.surface).toBe('web');
  });

  it('prefers frontmatter colors over Markdown swatches when both are present', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'hybrid-colors',
      [
        '---',
        'colors:',
        '  background: "#fafafa"',
        '  text: "#111111"',
        '  accent: "#ff3366"',
        '  border: "#dddddd"',
        '---',
        '',
        '# Hybrid Colors',
        '',
        '> Category: Productivity',
        '',
        'Body with explicit swatches.',
        '',
        '- **Background:** `#000000`',
        '- **Text:** `#ffffff`',
        '- **Accent:** `#abcdef`',
        '- **Border:** `#999999`',
      ].join('\n'),
    );

    const [ds] = await listDesignSystems(root);
    expect(ds?.swatches).toEqual(['#fafafa', '#dddddd', '#111111', '#ff3366']);
  });

  it('falls back to Markdown swatches when frontmatter colors use unrecognized token names (totality-festival regression)', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'totality-style',
      [
        '---',
        'colors:',
        '  surface: "#121318"',
        '  on-surface: "#e3e1e9"',
        '  on-surface-variant: "#d0c6ab"',
        '  outline: "#999077"',
        '  primary: "#fff6df"',
        '  secondary: "#bdf4ff"',
        '  background: "#121318"',
        '---',
        '',
        '# Design System Inspired by Totality',
        '',
        '> Category: Themed & Unique',
        '',
        'Cosmic-premium dark system.',
        '',
        '- **Surface:** `#121318`',
        '- **Text:** `#e3e1e9`',
        '- **Text Muted:** `#d0c6ab`',
        '- **Primary:** `#fff6df`',
      ].join('\n'),
    );

    const [ds] = await listDesignSystems(root);
    expect(ds?.swatches).toEqual(['#121318', '#d0c6ab', '#e3e1e9', '#fff6df']);
  });

  it('prefers Markdown H1 and Markdown Category over frontmatter when a hybrid file has both', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'hybrid',
      [
        '---',
        'name: Frontmatter Title',
        'description: Frontmatter summary that loses to Markdown.',
        'category: Frontmatter Category',
        '---',
        '',
        '# Markdown H1 Title',
        '',
        '> Category: Markdown Category',
        '',
        'Markdown summary paragraph wins.',
      ].join('\n'),
    );

    const [ds] = await listDesignSystems(root);
    expect(ds?.title).toBe('Markdown H1 Title');
    expect(ds?.category).toBe('Markdown Category');
    expect(ds?.summary).toBe('Markdown summary paragraph wins.');
  });

  it('does not throw on malformed or empty frontmatter and still surfaces the brand from body heuristics', async () => {
    const root = fresh();
    writeDesignMd(
      root,
      'malformed',
      [
        '---',
        '---',
        '',
        '# Body Only',
        '',
        '> Category: From Body',
        '',
        'Body summary line.',
      ].join('\n'),
    );

    const [ds] = await listDesignSystems(root);
    expect(ds?.title).toBe('Body Only');
    expect(ds?.category).toBe('From Body');
    expect(ds?.summary).toBe('Body summary line.');
  });

  it('keeps the body field as the verbatim file content including the frontmatter delimiters', async () => {
    const root = fresh();
    const raw = [
      '---',
      'name: Verbatim Body',
      'description: Body must include the frontmatter.',
      '---',
      '',
      'Trailing prose.',
      '',
    ].join('\n');
    writeDesignMd(root, 'verbatim', raw);

    const [ds] = await listDesignSystems(root);
    expect(ds?.body).toBe(raw);
  });
});
