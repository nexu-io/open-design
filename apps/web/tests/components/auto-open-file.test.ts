import { describe, expect, it } from 'vitest';

import { decideAutoOpenAfterWrite } from '../../src/components/auto-open-file';

describe('decideAutoOpenAfterWrite', () => {
  it('returns shouldOpen=false when filePath is empty', () => {
    const result = decideAutoOpenAfterWrite('', [{ name: 'index.html' }]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('returns shouldOpen=true when filePath equals a project file path', () => {
    const result = decideAutoOpenAfterWrite('index.html', [
      { name: 'index.html', path: 'index.html' },
      { name: 'styles.css', path: 'styles.css' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'index.html' });
  });

  it('returns shouldOpen=false when filePath has slashes but matches no project path', () => {
    // Regression: this is the "rogue empty tab" case — the agent edited a
    // file outside the project (e.g. an upstream repo's source file) and
    // we must NOT open a placeholder tab for it. filePath has a slash, so
    // the basename fallback is intentionally skipped.
    const result = decideAutoOpenAfterWrite(
      '/home/bryan/projects/open-design/apps/daemon/src/project-watchers.ts',
      [
        { name: 'index.html', path: 'index.html' },
        { name: 'App.jsx', path: 'App.jsx' },
      ],
    );
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('falls back to basename match when filePath is just a basename', () => {
    const result = decideAutoOpenAfterWrite('App.jsx', [
      { name: 'index.html', path: 'index.html' },
      { name: 'App.jsx', path: 'App.jsx' },
      { name: 'styles.css', path: 'styles.css' },
      { name: 'README.md', path: 'README.md' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'App.jsx' });
  });

  it('matches an absolute filePath via path-suffix against a nested project file', () => {
    // Real-world case: the agent passes an absolute file_path; the project
    // file lives at "prototype/App.jsx". The decision must still resolve
    // unambiguously, returning the project-relative file name.
    const result = decideAutoOpenAfterWrite(
      '/home/bryan/projects/open-design/.od/projects/abc/prototype/App.jsx',
      [
        { name: 'index.html', path: 'index.html' },
        { name: 'prototype/App.jsx', path: 'prototype/App.jsx' },
      ],
    );
    expect(result).toEqual({ shouldOpen: true, fileName: 'prototype/App.jsx' });
  });

  it('declines when an absolute filePath could match multiple nested project files (ambiguous)', () => {
    // Two project files share the basename "App.jsx" but live in different
    // subdirs. The agent's filePath ends with "/App.jsx" only, with no
    // disambiguating subdirectory match — refuse rather than open the wrong file.
    const result = decideAutoOpenAfterWrite(
      '/some/external/path/App.jsx',
      [
        { name: 'src/App.jsx', path: 'src/App.jsx' },
        { name: 'lib/App.jsx', path: 'lib/App.jsx' },
      ],
    );
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('declines when filePath has a slash and no project path is a suffix match', () => {
    // Agent edited /upstream/repo/App.jsx; project also has prototype/App.jsx.
    // The previous (basename-only) implementation would have opened the
    // wrong file; the path-suffix check leaves zero matches and the
    // basename fallback is intentionally skipped because filePath has a slash.
    const result = decideAutoOpenAfterWrite('/upstream/repo/App.jsx', [
      { name: 'prototype/App.jsx', path: 'prototype/App.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('still works when ProjectFile entries omit the optional path field', () => {
    // Defensive: ProjectFile.path is optional in the API contract. Fall
    // back to using `name` (which the daemon populates with the full
    // project-relative path) when path is missing.
    const result = decideAutoOpenAfterWrite('index.html', [
      { name: 'index.html' },
      { name: 'styles.css' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'index.html' });
  });

  it('declines a basename fallback when multiple project files share the basename', () => {
    const result = decideAutoOpenAfterWrite('App.jsx', [
      { name: 'src/App.jsx', path: 'src/App.jsx' },
      { name: 'lib/App.jsx', path: 'lib/App.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });
});
