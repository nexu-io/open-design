import { describe, expect, it } from 'vitest';

import {
  decideAutoOpenAfterWrite,
  selectAutoOpenProducedArtifact,
} from '../../src/components/auto-open-file';

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

  it('declines to auto-open a .jsx module loaded by a sibling HTML entry', () => {
    // icons.jsx is a module of a multi-file React prototype (loaded by
    // "Backups Panel.html" via <script type="text/babel" src>). It has no
    // standalone preview, so auto-opening it strands the user on a dead-end
    // tab. Issue #2744.
    const result = decideAutoOpenAfterWrite(
      'icons.jsx',
      [
        { name: 'icons.jsx', path: 'icons.jsx' },
        { name: 'Backups Panel.html', path: 'Backups Panel.html' },
      ],
      { moduleFileNames: new Set(['icons.jsx']) },
    );
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('still auto-opens the same file when no module set is supplied (back-compat)', () => {
    // Proves the suppression is driven solely by moduleFileNames: the legacy
    // two-arg call path is unchanged, so this test goes red if the guard ever
    // suppresses unconditionally.
    const result = decideAutoOpenAfterWrite('icons.jsx', [
      { name: 'icons.jsx', path: 'icons.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'icons.jsx' });
  });

  it('still auto-opens a standalone artifact even when other modules exist', () => {
    const result = decideAutoOpenAfterWrite(
      'landing.html',
      [
        { name: 'landing.html', path: 'landing.html' },
        { name: 'icons.jsx', path: 'icons.jsx' },
      ],
      { moduleFileNames: new Set(['icons.jsx']) },
    );
    expect(result).toEqual({ shouldOpen: true, fileName: 'landing.html' });
  });
});

describe('selectAutoOpenProducedArtifact', () => {
  it('selects a newly produced html file for the turn-end auto-open fallback', () => {
    const result = selectAutoOpenProducedArtifact([
      { name: 'notes.txt', path: 'notes.txt', kind: 'text', mtime: 20 },
      { name: 'mutuals-v2.html', path: 'mutuals-v2.html', kind: 'html', mtime: 30 },
    ]);

    expect(result).toBe('mutuals-v2.html');
  });

  it('prefers the newest produced html file when a turn writes multiple html files', () => {
    const result = selectAutoOpenProducedArtifact([
      { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
      { name: 'mutuals-v2.html', path: 'mutuals-v2.html', kind: 'html', mtime: 30 },
    ]);

    expect(result).toBe('mutuals-v2.html');
  });

  it('auto-opens a produced markdown document (plan/report) when no html exists', () => {
    // Plan mode: the turn produces only `plan.md`. It renders inline in the
    // viewer, so it must auto-open rather than leave the viewer empty.
    const result = selectAutoOpenProducedArtifact([
      { name: 'plan.md', path: 'plan.md', kind: 'text', mtime: 30 },
    ]);

    expect(result).toBe('plan.md');
  });

  it('prefers the html page over a markdown note written in the same turn', () => {
    // Even when the markdown file is the most recently written, the primary
    // visual deliverable (html) takes focus.
    const result = selectAutoOpenProducedArtifact([
      { name: 'index.html', path: 'index.html', kind: 'html', mtime: 10 },
      { name: 'README.md', path: 'README.md', kind: 'text', mtime: 30 },
    ]);

    expect(result).toBe('index.html');
  });

  it('leaves a plain .txt file alone (text kind is shared with markdown)', () => {
    // `.md` and `.txt` both arrive as kind: 'text'; only markdown should open.
    const result = selectAutoOpenProducedArtifact([
      { name: 'notes.txt', path: 'notes.txt', kind: 'text', mtime: 30 },
    ]);

    expect(result).toBeNull();
  });

  it('returns null when the produced files are not previewable', () => {
    const result = selectAutoOpenProducedArtifact([
      { name: 'deck.pptx', path: 'deck.pptx', kind: 'presentation', mtime: 30 },
    ]);

    expect(result).toBeNull();
  });
});
