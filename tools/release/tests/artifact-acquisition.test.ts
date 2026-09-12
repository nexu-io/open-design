import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { openArtifactProduct } from "@/exact/artifact-acquisition.ts";
import { zipFixture } from "./archive-fixture.ts";

afterEach(() => vi.unstubAllGlobals());
it.each([false, true])("disposes the private native product tree after consumer failure=%s", async fail => {
  const root = await mkdtemp(join(tmpdir(), "product-lifetime-test-"));
  try {
    const bytes = await zipFixture({ "receipt.json": "{}" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes))));
    let privateTree = "";
    const consume = async () => {
      await using product = await openArtifactProduct({ url: "https://cache.example/product.zip", sha256: createHash("sha256").update(bytes).digest("hex") });
      privateTree = product.archive.root;
      expect(await readFile(join(privateTree, "receipt.json"), "utf8")).toBe("{}");
      if (fail) throw new Error("consumer rejected receipt");
    };
    if (fail) await expect(consume()).rejects.toThrow("consumer rejected receipt");
    else await consume();
    expect(privateTree).not.toBe("");
    await expect(stat(privateTree)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
