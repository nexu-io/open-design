import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { currentOfficialNodeTarget, validateOfficialNodeLock } from "@/runtime/startup/carrier/index.js";

describe("official Node carrier lock", () => {
  it("binds each archive and official URL to exactly its declared version and target", async () => {
    const lock = JSON.parse(await readFile(new URL("../../../../../../shells/electron/config/carriers/node-lock.json", import.meta.url), "utf8"));
    for (const mutate of [
      (value: typeof lock) => { value.version = "24.17.0"; },
      (value: typeof lock) => { value.targets["darwin-arm64"] = value.targets["darwin-x64"]; },
      (value: typeof lock) => { value.targets["darwin-arm64"].url = value.targets["darwin-arm64"].url.replace("/dist/", "/other/"); },
      (value: typeof lock) => { value.targets["darwin-arm64"].url += "?source=other"; },
      (value: typeof lock) => { value.targets["darwin-arm64"].url = value.targets["darwin-arm64"].url.replace("https://", "https://user:password@"); },
      (value: typeof lock) => { value.targets = []; },
      (value: typeof lock) => { value.targets = {}; },
      (value: typeof lock) => { value.targets["darwin-arm64"] = null; },
    ]) {
      const invalid = structuredClone(lock);
      mutate(invalid);
      expect(() => validateOfficialNodeLock(invalid)).toThrow();
    }
  });
  it("accepts the Shell-local lock and keeps the same source truth as Terminal", async () => {
    const [electron, terminal] = await Promise.all([
      readFile(new URL("../../../../../../shells/electron/config/carriers/node-lock.json", import.meta.url), "utf8"),
      readFile(new URL("../../../../../../shells/terminal/node-lock.json", import.meta.url), "utf8"),
    ]);
    expect(validateOfficialNodeLock(JSON.parse(electron))).toEqual(JSON.parse(terminal));
  });

  it("rejects untrusted sources and unsupported runtime targets", () => {
    expect(() => validateOfficialNodeLock({
      schemaVersion: 1,
      version: "24.18.0",
      targets: {
        "darwin-arm64": {
          archive: "node-v24.18.0-darwin-arm64.tar.gz",
          mediaType: "application/gzip",
          sha256: "a".repeat(64),
          url: "https://example.com/node-v24.18.0-darwin-arm64.tar.gz",
        },
      },
    })).toThrow(/source/u);
    expect(() => currentOfficialNodeTarget("linux", "x64")).toThrow(/does not support/u);
  });
});
