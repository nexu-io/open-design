import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildAgentCliLogSources, buildRunEventLogSources } from "../src/agent-logs.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "diagnostics-agent-logs-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function touch(path: string, content = "x"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

describe("buildRunEventLogSources", () => {
  it("returns [] when no runs dir", async () => {
    expect(await buildRunEventLogSources(null)).toEqual([]);
    expect(await buildRunEventLogSources(join(tempDir, "missing"))).toEqual([]);
  });

  it("collects the most-recent per-run events.jsonl, newest first", async () => {
    const runsDir = join(tempDir, "runs");
    await touch(join(runsDir, "run-a", "events.jsonl"), "a");
    await touch(join(runsDir, "run-b", "events.jsonl"), "b");
    // Directory without events.jsonl is skipped.
    await mkdir(join(runsDir, "run-empty"), { recursive: true });

    const sources = await buildRunEventLogSources(runsDir, { maxRuns: 5 });
    const names = sources.map((s) => s.name).sort();
    expect(names).toEqual(["runs/run-a/events.jsonl", "runs/run-b/events.jsonl"]);
    for (const source of sources) {
      expect(source.kind).toBe("text");
      expect(source.tailBytes).toBeGreaterThan(0);
    }
  });

  it("caps the number of runs", async () => {
    const runsDir = join(tempDir, "runs");
    for (let i = 0; i < 5; i += 1) {
      await touch(join(runsDir, `run-${i}`, "events.jsonl"), String(i));
    }
    const sources = await buildRunEventLogSources(runsDir, { maxRuns: 2 });
    expect(sources).toHaveLength(2);
  });
});

describe("buildAgentCliLogSources", () => {
  it("collects claude / codex / opencode / amr log files under their known dirs", async () => {
    const home = join(tempDir, "home");
    const dataDir = join(tempDir, "data");
    await touch(join(home, ".claude", "daemon.log"));
    await touch(join(home, ".codex", "log", "codex-tui.log"));
    await touch(join(home, ".local", "share", "opencode", "log", "2026-01-01T00.log"));
    await touch(
      join(dataDir, "amr", "opencode-home", ".local", "share", "opencode", "log", "2026-01-02T00.log"),
    );
    // Secret-bearing files outside *.log dirs must NOT be swept.
    await touch(join(home, ".codex", "auth.json"), "secret");
    await touch(join(home, ".amr", "config.json"), "secret");

    const sources = await buildAgentCliLogSources({ homeDir: home, dataDir });
    const names = sources.map((s) => s.name);

    expect(names).toContain("agent-cli-logs/claude/daemon.log");
    expect(names).toContain("agent-cli-logs/codex/codex-tui.log");
    expect(names).toContain("agent-cli-logs/opencode/2026-01-01T00.log");
    expect(names).toContain("agent-cli-logs/amr/2026-01-02T00.log");
    // No secrets, and only *.log files.
    expect(names.some((n) => n.includes("auth.json"))).toBe(false);
    expect(names.some((n) => n.includes("config.json"))).toBe(false);
    for (const source of sources) {
      expect(source.name.endsWith(".log")).toBe(true);
      expect(source.tailBytes).toBeGreaterThan(0);
    }
  });

  it("honors an explicit amrOpenCodeHome override over the dataDir default", async () => {
    const home = join(tempDir, "home");
    const dataDir = join(tempDir, "data");
    const overrideHome = join(tempDir, "custom-amr-home");
    // Default location has a log, but the override points elsewhere — only the
    // override's logs should be swept (mirrors a user OPENCODE_TEST_HOME).
    await touch(
      join(dataDir, "amr", "opencode-home", ".local", "share", "opencode", "log", "default.log"),
    );
    await touch(
      join(overrideHome, ".local", "share", "opencode", "log", "override.log"),
    );

    const sources = await buildAgentCliLogSources({ homeDir: home, dataDir, amrOpenCodeHome: overrideHome });
    const amrNames = sources.filter((s) => s.name.startsWith("agent-cli-logs/amr/")).map((s) => s.name);
    expect(amrNames).toContain("agent-cli-logs/amr/override.log");
    expect(amrNames).not.toContain("agent-cli-logs/amr/default.log");
  });

  it("honors claudeConfigDir / codexHome overrides over the home defaults", async () => {
    const home = join(tempDir, "home");
    const claudeDir = join(tempDir, "custom-claude");
    const codexHome = join(tempDir, "custom-codex");
    // Default homes have logs that must be ignored when overrides are set.
    await touch(join(home, ".claude", "daemon.log"));
    await touch(join(home, ".codex", "log", "codex-tui.log"));
    await touch(join(claudeDir, "cost-tracker.log"));
    await touch(join(codexHome, "log", "session.log"));

    const sources = await buildAgentCliLogSources({ homeDir: home, claudeConfigDir: claudeDir, codexHome });
    const names = sources.map((s) => s.name);
    expect(names).toContain("agent-cli-logs/claude/cost-tracker.log");
    expect(names).toContain("agent-cli-logs/codex/session.log");
    expect(names).not.toContain("agent-cli-logs/claude/daemon.log");
    expect(names).not.toContain("agent-cli-logs/codex/codex-tui.log");
  });

  it("honors XDG_DATA_HOME for the opencode user log dir", async () => {
    const home = join(tempDir, "home");
    const xdg = join(tempDir, "xdg");
    await touch(join(xdg, "opencode", "log", "session.log"));

    const sources = await buildAgentCliLogSources({ homeDir: home, xdgDataHome: xdg });
    expect(sources.map((s) => s.name)).toContain("agent-cli-logs/opencode/session.log");
  });

  it("returns [] when homeDir is empty", async () => {
    expect(await buildAgentCliLogSources({ homeDir: "" })).toEqual([]);
  });
});
