import { describe, expect, it } from 'vitest';

import {
  collectReferencedJsxNames,
  extractBabelScriptSrcs,
  findHtmlEntriesReferencing,
  htmlLoadsJsxModule,
  isJsxModule,
} from '../../src/runtime/jsx-module-refs';

const MULTI_FILE_HTML = `<!doctype html>
<html>
  <head><title>Backups Panel</title></head>
  <body>
    <div id="root"></div>
    <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
    <script type="text/babel" src="tweaks-panel.jsx"></script>
    <script type="text/babel" src="icons.jsx"></script>
    <script type="text/babel" src="chrome.jsx"></script>
    <script type="text/babel" src="app.jsx"></script>
  </body>
</html>`;

describe('extractBabelScriptSrcs', () => {
  it('returns [] for empty / nullish input', () => {
    expect(extractBabelScriptSrcs('')).toEqual([]);
    expect(extractBabelScriptSrcs(null)).toEqual([]);
    expect(extractBabelScriptSrcs(undefined)).toEqual([]);
  });

  it('lists only text/babel module srcs, in document order', () => {
    expect(extractBabelScriptSrcs(MULTI_FILE_HTML)).toEqual([
      'tweaks-panel.jsx',
      'icons.jsx',
      'chrome.jsx',
      'app.jsx',
    ]);
  });

  it('ignores CDN/library <script src> that are not type=text/babel', () => {
    expect(extractBabelScriptSrcs(MULTI_FILE_HTML)).not.toContain(
      'https://unpkg.com/react@18.3.1/umd/react.development.js',
    );
  });

  it('ignores inline text/babel scripts with no src', () => {
    const html = '<script type="text/babel">function App(){return null;}</script>';
    expect(extractBabelScriptSrcs(html)).toEqual([]);
  });

  it('handles src-before-type attribute order', () => {
    const html = '<script src="app.jsx" type="text/babel"></script>';
    expect(extractBabelScriptSrcs(html)).toEqual(['app.jsx']);
  });

  it('normalizes a leading ./ and strips query/hash', () => {
    const html =
      '<script type="text/babel" src="./icons.jsx?v=2"></script>' +
      '<script type="text/babel" src="chrome.jsx#frag"></script>';
    expect(extractBabelScriptSrcs(html)).toEqual(['icons.jsx', 'chrome.jsx']);
  });

  it('ignores babel scripts commented out in HTML', () => {
    const html =
      '<!-- <script type="text/babel" src="legacy.jsx"></script> -->' +
      '<script type="text/babel" src="app.jsx"></script>';
    expect(extractBabelScriptSrcs(html)).toEqual(['app.jsx']);
    expect(extractBabelScriptSrcs(html)).not.toContain('legacy.jsx');
  });
});

describe('htmlLoadsJsxModule', () => {
  it('matches an exact src reference', () => {
    expect(htmlLoadsJsxModule(MULTI_FILE_HTML, 'icons.jsx')).toBe(true);
  });

  it('matches by basename when the project name has no slash', () => {
    const html = '<script type="text/babel" src="parts/icons.jsx"></script>';
    expect(htmlLoadsJsxModule(html, 'icons.jsx')).toBe(true);
  });

  it('is false when the module is not referenced', () => {
    expect(htmlLoadsJsxModule(MULTI_FILE_HTML, 'unused.jsx')).toBe(false);
  });

  it('is false for an empty module name', () => {
    expect(htmlLoadsJsxModule(MULTI_FILE_HTML, '')).toBe(false);
  });
});

describe('findHtmlEntriesReferencing', () => {
  it('returns every HTML entry that loads the module, in map order', () => {
    const sources = new Map<string, string>([
      ['Backups Panel.html', MULTI_FILE_HTML],
      ['Overview Panel.html', '<script type="text/babel" src="icons.jsx"></script>'],
      ['Unrelated.html', '<script type="text/babel" src="other.jsx"></script>'],
    ]);
    expect(findHtmlEntriesReferencing('icons.jsx', sources)).toEqual([
      'Backups Panel.html',
      'Overview Panel.html',
    ]);
  });

  it('returns [] when no HTML references the module (standalone artifact)', () => {
    const sources = new Map<string, string>([['Page.html', '<div>no scripts</div>']]);
    expect(findHtmlEntriesReferencing('icons.jsx', sources)).toEqual([]);
  });
});

describe('isJsxModule', () => {
  it('is true when at least one HTML entry loads the file', () => {
    const sources = new Map<string, string>([['Backups Panel.html', MULTI_FILE_HTML]]);
    expect(isJsxModule('app.jsx', sources)).toBe(true);
  });

  it('is false when nothing references the file', () => {
    const sources = new Map<string, string>([['Backups Panel.html', MULTI_FILE_HTML]]);
    expect(isJsxModule('standalone-component.jsx', sources)).toBe(false);
  });
});

describe('collectReferencedJsxNames', () => {
  const files = [
    { name: 'Backups Panel.html' },
    { name: 'tweaks-panel.jsx' },
    { name: 'icons.jsx' },
    { name: 'chrome.jsx' },
    { name: 'app.jsx' },
    { name: 'standalone.jsx' },
    { name: 'styles.css' },
  ];

  it('returns project file names loaded by an HTML entry, excluding unreferenced ones', async () => {
    const read = async (name: string) =>
      name === 'Backups Panel.html' ? MULTI_FILE_HTML : null;
    const result = await collectReferencedJsxNames(files, read);
    expect(result).toEqual(new Set(['tweaks-panel.jsx', 'icons.jsx', 'chrome.jsx', 'app.jsx']));
    // A .jsx that no HTML loads stays a normal standalone artifact.
    expect(result.has('standalone.jsx')).toBe(false);
  });

  it('ignores <script src> that point at files the project does not have', async () => {
    const read = async () => '<script type="text/babel" src="ghost.jsx"></script>';
    const result = await collectReferencedJsxNames(files, read);
    expect(result.size).toBe(0);
  });

  it('returns an empty set when no HTML entries exist', async () => {
    const read = async () => null;
    const result = await collectReferencedJsxNames([{ name: 'only.jsx' }], read);
    expect(result).toEqual(new Set());
  });
});
