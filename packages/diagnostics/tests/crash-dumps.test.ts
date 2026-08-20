import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectLogSource, findCrashDumps } from "../src/sources.js";
import { buildDiagnosticsZip } from "../src/zip.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "diagnostics-crash-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// Bytes that do NOT round-trip through UTF-8 decode/encode, so a corrupting
// text path (decode → redact → re-encode) is detectable.
const RAW_DUMP_BYTES = Buffer.from([0x4d, 0x44, 0x4d, 0x50, 0x00, 0xff, 0xfe, 0x80, 0x81, 0x00, 0x0a, 0x1b]);

describe("findCrashDumps", () => {
  it("collects .dmp files from the dir and its completed/ subdir as binary sources", async () => {
    await writeFile(join(tempDir, "a.dmp"), RAW_DUMP_BYTES);
    await mkdir(join(tempDir, "completed"), { recursive: true });
    await writeFile(join(tempDir, "completed", "b.dmp"), RAW_DUMP_BYTES);
    await writeFile(join(tempDir, "notes.txt"), "not a dump");

    const sources = await findCrashDumps({ dir: tempDir });
    const names = sources.map((s) => s.name).sort();
    expect(names).toEqual(["crash-dumps/a.dmp", "crash-dumps/b.dmp"]);
    expect(sources.every((s) => s.kind === "binary")).toBe(true);
    // The .txt is not a dump and must not be swept in.
    expect(names.some((n) => n.includes("notes"))).toBe(false);
  });

  it("returns nothing for a missing directory instead of throwing", async () => {
    await expect(findCrashDumps({ dir: join(tempDir, "does-not-exist") })).resolves.toEqual([]);
  });

  it("caps the number of dumps to maxDumps", async () => {
    for (let i = 0; i < 5; i += 1) await writeFile(join(tempDir, `d${i}.dmp`), RAW_DUMP_BYTES);
    const sources = await findCrashDumps({ dir: tempDir, maxDumps: 2 });
    expect(sources).toHaveLength(2);
  });
});

describe("collectLogSource — binary", () => {
  it("copies the bytes verbatim without text decoding or redaction", async () => {
    const dumpPath = join(tempDir, "crash.dmp");
    await writeFile(dumpPath, RAW_DUMP_BYTES);
    const collected = await collectLogSource({
      name: "crash-dumps/crash.dmp",
      absolutePath: dumpPath,
      kind: "binary",
    });
    expect(Buffer.isBuffer(collected.content)).toBe(true);
    expect(collected.content).toEqual(RAW_DUMP_BYTES);
    expect(collected.bytes).toBe(RAW_DUMP_BYTES.length);
  });
});

describe("buildDiagnosticsZip — crashDumps", () => {
  it("includes the minidump bytes intact in the zip", async () => {
    await writeFile(join(tempDir, "renderer.dmp"), RAW_DUMP_BYTES);
    const result = await buildDiagnosticsZip({
      context: { app: { name: "open-design", packaged: true }, source: "test" },
      sources: [],
      crashDumps: { dir: tempDir },
    });
    const zip = await JSZip.loadAsync(result.zip);
    const entry = zip.file("crash-dumps/renderer.dmp");
    expect(entry).not.toBeNull();
    const bytes = Buffer.from(await entry!.async("uint8array"));
    expect(bytes).toEqual(RAW_DUMP_BYTES);
  });
});
