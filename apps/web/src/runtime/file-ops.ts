/**
 * Aggregates Read/Write/Edit/Delete tool_use events into one row per file path.
 *
 * The chat surface renders individual `FileReadCard` / `FileWriteCard` /
 * `FileEditCard` cards inline (and collapses runs of the same family
 * behind a `Editing ×3, Done` disclosure). This module powers the
 * complementary "files this turn" summary that lives at the top of the
 * assistant message — visible while the run streams and persisting once
 * it finishes — so users can scan every file the agent touched without
 * expanding tool-group disclosures.
 */
import type { AgentEvent } from '../types';
import { dedupeToolUsesById } from './tool-events';

export type FileOpKind = 'read' | 'write' | 'edit' | 'delete';
export type FileOpStatus = 'running' | 'done' | 'error';

export interface FileOpEntry {
  /** Basename — used as both display label and the lookup key passed to
   *  `onRequestOpenFile`, since the project-file API keys on basenames. */
  path: string;
  /** Original full path the agent passed; kept for tooltips. */
  fullPath: string;
  /** Distinct ops applied to this file, in encounter order. */
  ops: FileOpKind[];
  /** Per-op tool_use count for this file. Sum across ops equals total. */
  opCounts: Record<FileOpKind, number>;
  /** Total tool_use count for this file (>= ops.length when an op repeats). */
  total: number;
  /** Worst status across all calls for this file: error > running > done. */
  status: FileOpStatus;
}

const READ_NAMES = new Set(['Read', 'read_file']);
const WRITE_NAMES = new Set(['Write', 'create_file']);
const EDIT_NAMES = new Set(['Edit', 'str_replace_edit', 'MultiEdit', 'multi_edit']);
const DELETE_NAMES = new Set(['Delete', 'delete', 'delete_file', 'remove_file', 'rm_file', 'unlink_file']);

function classify(name: string): FileOpKind | null {
  if (READ_NAMES.has(name)) return 'read';
  if (WRITE_NAMES.has(name)) return 'write';
  if (EDIT_NAMES.has(name)) return 'edit';
  if (DELETE_NAMES.has(name)) return 'delete';
  return null;
}

function extractPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as {
    file_path?: unknown;
    filePath?: unknown;
    filename?: unknown;
    path?: unknown;
    target_path?: unknown;
    targetPath?: unknown;
  };
  if (typeof obj.file_path === 'string' && obj.file_path) return obj.file_path;
  if (typeof obj.filePath === 'string' && obj.filePath) return obj.filePath;
  if (typeof obj.path === 'string' && obj.path) return obj.path;
  if (typeof obj.filename === 'string' && obj.filename) return obj.filename;
  if (typeof obj.target_path === 'string' && obj.target_path) return obj.target_path;
  if (typeof obj.targetPath === 'string' && obj.targetPath) return obj.targetPath;
  return null;
}

function basename(input: string): string {
  const segments = input.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? input;
}

function mergeStatus(a: FileOpStatus, b: FileOpStatus): FileOpStatus {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'running' || b === 'running') return 'running';
  return 'done';
}

export function deriveFileOps(events: AgentEvent[] | undefined): FileOpEntry[] {
  if (!events || events.length === 0) return [];
  const dedupedEvents = dedupeToolUsesById(events);
  const resultByToolId = new Map<
    string,
    Extract<AgentEvent, { kind: 'tool_result' }>
  >();
  for (const ev of dedupedEvents) {
    if (ev.kind === 'tool_result') resultByToolId.set(ev.toolUseId, ev);
  }

  const byPath = new Map<string, FileOpEntry>();
  const add = (fullPath: string, kind: FileOpKind, status: FileOpStatus) => {
    if (!fullPath || fullPath === '(unnamed)') return;
    const existing = byPath.get(fullPath);
    if (existing) {
      if (!existing.ops.includes(kind)) existing.ops.push(kind);
      existing.opCounts[kind] += 1;
      existing.total += 1;
      existing.status = mergeStatus(existing.status, status);
      return;
    }
    const opCounts: Record<FileOpKind, number> = { read: 0, write: 0, edit: 0, delete: 0 };
    opCounts[kind] = 1;
    byPath.set(fullPath, {
      path: basename(fullPath),
      fullPath,
      ops: [kind],
      opCounts,
      total: 1,
      status,
    });
  };

  for (const ev of dedupedEvents) {
    if (ev.kind !== 'tool_use') continue;
    const result = resultByToolId.get(ev.id);
    const status: FileOpStatus =
      result == null ? 'running' : result.isError ? 'error' : 'done';
    if (isCommandCapableToolUse(ev)) {
      for (const fullPath of extractSimpleBashDeletes(ev.input)) {
        add(fullPath, 'delete', status);
      }
      continue;
    }
    const kind = classify(ev.name);
    if (!kind) continue;
    const fullPath = extractPath(ev.input);
    if (!fullPath) continue;
    add(fullPath, kind, status);
  }

  return Array.from(byPath.values());
}

