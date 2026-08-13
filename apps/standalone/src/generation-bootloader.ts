import { statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateStandaloneHandoffRequest,
  type StandaloneHandoff,
  type StandaloneHandoffRequest,
} from "./protocol/index.js";

import {
  launchStandaloneBodyBridge,
  type StandaloneBodyProcessLaunchSpec,
} from "./process-bridge.js";

export type StandaloneGenerationLaunch = StandaloneBodyProcessLaunchSpec;

function bundledStandaloneToolEnv(resourceRoot: string): NodeJS.ProcessEnv {
  const binaryName = process.platform === "win32" ? "vela.exe" : "vela";
  const openCodeName = process.platform === "win32" ? "opencode.exe" : "opencode";
  const candidates = {
    VELA_BIN: join(resourceRoot, "bin", binaryName),
    VELA_OPENCODE_BIN: join(resourceRoot, "bin", "libexec", "opencode", openCodeName),
  } as const;
  const env: NodeJS.ProcessEnv = {};
  for (const [name, path] of Object.entries(candidates)) {
    if (process.env[name]?.trim()) continue;
    try {
      if (statSync(path).isFile()) env[name] = path;
    } catch {
      // Non-strict development contributions may intentionally omit Vela.
    }
  }
  return env;
}

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
  const nativeRoot = join(installationRoot, "native");
  const nativeLoader = pathToFileURL(join(installationRoot, "launcher", "native-loader.mjs")).href;
  return Object.freeze({
    cwd: join(installationRoot, "body"),
    env: {
      ...process.env,
      ...bundledStandaloneToolEnv(request.paths.resourceRoot),
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
  return await launchStandaloneBodyBridge({
    capabilities: request.capabilities,
    descriptor: {
      attachment: request.attachment,
      handoff: request.handoff,
      paths: request.paths,
      transition: request.transition,
    },
    launch: resolveStandaloneGenerationLaunch(request),
  });
};

export default handoff;
