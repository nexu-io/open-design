import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { managedDownload, pruneManagedDownloads, removeManagedDownload } from "../src/index.js";

const race = vi.hoisted(() => ({ bucket: "" }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const publish = async (path: unknown) => {
    if (path === race.bucket) await actual.writeFile(join(race.bucket, "concurrent.bin"), "concurrent publication");
  };
  return { ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => { await publish(args[0]); return actual.rm(...args); },
    rmdir: async (...args: Parameters<typeof actual.rmdir>) => { await publish(args[0]); return actual.rmdir(...args); },
  };
});

const roots: string[] = [];
afterEach(async () => { race.bucket = ""; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it.each(["remove", "prune"] as const)("%s cannot erase a concurrent publication when an empty bucket becomes nonempty", async operation => {
  const basePath = await mkdtemp(join(tmpdir(), "download-bucket-race-")); roots.push(basePath);
  const target = { basePath, bucket: "builds", fileName: "previous.bin" };
  await managedDownload({ ...target, payload: { url: "https://example.test/previous", checksum: {
    algorithm: "sha256", value: createHash("sha256").update("previous").digest("hex") } }, fetch: async () => new Response("previous") });
  if (operation === "prune") {
    await removeManagedDownload(target);
    await mkdir(join(basePath, target.bucket));
  }
  race.bucket = join(basePath, target.bucket);
  if (operation === "remove") await removeManagedDownload(target);
  else await pruneManagedDownloads({ basePath });
  expect(await readFile(join(race.bucket, "concurrent.bin"), "utf8")).toBe("concurrent publication");
});
