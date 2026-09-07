import type { ElectronPackRequest } from "./adapters/tools/pack-tool.ts";

export type { ElectronPackRequest };

/** Build-only product composition. Runtime observation never imports this entry. */
export async function buildElectronPackage(request: ElectronPackRequest) {
  const { parseElectronPackRequest, executeElectronPack } = await import("./adapters/tools/pack-tool.ts");
  return executeElectronPack(parseElectronPackRequest(request));
}