type ToolUseEvent = Extract<AgentEvent, { kind: 'tool_use' }>;

/**
 * Tools that run an arbitrary shell command. Matched case-insensitively on the
 * name: the daemon normalises codex `command_execution` to `Bash`, but
 * OpenCode and the pi RPC runtime forward `part.tool` unchanged, so the same
 * shell arrives as lowercase `bash`. Every site that reads a shell command —
 * the files-this-turn summary, the mutation-attempt predicate, the failure
 * guard, and deletion attribution — recognises tools through this one set, so
 * a runtime cannot be supported by one and missed by another.
 */
const SHELL_TOOL_NAMES = new Set([
  'bash',
  'shell',
  'exec',
  'terminal',
  'run_command',
  'run_terminal_cmd',
  'execute_command',
  'local_shell',
]);

function isCommandCapableToolUse(ev: ToolUseEvent): boolean {
  return SHELL_TOOL_NAMES.has(ev.name.toLowerCase());
}

/**
 * A tool whose name declares that it writes, edits, or deletes a file. Names
 * must stay aligned with the daemon's cross-runtime `WRITE_OR_EDIT_TOOL_NAMES`
 * set in `apps/daemon/src/runtimes/run-artifacts.ts`.
 */
function isRecognisedFileMutationTool(name: string): boolean {
  const kind = classify(name);
  return kind === 'write' || kind === 'edit' || kind === 'delete';
}

/**
 * A write/edit/delete tool call, or a simple Bash rm/unlink.
 */
function isFileMutationToolUse(ev: ToolUseEvent): boolean {
  if (isCommandCapableToolUse(ev)) return extractSimpleBashDeletes(ev.input).length > 0;
  return isRecognisedFileMutationTool(ev.name);
}

/**
 * True when the run attempted any file mutation (write/edit/delete tool call,
 * or a simple Bash rm/unlink), regardless of whether the attempt succeeded.
 */
export function hasFileMutationToolUse(events: AgentEvent[] | undefined): boolean {
  return (events ?? []).some((ev) => ev.kind === 'tool_use' && isFileMutationToolUse(ev));
}

/**
 * Lexically resolve a tool-supplied path to its project-relative form, or null
 * when it provably lies outside the project. Absolute paths are placed against
 * `projectRoot`; `..` is resolved first, and a climb above its own anchor is
 * rejected.
 */
