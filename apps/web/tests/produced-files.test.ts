import { describe, expect, it } from 'vitest';

import {
  filterAgentAttributedProjectFiles,
  isUserSketchProjectFile,
} from '../src/produced-files';
import type { ProjectFile } from '../src/types';

function file(name: string, kind: ProjectFile['kind']): ProjectFile {
  return {
    name,
    path: name,
    size: 1,
    mtime: 0,
    kind,
    mime: kind === 'sketch' ? 'application/json' : 'text/html',
  };
}

describe('isUserSketchProjectFile', () => {
  it('returns true for sketch workspace files', () => {
    expect(isUserSketchProjectFile(file('board.sketch.json', 'sketch'))).toBe(true);
  });

  it('returns false for agent-generated artifacts', () => {
    expect(isUserSketchProjectFile(file('index.html', 'html'))).toBe(false);
  });
});

describe('filterAgentAttributedProjectFiles', () => {
  it('drops sketch files from turn output attribution (#3089)', () => {
    const filtered = filterAgentAttributedProjectFiles([
      file('deck.html', 'html'),
      file('notes.sketch.json', 'sketch'),
    ]);
    expect(filtered.map((entry) => entry.name)).toEqual(['deck.html']);
  });
});
