import type { ElectronDevLifecycleRequest } from "./adapters/tools/lifecycle/dev-tool.ts";
import type { ElectronRuntimeLifecycleRequest } from "./adapters/tools/lifecycle/runtime-tool.ts";

export type { ElectronDevLifecycleRequest, ElectronRuntimeLifecycleRequest };
export { describeElectronRuntimeDiagnostics, updateElectronClosureThroughCdp, type ElectronDiagnosticSession } from "./adapters/tools/lifecycle/inspection.ts";

/** Caller owns the log descriptor; only start loads the build-time dependency closure. */
export async function controlElectronDevelopment(request: ElectronDevLifecycleRequest, options: Readonly<{ logFd: number }>) {
  if (!Number.isSafeInteger(options.logFd) || options.logFd < 0) throw new Error("Electron log descriptor is invalid");
  const { parseElectronDevLifecycleRequest, executeElectronDevLifecycle } = await import("./adapters/tools/lifecycle/dev-tool.ts");
  return executeElectronDevLifecycle(parseElectronDevLifecycleRequest(request), options);
}

export async function controlElectronRuntime(request: ElectronRuntimeLifecycleRequest) {
  const { parseElectronRuntimeLifecycleRequest, executeElectronRuntimeLifecycle } = await import("./adapters/tools/lifecycle/runtime-tool.ts");
  return executeElectronRuntimeLifecycle(parseElectronRuntimeLifecycleRequest(request));
}
