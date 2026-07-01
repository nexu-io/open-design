// Cmd/Ctrl+P file palette overlay.
//
// Filters the project's `ProjectFile[]` by case-insensitive substring (with
// a small score boost for prefix-on-name matches), and calls onOpenFile on
// Enter. Esc closes. ↑↓ navigates the list. With an empty query, recents
// surface first, then the rest of the file list by mtime.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceContextItem } from '@open-design/contracts';
import { motion } from 'motion/react';
import { modalOverlay, scaleIn } from '../motion';
import { useT } from '../i18n';
import { pushRecent, readRecents } from '../quickSwitcherRecents';
import type { ProjectFile } from '../types';

interface Props {
  projectId: string;
  files: ProjectFile[];
  workspaceContexts?: WorkspaceContextItem[];
  onOpenFile: (name: string) => void;
  onOpenTab?: (tabId: string) => void;
  onClose: () => void;
}

type QuickSwitcherResult =
  | { kind: 'tab'; context: WorkspaceContextItem; score: number }
  | { kind: 'file'; file: ProjectFile; score: number };

export function QuickSwitcher({
  projectId,
  files,
  workspaceContexts = [],
  onOpenFile,
  onOpenTab,
  onClose,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo<QuickSwitcherResult[]>(() => {
    const q = query.trim().toLowerCase();
    const searchableTabs = workspaceContexts.filter((item) => item.tabId);
    if (q) {
      const tabResults: QuickSwitcherResult[] = searchableTabs
        .map((context) => ({ kind: 'tab' as const, context, score: scoreWorkspaceContextMatch(context, q) }))
        .filter((x) => x.score > 0)
        .map((x) => ({ kind: 'tab' as const, context: x.context, score: x.score }));
      const fileResults: QuickSwitcherResult[] = files
        .map((file) => ({ kind: 'file' as const, file, score: scoreMatch(file, q) }))
        .filter((x) => x.score > 0);
      return [...tabResults, ...fileResults]
        .sort((a, b) => b.score - a.score)
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
    const fileResults: QuickSwitcherResult[] = [...recentFiles, ...rest]
      .map((file) => ({ kind: 'file' as const, file, score: 0 }));
    const tabResults: QuickSwitcherResult[] = searchableTabs
      .map((context) => ({ kind: 'tab' as const, context, score: 0 }));
    return [...tabResults, ...fileResults].slice(0, 50);
  }, [files, query, projectId, workspaceContexts]);

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
    (result: QuickSwitcherResult) => {
      if (result.kind === 'tab') {
        if (result.context.tabId) onOpenTab?.(result.context.tabId);
        onClose();
        return;
      }
      onOpenFile(result.file.name);
      pushRecent(projectId, result.file.name);
      onClose();
    },
    [onOpenFile, onOpenTab, onClose, projectId],
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
    <motion.div
      className="qs-overlay"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="qs-palette"
        onMouseDown={(e) => e.stopPropagation()}
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
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
            matches.map((match, i) => (
              <div
                key={quickSwitcherResultKey(match)}
                data-idx={i}
                role="option"
                aria-selected={i === cursor}
                className={`qs-row ${i === cursor ? 'qs-row-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => open(match)}
              >
                <span className="qs-name" title={quickSwitcherResultTitle(match)}>
                  {quickSwitcherResultName(match)}
                </span>
                <span className="qs-path">{quickSwitcherResultPath(match)}</span>
                <span className="qs-kind">{quickSwitcherResultKindLabel(match)}</span>
              </div>
            ))
          )}
        </div>
        <div className="qs-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('quickSwitcher.navigate')}</span>
          <span><kbd>↵</kbd> {t('quickSwitcher.open')}</span>
          <span><kbd>esc</kbd> {t('quickSwitcher.close')}</span>
        </div>
      </motion.div>
    </motion.div>
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

export function scoreWorkspaceContextMatch(item: WorkspaceContextItem, q: string): number {
  const label = item.label.toLowerCase();
  const kind = item.kind.toLowerCase();
  const full = [
    item.id,
    item.label,
    item.kind,
    item.tabId ?? '',
    item.path ?? '',
    item.absolutePath ?? '',
    item.url ?? '',
    item.title ?? '',
  ].join(' ').toLowerCase();
  if (label === q) return 1000;
  if (label.startsWith(q)) return 550;
  if (kind === q) return 520;
  if (label.includes(q)) return 280;
  if (full.includes(q)) return 130;
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

function quickSwitcherResultKey(result: QuickSwitcherResult): string {
  return result.kind === 'tab'
    ? `tab:${result.context.kind}:${result.context.id}`
    : `file:${result.file.name}`;
}

function quickSwitcherResultName(result: QuickSwitcherResult): string {
  return result.kind === 'tab'
    ? result.context.label
    : baseName(result.file.name);
}

function quickSwitcherResultPath(result: QuickSwitcherResult): string {
  if (result.kind === 'file') return dirName(result.file.name);
  return result.context.url
    || result.context.path
    || result.context.absolutePath
    || result.context.title
    || result.context.tabId
    || result.context.id;
}

function quickSwitcherResultTitle(result: QuickSwitcherResult): string {
  if (result.kind === 'file') return result.file.name;
  return [
    workspaceContextKindLabel(result.context.kind),
    result.context.label,
    result.context.url,
    result.context.path,
    result.context.tabId,
  ].filter(Boolean).join(' | ');
}

function quickSwitcherResultKindLabel(result: QuickSwitcherResult): string {
  return result.kind === 'file'
    ? labelFor(result.file)
    : workspaceContextKindLabel(result.context.kind).toUpperCase();
}

function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'project':
      return 'Project';
    case 'local-code':
      return 'Local code';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
}
