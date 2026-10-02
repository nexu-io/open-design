import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_SESSION_MAX_LINE_BYTES,
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
