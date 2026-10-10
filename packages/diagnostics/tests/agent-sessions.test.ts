import { appendFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_SESSION_MAX_LINE_BYTES,
  buildAgentSessionSources,
  readRunAgentSession,
  selectAgentSessionLines,
} from "../src/agent-sessions.js";

let tempDir: string;
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "diagnostics-agent-sessions-"));
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const START = Date.parse("2026-10-01T10:00:00.000Z");
const END = Date.parse("2026-10-01T10:05:00.000Z");
const at = (ms: number) => new Date(ms).toISOString();

describe("selectAgentSessionLines", () => {
  it("replaces an oversized line with a stub that keeps its time and size", () => {
    const big = JSON.stringify({ timestamp: at(START + 1_000), output: "x".repeat(AGENT_SESSION_MAX_LINE_BYTES) });
    const [line] = selectAgentSessionLines(START, END)([big]);
    expect(JSON.parse(line!)).toEqual({ truncated: true, bytes: Buffer.byteLength(big), timestamp: at(START + 1_000) });
  });

  it("keeps a file without any timestamp whole", () => {
    const lines = [JSON.stringify({ a: 1 }), JSON.stringify({ b: 2 })];
    expect(selectAgentSessionLines(START, END)(lines)).toEqual(lines);
  });

  it("drops untimed lines that follow a turn outside the run", () => {
    const lines = [
      JSON.stringify({ timestamp: at(START - 3_600_000), text: "old" }),
      JSON.stringify({ attachment: "old attachment" }),
      JSON.stringify({ timestamp: at(START + 10), text: "new" }),
      JSON.stringify({ attachment: "new attachment" }),
    ];
    const kept = selectAgentSessionLines(START, END)(lines).join("\n");
    expect(kept).not.toContain("old");
    expect(kept).toContain("new attachment");
  });
});

describe("readRunAgentSession", () => {
  it("ignores a session id that is not a plain identifier", async () => {
    const path = join(tempDir, "events.jsonl");
    await mkdir(tempDir, { recursive: true });
    await writeFile(path, [
      JSON.stringify({ event: "agent", data: { type: "status", sessionId: "../../etc/passwd" }, timestamp: START }),
    ].join("\n"));
    expect(await readRunAgentSession(path)).toBeNull();
  });

  it("reads the reported session and the run's span", async () => {
    const path = join(tempDir, "events.jsonl");
    await writeFile(path, [
      JSON.stringify({ event: "start", data: {}, timestamp: START }),
      JSON.stringify({ event: "agent", data: { type: "status", label: "running", sessionId: "ses_abc12345" }, timestamp: START + 5 }),
      "not json",
      JSON.stringify({ event: "end", data: {}, timestamp: END }),
    ].join("\n"));
    expect(await readRunAgentSession(path)).toEqual({ sessionId: "ses_abc12345", startMs: START, endMs: END });
  });
});

describe("readRunAgentSession beyond the first 16 MiB", () => {
  it("takes the session and the true end from a run whose events.jsonl outgrows the scan", async () => {
    const path = join(tempDir, "events.jsonl");
    const filler = (ms: number) => JSON.stringify({ event: "agent", data: { type: "text_delta", delta: "x".repeat(1024 * 1024) }, timestamp: ms });
    await writeFile(path, JSON.stringify({ event: "start", data: {}, timestamp: START }) + "\n");
    for (let i = 0; i < 17; i++) await appendFile(path, filler(START + 1_000 + i) + "\n");
    // The status event and the failure land after 16 MiB.
    await appendFile(path, JSON.stringify({ event: "agent", data: { type: "status", sessionId: "ses_late123" }, timestamp: START + 60_000 }) + "\n");
    await appendFile(path, JSON.stringify({ event: "error", data: { message: "boom" }, timestamp: END }) + "\n");
    expect(await readRunAgentSession(path)).toEqual({ sessionId: "ses_late123", startMs: START, endMs: END });
  });
});

