import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  RotatingRendererLogWriter,
  serializeRendererLogEntry,
} from "../../src/main/renderer-log.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "open-design-renderer-log-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("RotatingRendererLogWriter", () => {
  test("serializes concurrent appends and rotates before the configured limit", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
    });
    const first = `${"a".repeat(30)}\n`;
    const second = `${"b".repeat(30)}\n`;
    const third = `${"c".repeat(30)}\n`;

    await expect(
      Promise.all([
        writer.append(first),
        writer.append(second),
        writer.append(third),
      ]),
    ).resolves.toEqual([true, true, true]);

    await expect(readFile(`${logPath}.1`, "utf8")).resolves.toBe(
      `${first}${second}`,
    );
    await expect(readFile(logPath, "utf8")).resolves.toBe(third);
    await expect(stat(logPath)).resolves.toMatchObject({ size: 31 });
  });

  test("bounds a pre-existing oversized log before writing a new entry", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const oldLines = ["a", "b", "c"].map(
      (letter) => `${letter.repeat(30)}\n`,
    );
    await writeFile(logPath, `${oldLines.join("")}partial`, "utf8");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
    });

    await expect(writer.initialize()).resolves.toBe(true);
    await expect(readFile(`${logPath}.1`, "utf8")).resolves.toBe(
      `${oldLines[1]}${oldLines[2]}`,
    );
    await expect(stat(logPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(writer.append("new\n")).resolves.toBe(true);

    await expect(readFile(`${logPath}.1`, "utf8")).resolves.toBe(
      `${oldLines[1]}${oldLines[2]}`,
    );
    await expect(stat(`${logPath}.1`)).resolves.toMatchObject({ size: 62 });
    await expect(readFile(logPath, "utf8")).resolves.toBe("new\n");
  });

  test("drops a crash-truncated trailing fragment before appending", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    await writeFile(logPath, "complete\npartial", "utf8");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
    });

    await expect(writer.append("new\n")).resolves.toBe(true);

    await expect(readFile(logPath, "utf8")).resolves.toBe(
      "complete\nnew\n",
    );
  });

  test("reconciles stale backup and temporary files on first append", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const backupPath = `${logPath}.1`;
    const temporaryBackupPath = `${backupPath}.tmp`;
    const backupLines = ["a", "b", "c"].map(
      (letter) => `${letter.repeat(30)}\n`,
    );
    await writeFile(logPath, "current\n", "utf8");
    await writeFile(backupPath, `${backupLines.join("")}partial`, "utf8");
    await writeFile(temporaryBackupPath, "stale temporary data", "utf8");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
    });

    await expect(writer.initialize()).resolves.toBe(true);
    await expect(writer.append("new\n")).resolves.toBe(true);

    await expect(readFile(backupPath, "utf8")).resolves.toBe(
      `${backupLines[1]}${backupLines[2]}`,
    );
    await expect(stat(backupPath)).resolves.toMatchObject({ size: 62 });
    await expect(stat(temporaryBackupPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(logPath, "utf8")).resolves.toBe(
      "current\nnew\n",
    );
  });

  test("flush waits for queued appends", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
    });

    void writer.append("first\n");
    void writer.append("second\n");
    await expect(writer.flush()).resolves.toBeUndefined();

    await expect(readFile(logPath, "utf8")).resolves.toBe(
      "first\nsecond\n",
    );
  });

  test("retains only the newest backup generation", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
    });
    const lines = ["a", "b", "c", "d", "e"].map(
      (letter) => `${letter.repeat(30)}\n`,
    );

    for (const line of lines) {
      await expect(writer.append(line)).resolves.toBe(true);
    }

    await expect(readFile(`${logPath}.1`, "utf8")).resolves.toBe(
      `${lines[2]}${lines[3]}`,
    );
    await expect(readFile(logPath, "utf8")).resolves.toBe(lines[4]);
  });

  test("contains file-system failures and can recover on a later append", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const backupPath = `${logPath}.1`;
    const onError = vi.fn();
    await writeFile(logPath, `${"x".repeat(70)}\n`, "utf8");
    await mkdir(backupPath);
    await writeFile(join(backupPath, "keep"), "occupied", "utf8");
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 80,
      onError,
    });

    await expect(writer.append(`${"y".repeat(20)}\n`)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    await rm(backupPath, { force: true, recursive: true });

    await expect(writer.append("recovered\n")).resolves.toBe(true);
    await expect(readFile(logPath, "utf8")).resolves.toBe("recovered\n");
  });

  test("rejects a single entry larger than the file limit without growing the log", async () => {
    const directory = await createTemporaryDirectory();
    const logPath = join(directory, "renderer.log");
    const onError = vi.fn();
    const writer = new RotatingRendererLogWriter({
      logPath,
      maxBytes: 10,
      onError,
    });

    await expect(writer.append("x".repeat(11))).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    await expect(writer.append("ok\n")).resolves.toBe(true);
    await expect(readFile(logPath, "utf8")).resolves.toBe("ok\n");
  });
});

