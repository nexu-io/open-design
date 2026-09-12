import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stageArtifactProduct } from "@/exact/artifact-staging.ts";

it.each([false, true])("commits only complete product trees and cleans staging on failure=%s", async fail => {
  const root = await mkdtemp(join(tmpdir(), "artifact-staging-test-"));
  try {
    const output = join(root, "product");
    const pending = stageArtifactProduct(output, async stage => {
      await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
      await writeFile(join(stage, "result.json"), "{}");
      if (fail) throw new Error("producer failed");
    });
    if (fail) {
      await expect(pending).rejects.toThrow("producer failed");
      expect(await readdir(root)).toEqual([]);
    } else {
      await pending;
      expect(await readFile(join(output, "result.json"), "utf8")).toBe("{}");
      expect(await readdir(root)).toEqual(["product"]);
      await expect(stageArtifactProduct(output, async () => { throw new Error("must not run"); }))
        .rejects.toThrow("destination already exists");
      expect(await readFile(join(output, "result.json"), "utf8")).toBe("{}");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
