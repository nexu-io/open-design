import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { managedDownload, pruneManagedDownloads, removeManagedDownload } from "../src/index.js";

const race = vi.hoisted(() => ({ bucket: "", removedFile: "", promotion: "", beforePromotion: null as null | (() => Promise<void>) }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      await actual.rm(...args);
      if (args[0] === race.removedFile) await actual.writeFile(join(race.bucket, "concurrent.bin"), "concurrent publication");
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (args[1] === race.promotion && race.beforePromotion != null) {
        const intervene = race.beforePromotion;
        race.beforePromotion = null;
        await intervene();
      }
      return actual.rename(...args);
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  race.bucket = ""; race.removedFile = ""; race.promotion = ""; race.beforePromotion = null;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it.each(["remove", "prune"] as const)("%s cannot erase a concurrent publication when an empty bucket becomes nonempty", async operation => {
  const basePath = await mkdtemp(join(tmpdir(), "download-bucket-race-")); roots.push(basePath);
  const target = { basePath, bucket: "builds", fileName: "previous.bin" };
  await managedDownload({ ...target, payload: { url: "https://example.test/previous", checksum: {
    algorithm: "sha256", value: createHash("sha256").update("previous").digest("hex") } }, fetch: async () => new Response("previous") });
  race.bucket = join(basePath, target.bucket);
  race.removedFile = join(race.bucket, target.fileName);
  if (operation === "remove") await removeManagedDownload(target);
  else await pruneManagedDownloads({ basePath, now: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) });
  expect(await readFile(join(race.bucket, "concurrent.bin"), "utf8")).toBe("concurrent publication");
});

it.each(["remove", "prune"] as const)("%s keeps an empty bucket stable during another target's final promotion", async operation => {
  const basePath = await mkdtemp(join(tmpdir(), "download-promotion-race-")); roots.push(basePath);
  const target = { basePath, bucket: "builds", fileName: "previous.bin" };
  const payload = { url: "https://example.test/payload", checksum: {
    algorithm: "sha256" as const, value: createHash("sha256").update("payload").digest("hex") } };
  await managedDownload({ ...target, payload, fetch: async () => new Response("payload") });
  if (operation === "prune") await removeManagedDownload(target);
  race.promotion = join(basePath, "builds", "next.bin");
  // Exact interleaving: next has created its destination directory and verified
  // its bytes, then a different target finishes cleanup before atomic rename.
  race.beforePromotion = async () => {
    if (operation === "remove") await removeManagedDownload(target);
    else await pruneManagedDownloads({ basePath });
  };
  const next = await managedDownload({ ...target, fileName: "next.bin", payload, maxAttempts: 1, fetch: async () => new Response("payload") });
  expect(await readFile(next.path, "utf8")).toBe("payload");
});
