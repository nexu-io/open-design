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
  standaloneResourceRootsEnv,
  VELA_RUNTIME_RESOURCE_ID,
} from "./tool-env.js";

/** Project prepared blocking resources into the active body process. */
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
  const active = binding.active;
  if (
    active == null
    || active.standalone.digest !== request.handoff.descriptor.standalone.digest
    || active.standalone.target !== request.closure.target
  ) {
    throw new Error("Standalone resource context does not match the active Closure generation");
  }
  const manifest = await readStoredClosureDistributionManifest(paths, active.standalone);
  const plan = planClosureDistributionGeneration(
    paths,
    active.standalone.generation,
    manifest,
    request.closure.target,
  );
  const resource = plan.resources.find((entry) => entry.id === VELA_RUNTIME_RESOURCE_ID);
  const roots = new Map(
    plan.resources
      .filter((entry) => entry.startup === "blocking")
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
