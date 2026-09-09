import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { afterEach, expect, it } from "vitest";
import { CAPSULE_RELEASE_BUDGET, verifyCapsuleReleaseBudget } from "../src/exact/capsule-budget.ts";
import { capsuleFixture } from "./capsule-fixture.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function file(bytes: Buffer) {
  const root = await mkdtemp(join(tmpdir(), "capsule-budget-")); roots.push(root);
  const path = join(root, "capsule.zip"); await writeFile(path, bytes); return path;
}

it("measures verified payload bytes and binds the policy revision", async () => {
  const fixture = await capsuleFixture("local first screen");
  expect(await verifyCapsuleReleaseBudget(await file(fixture.bytes), fixture.archive)).toEqual({
    budget: CAPSULE_RELEASE_BUDGET, files: 1, archiveBytes: fixture.bytes.length,
    expandedBytes: 18, sha256: fixture.archive.sha256, treeSha256: fixture.archive.treeSha256,
  });
});

it("rejects oversized archives before parsing and independently verifies both digests", async () => {
  const fixture = await capsuleFixture();
  await expect(verifyCapsuleReleaseBudget(await file(Buffer.alloc(CAPSULE_RELEASE_BUDGET.archiveBytes + 1)), fixture.archive)).rejects.toThrow("archive bytes");
  const path = await file(fixture.bytes);
  await expect(verifyCapsuleReleaseBudget(path, { ...fixture.archive, sha256: "0".repeat(64) })).rejects.toThrow("archive binding");
  await expect(verifyCapsuleReleaseBudget(path, { ...fixture.archive, treeSha256: "0".repeat(64) })).rejects.toThrow("tree binding");
});

it.each(["file-count", "expanded-bytes", "traversal", "symlink"])("rejects %s even with a matching archive digest", async reason => {
  const zip = new JSZip();
  if (reason === "file-count") {
    for (let i = 0; i <= CAPSULE_RELEASE_BUDGET.files; i++) zip.file(`${i}.cjs`, "x");
  } else if (reason === "expanded-bytes") zip.file("capsule.cjs", Buffer.alloc(CAPSULE_RELEASE_BUDGET.expandedBytes + 1));
  else if (reason === "traversal") zip.file("../capsule.cjs", "x", { createFolders: false });
  else zip.file("capsule.cjs", "target", { unixPermissions: 0o120777 });
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" });
  await expect(verifyCapsuleReleaseBudget(await file(bytes), { sha256: sha(bytes), size: bytes.length, treeSha256: "0".repeat(64) }))
    .rejects.toThrow(reason === "file-count" ? "file count" : reason === "expanded-bytes" ? "expanded bytes" : "payload entry");
});

it("accepts the exact expanded-byte limit without allocating the expansion in the verifier", async () => {
  const module = Buffer.alloc(CAPSULE_RELEASE_BUDGET.expandedBytes);
  const zip = new JSZip(); zip.file("capsule.cjs", module);
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const result = await verifyCapsuleReleaseBudget(await file(bytes), { sha256: sha(bytes), size: bytes.length,
    treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", size: module.length, sha256: sha(module) }]) });
  expect(result.expandedBytes).toBe(CAPSULE_RELEASE_BUDGET.expandedBytes);
});
