import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildDiagnosticsZip } from "../src/zip.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "diagnostics-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("buildDiagnosticsZip", () => {
  it("packages logs with redacted manifest and machine info", async () => {
    const logPath = join(tempDir, "daemon.log");
    await writeFile(logPath, "GET /api?token=abc123 ok\n", "utf8");

    const result = await buildDiagnosticsZip({
      context: {
        app: { name: "open-design", version: "1.2.3", packaged: false },
        source: "test",
        namespace: "default",
      },
      sources: [{ name: "logs/daemon/latest.log", absolutePath: logPath, kind: "text" }],
      redaction: { username: "alice" },
    });

    const zip = await JSZip.loadAsync(result.zip);
    const log = await zip.file("logs/daemon/latest.log")!.async("string");
    expect(log).toContain("token=[REDACTED]");

    const manifest = JSON.parse(await zip.file("summary/manifest.json")!.async("string"));
    expect(manifest.app.name).toBe("open-design");
    expect(manifest.namespace).toBe("default");
    expect(manifest.files[0].name).toBe("logs/daemon/latest.log");
    expect(manifest.warnings).toEqual([]);

    const machine = JSON.parse(await zip.file("summary/machine-info.json")!.async("string"));
    expect(typeof machine.platform).toBe("string");
    expect(machine.hostname).toBe("[REDACTED]");
    expect(machine.username).toBe("[REDACTED]");
  });

  it("includes redacted in-memory summaries for failures that happened before a run existed", async () => {
    const result = await buildDiagnosticsZip({
      context: { app: { name: "open-design" }, source: "test" },
      sources: [],
      redaction: { username: "alice" },
      summaries: {
        "runtime-health.json": {
          amr: { sessionState: "reauth_required", credentialRevision: "safe-digest" },
          note: "/Users/alice/private",
        },
      },
    });

    const zip = await JSZip.loadAsync(result.zip);
    const runtimeHealth = await zip.file("summary/runtime-health.json")!.async("string");
    expect(runtimeHealth).toContain('"sessionState": "reauth_required"');
    expect(runtimeHealth).toContain('/Users/<USER>/private');
    expect(runtimeHealth).not.toContain('/Users/alice');
  });

  it("records a warning placeholder when a file cannot be read", async () => {
    const result = await buildDiagnosticsZip({
      context: {
        app: { name: "open-design" },
        source: "test",
      },
      sources: [{ name: "logs/missing.log", absolutePath: join(tempDir, "no-such.log"), kind: "text" }],
    });

    const zip = await JSZip.loadAsync(result.zip);
    const placeholder = await zip.file("logs/missing.log")!.async("string");
    expect(placeholder).toContain("file unavailable");
    expect(result.manifest.warnings.length).toBe(1);
  });
});
