import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { afterEach, expect, it } from "vitest";
import { composeReleaseDataResources } from "@/exact/resource-composition.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

it("composes all independent data products without reading superseded seeds or rebuilding runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-data-compose-")); roots.push(root);
  const files: string[] = [];
  for (const { id } of CLOSURE_DATA_RESOURCES) {
    const directory = join(root, id); await mkdir(directory);
    const file = `${id}-${digest(id)}.zip`;
    await writeFile(join(directory, file), id);
    const receipt = join(directory, "receipt.json"); files.push(receipt);
    await writeFile(receipt, JSON.stringify({ schemaVersion: 1, operation: "closure.data-resource.build", resource: {
      id, file, path: `/previous-job/${file}`, sha256: digest(id), size: id.length,
      treeSha256: "a".repeat(64), entrypoint: "resource.json", sync: true,
    } }));
  }
  const runtime = ["open-design-daemon", "open-design-web"].map(id => ({ id, file: `${id}.zip`, path: `/runtime/${id}.zip` }));
  const previous = { schemaVersion: 1, operation: "closure.resources.build", resources: [
    ...runtime, ...CLOSURE_DATA_RESOURCES.map(({ id }) => ({ id, path: `/absent-old-seeds/${id}.zip` })),
  ] };
  const snapshot = structuredClone(previous);
  const result = await composeReleaseDataResources(previous, files);
  expect(result.resources.slice(0, 2)).toEqual(runtime);
  expect(result.resources).toHaveLength(11);
  expect(previous).toEqual(snapshot);
  for (const resource of result.resources.slice(2)) {
    expect(await readFile(resource.path, "utf8")).toBe(resource.id);
    expect(resource.sha256).toBe(digest(resource.id));
  }
  await expect(composeReleaseDataResources(previous, files.slice(1))).rejects.toThrow("complete data resource set");
  await expect(composeReleaseDataResources(previous, [...files, files[0]!])).rejects.toThrow("duplicate");
  await expect(composeReleaseDataResources({ ...previous, resources: runtime.slice(1) }, files)).rejects.toThrow("runtime resource set");
  const first = JSON.parse(await readFile(files[0]!, "utf8"));
  await writeFile(join(root, first.resource.id, first.resource.file), "tampered");
  await expect(composeReleaseDataResources(previous, files)).rejects.toThrow("binding verification failed");
  await writeFile(files[0]!, JSON.stringify({ ...first, operation: "closure.resources.development" }));
  await expect(composeReleaseDataResources(previous, files)).rejects.toThrow("single data resource receipt");
});