describe("serializeRendererLogEntry", () => {
  test("preserves entries that fit within the line budget", () => {
    const line = serializeRendererLogEntry(
      {
        timestamp: "2026-07-19T00:00:00.000Z",
        level: "error",
        text: "failed to fetch",
      },
      512,
    );

    expect(JSON.parse(line)).toEqual({
      timestamp: "2026-07-19T00:00:00.000Z",
      level: "error",
      text: "failed to fetch",
    });
    expect(line.endsWith("\n")).toBe(true);
  });

  test("truncates oversized UTF-8 text while keeping valid bounded JSONL", () => {
    const line = serializeRendererLogEntry(
      {
        timestamp: "2026-07-19T00:00:00.000Z",
        level: "error",
        text: `${"😀\\\"".repeat(200)}tail`,
      },
      220,
    );

    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(220);
    const parsed = JSON.parse(line) as { text: string };
    expect(parsed.text).toContain("[truncated from");
    const markerIndex = parsed.text.indexOf("… [truncated from");
    const finalPrefixCodeUnit = parsed.text.charCodeAt(markerIndex - 1);
    expect(
      finalPrefixCodeUnit >= 0xd800 && finalPrefixCodeUnit <= 0xdbff,
    ).toBe(false);
    expect(line.endsWith("\n")).toBe(true);
  });
});

const runtimeSource = readFileSync(
  new URL("../../src/main/runtime.ts", import.meta.url),
  "utf8",
);
const rendererLogWiring =
  /const rendererLogPath = options\.rendererLogPath[\s\S]*?\n  \};/.exec(
    runtimeSource,
  )?.[0] ?? "";

describe("renderer log runtime wiring", () => {
  test("routes renderer entries through the bounded writer", () => {
    expect(rendererLogWiring).toContain("new RotatingRendererLogWriter(");
    expect(rendererLogWiring).toContain("void rendererLogWriter?.initialize();");
    expect(rendererLogWiring).toContain("serializeRendererLogEntry(");
    expect(rendererLogWiring).toContain("void rendererLogWriter.append(line);");
    expect(rendererLogWiring).not.toContain("appendFile(");
  });

  test("keeps persistence limited to Electron warning and error entries", () => {
    expect(rendererLogWiring).toContain('entry.level !== "error"');
    expect(rendererLogWiring).toContain('entry.level !== "warn"');
    expect(rendererLogWiring).toContain('entry.level !== "warning"');
  });

  test("flushes queued entries before closing desktop windows", () => {
    const closeBlock =
      /async close\(\) \{([\s\S]*?)\n    \},/.exec(runtimeSource)?.[0] ?? "";
    const flushIndex = closeBlock.indexOf("await rendererLogWriter?.flush();");
    const closeIndex = closeBlock.indexOf("window.close()");
    expect(flushIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(flushIndex);
  });
});
