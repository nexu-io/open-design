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
import { resolveChatFileLink } from './in-project-link';
import { dedupeToolUsesById, isInFlightToolUse } from './tool-events';

export type FileOpKind = 'read' | 'write' | 'edit' | 'delete';
export type FileOpStatus = 'running' | 'done' | 'error';

export interface FileOpEntry {
  /**
   * 这一条记录**在项目里的身份** —— 显示用它,右侧工作区也用它开档。
   *
   * 不变式:**这里必须是项目相对路径**(`context/provenance.md` 这种形状),
   * 因为下游每一个消费者都拿它当项目文件的钥匙 ——
   *   · 点开   `onRequestOpenFile` → `FileWorkspace` 按 `ProjectFile.name` 配 tab;
   *   · 卡面   `projectFileUrl(projectId, name)` → daemon `/raw/<项目相对路径>`;
   *   · 导出 / 分享,以及产物卡按名字去重、`artifactRefs` 按 `label` 配对
   *     (daemon 那边的 `label_at_capture` 存的就是 `projectRelativePath`)。
   * 而 daemon 的 `GET /files` 给的 `name` 就是项目相对路径。
   *
   * 曾经这里是**基名**,注释还写着「项目文件 API 按基名索引」—— 那句是错的:
   * `/raw/provenance.md` 回 404、`/raw/context/provenance.md` 才回 200。于是住在
   * 子目录里的产物点开建不起 tab(活动 tab 静默回落到「设计文件」)、卡面探 404
   * 永远画不出来,同名的 `README.md` / `assets/README.md` 还会被并成一张卡。
   *
   * 绝对路径靠 `resolvedDir` **正面取证**换算(见 `workspaceFileKey`);取不到
   * 证据时才退回基名。
   */
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

/**
 * 把 agent 给的绝对路径换算成项目相对路径需要的两样,都来自 `ChatPane` 已有的
 * props(`GET /api/projects/:id` 的 `resolvedDir`)。
 *
 * 不传就是这条修复之前的行为:一律退回基名。调用方拿不到项目上下文时
 * (`DesignSystemFlow` 的只读回放、`FileWorkspace` 的活动面板)本来就只把这个
 * 名字当文字用。
 */
export interface FileOpProjectScope {
  projectId?: string | null;
  /** daemon 算出来的项目工作目录(`GET /api/projects/:id` 的 `resolvedDir`) */
  resolvedDir?: string | null;
}

/**
 * 这一条记录在**项目里**叫什么 —— 见 `FileOpEntry.path` 上的不变式。
 *
 * 判据沿用正文 markdown 链接和执行记录行**同一个判官** `resolveChatFileLink`:
 * 绝对路径只认 `resolvedDir` 前缀这一条正面证据,拿不到就退回基名。
 *
 * **故意不按同名去猜**(不把项目文件清单递进去):一个项目里可以有两个
 * `README.md`(根一个、`assets/` 一个),按名字猜会把卡片指向另一个文件 ——
 * 那比开不出来更糟,`runtime/chat/record-file-open.ts` 里产品点名过这一种错法。
 * 猜不出来的那一档保持今天的行为:仍是基名,仍然开不出来,但不会开错。
 */
function workspaceFileKey(fullPath: string, scope: FileOpProjectScope | undefined): string {
  const fallback = basename(fullPath);
  if (!scope?.resolvedDir) return fallback;
  const target = resolveChatFileLink(fullPath, undefined, scope.projectId, scope.resolvedDir);
  // 别的项目的文件(`project-file`)不归右侧工作区管,交给它只会开出一个空 tab。
  return target?.kind === 'workspace-file' ? target.filePath : fallback;
}

export function deriveFileOps(
  events: AgentEvent[] | undefined,
  scope?: FileOpProjectScope,
): FileOpEntry[] {
  if (!events || events.length === 0) return [];
  /*
   * 「入参还在传」的那一档不算一次文件操作。
   *
   * 它只说明模型**打算**写哪个文件,写还没发生 —— 拿它去开文件卡片 / 工作区 tab
   * 是谎报一次落盘。真的 `tool_use` 一到,同一个 id 就会以完整入参再进来一次,
   * 那时候才算数。判据见 `runtime/tool-events.ts` 的 `isInFlightToolUse`。
   */
  const settledEvents = events.filter((ev) => !isInFlightToolUse(ev));
  if (settledEvents.length === 0) return [];
  const dedupedEvents = dedupeToolUsesById(settledEvents);
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
      path: workspaceFileKey(fullPath, scope),
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
    if (ev.name === 'Bash') {
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

/**
 * True when the run attempted any file mutation (write/edit/delete tool call,
 * or a simple Bash rm/unlink), regardless of whether the attempt succeeded.
 * Tool names must stay aligned with the daemon's cross-runtime
 * `WRITE_OR_EDIT_TOOL_NAMES` set in `apps/daemon/src/runtimes/run-artifacts.ts`.
 */
export function hasFileMutationToolUse(events: AgentEvent[] | undefined): boolean {
  for (const ev of events ?? []) {
    if (ev.kind !== 'tool_use') continue;
    if (ev.name === 'Bash') {
      if (extractSimpleBashDeletes(ev.input).length > 0) return true;
      continue;
    }
    const kind = classify(ev.name);
    if (kind === 'write' || kind === 'edit' || kind === 'delete') return true;
  }
  return false;
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

function extractSimpleBashDeletes(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const command = (input as { command?: unknown }).command;
  if (typeof command !== 'string' || !command.trim()) return [];
  const tokens = shellWords(command);
  const paths: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token !== 'rm' && token !== 'unlink') continue;
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
