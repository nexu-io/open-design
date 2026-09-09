import { join } from "node:path";
import type { NodePlatformResource } from "@open-design/standalone/packages";
import { prepareNodePlatformResource } from "@open-design/standalone/packages/resource";
import { resolveElectronStandaloneStoreRoot } from "./store-root.js";

/** Product platform preparation is invoked by Capsule after its first screen. */
export async function prepareElectronNodeRuntime(input: Readonly<{
  runtimeRoot: string; platform: NodePlatformResource; signal: AbortSignal;
}>) {
  return (await prepareNodePlatformResource({ root: join(resolveElectronStandaloneStoreRoot(input.runtimeRoot), "platform"),
    resource: input.platform }, { signal: input.signal })).binding;
}
