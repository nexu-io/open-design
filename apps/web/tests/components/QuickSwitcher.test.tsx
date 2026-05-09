import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextCursor, QuickSwitcher, scoreMatch } from '../../src/components/QuickSwitcher';
import type { ProjectFile } from '../../src/types';

// QuickSwitcher reads recents from localStorage during render. The default
// vitest env is node, so stub a minimal Storage to keep the component
// happy and the assertions deterministic.
function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } satisfies Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorageStub());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function file(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 1024,
    mtime: 1700000000,
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  };
}

describe('scoreMatch — fuzzy ranking tiers', () => {
  it('exact basename match scores highest', () => {
    expect(scoreMatch(file({ name: 'app.tsx' }), 'app.tsx')).toBe(1000);
  });

  it('prefix-on-basename outranks substring-on-basename', () => {
    const prefix = scoreMatch(file({ name: 'header.tsx' }), 'head');
    const substring = scoreMatch(file({ name: 'page-header.tsx' }), 'head');
    expect(prefix).toBeGreaterThan(substring);
  });

  it('substring-on-basename outranks substring-on-path-only', () => {
    const inBase = scoreMatch(file({ name: 'utils/helper.ts' }), 'help');
    const onlyInPath = scoreMatch(file({ name: 'helpers/main.ts' }), 'help');
    // 'help' is in the basename of utils/helper.ts ('helper.ts')
    // 'help' is only in the dir of helpers/main.ts ('helpers')
    expect(inBase).toBeGreaterThan(onlyInPath);
  });

  it('returns 0 when the query matches neither basename nor path', () => {
    expect(scoreMatch(file({ name: 'app.tsx' }), 'xyz')).toBe(0);
  });

  it('matching is case-insensitive (queries normalized to lowercase by caller)', () => {
    // The component lowercases the query before calling scoreMatch, so
    // scoreMatch itself can rely on the contract that q is already lower.
    expect(scoreMatch(file({ name: 'Hero.tsx' }), 'hero')).toBeGreaterThan(0);
  });
});

describe('nextCursor — arrow-key wrap behavior', () => {
  it('moves forward through the list without wrapping in the middle', () => {
    expect(nextCursor(0, 5, 1)).toBe(1);
    expect(nextCursor(2, 5, 1)).toBe(3);
  });

  it('moves backward through the list without wrapping in the middle', () => {
    expect(nextCursor(3, 5, -1)).toBe(2);
    expect(nextCursor(1, 5, -1)).toBe(0);
  });

  it('wraps from the last row to the first when pressing ↓', () => {
    // Row 4 (last of 5) → 0 (first). Documented behavior in the PR test plan.
    expect(nextCursor(4, 5, 1)).toBe(0);
  });

  it('wraps from the first row to the last when pressing ↑', () => {
    expect(nextCursor(0, 5, -1)).toBe(4);
  });

  it('returns 0 when the list is empty (no division-by-zero, no NaN)', () => {
    expect(nextCursor(0, 0, 1)).toBe(0);
    expect(nextCursor(0, 0, -1)).toBe(0);
  });

  it('stays put on a single-item list (wrap is a no-op)', () => {
    expect(nextCursor(0, 1, 1)).toBe(0);
    expect(nextCursor(0, 1, -1)).toBe(0);
  });
});

describe('QuickSwitcher render', () => {
  it('renders the empty state when the project has no files', () => {
    const markup = renderToStaticMarkup(
      <QuickSwitcher projectId="p1" files={[]} onOpenFile={vi.fn()} onClose={vi.fn()} />,
    );
    // Empty-state copy comes from i18n; the rendered class is stable.
    expect(markup).toContain('class="qs-empty"');
    expect(markup).not.toContain('class="qs-row');
  });

  it('renders a row per file when no query is set', () => {
    const files = [
      file({ name: 'a.html', mtime: 3 }),
      file({ name: 'b.html', mtime: 2 }),
      file({ name: 'c.html', mtime: 1 }),
    ];
    const markup = renderToStaticMarkup(
      <QuickSwitcher projectId="p1" files={files} onOpenFile={vi.fn()} onClose={vi.fn()} />,
    );
    const rowCount = (markup.match(/class="qs-row /g) ?? []).length;
    expect(rowCount).toBe(3);
  });

  it('exposes the keyboard hints in the footer', () => {
    const markup = renderToStaticMarkup(
      <QuickSwitcher projectId="p1" files={[file({})]} onOpenFile={vi.fn()} onClose={vi.fn()} />,
    );
    // Three <kbd> hints (↑↓ / ↵ / esc).
    const kbdCount = (markup.match(/<kbd>/g) ?? []).length;
    expect(kbdCount).toBeGreaterThanOrEqual(3);
  });

  it('renders the input placeholder so users discover the palette is searchable', () => {
    const markup = renderToStaticMarkup(
      <QuickSwitcher projectId="p1" files={[]} onOpenFile={vi.fn()} onClose={vi.fn()} />,
    );
    expect(markup).toContain('class="qs-input"');
    expect(markup).toContain('placeholder=');
  });
});
