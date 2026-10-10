import { createReadStream } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";

import type { LogSource } from "./sources.js";

/**
 * Claude Code and Codex record each session — the main agent and every
 * subagent it spawns — as JSONL beside their config, not as `*.log` files:
 *
 * - Claude Code: `<CLAUDE_CONFIG_DIR>/projects/<project>/<sessionId>.jsonl`,
 *   subagents under `<project>/<sessionId>/subagents/*.jsonl`.
 * - Codex: `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<time>-<threadId>.jsonl`;
 *   a subagent thread is its own rollout whose first `session_meta` line names
 *   the root thread as `session_id` (and `parent_thread_id`).
 *
 * A run's `events.jsonl` names the session the CLI reported, so a bundle can
 * carry exactly that session instead of sweeping the user's history.
 */

export type AgentSessionAgent = "claude" | "codex";

export interface RunAgentSession {
  sessionId: string;
  /** First and last event of the run, epoch ms. */
  startMs: number;
  endMs: number;
}

export interface AgentSessionLookupOptions {
  homeDir: string;
  claudeConfigDir?: string | null;
  codexHome?: string | null;
  /** Only search these stores; both when omitted. */
  agents?: AgentSessionAgent[];
  maxSubagents?: number;
  tailBytes?: number;
}

export interface AgentSessionSource extends LogSource {
  agent: AgentSessionAgent;
}

const SESSION_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ENTRY = /^[A-Za-z0-9._-]+$/;
const DEFAULT_MAX_SUBAGENTS = 16;
export const AGENT_SESSION_TAIL_BYTES = 4 * 1024 * 1024;
/** A run-event line longer than this (a large tool result) is skipped, not buffered. */
const RUN_EVENT_MAX_LINE_BYTES = 1024 * 1024;
const FIRST_LINE_BYTES = 64 * 1024;
const MAX_PROJECT_DIRS = 5_000;
const MAX_ROLLOUTS_PER_DAY = 2_000;
/** Newest-first day directories searched for a thread's rollout, which may predate the run. */
const MAX_ROLLOUT_DAY_DIRS = 120;
const MAX_ARCHIVED_ROLLOUTS = 2_048;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lines longer than this are replaced by a stub that keeps their time and size. */
export const AGENT_SESSION_MAX_LINE_BYTES = 256 * 1024;
const WINDOW_MARGIN_MS = 5_000;

/**
 * The CLI session a run reported (`status` events carry `sessionId`) and the
 * run's time span. The whole file is streamed so a failure after a large tool
 * result still sets the end; lines above RUN_EVENT_MAX_LINE_BYTES are skipped
 * without being buffered.
 */
export async function readRunAgentSession(eventsPath: string): Promise<RunAgentSession | null> {
  let sessionId: string | null = null;
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  const consider = (line: string) => {
    if (!line.trim()) return;
    let record: { event?: unknown; data?: { type?: unknown; sessionId?: unknown }; timestamp?: unknown };
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof record.timestamp === "number" && Number.isFinite(record.timestamp)) {
      startMs = Math.min(startMs, record.timestamp);
      endMs = Math.max(endMs, record.timestamp);
    }
    const data = record.data;
    if (
      record.event === "agent" && data && data.type === "status" &&
      typeof data.sessionId === "string" && SESSION_ID.test(data.sessionId)
    ) {
      sessionId = data.sessionId;
    }
  };
  try {
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let overflow = false;
    for await (const chunk of createReadStream(eventsPath) as AsyncIterable<Buffer>) {
      let from = 0;
      for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, from)) {
        if (!overflow) consider(Buffer.concat([...pending, chunk.subarray(from, newline)]).toString("utf8"));
        pending = [];
        pendingBytes = 0;
        overflow = false;
        from = newline + 1;
      }
      if (overflow || from >= chunk.length) continue;
      pendingBytes += chunk.length - from;
      if (pendingBytes > RUN_EVENT_MAX_LINE_BYTES) {
        overflow = true;
        pending = [];
      } else {
        pending.push(chunk.subarray(from));
      }
    }
    if (!overflow && pending.length > 0) consider(Buffer.concat(pending).toString("utf8"));
  } catch {
    return null;
  }
  if (!sessionId || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { sessionId, startMs, endMs };
}

