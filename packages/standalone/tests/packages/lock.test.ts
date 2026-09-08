import { describe, expect, it } from "vitest";

import { currentOfficialNodeTarget } from "@/packages/runtime.js";
import { validateOfficialNodeLock } from "@/packages/lock.js";

function fixture(): any {
  return { schemaVersion: 1, version: "24.18.0", targets: Object.fromEntries(["darwin-arm64", "darwin-x64"].map(target => {
    const archive = `node-v24.18.0-${target}.tar.gz`;
    return [target, { archive, sha256: "a".repeat(64), mediaType: "application/gzip", url: `https://nodejs.org/dist/v24.18.0/${archive}` }];
  })) };
}

describe("official Node source lock", () => {
  it("binds each archive and official URL to exactly its declared version and target", async () => {
    const lock = fixture();
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
  it("accepts a locked official archive declaration", () => {
    const lock = fixture(); expect(validateOfficialNodeLock(lock)).toEqual(lock);
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
