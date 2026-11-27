import assert from "node:assert/strict";
import fs, { type FileHandle } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, it } from "vitest";

import { collectLogSource } from "../src/sources.js";

const originalOpen = fs.open;
let directory: string;
let logPath: string;
let handles: FileHandle[];
let beforeOpen: (() => Promise<void>) | undefined;
let afterOpen: ((handle: FileHandle) => Promise<void>) | undefined;

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), "diagnostics-sources-"));
  logPath = join(directory, "renderer.log");
  handles = [];
  beforeOpen = undefined;
  afterOpen = undefined;
  fs.open = async (...args) => {
    if (args[0] !== logPath) return originalOpen(...args);
    await beforeOpen?.();
    const handle = await originalOpen(...args);
    handles.push(handle);
    await afterOpen?.(handle);
    return handle;
  };
  syncBuiltinESMExports();
});

afterEach(async () => {
  fs.open = originalOpen;
  syncBuiltinESMExports();
  try {
    for (const handle of handles) {
      assert.equal(handle.fd, -1, "the collector must close every opened file");
    }
  } finally {
    await Promise.all(handles.map((handle) => handle.close()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function collect(tailBytes: number) {
  return collectLogSource({
    name: "logs/desktop/renderer.log",
    absolutePath: logPath,
    kind: "text",
    tailBytes,
  });
}

for (const [label, replacement, expected] of [
  ["small", "new log\n", "new log\n"],
  ["large", `${"earlier\n".repeat(20)}new tail\n`, "new tail\n"],
] as const) {
  it(`reads the ${label} replacement when the log rotates before open`, async () => {
    await fs.writeFile(logPath, `${"old entry\n".repeat(200)}old tail\n`);
    beforeOpen = async () => {
      await fs.rename(logPath, `${logPath}.1`);
      await fs.writeFile(logPath, replacement);
    };

    const result = await collect(12);

    assert.equal(handles.length, 1);
    assert.equal(result.error, undefined);
    assert.equal(result.content, expected);
    assert.equal(result.bytes, Buffer.byteLength(expected));
  });
}

it("keeps the opened log when its path is replaced after open", async () => {
  await fs.writeFile(logPath, `${"old entry\n".repeat(20)}old tail\n`);
  afterOpen = async () => {
    await fs.rename(logPath, `${logPath}.1`);
    await fs.writeFile(logPath, "new log\n");
  };

  const result = await collect(12);

  assert.equal(result.error, undefined);
  assert.equal(result.content, "old tail\n");
  assert.equal(await fs.readFile(logPath, "utf8"), "new log\n");
});

it("keeps small files whole and redacts their contents", async () => {
  const content = "GET /api?token=secret ok\n";
  await fs.writeFile(logPath, content);

  const result = await collect(64);

  assert.equal(result.content, "GET /api?token=[REDACTED] ok\n");
  assert.equal(result.bytes, Buffer.byteLength(content));
});

it("bounds a small log to its observed size while new entries are appended", async () => {
  const initial = "initial log\n";
  await fs.writeFile(logPath, initial);
  afterOpen = async (handle) => {
    const stat = handle.stat.bind(handle);
    handle.stat = (async () => {
      const info = await stat();
      await fs.appendFile(logPath, "later entry\n".repeat(128));
      return info;
    }) as typeof handle.stat;
  };

  const result = await collect(64);

  assert.equal(result.content, initial);
  assert.equal(result.bytes, Buffer.byteLength(initial));
  assert.ok((await fs.stat(logPath)).size > 64);
});

for (const extraBytes of [0, 2]) {
  it(`preserves complete UTF-8 lines with ${extraBytes} extra bytes before the boundary`, async () => {
    const tail = "最新记录\n";
    await fs.writeFile(logPath, `older record\n${tail}`);

    const result = await collect(Buffer.byteLength(tail) + extraBytes);

    assert.equal(result.error, undefined);
    assert.equal(result.content, tail);
    assert.equal(result.bytes, Buffer.byteLength(tail));
  });
}

it("finishes the bounded window when a file read returns fewer bytes", async () => {
  const tail = "retained line\n";
  await fs.writeFile(logPath, `discarded line\n${tail}`);
  afterOpen = async (handle) => {
    const read = handle.read.bind(handle);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      return read(buffer, offset, Math.min(length, 3), position);
    }) as typeof handle.read;
  };

  const result = await collect(Buffer.byteLength(tail));

  assert.equal(result.error, undefined);
  assert.equal(result.content, tail);
  assert.equal(result.bytes, Buffer.byteLength(tail));
});

it("reports an oversized record instead of exporting a partial line", async () => {
  await fs.writeFile(logPath, "x".repeat(128));

  const result = await collect(12);

  assert.equal(result.content, null);
  assert.equal(result.bytes, 0);
  assert.match(result.error!, /no complete line fits/);
});

for (const method of ["stat", "read"] as const) {
  it(`closes the file when ${method} fails`, async () => {
    await fs.writeFile(logPath, "old log\n".repeat(20));
    afterOpen = async (handle) => {
      handle[method] = async () => { throw new Error("synthetic read failure"); };
    };

    const result = await collect(12);

    assert.equal(result.content, null);
    assert.equal(result.error, "synthetic read failure");
  });
}

it("keeps empty files empty", async () => {
  await fs.writeFile(logPath, "");

  const result = await collect(12);

  assert.equal(result.error, undefined);
  assert.equal(result.content, "");
  assert.equal(result.bytes, 0);
});
