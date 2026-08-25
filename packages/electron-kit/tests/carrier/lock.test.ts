import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { currentOfficialNodeTarget, validateOfficialNodeLock } from "@/carrier/index.js";

describe("official Node carrier lock", () => {
  it("accepts the Shell-local lock and keeps the same source truth as Terminal", async () => {
    const [electron, terminal] = await Promise.all([
      readFile(new URL("../../../../shells/electron/node-lock.json", import.meta.url), "utf8"),
      readFile(new URL("../../../../shells/terminal/node-lock.json", import.meta.url), "utf8"),
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
