import { chmod, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ensureStandaloneBlob, materializeStandaloneBlob, type StandaloneBlobOptions } from "../blob.js";
import { withStandaloneMaintenanceLock } from "../maintenance.js";
import { bindNodePlatform, currentOfficialNodeTarget } from "./runtime.js";
import { validateNodePlatformResource, type NodePlatformResource } from "./resource-contract.js";

/** Caller authenticates the descriptor and owns startup/recovery authorization.
 * Preparation never selects another version or executes unverified tree bytes. */
export async function prepareNodePlatformResource(input: Readonly<{
  root: string;
  resource: NodePlatformResource;
  recovery?: boolean;
}>, options: Omit<StandaloneBlobOptions, "invalidCache"> = {}) {
  const resource = validateNodePlatformResource(input.resource);
  if (!isAbsolute(input.root) || resource.target !== currentOfficialNodeTarget()) throw new Error("Node platform resource target/root mismatch");
  if (input.recovery != null && typeof input.recovery !== "boolean") throw new Error("invalid Node platform recovery intent");
  const root = input.root, recovery = input.recovery === true;
  return withStandaloneMaintenanceLock(root, async () => {
    options.signal?.throwIfAborted();
    const policy = { ...options, invalidCache: recovery ? "repair" as const : "reject" as const };
    const archive = await ensureStandaloneBlob(root, resource.blob, policy);
    const tree = await materializeStandaloneBlob(root, resource.blob, archive.path,
      { type: "zip", entrypoint: "platform.json", treeSha256: resource.treeSha256 }, policy);
    options.signal?.throwIfAborted();
    // ZIP materialization deliberately does not grant executable permissions.
    // The signed descriptor grants them only after the entire tree verifies.
    for (const path of resource.executables) {
      const file = join(tree.path, path), info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Node platform executable is not a verified regular file");
      if (process.platform !== "win32") await chmod(file, 0o755);
    }
    options.signal?.throwIfAborted();
    const binding = await bindNodePlatform(tree.path, { signal: options.signal }).catch(cause => {
      throw new Error("verified Node platform resource failed its runtime probe; explicit recovery required", { cause });
    });
    return Object.freeze({ root: tree.path, binding, archive, reused: tree.reused });
  });
}
