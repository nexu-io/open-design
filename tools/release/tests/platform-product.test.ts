import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { preparePlatformProduct } from "@/exact/platform-product.ts";
import { writePlatformFixture } from "./capsule-fixture.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-platform-")); roots.push(root);
  return { ...await writePlatformFixture(join(root, "producer")),
    outputDirectory: join(root, "prepared"), artifactBaseUrl: "https://release.invalid/betahyx/0.1.0-betahyx.1" };
}

it("promotes exact neutral bytes to an immutable version source without modifying producer metadata", async () => {
  const input = await fixture(), before = await readFile(input.resourceFile, "utf8");
  const result = await preparePlatformProduct(input);
  expect(await readFile(result.archive.file)).toEqual(await readFile(input.archiveFile));
  expect(result.resource.blob.sources).toEqual([{ kind: "remote",
    url: `${input.artifactBaseUrl}/platform-darwin-arm64-${result.archive.sha256}.zip` }]);
  expect(await readFile(input.resourceFile, "utf8")).toBe(before);
  expect(result.resource).not.toHaveProperty("version");
  expect(result.resource).not.toHaveProperty("channel");
});

it.each(["target", "bytes", "sources"])("rejects a mismatched platform product (%s)", async kind => {
  const input = await fixture();
  if (kind === "target") input.target = "darwin-x64";
  if (kind === "bytes") await writeFile(input.archiveFile, "substitution");
  if (kind === "sources") {
    const resource = JSON.parse(await readFile(input.resourceFile, "utf8"));
    resource.blob.sources = [{ kind: "remote", url: "https://invalid.test/latest" }];
    await writeFile(input.resourceFile, JSON.stringify(resource));
  }
  await expect(preparePlatformProduct(input)).rejects.toThrow("binding mismatch");
});
