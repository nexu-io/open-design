import type { ElectronPackRequest } from "./adapters/tools/pack-tool.ts";
import type { ElectronExactSceneRequest, ElectronExactDistributionRequest } from "./adapters/tools/exact-contract.ts";

export type { ElectronPackRequest, ElectronExactSceneRequest, ElectronExactDistributionRequest };

/** Native base input; cache ownership stays with the calling tool. */
export async function resolveElectronBaseArchive(target: string) {
  const { resolveElectronDistributionArchive } = await import("@open-design/electron-kit/distribution");
  return resolveElectronDistributionArchive(target);
}
export async function buildElectronBase(input: Readonly<{ target: string; channel: string; archivePath: string; outputRoot: string }>) {
  const { buildElectronMacBase } = await import("./adapters/tools/platforms/macos/base.ts");
  return buildElectronMacBase(input);
}

/** Product-owned Capsule entry, independent of release versions and physical Node assembly. */
export async function buildElectronCapsuleContent(input: Readonly<{
  target: ElectronExactSceneRequest["target"];
  outputRoot: string;
}>) {
  const [{ buildElectronCapsuleContent: buildContent }, { electronShellSource }] = await Promise.all([
    import("@open-design/electron-kit/distribution"), import("./adapters/tools/resources.ts"),
  ]);
  return buildContent({ ...input, entryPath: electronShellSource("capsule.ts") });
}

/** Product declaration only; the calling tool owns archive acquisition and reuse. */
export async function resolveElectronNodeArchive(target?: ElectronExactSceneRequest["target"]) {
  const { readElectronNodeArchive } = await import("./platform/build.ts");
  return readElectronNodeArchive(target);
}

/** Independently distributable Node/native resource; tools own plan/cache and
 * publication, while Standalone owns verified package assembly and archiving. */
export async function buildElectronPlatformResource(input: Readonly<{
  archivePath: string; target: ElectronExactSceneRequest["target"]; outputArchivePath: string;
}>) {
  const { buildElectronPlatformResource: buildResource } = await import("./platform/build.ts");
  return buildResource(input);
}

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