/**
 * Agent stores are another CLI's state, not ours: never follow a symlink below
 * a store root, and check the real path stays under the root's real path.
 */
interface StoreRoot {
  path: string;
  real: string;
}

async function storeRoot(path: string): Promise<StoreRoot | null> {
  try {
    return { path, real: await realpath(path) };
  } catch {
    return null;
  }
}

async function inside(root: StoreRoot, path: string): Promise<boolean> {
  try {
    const real = await realpath(path);
    return real === root.real || real.startsWith(root.real + sep);
  } catch {
    return false;
  }
}

/** Plain (non-symlink) entries of a directory under the root. */
async function listEntries(root: StoreRoot, dir: string, kind: "dir" | "file"): Promise<string[]> {
  if (!(await inside(root, dir))) return [];
  try {
    const info = await lstat(dir);
    if (!info.isDirectory() || (dir !== root.path && info.isSymbolicLink())) return [];
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => !entry.isSymbolicLink() && (kind === "dir" ? entry.isDirectory() : entry.isFile()))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function isFile(root: StoreRoot, path: string): Promise<{ mtimeMs: number } | null> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || !(await inside(root, path))) return null;
    return { mtimeMs: info.mtimeMs };
  } catch {
    return null;
  }
}

async function readFirstLine(path: string): Promise<string> {
  try {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(FIRST_LINE_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, FIRST_LINE_BYTES, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      const end = text.indexOf("\n");
      return end < 0 ? text : text.slice(0, end);
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

async function newestJsonl(root: StoreRoot, dir: string, max: number): Promise<Array<{ name: string; path: string }>> {
  const found: Array<{ name: string; path: string; mtimeMs: number }> = [];
  for (const name of await listEntries(root, dir, "file")) {
    if (!name.endsWith(".jsonl") || !SAFE_ENTRY.test(name)) continue;
    const path = join(dir, name);
    const info = await isFile(root, path);
    if (info) found.push({ name, path, mtimeMs: info.mtimeMs });
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, max).map(({ name, path }) => ({ name, path }));
}

async function claudeSessionSources(
  claudeDir: string,
  sessionId: string,
  maxSubagents: number,
  tailBytes: number,
): Promise<AgentSessionSource[]> {
  const projectsDir = join(claudeDir, "projects");
  const root = await storeRoot(projectsDir);
  if (!root) return [];
  const projects = (await listEntries(root, projectsDir, "dir")).filter((name) => SAFE_ENTRY.test(name)).slice(0, MAX_PROJECT_DIRS);
  for (const project of projects) {
    const main = join(projectsDir, project, `${sessionId}.jsonl`);
    if (!(await isFile(root, main))) continue;
    const sources: AgentSessionSource[] = [
      { agent: "claude", name: `agent-sessions/claude/${sessionId}.jsonl`, absolutePath: main, kind: "text", tailBytes },
    ];
    const sessionDir = join(projectsDir, project, sessionId);
    const subagentDir = join(sessionDir, "subagents");
    const subagents = (await listEntries(root, sessionDir, "dir")).includes("subagents")
      ? await newestJsonl(root, subagentDir, maxSubagents)
      : [];
    for (const file of subagents) {
      sources.push({
        agent: "claude",
        name: `agent-sessions/claude/${sessionId}/subagents/${file.name}`,
        absolutePath: file.path,
        kind: "text",
        tailBytes,
      });
    }
    return sources;
  }
  return [];
}

/** Codex files rollouts under the local date the thread started. */
function localDayDirs(sessionsDir: string, startMs: number, endMs: number): string[] {
  const dirs: string[] = [];
  const pad = (value: number) => String(value).padStart(2, "0");
  for (let at = startMs - DAY_MS; at <= endMs + DAY_MS; at += DAY_MS) {
    const day = new Date(at);
    dirs.push(join(sessionsDir, String(day.getFullYear()), pad(day.getMonth() + 1), pad(day.getDate())));
  }
  return [...new Set(dirs)];
}

function isRollout(name: string): boolean {
  return name.startsWith("rollout-") && name.endsWith(".jsonl") && SAFE_ENTRY.test(name);
}

/**
 * The thread's own rollout. Codex appends every turn of a thread, including one
 * resumed days later, to the file filed under the date the thread started, so
 * search day directories newest-first (bounded), then the flat archive.
 */
async function findMainRollout(codexHome: string, sessionId: string): Promise<{ root: StoreRoot; dir: string; name: string } | null> {
  const suffix = `-${sessionId}.jsonl`;
  const sessionsDir = join(codexHome, "sessions");
  const sessions = await storeRoot(sessionsDir);
  if (sessions) {
    const newestFirst = async (dir: string) => (await listEntries(sessions, dir, "dir"))
      .filter((name) => /^\d{1,4}$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    let scanned = 0;
    for (const year of await newestFirst(sessionsDir)) {
      for (const month of await newestFirst(join(sessionsDir, year))) {
        for (const day of await newestFirst(join(sessionsDir, year, month))) {
          if (scanned++ >= MAX_ROLLOUT_DAY_DIRS) return null;
          const dir = join(sessionsDir, year, month, day);
          const names = (await listEntries(sessions, dir, "file")).slice(0, MAX_ROLLOUTS_PER_DAY);
          const name = names.find((entry) => isRollout(entry) && entry.endsWith(suffix));
          if (name && (await isFile(sessions, join(dir, name)))) return { root: sessions, dir, name };
        }
      }
    }
  }
  const archiveDir = join(codexHome, "archived_sessions");
  const archive = await storeRoot(archiveDir);
  if (archive) {
    const names = await listEntries(archive, archiveDir, "file");
    if (names.length <= MAX_ARCHIVED_ROLLOUTS) {
      const name = names.find((entry) => isRollout(entry) && entry.endsWith(suffix));
      if (name && (await isFile(archive, join(archiveDir, name)))) return { root: archive, dir: archiveDir, name };
    }
  }
  return null;
}

async function codexSessionSources(
  codexHome: string,
  session: RunAgentSession,
  maxSubagents: number,
  tailBytes: number,
): Promise<AgentSessionSource[]> {
  const main = await findMainRollout(codexHome, session.sessionId);
  if (!main) return [];
  const sources: AgentSessionSource[] = [{
    agent: "codex", name: `agent-sessions/codex/${main.name}`, absolutePath: join(main.dir, main.name), kind: "text", tailBytes,
  }];
  // Subagent threads start during the run, so they are filed under the run's
  // dates (and the main rollout's directory). Codex archives a thread with its
  // descendants, so an archived main rollout has its children in the archive.
  const places: Array<{ root: StoreRoot; dir: string }> = [];
  const sessionsDir = join(codexHome, "sessions");
  const sessions = await storeRoot(sessionsDir);
  if (sessions) {
    const dirs = new Set(localDayDirs(sessionsDir, session.startMs, session.endMs));
    if (main.root.path === sessionsDir) dirs.add(main.dir);
    for (const dir of dirs) places.push({ root: sessions, dir });
  }
  if (main.root.path !== sessionsDir) places.push({ root: main.root, dir: main.dir });
  let children = 0;
  for (const { root, dir } of places) {
    const names = (await listEntries(root, dir, "file")).filter(isRollout);
    if (names.length > MAX_ARCHIVED_ROLLOUTS) continue;
    for (const name of names) {
      if (children >= maxSubagents) return sources;
      if (name === main.name) continue;
      const path = join(dir, name);
      if (!(await isFile(root, path))) continue;
      let meta: { type?: unknown; payload?: { session_id?: unknown; parent_thread_id?: unknown } };
      try {
        meta = JSON.parse(await readFirstLine(path));
      } catch {
        continue;
      }
      const payload = meta?.payload;
      if (
        meta?.type === "session_meta" && payload &&
        (payload.session_id === session.sessionId || payload.parent_thread_id === session.sessionId)
      ) {
        sources.push({ agent: "codex", name: `agent-sessions/codex/${name}`, absolutePath: path, kind: "text", tailBytes });
        children += 1;
      }
    }
  }
  return sources;
}

/**
 * Finds the run's native session files. The agent store is identified by where
 * the session id is found, so a caller that does not know the agent can try both.
 */
export async function buildAgentSessionSources(
  session: RunAgentSession,
  options: AgentSessionLookupOptions,
): Promise<AgentSessionSource[]> {
  if (!SESSION_ID.test(session.sessionId)) return [];
  const home = options.homeDir?.trim();
  if (!home) return [];
  const agents = options.agents ?? ["claude", "codex"];
  const maxSubagents = options.maxSubagents ?? DEFAULT_MAX_SUBAGENTS;
  const tailBytes = options.tailBytes ?? AGENT_SESSION_TAIL_BYTES;
  if (agents.includes("claude")) {
    const claudeDir = options.claudeConfigDir?.trim() || join(home, ".claude");
    const found = await claudeSessionSources(claudeDir, session.sessionId, maxSubagents, tailBytes);
    if (found.length > 0) return found;
  }
  if (agents.includes("codex")) {
    const codexHome = options.codexHome?.trim() || join(home, ".codex");
    const found = await codexSessionSources(codexHome, session, maxSubagents, tailBytes);
    if (found.length > 0) return found;
  }
  return [];
}

function lineTime(record: unknown): number | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as { timestamp?: unknown }).timestamp;
  const ms = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Keeps the lines written during the run. A session file spans every turn of
 * the conversation, so earlier and later turns are dropped. Lines without a
 * timestamp (Claude attachments, for example) follow the timestamped line
 * around them; a file without any timestamp is kept whole. Oversized lines (a
 * large tool result) become a stub that keeps their time and size.
 */
export function selectAgentSessionLines(startMs: number, endMs: number) {
  const from = startMs - WINDOW_MARGIN_MS;
  const to = endMs + WINDOW_MARGIN_MS;
  return (lines: string[]): string[] => {
    const kept: string[] = [];
    let pending: string[] = [];
    let keeping: boolean | null = null;
    for (const raw of lines) {
      if (!raw.trim()) continue;
      let record: unknown = null;
      try {
        record = JSON.parse(raw);
      } catch {
        record = null;
      }
      const at = lineTime(record);
      const bytes = Buffer.byteLength(raw, "utf8");
      const line = bytes > AGENT_SESSION_MAX_LINE_BYTES
        ? JSON.stringify({ truncated: true, bytes, ...(at === null ? {} : { timestamp: new Date(at).toISOString() }) })
        : raw;
      if (at === null) {
        if (keeping === null) pending.push(line);
        else if (keeping) kept.push(line);
        continue;
      }
      keeping = at >= from && at <= to;
      if (keeping) kept.push(...pending, line);
      pending = [];
    }
    if (keeping === null) kept.push(...pending);
    return kept;
  };
}

/** Of an oversized line only this much is held, enough to read its timestamp for the stub. */
const OVERSIZED_LINE_HEAD_BYTES = 64 * 1024;
const TIMESTAMP_FIELD = /"timestamp"\s*:\s*(?:"([^"]{1,64})"|(-?\d{1,16}(?:\.\d+)?))/;

function stubTime(head: string): number | null {
  const match = TIMESTAMP_FIELD.exec(head);
  if (!match) return null;
  const ms = match[1] !== undefined ? Date.parse(match[1]) : Number(match[2]);
  return Number.isFinite(ms) ? ms : null;
}

/** A run's time span; records within it (plus a small margin) belong to the run. */
export interface AgentSessionTimeWindow {
  startMs: number;
  endMs: number;
}

export interface AgentSessionWindowOptions {
  /** Cap on the returned text; when the run's records exceed it, the middle is omitted. */
  maxBytes: number;
  /** Records older than this (the consent boundary) are never returned. */
  notBeforeMs?: number | null;
}

/**
 * Streams a session file and returns only the run's records, selected before
 * any byte cap so a long run keeps its first failure. Lines above
 * AGENT_SESSION_MAX_LINE_BYTES become a stub (time and size) without being
 * buffered. Past `maxBytes` the first and last halves are kept and one record
 * says how much was omitted between them. Several runs can resume the same
 * session, so a record is kept when it falls in any of `windows`.
 */
export async function readAgentSessionWindow(
  path: string,
  windows: readonly AgentSessionTimeWindow[],
  options: AgentSessionWindowOptions,
): Promise<string> {
  const notBefore = options.notBeforeMs ?? Number.NEGATIVE_INFINITY;
  const spans = windows.map(({ startMs, endMs }) => ({
    from: Math.max(startMs - WINDOW_MARGIN_MS, notBefore),
    to: endMs + WINDOW_MARGIN_MS,
  }));
  const inRun = (at: number) => spans.some(({ from, to }) => at >= from && at <= to);
  const headBudget = Math.floor(options.maxBytes / 2);
  const tailBudget = Math.max(0, options.maxBytes - headBudget - 256);
  const head: string[] = [];
  let headBytes = 0;
  let headFull = false;
  const tail: string[] = [];
  let tailBytes = 0;
  let omittedLines = 0;
  let omittedBytes = 0;
  const emit = (line: string) => {
    const bytes = Buffer.byteLength(line, "utf8") + 1;
    if (!headFull && headBytes + bytes <= headBudget) {
      head.push(line);
      headBytes += bytes;
      return;
    }
    headFull = true;
    tail.push(line);
    tailBytes += bytes;
    while (tailBytes > tailBudget && tail.length > 0) {
      const dropped = tail.shift()!;
      const droppedBytes = Buffer.byteLength(dropped, "utf8") + 1;
      tailBytes -= droppedBytes;
      omittedLines += 1;
      omittedBytes += droppedBytes;
    }
  };
  let pending: string[] = [];
  let pendingBytes = 0;
  let keeping: boolean | null = null;
  const consider = (line: string, at: number | null) => {
    if (at === null) {
      if (keeping === null) {
        pending.push(line);
        pendingBytes += Buffer.byteLength(line, "utf8") + 1;
        while (pendingBytes > options.maxBytes && pending.length > 0) {
          pendingBytes -= Buffer.byteLength(pending.shift()!, "utf8") + 1;
        }
      } else if (keeping) {
        emit(line);
      }
      return;
    }
    keeping = inRun(at);
    if (keeping) {
      for (const queued of pending) emit(queued);
      emit(line);
    }
    pending = [];
    pendingBytes = 0;
  };
  const complete = (raw: string) => {
    if (!raw.trim()) return;
    let record: unknown = null;
    try {
      record = JSON.parse(raw);
    } catch {
      record = null;
    }
    consider(raw, lineTime(record));
  };
  const oversized = (headText: string, bytes: number) => {
    const at = stubTime(headText);
    consider(JSON.stringify({ truncated: true, bytes, ...(at === null ? {} : { timestamp: new Date(at).toISOString() }) }), at);
  };

  let parts: Buffer[] = [];
  let partBytes = 0;
  let lineBytes = 0;
  let overflowHead: string | null = null;
  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) {
    let from = 0;
    while (from < chunk.length) {
      const newline = chunk.indexOf(10, from);
      const end = newline === -1 ? chunk.length : newline;
      const piece = chunk.subarray(from, end);
      lineBytes += piece.length;
      if (overflowHead === null) {
        parts.push(piece);
        partBytes += piece.length;
        if (partBytes > AGENT_SESSION_MAX_LINE_BYTES) {
          overflowHead = Buffer.concat(parts).subarray(0, OVERSIZED_LINE_HEAD_BYTES).toString("utf8");
          parts = [];
          partBytes = 0;
        }
      }
      if (newline === -1) break;
      if (overflowHead === null) complete(Buffer.concat(parts).toString("utf8"));
      else oversized(overflowHead, lineBytes);
      parts = [];
      partBytes = 0;
      lineBytes = 0;
      overflowHead = null;
      from = newline + 1;
    }
  }
  if (overflowHead !== null) oversized(overflowHead, lineBytes);
  else if (partBytes > 0) complete(Buffer.concat(parts).toString("utf8"));
  // A file without any timestamp cannot be placed in time: keep it whole,
  // unless a consent boundary applies, which it could not be proven against.
  if (keeping === null && !Number.isFinite(notBefore)) for (const queued of pending) emit(queued);

  const out = [...head];
  if (omittedLines > 0) out.push(JSON.stringify({ truncated: "middle", omittedLines, omittedBytes }));
  out.push(...tail);
  return out.join("\n");
}
