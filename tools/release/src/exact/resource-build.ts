import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeObject } from "./control-common.ts";

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
  await writeObject(input.receipt, receipt);
  return receipt;
}
