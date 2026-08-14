import {
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  readStoredClosureDistributionManifest,
  resolveClosureStorePaths,
} from "@open-design/closure/store";

import {
  validateStandaloneHandoffRequest,
  type StandaloneHandoffRequest,
} from "./protocol/index.js";
import {
  bundledStandaloneToolEnv,
  lazyVelaRuntimeEnv,
  STANDALONE_BOOT_RESOURCE_IDS,
  standaloneResourceRootsEnv,
  VELA_RUNTIME_RESOURCE_ID,
} from "./tool-env.js";

/** Project an already-prepared resource into the committed body process. */
export async function prepareStandaloneResourceEnv(
  requestInput: StandaloneHandoffRequest,
): Promise<NodeJS.ProcessEnv> {
  const request = validateStandaloneHandoffRequest(requestInput);
  if (request.closure == null) return bundledStandaloneToolEnv(request.paths.resourceRoot);
  const paths = resolveClosureStorePaths({
    channel: request.handoff.scope.channel,
    namespace: request.handoff.scope.namespace,
    root: request.closure.storeRoot,
  });
  const binding = await readClosureBindingDescriptor(paths);
  const committed = binding.committed;
  if (
    committed == null
    || committed.standalone.digest !== request.handoff.descriptor.standalone.digest
    || committed.standalone.target !== request.closure.target
  ) {
    throw new Error("Standalone Vela resource context does not match the committed Closure generation");
  }
  const manifest = await readStoredClosureDistributionManifest(paths, committed.standalone);
  const plan = planClosureDistributionGeneration(
    paths,
    committed.standalone.generation,
    manifest,
    request.closure.target,
  );
  const resource = plan.resources.find((entry) => entry.id === VELA_RUNTIME_RESOURCE_ID);
  const bootResourceIds = new Set<string>(STANDALONE_BOOT_RESOURCE_IDS);
  const roots = new Map(
    plan.resources
      .filter((entry) => bootResourceIds.has(entry.id))
      .map((entry) => [entry.id, entry.resourceRoot]),
  );
  return {
    ...standaloneResourceRootsEnv(roots),
    ...(process.env.VELA_BIN?.trim() && process.env.VELA_OPENCODE_BIN?.trim()
      ? {}
      : resource == null
        ? bundledStandaloneToolEnv(request.paths.resourceRoot)
        : lazyVelaRuntimeEnv(resource.resourceRoot)),
  };
}

/** @deprecated Use prepareStandaloneResourceEnv. */
export const prepareStandaloneVelaRuntime = prepareStandaloneResourceEnv;
