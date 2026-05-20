import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectLogSource, collectLogSources, findMacOSCrashReports } from "../src/sources.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "diagnostics-sources-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("collectLogSource", () => {
  it("reads a text file and runs redaction over its content", async () => {
    const filePath = join(tempDir, "daemon.log");
    await writeFile(filePath, "GET /api?token=abc123 ok\n", "utf8");

    const result = await collectLogSource({
      name: "logs/daemon.log",
      absolutePath: filePath,
      kind: "text",
    });
    expect(result.content).toContain("token=[REDACTED]");
    expect(result.content).not.toContain("abc123");
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it("redacts JSON content via pretty-printed JSON path when kind is json", async () => {
    const filePath = join(tempDir, "state.json");
    await writeFile(filePath, JSON.stringify({ token: "secret", body: "ok" }), "utf8");

    const result = await collectLogSource({
      name: "logs/state.json",
      absolutePath: filePath,
      kind: "json",
    });
    expect(result.content).toContain("[REDACTED]");
    expect(result.content).toContain("\n");
  });

  it("returns the trailing window when tailBytes is smaller than the file", async () => {
    const filePath = join(tempDir, "long.log");
    await writeFile(filePath, "head-content\nmiddle\ntail-content", "utf8");

    const result = await collectLogSource({
      name: "logs/long.log",
      absolutePath: filePath,
      kind: "text",
      tailBytes: 12,
    });
    expect(result.content).toBe("tail-content");
    expect(result.bytes).toBe(12);
  });

  it("returns an error marker when the file does not exist", async () => {
    const result = await collectLogSource({
      name: "logs/missing.log",
      absolutePath: join(tempDir, "no-such-file.log"),
      kind: "text",
    });
    expect(result.content).toBeNull();
    expect(result.bytes).toBe(0);
    expect(result.error).toBeTruthy();
  });
});

describe("collectLogSources", () => {
  it("aggregates multiple sources, preserving order", async () => {
    const aPath = join(tempDir, "a.log");
    const bPath = join(tempDir, "b.log");
    await writeFile(aPath, "alpha\n", "utf8");
    await writeFile(bPath, "beta\n", "utf8");

    const results = await collectLogSources([
      { name: "logs/a.log", absolutePath: aPath, kind: "text" },
      { name: "logs/b.log", absolutePath: bPath, kind: "text" },
      { name: "logs/missing.log", absolutePath: join(tempDir, "nope.log"), kind: "text" },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]?.name).toBe("logs/a.log");
    expect(results[0]?.content).toBe("alpha\n");
    expect(results[1]?.name).toBe("logs/b.log");
    expect(results[1]?.content).toBe("beta\n");
    expect(results[2]?.error).toBeTruthy();
  });
});

describe("findMacOSCrashReports", () => {
  it("returns an empty list on non-darwin platforms", async () => {
    if (process.platform === "darwin") return;
    const reports = await findMacOSCrashReports({
      matchSubstrings: ["open-design"],
      searchDirs: [tempDir],
    });
    expect(reports).toEqual([]);
  });
});
