import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { standaloneTreeSha256 } from "../src/tree.js";
import { standaloneTreeSha256 as runtimeTreeSha256 } from "../src/blob.js";

it("shares the unchanged tree identity with runtime without mutating the inventory", () => {
  const entries = Object.freeze([
    Object.freeze({ path: "b", sha256: "b".repeat(64), size: 2 }),
    Object.freeze({ path: "a", sha256: "a".repeat(64), size: 1 }),
  ]);
  const canonical = JSON.stringify([
    { path: "a", sha256: "a".repeat(64), size: 1 },
    { path: "b", sha256: "b".repeat(64), size: 2 },
  ]) + "\n";
  expect(standaloneTreeSha256(entries)).toBe(createHash("sha256").update(canonical).digest("hex"));
  expect(runtimeTreeSha256).toBe(standaloneTreeSha256);
  expect(entries[0].path).toBe("b");
});
