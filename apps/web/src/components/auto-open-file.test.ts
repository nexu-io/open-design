import { describe, expect, it } from 'vitest';

import { decideAutoOpenAfterWrite } from './auto-open-file';

describe('decideAutoOpenAfterWrite', () => {
  it('returns shouldOpen=false when base is empty', () => {
    const result = decideAutoOpenAfterWrite('', [{ name: 'index.html' }]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('returns shouldOpen=true with the file name when base matches a project file', () => {
    const result = decideAutoOpenAfterWrite('index.html', [
      { name: 'index.html' },
      { name: 'styles.css' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'index.html' });
  });

  it('returns shouldOpen=false when base is not in the project file list', () => {
    // Regression: this is the "rogue empty tab" case — the agent edited a
    // file outside the project (e.g. an upstream repo's source file) and
    // we must NOT open a placeholder tab for it.
    const result = decideAutoOpenAfterWrite('project-watchers.ts', [
      { name: 'index.html' },
      { name: 'App.jsx' },
    ]);
    expect(result).toEqual({ shouldOpen: false, fileName: null });
  });

  it('handles a multi-file list where exactly one entry matches', () => {
    const result = decideAutoOpenAfterWrite('App.jsx', [
      { name: 'index.html' },
      { name: 'App.jsx' },
      { name: 'styles.css' },
      { name: 'README.md' },
    ]);
    expect(result).toEqual({ shouldOpen: true, fileName: 'App.jsx' });
  });
});
