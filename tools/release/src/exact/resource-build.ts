import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalBytes, checkedFile } from "./control-common.ts";

/** Runtime production is separate from the nine independent data products. */
export async function buildReleaseRuntimeResources(input: Readonly<{ root: string; output: string; receipt: string }>) {
  const root = resolve(input.root), resolver = createRequire(join(root, "tools/release/package.json"));
  const builder: typeof import("@open-design/closure/build-runtime-resources") = await import(
    pathToFileURL(resolver.resolve("@open-design/closure/build-runtime-resources")).href);
  const result = await builder.buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory: resolve(input.output) });
  if (result.schemaVersion !== 1 || result.operation !== "closure.runtime-resources.build"
    || result.resources.map(resource => resource.id).sort().join(",") !== "open-design-daemon,open-design-web") throw new Error("invalid runtime resource set");
  for (const resource of result.resources) await checkedFile(resource, "runtime resource", resource.path);
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes(result), { flag: "wx" });
  return result;
}

/** One release-neutral product, not a complete resource receipt or cache hit.
 * The Closure producer owns declarations and validates the selected group. */
export async function buildReleaseDataResource(input: Readonly<{
  root: string; resourceId: string; output: string; receipt: string;
}>) {
  const root = resolve(input.root);
  const resolver = createRequire(join(root, "tools/release/package.json"));
  const builder: typeof import("@open-design/closure/build-resources") = await import(
    pathToFileURL(resolver.resolve("@open-design/closure/build-resources")).href);
  const resource = await builder.buildClosureDataResource({
    id: input.resourceId as Parameters<typeof builder.buildClosureDataResource>[0]["id"],
    workspaceRoot: root, outputDirectory: resolve(input.output),
  });
  const receipt = { schemaVersion: 1, operation: "closure.data-resource.build", resource } as const;
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes(receipt), { flag: "wx" });
  return receipt;
}
