import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { acquireNativeArtifacts } from "@/exact/native-acquisition.ts";
import { writeObject } from "@/exact/control-common.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it.each(["capsule", "platform"] as const)("requires fresh %s products without rebuilding or changing existing bytes", async product => {
  const root = await mkdtemp(join(tmpdir(), "native-acquisition-")); roots.push(root);
  const sources = join(root, "sources.json"), target = "darwin-arm64", output = join(root, "products");
  await writeObject(sources, { sources: [{ target }] });
  const input = { product, sources, output };
  await expect(acquireNativeArtifacts(input)).rejects.toMatchObject({ code: "ENOENT" });
  const directory = join(output, target); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, product === "capsule" ? "capsule-content.json" : "platform-resource.json"), "{}");
  await writeFile(join(directory, product + ".zip"), "unchanged");
  await acquireNativeArtifacts(input);
  expect(await readFile(join(directory, product + ".zip"), "utf8")).toBe("unchanged");
  for (const entries of [[], [{ target }, { target }], [{ target, artifact: null }], [{ target: "../escape" }]]) {
    await writeObject(sources, { sources: entries });
    await expect(acquireNativeArtifacts(input)).rejects.toThrow();
  }
});
