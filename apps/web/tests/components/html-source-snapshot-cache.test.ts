import { describe, expect, it } from 'vitest';
import {
  HtmlSourceSnapshotCache,
  htmlSourceSnapshotRefreshKey,
} from '../../src/components/html-source-snapshot-cache';

describe('HtmlSourceSnapshotCache', () => {
  const scope = 'local';

  it('evicts the least-recently-used entry when the entry cap is exceeded', () => {
    const cache = new HtmlSourceSnapshotCache({ maxEntries: 2, maxUtf16Bytes: 1_000 });

    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'a.html', refreshKey: '1', source: 'a' });
    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'b.html', refreshKey: '1', source: 'b' });
    expect(cache.get(scope, 'project', 'a.html', '1')?.source).toBe('a');

    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'c.html', refreshKey: '1', source: 'c' });

    expect(cache.get(scope, 'project', 'b.html', '1')).toBeNull();
    expect(cache.get(scope, 'project', 'a.html', '1')?.source).toBe('a');
    expect(cache.get(scope, 'project', 'c.html', '1')?.source).toBe('c');
  });

  it('evicts least-recently-used entries until the UTF-16 byte cap is met', () => {
    const cache = new HtmlSourceSnapshotCache({ maxEntries: 10, maxUtf16Bytes: 10 });

    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'a.html', refreshKey: '1', source: 'abc' });
    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'b.html', refreshKey: '1', source: 'de' });
    expect(cache.get(scope, 'project', 'a.html', '1')?.source).toBe('abc');

    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'c.html', refreshKey: '1', source: 'fgh' });

    expect(cache.get(scope, 'project', 'b.html', '1')).toBeNull();
    expect(cache.get(scope, 'project', 'a.html', '1')).toBeNull();
    expect(cache.get(scope, 'project', 'c.html', '1')?.source).toBe('fgh');
    expect(cache.utf16Bytes).toBe(6);
  });

  it('does not return a snapshot for a changed content refresh key', () => {
    const cache = new HtmlSourceSnapshotCache({ maxEntries: 2, maxUtf16Bytes: 1_000 });
    cache.set({ authorizationScopeKey: scope, projectId: 'project', fileName: 'a.html', refreshKey: 'old', source: 'stale' });

    expect(cache.get(scope, 'project', 'a.html', 'new')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('supports explicit file and project invalidation', () => {
    const cache = new HtmlSourceSnapshotCache({ maxEntries: 10, maxUtf16Bytes: 1_000 });
    cache.set({ authorizationScopeKey: scope, projectId: 'one', fileName: 'a.html', refreshKey: '1', source: 'a' });
    cache.set({ authorizationScopeKey: scope, projectId: 'one', fileName: 'b.html', refreshKey: '1', source: 'b' });
    cache.set({ authorizationScopeKey: scope, projectId: 'two', fileName: 'a.html', refreshKey: '1', source: 'other' });

    cache.invalidateFile(scope, 'one', 'a.html');
    expect(cache.get(scope, 'one', 'a.html', '1')).toBeNull();
    expect(cache.get(scope, 'one', 'b.html', '1')?.source).toBe('b');

    cache.invalidateProject('one');
    expect(cache.get(scope, 'one', 'b.html', '1')).toBeNull();
    expect(cache.get(scope, 'two', 'a.html', '1')?.source).toBe('other');
  });

  it('never serves a same-project snapshot across authorization scopes', () => {
    const cache = new HtmlSourceSnapshotCache({ maxEntries: 10, maxUtf16Bytes: 1_000 });
    cache.set({
      authorizationScopeKey: 'workspace:a:member:one',
      projectId: 'project',
      fileName: 'a.html',
      refreshKey: '1',
      source: 'authorized-for-a',
    });

    expect(
      cache.get('workspace:b:member:two', 'project', 'a.html', '1'),
    ).toBeNull();
    expect(
      cache.get('workspace:a:member:one', 'project', 'a.html', '1')?.source,
    ).toBe('authorized-for-a');
  });

  it('builds the refresh key from file content metadata and the file-change generation', () => {
    expect(htmlSourceSnapshotRefreshKey({ mtime: 42, size: 7 }, 3)).toBe('42:7:3');
  });
});
