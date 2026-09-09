import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalBytes, readObject } from "./control-common.ts";
import { resolveExactDataPlanNode, type ExactTarget } from "./plan.ts";

/** One release-neutral product, not a complete resource receipt or cache hit.
 * The Closure producer owns declarations and validates the selected group. */
export async function buildReleaseDataResource(input: Readonly<{
  root: string; resourceId: string; output: string; receipt: string; plan?: string;
}>) {
  const root = resolve(input.root);
  const node = `closure.data.${input.resourceId}.build`;
  const plan = input.plan == null ? undefined : await readObject(input.plan);
  // An unchanged release node still needs materialization on a cache miss.
  if (plan != null && (plan.schemaVersion !== 1
    || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(plan.plan?.target))) throw new Error("data build requires a valid target-bound release plan");
  const matches = async () => plan == null || (plan.plan.nodes?.[node] != null && canonicalBytes(await resolveExactDataPlanNode({
    id: node, root, registryPath: join(root, "tools/release/resources/exact-plan-identities.json"), target: plan.plan.target as ExactTarget,
  })).equals(canonicalBytes(plan.plan.nodes[node])));
  if (!await matches()) throw new Error("data build plan binding mismatch");
  const resolver = createRequire(join(root, "tools/release/package.json"));
  const builder: typeof import("@open-design/closure/build-resources") = await import(
    pathToFileURL(resolver.resolve("@open-design/closure/build-resources")).href);
  const resource = await builder.buildClosureDataResource({
    id: input.resourceId as Parameters<typeof builder.buildClosureDataResource>[0]["id"],
    workspaceRoot: root, outputDirectory: resolve(input.output),
  });
  if (!await matches()) throw new Error("data build source changed during execution");
  const receipt = { schemaVersion: 1, operation: "closure.data-resource.build", resource,
    ...(plan == null ? {} : { planNode: { id: node, identity: plan.plan.nodes[node].identity, target: plan.plan.target } }),
  } as const;
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes(receipt), { flag: "wx" });
  return receipt;
}
