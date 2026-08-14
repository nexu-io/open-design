import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  cleanupClosureChannelGarbage,
  resolveClosureStorePaths,
} from "@open-design/closure/store";

import {
  validateStandaloneHandoffRequest,
  type StandaloneHandoff,
  type StandaloneHandoffRequest,
} from "./protocol/index.js";

import {
  launchStandaloneBodyBridge,
  type StandaloneBodyProcessLaunchSpec,
} from "./process-bridge.js";
import { bundledStandaloneToolEnv } from "./tool-env.js";
import { prepareStandaloneResourceEnv } from "./resource-handoff.js";

export type StandaloneGenerationLaunch = StandaloneBodyProcessLaunchSpec;

/**
 * Resolve the three-component generation layout inside the launcher fossil.
 * The Shell-owned official Node executes this wrapper; native and launcher
 * details remain private to the Closure-owned wrapper.
 */
export function resolveStandaloneGenerationLaunch(
  requestInput: StandaloneHandoffRequest,
  executable: string = process.env.OD_NODE_BIN ?? process.execPath,
  resourceEnv: NodeJS.ProcessEnv = {},
): StandaloneGenerationLaunch {
  const request = validateStandaloneHandoffRequest(requestInput);
  const installationRoot = request.paths.installationRoot;
  const nativeRoot = join(installationRoot, "native");
  const nativeLoader = pathToFileURL(join(installationRoot, "launcher", "native-loader.mjs")).href;
  return Object.freeze({
    cwd: join(installationRoot, "body"),
    env: {
      ...process.env,
      ...bundledStandaloneToolEnv(request.paths.resourceRoot),
      ...resourceEnv,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${nativeLoader}`].filter(Boolean).join(" "),
      NODE_PATH: join(nativeRoot, "node_modules"),
      OD_STANDALONE_NATIVE_ROOT: nativeRoot,
    },
    executable,
    launcherPath: join(installationRoot, "launcher", "launcher.mjs"),
    output: "inherit",
  });
}

export const handoff: StandaloneHandoff = async (value) => {
  const request = validateStandaloneHandoffRequest(value);
  if (request.closure != null) {
    void cleanupClosureChannelGarbage({
      paths: resolveClosureStorePaths({
        channel: request.handoff.scope.channel,
        namespace: request.handoff.scope.namespace,
        root: request.closure.storeRoot,
      }),
    }).catch((error: unknown) => {
      process.stderr.write(
        `open-design Standalone garbage cleanup was deferred: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
  }
  const resourceEnv = await prepareStandaloneResourceEnv(request);
  return await launchStandaloneBodyBridge({
    capabilities: request.capabilities,
    descriptor: {
      attachment: request.attachment,
      closure: request.closure,
      handoff: request.handoff,
      paths: request.paths,
      transition: request.transition,
    },
    launch: resolveStandaloneGenerationLaunch(
      request,
      process.env.OD_NODE_BIN ?? process.execPath,
      resourceEnv,
    ),
  });
};

export default handoff;
