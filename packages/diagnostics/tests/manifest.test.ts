import { arch, platform, release } from "node:os";

import { describe, expect, it } from "vitest";

import { buildMachineInfo, buildManifest, diagnosticsFileName } from "../src/manifest.js";
import type { CollectedFile } from "../src/sources.js";

describe("buildManifest", () => {
  it("returns a manifest with no files and no warnings for a minimal context", () => {
    const manifest = buildManifest(
      {
        app: { name: "open-design" },
        source: "test",
      },
      [],
    );
    expect(manifest.app.name).toBe("open-design");
    expect(manifest.source).toBe("test");
    expect(manifest.files).toEqual([]);
    expect(manifest.warnings).toEqual([]);
    expect(typeof manifest.exportedAt).toBe("string");
    expect(() => new Date(manifest.exportedAt).toISOString()).not.toThrow();
  });

  it("copies a single file entry into the manifest", () => {
    const file: CollectedFile = {
      name: "logs/daemon.log",
      absolutePath: "/tmp/daemon.log",
      content: "ok",
      bytes: 2,
    };
    const manifest = buildManifest(
      {
        app: { name: "open-design", version: "1.0.0", packaged: true },
        source: "daemon-http",
        namespace: "default",
        endpoint: "http://127.0.0.1:17456",
        daemonReachable: true,
      },
      [file],
    );
    expect(manifest.files).toEqual([
      { name: "logs/daemon.log", absolutePath: "/tmp/daemon.log", bytes: 2, error: undefined },
    ]);
    expect(manifest.endpoint).toBe("http://127.0.0.1:17456");
    expect(manifest.daemonReachable).toBe(true);
    expect(manifest.warnings).toEqual([]);
  });

  it("merges context warnings and per-file errors into the warnings array", () => {
    const files: CollectedFile[] = [
      { name: "logs/a.log", absolutePath: "/tmp/a.log", content: "x", bytes: 1 },
      { name: "logs/b.log", absolutePath: "/tmp/b.log", content: null, bytes: 0, error: "ENOENT" },
    ];
    const manifest = buildManifest(
      {
        app: { name: "open-design" },
        source: "desktop-ipc",
        warnings: ["file logs unavailable in this launch"],
      },
      files,
    );
    expect(manifest.warnings).toEqual([
      "file logs unavailable in this launch",
      "logs/b.log: ENOENT",
    ]);
  });
});

describe("buildMachineInfo", () => {
  it("returns a structurally-correct snapshot of the host", () => {
    const info = buildMachineInfo("alice");
    expect(info.platform).toBe(platform());
    expect(info.arch).toBe(arch());
    expect(info.release).toBe(release());
    expect(typeof info.hostname).toBe("string");
    expect(typeof info.totalMemoryBytes).toBe("number");
    expect(info.nodeVersion).toBe(process.version);
    expect(info.pid).toBe(process.pid);
    expect(info.username).toBe("alice");
  });

  it("accepts an undefined username", () => {
    const info = buildMachineInfo(undefined);
    expect(info.username).toBeUndefined();
  });
});

describe("diagnosticsFileName", () => {
  it("formats an explicit Date into a zip filename", () => {
    const fixed = new Date("2025-01-02T03:04:05.678Z");
    expect(diagnosticsFileName("open-design-diagnostics", fixed)).toBe(
      "open-design-diagnostics-2025-01-02T03-04-05Z.zip",
    );
  });

  it("falls back to the current date when no Date is provided", () => {
    const name = diagnosticsFileName("prefix");
    expect(name).toMatch(/^prefix-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.zip$/);
  });
});