describe("buildAgentSessionSources stays inside the agent stores", () => {
  const options = () => ({ homeDir: tempDir, claudeConfigDir: join(tempDir, ".claude"), codexHome: join(tempDir, ".codex") });
  const session = (sessionId: string) => ({ sessionId, startMs: START, endMs: END });
  const outside = async (name: string) => {
    const dir = join(tempDir, "outside");
    await mkdir(dir, { recursive: true });
    const file = join(dir, name);
    await writeFile(file, JSON.stringify({ timestamp: at(START + 1), secret: "outside the store" }) + "\n");
    return { dir, file };
  };

  it("ignores a Claude session file that is a symlink", async () => {
    const { file } = await outside("ses_claude123.jsonl");
    await mkdir(join(tempDir, ".claude", "projects", "p"), { recursive: true });
    await symlink(file, join(tempDir, ".claude", "projects", "p", "ses_claude123.jsonl"));
    expect(await buildAgentSessionSources(session("ses_claude123"), options())).toEqual([]);
  });

  it("ignores a Claude project directory that is a symlink", async () => {
    const { dir } = await outside("ses_claude123.jsonl");
    await mkdir(join(tempDir, ".claude", "projects"), { recursive: true });
    await symlink(dir, join(tempDir, ".claude", "projects", "linked"));
    expect(await buildAgentSessionSources(session("ses_claude123"), options())).toEqual([]);
  });

  it("ignores Claude subagent files and directories that are symlinks", async () => {
    const { dir, file } = await outside("agent-x.jsonl");
    const project = join(tempDir, ".claude", "projects", "p");
    await mkdir(join(project, "ses_claude123", "subagents"), { recursive: true });
    await writeFile(join(project, "ses_claude123.jsonl"), JSON.stringify({ timestamp: at(START + 1) }) + "\n");
    await symlink(file, join(project, "ses_claude123", "subagents", "agent-linked.jsonl"));
    const sources = await buildAgentSessionSources(session("ses_claude123"), options());
    expect(sources.map((source) => source.name)).toEqual(["agent-sessions/claude/ses_claude123.jsonl"]);

    await rm(join(project, "ses_claude123", "subagents"), { recursive: true });
    await symlink(dir, join(project, "ses_claude123", "subagents"));
    const again = await buildAgentSessionSources(session("ses_claude123"), options());
    expect(again.map((source) => source.name)).toEqual(["agent-sessions/claude/ses_claude123.jsonl"]);
  });

  const threadId = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
  it("ignores a Codex rollout that is a symlink", async () => {
    const { file } = await outside(`rollout-2026-10-01T10-00-00-${threadId}.jsonl`);
    const day = join(tempDir, ".codex", "sessions", "2026", "10", "01");
    await mkdir(day, { recursive: true });
    await symlink(file, join(day, `rollout-2026-10-01T10-00-00-${threadId}.jsonl`));
    expect(await buildAgentSessionSources(session(threadId), options())).toEqual([]);
  });

  it("ignores a Codex day directory that is a symlink", async () => {
    const { dir } = await outside(`rollout-2026-10-01T10-00-00-${threadId}.jsonl`);
    await mkdir(join(tempDir, ".codex", "sessions", "2026", "10"), { recursive: true });
    await symlink(dir, join(tempDir, ".codex", "sessions", "2026", "10", "01"));
    expect(await buildAgentSessionSources(session(threadId), options())).toEqual([]);
  });

  it("collects an archived Codex thread together with its archived child threads", async () => {
    // Codex archiving moves a thread and its descendants into the flat archive.
    const childId = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60";
    const archive = join(tempDir, ".codex", "archived_sessions");
    await mkdir(archive, { recursive: true });
    const mainName = `rollout-2026-10-01T10-00-00-${threadId}.jsonl`;
    const childName = `rollout-2026-10-01T10-01-00-${childId}.jsonl`;
    await writeFile(join(archive, mainName), JSON.stringify({ timestamp: at(START + 1), type: "session_meta", payload: { id: threadId, session_id: threadId } }) + "\n");
    await writeFile(join(archive, childName), JSON.stringify({ timestamp: at(START + 2), type: "session_meta", payload: { id: childId, session_id: threadId, parent_thread_id: threadId } }) + "\n");
    await writeFile(join(archive, "rollout-2026-10-01T10-02-00-0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a61.jsonl"),
      JSON.stringify({ timestamp: at(START + 3), type: "session_meta", payload: { id: "other", session_id: "other" } }) + "\n");
    const sources = await buildAgentSessionSources(session(threadId), options());
    expect(sources.map((source) => source.name)).toEqual([`agent-sessions/codex/${mainName}`, `agent-sessions/codex/${childName}`]);
  });

  it("finds a Codex thread resumed days after its rollout was filed", async () => {
    // Codex appends a resumed turn to the rollout under the date the thread started.
    const started = join(tempDir, ".codex", "sessions", "2026", "09", "20");
    await mkdir(started, { recursive: true });
    const name = `rollout-2026-09-20T08-00-00-${threadId}.jsonl`;
    await writeFile(join(started, name), JSON.stringify({ timestamp: at(START + 1), type: "event_msg" }) + "\n");
    const sources = await buildAgentSessionSources(session(threadId), options());
    expect(sources.map((source) => source.name)).toEqual([`agent-sessions/codex/${name}`]);
  });
});
