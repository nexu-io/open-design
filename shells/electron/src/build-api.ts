import type { ElectronPackRequest } from "./adapters/tools/pack-tool.ts";
import type { ElectronExactSceneRequest, ElectronExactDistributionRequest } from "./adapters/tools/exact-contract.ts";

export type { ElectronPackRequest, ElectronExactSceneRequest, ElectronExactDistributionRequest };

/** Build-only product composition. Runtime observation never imports this entry. */
export async function buildElectronPackage(request: ElectronPackRequest) {
  const { parseElectronPackRequest, executeElectronPack } = await import("./adapters/tools/pack-tool.ts");
  return executeElectronPack(parseElectronPackRequest(request));
}

/** Build a release-neutral scene, including its product-owned manifest. */
export async function buildElectronScene(request: ElectronExactSceneRequest) {
  const { parseElectronExactSceneRequest } = await import("./adapters/tools/exact-contract.ts");
  const input = parseElectronExactSceneRequest(request);
  const { executeElectronExactScene } = await import("./adapters/tools/scene-tool.ts");
  return executeElectronExactScene(input);
}

/** Project release identity over a verified scene before native signing. */
export async function buildElectronInstaller(request: ElectronExactDistributionRequest) {
  const { parseElectronExactDistributionRequest } = await import("./adapters/tools/exact-contract.ts");
  const input = parseElectronExactDistributionRequest(request);
  const { executeElectronExactDistribution } = await import("./adapters/tools/distribution-tool.ts");
  return executeElectronExactDistribution(input);
}
