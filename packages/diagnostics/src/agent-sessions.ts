import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

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
const RUN_EVENTS_SCAN_BYTES = 16 * 1024 * 1024;
const FIRST_LINE_BYTES = 64 * 1024;
const MAX_PROJECT_DIRS = 5_000;
const MAX_ROLLOUTS_PER_DAY = 2_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lines longer than this are replaced by a stub that keeps their time and size. */
export const AGENT_SESSION_MAX_LINE_BYTES = 256 * 1024;
const WINDOW_MARGIN_MS = 5_000;

/** The CLI session a run reported (`status` events carry `sessionId`) and the run's time span. */
export async function readRunAgentSession(eventsPath: string): Promise<RunAgentSession | null> {
  let text: string;
  try {
    const handle = await open(eventsPath, "r");
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, RUN_EVENTS_SCAN_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);
      text = buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
  let sessionId: string | null = null;
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: { event?: unknown; data?: { type?: unknown; sessionId?: unknown }; timestamp?: unknown };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
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
  }
  if (!sessionId || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { sessionId, startMs, endMs };
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function isFile(path: string): Promise<{ mtimeMs: number } | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? { mtimeMs: info.mtimeMs } : null;
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

async function newestJsonl(dir: string, max: number): Promise<Array<{ name: string; path: string }>> {
  const found: Array<{ name: string; path: string; mtimeMs: number }> = [];
  for (const name of await listDir(dir)) {
    if (!name.endsWith(".jsonl") || !SAFE_ENTRY.test(name)) continue;
    const path = join(dir, name);
    const info = await isFile(path);
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
  const projects = (await listDir(projectsDir)).filter((name) => SAFE_ENTRY.test(name)).slice(0, MAX_PROJECT_DIRS);
  for (const project of projects) {
    const main = join(projectsDir, project, `${sessionId}.jsonl`);
    if (!(await isFile(main))) continue;
    const sources: AgentSessionSource[] = [
      { agent: "claude", name: `agent-sessions/claude/${sessionId}.jsonl`, absolutePath: main, kind: "text", tailBytes },
    ];
    const subagentDir = join(projectsDir, project, sessionId, "subagents");
    for (const file of await newestJsonl(subagentDir, maxSubagents)) {
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

async function codexSessionSources(
  codexHome: string,
  session: RunAgentSession,
  maxSubagents: number,
  tailBytes: number,
): Promise<AgentSessionSource[]> {
  const main: AgentSessionSource[] = [];
  const children: AgentSessionSource[] = [];
  for (const dir of localDayDirs(join(codexHome, "sessions"), session.startMs, session.endMs)) {
    const names = (await listDir(dir))
      .filter((name) => name.startsWith("rollout-") && name.endsWith(".jsonl") && SAFE_ENTRY.test(name))
      .slice(0, MAX_ROLLOUTS_PER_DAY);
    for (const name of names) {
      const path = join(dir, name);
      const source: AgentSessionSource = { agent: "codex", name: `agent-sessions/codex/${name}`, absolutePath: path, kind: "text", tailBytes };
      if (name.endsWith(`-${session.sessionId}.jsonl`)) {
        main.push(source);
        continue;
      }
      if (children.length >= maxSubagents) continue;
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
        children.push(source);
      }
    }
  }
  return main.length > 0 ? [...main, ...children] : [];
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
