import { describe, expect, it } from 'vitest';
import { filterImplicitProducedFiles } from '../src/produced-files';
import type { ProjectFile } from '../src/types';

function file(name: string, path = name): ProjectFile {
  return { name, path, size: 1, mtime: 0, kind: 'text', mime: 'text/plain' } as ProjectFile;
}

describe('filterImplicitProducedFiles', () => {
  it('excludes user sketch files from turn output attribution', () => {
    expect(filterImplicitProducedFiles([file('hero.sketch.json'), file('stale.txt')])).toEqual([
      file('stale.txt'),
    ]);
  });
});
