import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ElectronRuntimeLog } from "@/runtime/logging.js";

describe("Electron runtime diagnostics", () => {
  it("writes one ordered attempt without making Error details opaque", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-runtime-log-"));
    try {
      const log = new ElectronRuntimeLog(root);
      log.write("preflight.complete", { pid: 42 });
      log.write("startup.failed", { error: new Error("fixture failed") });
      await log.flush();
      const records = (await readFile(log.path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(records.map((record) => record.sequence)).toEqual([0, 1]);
      expect(new Set(records.map((record) => record.attemptId))).toEqual(new Set([log.attemptId]));
      expect(records[1]).toMatchObject({ event: "startup.failed", details: { error: { message: "fixture failed" } } });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
