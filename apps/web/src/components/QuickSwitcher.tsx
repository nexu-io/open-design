// Cmd/Ctrl+P file palette overlay.
//
// Filters the project's `ProjectFile[]` by case-insensitive substring (with
// a small score boost for prefix-on-name matches), and calls onOpenFile on
// Enter. Esc closes. ↑↓ navigates the list. With an empty query, recents
// surface first, then the rest of the file list by mtime.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { pushRecent, readRecents } from '../quickSwitcherRecents';
import type { ProjectFile } from '../types';

interface Props {
  projectId: string;
  files: ProjectFile[];
  onOpenFile: (name: string) => void;
  onClose: () => void;
}

export function QuickSwitcher({ projectId, files, onOpenFile, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return files
        .map((f) => ({ f, score: scoreMatch(f, q) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.f)
        .slice(0, 50);
    }
    // No query: recents (still-extant) first, then mtime-desc for the rest.
    const recents = readRecents(projectId);
    const byName = new Map(files.map((f) => [f.name, f] as const));
    const recentFiles: ProjectFile[] = [];
    const seen = new Set<string>();
    for (const name of recents) {
      const hit = byName.get(name);
      if (hit && !seen.has(name)) {
        recentFiles.push(hit);
        seen.add(name);
      }
    }
    const rest = files
      .filter((f) => !seen.has(f.name))
      .slice()
      .sort((a, b) => b.mtime - a.mtime);
    return [...recentFiles, ...rest].slice(0, 50);
  }, [files, query, projectId]);

  // Reset cursor when the result set changes shape.
  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Keep the highlighted row in view as the cursor moves.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLDivElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const open = useCallback(
    (file: ProjectFile) => {
      onOpenFile(file.name);
      pushRecent(projectId, file.name);
      onClose();
    },
    [onOpenFile, onClose, projectId],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    // Don't intercept navigation/commit keys while an IME composition is
    // active — those keys are how users select / commit candidates when
    // typing CJK file names. Without this guard, ↑↓/Enter would steer the
    // palette cursor instead of the IME picker.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length === 0) return;
      setCursor((c) => nextCursor(c, matches.length, 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length === 0) return;
      setCursor((c) => nextCursor(c, matches.length, -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = matches[cursor];
      if (hit) open(hit);
    }
  }

  const hasQuery = query.trim().length > 0;
  const emptyLabel = hasQuery ? t('quickSwitcher.noMatches') : t('quickSwitcher.empty');

  return (
    <div className="qs-overlay" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="qs-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="qs-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('quickSwitcher.placeholder')}
          spellCheck={false}
          aria-label={t('quickSwitcher.placeholder')}
        />
        <div className="qs-list" ref={listRef} role="listbox">
          {matches.length === 0 ? (
            <div className="qs-empty">{emptyLabel}</div>
          ) : (
            matches.map((f, i) => (
              <div
                key={f.name}
                data-idx={i}
                role="option"
                aria-selected={i === cursor}
                className={`qs-row ${i === cursor ? 'qs-row-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => open(f)}
              >
                <span className="qs-name" title={f.name}>{baseName(f.name)}</span>
                <span className="qs-path">{dirName(f.name)}</span>
                <span className="qs-kind">{labelFor(f)}</span>
              </div>
            ))
          )}
        </div>
        <div className="qs-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('quickSwitcher.navigate')}</span>
          <span><kbd>↵</kbd> {t('quickSwitcher.open')}</span>
          <span><kbd>esc</kbd> {t('quickSwitcher.close')}</span>
        </div>
      </div>
    </div>
  );
}

// Cursor advance with wrap-around. Pulled out as a pure function so the
// boundary-wrap behavior can be unit-tested without simulating keyboard
// events (the rest of the test suite uses static-markup rendering).
// Exported for unit testing.
export function nextCursor(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  if (direction === 1) return (current + 1) % total;
  return (current - 1 + total) % total;
}

// Cheap fuzzy: prefix-on-basename beats substring-on-basename beats
// substring-on-full-name. Good enough for typical file lists; users who
// want sublime-text-style matching can graduate to a real fuzzy lib later.
// Exported for unit testing.
export function scoreMatch(file: ProjectFile, q: string): number {
  const name = file.name.toLowerCase();
  const base = baseName(name);
  if (base === q) return 1000;
  if (base.startsWith(q)) return 500;
  if (base.includes(q)) return 250;
  if (name.includes(q)) return 100;
  return 0;
}

function baseName(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(i + 1) : name;
}

function dirName(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(0, i) : '';
}

function labelFor(file: ProjectFile): string {
  // Use the kind directly: 'html' / 'image' / 'sketch' / etc. Short and
  // already tokenized by the contract; avoids a translation roundtrip per
  // row when results render at 50/sec while typing.
  return file.kind.toUpperCase();
}
