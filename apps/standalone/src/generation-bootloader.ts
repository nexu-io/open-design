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
 * Resolve the fixed four-component generation layout inside the launcher
 * fossil. Shells only supply installationRoot; platform/runtime/native details
 * remain private to this Closure-owned wrapper.
 */
export function resolveStandaloneGenerationLaunch(
  requestInput: StandaloneHandoffRequest,
  platform: NodeJS.Platform = process.platform,
): StandaloneGenerationLaunch {
  const request = validateStandaloneHandoffRequest(requestInput);
  const installationRoot = request.paths.installationRoot;
  if (platform !== "darwin" && platform !== "win32") {
    throw new Error(`Standalone generation launcher is unsupported on ${platform}`);
  }
  return Object.freeze({
    cwd: join(installationRoot, "body"),
    env: {
      ...process.env,
      NODE_PATH: join(installationRoot, "native", "node_modules"),
    },
    executable: platform === "win32"
      ? join(installationRoot, "runtime", "node.exe")
      : join(installationRoot, "runtime", "bin", "node"),
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
