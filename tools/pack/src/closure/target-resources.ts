import { join } from "node:path";

import { copyOptionalVelaCliBinary } from "../vela-cli.js";
import type { ClosureSharedResourceRoot } from "./components.js";
import {
  CLOSURE_PLATFORM_TARGETS,
  type ClosurePlatformTarget,
} from "./platform.js";

const VELA_RUNTIME_RESOURCE_ID = "vela-runtime" as const;

function velaRuntimeExecutablePaths(target: ClosurePlatformTarget): readonly string[] {
  return target === CLOSURE_PLATFORM_TARGETS.WIN32_X64
    ? ["bin/vela.exe", "bin/libexec/opencode/opencode.exe"]
    : ["bin/vela", "bin/libexec/opencode/opencode"];
}

export async function prepareClosureTargetResources(
  stageRoot: string,
  target: ClosurePlatformTarget,
): Promise<readonly ClosureSharedResourceRoot[]> {
  const root = join(stageRoot, "resources", VELA_RUNTIME_RESOURCE_ID);
  await copyOptionalVelaCliBinary({
    platform: target === CLOSURE_PLATFORM_TARGETS.WIN32_X64 ? "win" : "mac",
    requireBundled: true,
    resourceRoot: root,
  });
  return [{
    executablePaths: velaRuntimeExecutablePaths(target),
    id: VELA_RUNTIME_RESOURCE_ID,
    root,
    title: "Vela runtime",
  }];
}