function toProjectRelativePath(raw: string, projectRoot?: string | null): string | null {
  const slashed = raw.replace(/\\/g, '/');
  const isAbsolute = slashed.startsWith('/') || /^[A-Za-z]:\//.test(slashed);
  const segments: string[] = [];
  for (const segment of slashed.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  if (!isAbsolute) return segments.join('/');
  const rootSegments = projectRoot
    ? projectRoot.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.')
    : null;
  if (!rootSegments || rootSegments.length === 0) return null;
  if (segments.length <= rootSegments.length) return null;
  for (let i = 0; i < rootSegments.length; i += 1) {
    if (segments[i] !== rootSegments[i]) return null;
  }
  return segments.slice(rootSegments.length).join('/');
}

/**
 * Project-relative paths this run declared it was deleting, taken only from
 * tools whose name says so and whose path arrives as a structured argument.
 *
 * A shell command is excluded on purpose, and that is the whole point of this
 * predicate. Running a shell says the run *could* have deleted something, not
 * that it did: `Bash { command: 'ls' }` is a shell call, and a user or sync
 * client removing a file during that turn would otherwise be credited to it.
 * A `delete_file({ path })` call carries the target itself, with no command
 * text to parse and no question of whether a branch executed.
 *
 * The cost is that a deletion performed through the shell contributes nothing
 * here, which includes the `cd … && rm …` form in the original report. Closing
 * that needs run-scoped provenance at the mutation boundary; a before/after
 * tree diff cannot supply it, because it spans the run's window rather than
 * its actions.
 */
export function declaredDeletionTargets(
  events: AgentEvent[] | undefined,
  projectRoot?: string | null,
): Set<string> {
  const targets = new Set<string>();
  for (const ev of dedupeToolUsesById(events)) {
    if (ev.kind !== 'tool_use') continue;
    if (classify(ev.name) !== 'delete') continue;
    const raw = extractPath(ev.input);
    if (!raw) continue;
    const relative = toProjectRelativePath(raw, projectRoot);
    if (relative) targets.add(relative);
  }
  return targets;
}

/**
 * True when the run contains an errored tool call that could have left the
 * project half-mutated.
 *
 * Deliberately wider than `hasFileMutationToolUse`. That predicate reads intent
 * out of the event — a Bash `rm`, a `Write` call — which is enough to decide
 * whether the turn *tried* to write. It is not enough to clear a turn whose
 * delivery evidence came from the file system rather than from the event,
 * because a shell deletes files without ever naming `rm`: `find … -delete`,
 * `xargs rm`, or a cleanup script all qualify, and runtimes spell the shell
 * tool `Bash`, `shell`, `exec`, or `terminal`. Parsing cannot keep up with
 * that, so the rule inverts: an errored call blocks unless it is a recognised
 * read.
 *
 * The widening stops at tools that could plausibly have done it: a shell call,
 * or a tool whose name declares a write/edit/delete. A tool that only reads or
 * reports — `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `TodoWrite` —
 * never blocks, because treating every errored call as suspect would undo the
 * fix this guard protects: Design-mode discovery uses `WebFetch`, and a failed
 * lookup next to a successful `rm` would restore the very ARTIFACT_NOT_FOUND
 * card this change exists to remove.
 */
export function hasPossibleFileMutationFailure(events: AgentEvent[] | undefined): boolean {
  if (!events || events.length === 0) return false;
  const erroredToolUseIds = new Set<string>();
  for (const ev of events) {
    if (ev.kind === 'tool_result' && ev.isError) erroredToolUseIds.add(ev.toolUseId);
  }
  if (erroredToolUseIds.size === 0) return false;
  return events.some(
    (ev) =>
      ev.kind === 'tool_use' &&
      erroredToolUseIds.has(ev.id) &&
      (isCommandCapableToolUse(ev) || isRecognisedFileMutationTool(ev.name)),
  );
}

export type FileOpCounts = Record<FileOpKind, number>;

/** Total tool_use count per op family across `entries`. */
export function countFileOps(entries: FileOpEntry[]): FileOpCounts {
  const counts: FileOpCounts = { read: 0, write: 0, edit: 0, delete: 0 };
  for (const entry of entries) {
    counts.read += entry.opCounts.read;
    counts.write += entry.opCounts.write;
    counts.edit += entry.opCounts.edit;
    counts.delete += entry.opCounts.delete;
  }
  return counts;
}

export interface ArtifactFileOpCounts {
  write: number;
  edit: number;
}

/**
 * Count unique produced files for the "Files from this turn" disclosure
 * header, categorized by each file's primary artifact op (edit > write).
 * Unlike `countFileOps`, a file written (or edited) several times counts
 * once — the header must match the number of delivered files, not the number
 * of write operations (#5909).
 */
export function countArtifactFileOps(entries: FileOpEntry[]): ArtifactFileOpCounts {
  let write = 0;
  let edit = 0;
  for (const entry of entries) {
    if (entry.ops.includes('edit')) edit += 1;
    else if (entry.ops.includes('write')) write += 1;
  }
  return { write, edit };
}

/**
 * `rm` and `unlink` only delete when they are the command being run. As an
 * argument, printed text, or a redirection target — `grep rm stale.txt`,
 * `echo rm stale.txt`, `echo > rm stale.txt` — the word deletes nothing, so a
 * token scan would invent a deletion target the command never had.
 *
 * A command position is the start of the command line or the token right after
 * an UNCONDITIONAL separator (`;`, `|`, `&`, or a newline). Redirection
 * operators are not separators here — `>` starts a target belonging to the
 * command already running — and neither are `&&` and `||`, because whether the
 * command after them ran depends on an exit status the text does not carry.
 */
function isUnconditionalSeparator(token: string): boolean {
  // `&&` and `||` are deliberately absent. Whether the command after them ran
  // depends on the exit status of the one before, which the command text does
  // not carry, so a deletion in a conditional branch cannot be shown to have
  // executed: `true || rm stale.txt` succeeds without deleting anything.
  return token === ';' || token === '|' || token === '&';
}

function isCommandPosition(tokens: string[], index: number): boolean {
  if (index === 0) return true;
  const previous = tokens[index - 1]!;
  if (isUnconditionalSeparator(previous)) return true;
  // `cmd > target rm x` — the token after a redirection operator is that
  // operator's target, and anything past it still belongs to `cmd`.
  return false;
}

function extractSimpleBashDeletes(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const command = (input as { command?: unknown }).command;
  if (typeof command !== 'string' || !command.trim()) return [];
  const tokens = shellWords(command);
  const paths: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token !== 'rm' && token !== 'unlink') continue;
    if (!isCommandPosition(tokens, i)) continue;
    const commandPaths: string[] = [];
    for (let j = i + 1; j < tokens.length; j += 1) {
      const next = tokens[j]!;
      if (isShellSeparator(next)) break;
      if (token === 'rm' && next.startsWith('-')) continue;
      if (looksUnsafeForFileList(next)) continue;
      commandPaths.push(next);
    }
    paths.push(...commandPaths);
  }
  return [...new Set(paths)];
}

