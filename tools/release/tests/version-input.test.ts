import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { freezeVersionInput, type VersionInputStore } from "@/exact/version-input.ts";
import { canonicalBytes, type JsonObject } from "@/exact/control-common.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(previous: Buffer | null = null) {
  const root = await mkdtemp(join(tmpdir(), "version-input-")); roots.push(root);
  return { directory: join(root, "frozen"), selection: { channel: "betahyx", releaseVersion: "0.1.0-betahyx.21", products: { capsule: "a".repeat(64) } },
    acquirePrevious: vi.fn(async () => previous) };
}
it("freezes absence as well as presence without rereading a moving channel head", async () => {
  for (const prior of [null, Buffer.from("original signed metadata")]) {
    const f = await fixture(prior), original = await freezeVersionInput(f);
    f.acquirePrevious.mockRejectedValue(new Error("latest has moved"));
    expect(await freezeVersionInput(f)).toBe(original);
    expect(f.acquirePrevious).toHaveBeenCalledTimes(1);
    if (original != null) expect(await readFile(original)).toEqual(prior);
  }
});
it("refuses a changed product selection instead of replacing the version snapshot", async () => {
  const f = await fixture(); await freezeVersionInput(f);
  await expect(freezeVersionInput({ ...f, selection: { ...f.selection, products: { capsule: "b".repeat(64) } } })).rejects.toThrow("differs");
  expect(f.acquirePrevious).toHaveBeenCalledTimes(1);
});
it("fails closed on baseline corruption and explicit baseline replacement", async () => {
  const f = await fixture(Buffer.from("original")), prior = await freezeVersionInput(f);
  const replacement = join(roots.at(-1)!, "replacement.json"); await writeFile(replacement, "replacement");
  await expect(freezeVersionInput({ ...f, previousContentFile: replacement })).rejects.toThrow("explicit input");
  await writeFile(prior!, "corrupt");
  await expect(freezeVersionInput(f)).rejects.toThrow("binding verification failed");
});
it("recovers a persisted version on a fresh runner without selecting latest again", async () => {
  let stored: JsonObject | undefined;
  const store: VersionInputStore = { read: async () => stored, create: async value => {
    if (stored != null && !canonicalBytes(stored).equals(canonicalBytes(value))) throw new Error("immutable collision");
    stored = value;
  } };
  const f = await fixture(Buffer.from("original signed baseline"));
  await freezeVersionInput({ ...f, store });
  f.acquirePrevious.mockRejectedValue(new Error("must not read latest"));
  const recovered = await freezeVersionInput({ ...f, directory: join(roots.at(-1)!, "fresh-runner"), store });
  expect(await readFile(recovered!, "utf8")).toBe("original signed baseline");
  expect(f.acquirePrevious).toHaveBeenCalledTimes(1);
  await expect(freezeVersionInput({ ...f, directory: join(roots.at(-1)!, "changed"), store,
    selection: { ...f.selection, releaseVersion: "0.1.0-betahyx.22" } })).rejects.toThrow("differs");
});
