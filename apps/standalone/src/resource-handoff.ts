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
  VELA_RUNTIME_RESOURCE_ID,
} from "./tool-env.js";

/** Project an already-prepared resource into the committed body process. */
export async function prepareStandaloneVelaRuntime(
  requestInput: StandaloneHandoffRequest,
): Promise<NodeJS.ProcessEnv> {
  const request = validateStandaloneHandoffRequest(requestInput);
  if (request.closure == null) return bundledStandaloneToolEnv(request.paths.resourceRoot);
  if (process.env.VELA_BIN?.trim() && process.env.VELA_OPENCODE_BIN?.trim()) return {};
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
  return resource == null
    ? bundledStandaloneToolEnv(request.paths.resourceRoot)
    : lazyVelaRuntimeEnv(resource.resourceRoot);
}
