/**
 * What the recorded entry becomes after the two file mutations that can
 * invalidate it. Pure: the routes only apply these answers.
 */
import { describe, expect, it } from 'vitest';

import {
  entryFileAfterDelete,
  entryFileAfterRename,
  metadataWithEntryFile,
} from '../src/project-entry-file.js';

describe('entryFileAfterRename', () => {
  it('moves the entry with its file and leaves other renames alone', () => {
    expect(entryFileAfterRename('screens/home.html', 'screens/home.html', 'screens/start.html'))
      .toBe('screens/start.html');
    expect(entryFileAfterRename('screens/home.html', 'screens/about.html', 'screens/team.html'))
      .toBeUndefined();
    expect(entryFileAfterRename(undefined, 'a.html', 'b.html')).toBeUndefined();
  });

  it('compares paths the way the routes spell them', () => {
    expect(entryFileAfterRename('screens/home.html', './screens/home.html', 'home.html')).toBe('home.html');
    expect(entryFileAfterRename('screens/home.html', 'screens\\home.html', 'index.html')).toBe('index.html');
    expect(entryFileAfterRename('home.html', 'home.html', 'home.html')).toBeUndefined();
  });
});

describe('entryFileAfterDelete', () => {
  it('clears the entry when its file is deleted, and only then', () => {
    expect(entryFileAfterDelete('screens/home.html', 'screens/home.html', 'file')).toBeNull();
    expect(entryFileAfterDelete('screens/home.html', './screens/home.html', 'file')).toBeNull();
    expect(entryFileAfterDelete('screens/home.html', 'screens/about.html', 'file')).toBeUndefined();
    expect(entryFileAfterDelete(undefined, 'screens/home.html', 'file')).toBeUndefined();
  });

  it('clears the entry when a folder containing it is deleted', () => {
    expect(entryFileAfterDelete('screens/home.html', 'screens', 'folder')).toBeNull();
    expect(entryFileAfterDelete('screens/home.html', 'screens/', 'folder')).toBeNull();
    expect(entryFileAfterDelete('screens/mobile/home.html', 'screens', 'folder')).toBeNull();
    // A sibling folder whose name merely starts the same is not a container.
    expect(entryFileAfterDelete('screens/home.html', 'screen', 'folder')).toBeUndefined();
    expect(entryFileAfterDelete('screens/home.html', 'assets', 'folder')).toBeUndefined();
    // Deleting a file named like the folder does not clear an entry under it.
    expect(entryFileAfterDelete('screens/home.html', 'screens', 'file')).toBeUndefined();
  });
});

describe('metadataWithEntryFile', () => {
  it('replaces or removes only the entry record', () => {
    const metadata = { kind: 'prototype', entryFile: 'a.html', taskType: 'prototype' };
    expect(metadataWithEntryFile(metadata, 'b.html'))
      .toEqual({ kind: 'prototype', entryFile: 'b.html', taskType: 'prototype' });
    expect(metadataWithEntryFile(metadata, null)).toEqual({ kind: 'prototype', taskType: 'prototype' });
    expect(metadataWithEntryFile(undefined, 'a.html')).toEqual({ kind: 'prototype', entryFile: 'a.html' });
  });
});
