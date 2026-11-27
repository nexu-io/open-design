import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readLogTail } from "../src/fs.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Create a real log file, or leave its path absent for missing-file checks. */
async function logFixture(content?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "platform-log-tail-"));
  roots.push(root);
  const path = join(root, "daemon.log");
  if (content != null) await writeFile(path, content);
  return path;
}

describe("readLogTail", () => {
  // POSIX sparse files exercise Node's whole-file size limit without allocating
  // gigabytes of storage. Windows does not guarantee sparse extension here.
  it.skipIf(process.platform === "win32")("reads the tail beyond the whole-file read size limit", async () => {
    const path = await logFixture();
    const file = await open(path, "w");
    try {
      const tail = Buffer.from("\nearlier\nstartup failed\nError: runtime unavailable\n");
      await file.write(tail, 0, tail.byteLength, 2 ** 31);
      const stats = await file.stat();
      expect(stats.size).toBeGreaterThan(2 ** 31);
      expect(stats.blocks * 512).toBeLessThan(1024 * 1024);
    } finally {
      await file.close();
    }

    expect(await readLogTail(path, 2)).toEqual(["startup failed", "Error: runtime unavailable"]);
  });

  const longLine = "长い🙂".repeat(9000);
  const boundaryLine = "x".repeat(64 * 1024 - 2);
  it.each([
    { label: "empty log", content: "", expected: [] },
    {
      label: "CRLF and trailing blank lines",
      content: "first\r\n\r\nsecond\r\nthird\r\n\r\n",
      expected: ["second", "third"],
    },
    { label: "unterminated final line", content: "first\nsecond", expected: ["first", "second"] },
    { label: "whitespace-only lines", content: "first\n   \n\nlast\n", expected: ["   ", "last"] },
    { label: "standalone carriage returns", content: "first\nsecond\r\r\nlast\r", expected: ["second\r", "last\r"] },
    { label: "UTF-8 across read chunks", content: `prefix\n${longLine}\r\ntail\n`, expected: [longLine, "tail"] },
    { label: "CRLF across read chunks", content: `prefix\nkept\r\n${boundaryLine}\n`, expected: ["kept", boundaryLine] },
    {
      label: "blank lines across read chunks",
      content: `first\n${"\n".repeat(64 * 1024)}second\n${"\n".repeat(64 * 1024)}`,
      expected: ["first", "second"],
    },
  ])("preserves $label", async ({ content, expected }) => {
    const path = await logFixture(content);
    expect(await readLogTail(path, 2)).toEqual(expected);
  });

  it("keeps the last 80 non-empty lines by default", async () => {
    const lines = Array.from({ length: 100 }, (_, index) => `line ${index}`);
    const path = await logFixture(lines.join("\n"));
    expect(await readLogTail(path)).toEqual(lines.slice(-80));
  });

  it("returns no lines for a zero limit", async () => {
    const path = await logFixture("first\nsecond\n");
    expect(await readLogTail(path, 0)).toEqual([]);
  });

  it("returns no lines for a missing file", async () => {
    expect(await readLogTail(await logFixture(), 2)).toEqual([]);
  });
});
