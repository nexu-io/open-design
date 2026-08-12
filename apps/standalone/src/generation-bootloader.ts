import { join } from "node:path";

import {
  validateStandaloneHandoffRequest,
  type StandaloneHandoff,
  type StandaloneHandoffRequest,
} from "@open-design/standalone-proto";

import {
  launchStandaloneBodyBridge,
  type StandaloneBodyProcessLaunchSpec,
} from "./process-bridge.js";

export type StandaloneGenerationLaunch = StandaloneBodyProcessLaunchSpec;

/**
 * Resolve the three-component generation layout inside the launcher fossil.
 * The Shell-owned official Node executes this wrapper; native and launcher
 * details remain private to the Closure-owned wrapper.
 */
export function resolveStandaloneGenerationLaunch(
  requestInput: StandaloneHandoffRequest,
  executable: string = process.env.OD_NODE_BIN ?? process.execPath,
): StandaloneGenerationLaunch {
  const request = validateStandaloneHandoffRequest(requestInput);
  const installationRoot = request.paths.installationRoot;
  return Object.freeze({
    cwd: join(installationRoot, "body"),
    env: {
      ...process.env,
      NODE_PATH: join(installationRoot, "native", "node_modules"),
    },
    executable,
    launcherPath: join(installationRoot, "launcher", "launcher.mjs"),
    output: "inherit",
  });
}

export const handoff: StandaloneHandoff = async (value) => {
  const request = validateStandaloneHandoffRequest(value);
  return await launchStandaloneBodyBridge({
    capabilities: request.capabilities,
    descriptor: {
      attachment: request.attachment,
      handoff: request.handoff,
      paths: request.paths,
    },
    launch: resolveStandaloneGenerationLaunch(request),
  });
};

export default handoff;
