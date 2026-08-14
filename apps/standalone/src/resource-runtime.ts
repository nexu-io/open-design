import {
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  readStoredClosureDistributionManifest,
  resolveClosureStorePaths,
} from "@open-design/closure/store";
import {
  ensureClosureResource,
  readClosureResourceRepositoryConfig,
} from "@open-design/closure/update";

import {
  validateStandaloneHandoffRequest,
  type StandaloneHandoffRequest,
} from "./protocol/index.js";
import {
  bundledStandaloneToolEnv,
  lazyVelaRuntimeEnv,
  VELA_RUNTIME_RESOURCE_ID,
} from "./tool-env.js";

/**
 * Start target-owned Vela materialization from the selected body process. The
 * launcher fossil only carries the validated context; resource I/O stays in
 * Closure body code and does not enter the Electron Shell bundle.
 */
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
  if (resource == null) return bundledStandaloneToolEnv(request.paths.resourceRoot);
  const repository = await readClosureResourceRepositoryConfig({
    OD_CLOSURE_RESOURCE_REPOSITORY_V1: request.closure.repositoryConfigPath,
  });
  void ensureClosureResource({
    id: resource.id,
    manifest,
    paths,
    repository,
    target: request.closure.target,
  }).catch((error: unknown) => {
    process.stderr.write(
      `open-design Vela runtime prewarm failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  });
  return lazyVelaRuntimeEnv(resource.resourceRoot);
}
