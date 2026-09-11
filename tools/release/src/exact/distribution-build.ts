import { basename, join, resolve } from "node:path";
import { readReleasePolicyReceipt } from "../policy/release-profile.ts";
import { assertMacNotarizationCredentials, requiresFormalMacTrust } from "../policy/native-trust.ts";
import { checkedFile, describeFile, readObject, writeObject } from "./control-common.ts";
import { withDistributionResult } from "./distribution-result.ts";
import { electronBuilder, target, terminalBuild, type BuildInput } from "./native-builder.ts";
import { resolveToolchainPackage } from "./toolchain-artifact.ts";

export async function buildReleaseDistribution(input: BuildInput & Readonly<{ toolchain?: string; retainResult?: boolean; baseDirectory?: string; baseReceipt?: string; scene: string; prepared: string; policy: string; channel: string; releaseVersion: string; sourceCommit: string }>) {
  if (input.baseDirectory != null) {
    if (input.baseReceipt != null) throw new Error("Base directory and receipt are mutually exclusive");
    if (input.shell === "electron") input = { ...input, baseReceipt: join(resolve(input.baseDirectory), "base-build-receipt.json") };
  }
  const buildTarget = target(input), preparedRoot = resolve(input.prepared);
  const baseReceipt = input.baseReceipt == null ? undefined : await readObject(input.baseReceipt);
  if (baseReceipt != null && (input.shell !== "electron" || baseReceipt.schemaVersion !== 1
    || baseReceipt.operation !== "electron.base.build" || baseReceipt.target !== buildTarget)) throw new Error("distribution base receipt binding mismatch");
  const policy = await readReleasePolicyReceipt(input.policy, { capability: "prepare",
    channel: input.channel, releaseVersion: input.releaseVersion, sourceCommit: input.sourceCommit });
  if (input.shell === "electron" && buildTarget.startsWith("darwin-") && requiresFormalMacTrust(policy)) {
    assertMacNotarizationCredentials();
  }
  const prepared = await readObject(join(preparedRoot, "prepare-receipt.json"));
  if (prepared.channel !== input.channel || prepared.releaseVersion !== input.releaseVersion || prepared.sourceCommit !== input.sourceCommit) throw new Error("prepared release identity mismatch");
  const content = await checkedFile(prepared.contentMetadata, "prepared content", join(preparedRoot, "documents/content-metadata.json"));
  const trust = await checkedFile(prepared.trustFile, "prepared trust", join(preparedRoot, "trust/keys.json"));
  const scene = resolve(input.scene), manifest = await readObject(join(scene, "scene.json"));
  const expected = prepared.shells?.find((shell: { type: string }) => shell.type === input.shell)?.scenes?.find((entry: { target: string }) => entry.target === buildTarget);
  const sceneManifestSha256 = (await describeFile(join(scene, "scene.json"))).sha256;
  if (manifest.target !== buildTarget || expected?.sceneManifestSha256 !== sceneManifestSha256) throw new Error("prepared scene binding mismatch");
  const common = { schemaVersion: 1 as const, target: buildTarget, sceneDirectory: scene, sceneManifestSha256, outputDirectory: resolve(input.output) };
  const build = async () => {
  if (input.shell === "terminal") return terminalBuild(input, "distribution", { ...common, operation: "terminal.distribution.build", trustFile: trust,
    releaseDocumentsDirectory: join(preparedRoot, "documents"), release: { channel: input.channel, releaseVersion: input.releaseVersion,
      sourceCommit: input.sourceCommit, publishedAt: prepared.publishedAt, artifactBaseUrl: prepared.artifactBaseUrl } });
  const { buildElectronInstaller } = await electronBuilder(input.root,
    input.toolchain == null ? undefined : await resolveToolchainPackage(input.toolchain, buildTarget));
  const capsule = await checkedFile(expected.capsule.manifest, "prepared Capsule manifest", join(preparedRoot, "documents", `capsule-${buildTarget}.json`));
  const capsuleArchive = await checkedFile(expected.capsule.archive, "prepared Capsule archive", join(preparedRoot, "artifacts", basename(expected.capsule.archive.file)));
  const result = await buildElectronInstaller({ ...common, schemaVersion: 2, operation: "electron.distribution.build", acceptedContentMetadataFile: content, acceptedTrustFile: trust,
    ...(baseReceipt == null ? {} : { base: baseReceipt.base }),
    acceptedCapsuleManifestFile: capsule, acceptedCapsuleArchiveFile: capsuleArchive,
    channel: policy.channel, releaseVersion: policy.releaseVersion, channelHeadUrl: `${policy.target.publicBaseUrl}/${input.channel}/latest/channel-head.json` });
  if (buildTarget.startsWith("darwin-") && requiresFormalMacTrust(policy) && result.platformTrust?.mode !== "formal") {
    throw new Error("public macOS distribution requires formal signed and notarized platform trust");
  }
  await writeObject(join(input.output, "shell-contribution.json"), result);
  await writeObject(input.receipt, result);
  return result;
  };
  if (!input.retainResult) return build();
  const digest = (file: { sha256: string; size: number }) => ({ sha256: file.sha256, size: file.size });
  return withDistributionResult({ policy, shell: input.shell, target: buildTarget, output: resolve(input.output), receipt: input.receipt, build,
    binding: { policy, sceneManifestSha256, content: digest(prepared.contentMetadata), trust: digest(prepared.trustFile),
      capsule: input.shell !== "electron" ? null : { manifest: digest(expected.capsule.manifest), archive: digest(expected.capsule.archive) },
      base: baseReceipt?.base?.manifestSha256 ?? null, signerTeamId: process.env.APPLE_TEAM_ID ?? null,
      signerName: process.env.CSC_NAME ?? null, identityAutoDiscovery: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? null } });
}
