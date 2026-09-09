import { join } from "node:path";
import { bindNodePlatform } from "@open-design/standalone/packages";

/** Product platform preparation is invoked by Capsule after its first screen. */
export function prepareElectronNodeRuntime(input: Readonly<{
  resourceRoot: string; runtimeRoot: string; signal: AbortSignal;
}>) {
  return bindNodePlatform(join(input.resourceRoot, "platform"), { signal: input.signal });
}
