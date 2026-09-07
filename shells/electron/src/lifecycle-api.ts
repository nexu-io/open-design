import type { ElectronDevLifecycleRequest } from "./adapters/tools/dev-tool.ts";
import type { ElectronRuntimeLifecycleRequest } from "./adapters/tools/runtime-tool.ts";

export type { ElectronDevLifecycleRequest, ElectronRuntimeLifecycleRequest };

/** Caller owns the log descriptor; only start loads the build-time dependency closure. */
export async function controlElectronDevelopment(request: ElectronDevLifecycleRequest, options: Readonly<{ logFd: number }>) {
  if (!Number.isSafeInteger(options.logFd) || options.logFd < 0) throw new Error("Electron log descriptor is invalid");
  const { parseElectronDevLifecycleRequest, executeElectronDevLifecycle } = await import("./adapters/tools/dev-tool.ts");
  return executeElectronDevLifecycle(parseElectronDevLifecycleRequest(request), options);
}

export async function controlElectronRuntime(request: ElectronRuntimeLifecycleRequest) {
  const { parseElectronRuntimeLifecycleRequest, executeElectronRuntimeLifecycle } = await import("./adapters/tools/runtime-tool.ts");
  return executeElectronRuntimeLifecycle(parseElectronRuntimeLifecycleRequest(request));
}