function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  const flushCurrent = () => {
    if (!current) return;
    words.push(current);
    current = '';
  };
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]!;
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (quote === '"' && char === '\\' && i + 1 < command.length) {
        i += 1;
        current += command[i]!;
      } else {
        current += char;
      }
      continue;
    }
    // An unquoted `#` at the start of a word begins a comment that runs to the
    // end of the line; nothing after it is an operand. A `#` inside a word is
    // an ordinary filename character (`notes#1.txt`), so only a word-initial
    // one counts.
    if (char === '#' && current === '') {
      const lineEnd = command.indexOf('\n', i);
      if (lineEnd === -1) break;
      // Stop one short of the newline so the branch below still emits the
      // command boundary it carries; skipping past it would splice the next
      // command onto this one's operands.
      i = lineEnd - 1;
      continue;
    }
    // A newline ends the command, exactly like `;`. Without this the operand
    // scan runs past it and reads the next command and its arguments as more
    // operands of this one.
    if (char === '\n') {
      flushCurrent();
      words.push(';');
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flushCurrent();
      continue;
    }
    if (char === '&' || char === '|') {
      flushCurrent();
      if (command[i + 1] === char) {
        words.push(`${char}${char}`);
        i += 1;
      } else {
        words.push(char);
      }
      continue;
    }
    if (char === ';') {
      flushCurrent();
      words.push(char);
      continue;
    }
    if (char === '<' || char === '>') {
      let operator = char;
      if (/^\d+$/.test(current)) {
        operator = `${current}${operator}`;
        current = '';
      } else {
        flushCurrent();
      }
      if (command[i + 1] === char) {
        operator += char;
        i += 1;
      }
      if (command[i + 1] === '&') {
        operator += '&';
        i += 1;
      }
      words.push(operator);
      continue;
    }
    if (char === '\\' && i + 1 < command.length) {
      i += 1;
      current += command[i]!;
      continue;
    }
    current += char;
  }
  if (current) words.push(current);
  return words;
}

function isShellSeparator(token: string): boolean {
  return (
    token === '&&' ||
    token === '||' ||
    token === ';' ||
    token === '|' ||
    token === '&' ||
    isRedirectionOperator(token)
  );
}

function isRedirectionOperator(token: string): boolean {
  return /^(?:\d+)?(?:>{1,2}|<{1,2})(?:&)?$/.test(token);
}

function looksUnsafeForFileList(token: string): boolean {
  if (!token || token === '/' || token === '.' || token === '..') return true;
  return /[*?[\]{}$`<>|&;]/.test(token);
}
