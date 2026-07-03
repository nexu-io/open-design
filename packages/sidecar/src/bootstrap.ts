/**
 * @module bootstrap
 *
 * Sidecar launch-env composition and runtime bootstrap. `createSidecarLaunchEnv`
 * builds the env a child sidecar is spawned with (base/ipc/namespace/source);
 * `bootstrapSidecarRuntime` validates the incoming stamp against the resolved
 * app/ipc/env, writes the canonical env back, and returns the live runtime
 * context. Depends on the path resolvers and the public types.
 */

import { resolveAppIpcPath, resolveSidecarBase } from "./paths.js";
import type {
  BootstrapSidecarRuntimeOptions,
  SidecarLaunchEnvRequest,
  SidecarRuntimeContext,
  SidecarStampShape,
} from "./types.js";

/**
 * Compose the environment a child sidecar is launched with: the resolved base,
 * the stamp's ipc path, namespace, and source, layered over `extraEnv`.
 * @returns The launch environment.
 */
export function createSidecarLaunchEnv<TStamp extends SidecarStampShape>({
  base,
  contract,
  extraEnv = process.env,
  stamp,
}: SidecarLaunchEnvRequest<TStamp>): NodeJS.ProcessEnv {
  const normalizedStamp = contract.normalizeStamp(stamp);
  return {
    ...extraEnv,
    [contract.env.base]: resolveSidecarBase({ base, contract, env: extraEnv, source: normalizedStamp.source }),
    [contract.env.ipcPath]: normalizedStamp.ipc,
    [contract.env.namespace]: normalizedStamp.namespace,
    [contract.env.source]: normalizedStamp.source,
  };
}

/**
 * @internal Assert that an existing env value, if present, matches the expected
 * canonical value.
 */
function assertMatchingEnv(env: NodeJS.ProcessEnv, key: string, expected: string): void {
  const current = env[key];
  if (current != null && current !== expected) {
    throw new Error(`sidecar env mismatch for ${key}: expected ${expected}, received ${current}`);
  }
}

/**
 * Bootstrap a sidecar runtime from an incoming stamp and env: validate app and
 * ipc path, confirm no conflicting env, write the canonical env back, and return
 * the resolved live runtime context.
 * @returns The resolved {@link SidecarRuntimeContext}.
 */
export function bootstrapSidecarRuntime<TStamp extends SidecarStampShape>(
  stampInput: unknown,
  env: NodeJS.ProcessEnv,
  options: BootstrapSidecarRuntimeOptions<TStamp>,
): SidecarRuntimeContext<TStamp> {
  const stamp = options.contract.normalizeStamp(stampInput);
  const expectedApp = options.contract.normalizeApp(options.app);
  if (stamp.app !== expectedApp) {
    throw new Error(`sidecar stamp app mismatch: expected ${expectedApp}, received ${stamp.app}`);
  }

  const base = resolveSidecarBase({
    base: options.base,
    contract: options.contract,
    env,
    projectRoot: options.projectRoot,
    source: stamp.source,
  });
  const ipc = resolveAppIpcPath({ app: stamp.app, contract: options.contract, env, namespace: stamp.namespace });
  if (stamp.ipc !== ipc) {
    throw new Error(`sidecar ipc path mismatch: expected ${ipc}, received ${stamp.ipc}`);
  }

  assertMatchingEnv(env, options.contract.env.ipcPath, stamp.ipc);
  assertMatchingEnv(env, options.contract.env.namespace, stamp.namespace);
  assertMatchingEnv(env, options.contract.env.source, stamp.source);

  env[options.contract.env.ipcPath] = ipc;
  env[options.contract.env.namespace] = stamp.namespace;
  env[options.contract.env.source] = stamp.source;

  return {
    app: stamp.app,
    base,
    ipc,
    mode: stamp.mode,
    namespace: stamp.namespace,
    source: stamp.source,
  };
}
