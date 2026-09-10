import type { CAC } from "cac";
import { buildReleaseBase, buildReleaseCapsule, buildReleaseDistribution, buildReleasePlatform, buildReleaseScene, buildReleaseSceneInputs } from "./native-build.ts";
import { buildReleaseDataResource, buildReleaseRuntimeResources } from "./resource-build.ts";
import { required, type Options } from "./command-input.ts";
import { exportReleaseDistribution } from "./distribution-artifact.ts";

/** Result-affecting build grammar belongs to the build recipe, not release control. */
export function registerBuildCommands(cli: CAC): void {
  cli.command("build <operation>", "Build independent resources, platform, Capsule content, native scenes or distributions")
    .option("--root <directory>", "Checked-out workspace with built inputs")
    .option("--shell <name>", "electron or terminal")
    .option("--target <target>", "Native platform architecture")
    .option("--output <directory>", "Build output")
    .option("--transport-output <directory>", "Fresh installer-only publication transport (distribution)")
    .option("--receipt <file>", "Build receipt")
    .option("--resource-id <id>", "Closure data resource group (resource)")
    .option("--resource-ids <json>", "Explicit runtime resource selection (runtime-resources)")
    .option("--resources <file>", "Closure runtime-only resource receipt (Electron scene)")
    .option("--node-archive <file>", "Optional local locked official Node archive (Terminal scene or independent platform)")
    .option("--runtime-archive <file>", "Optional local official Electron archive; pinned checksum required (base)")
    .option("--capsule-content <file>", "Prebuilt Capsule content descriptor (Electron scene; paired with archive)")
    .option("--capsule-directory <directory>", "Portable Capsule products, indexed by target (scene; Electron consumes)")
    .option("--capsule-archive <file>", "Prebuilt Capsule archive (Electron scene; paired with content)")
    .option("--base-receipt <file>", "Verified neutral base receipt (Electron distribution)")
    .option("--base-directory <directory>", "Restored neutral base product (distribution; Electron consumes)")
    .option("--scene <directory>", "Verified scene (distribution)")
    .option("--prepared <directory>", "Prepared signed content (distribution)")
    .option("--policy <file>", "Release policy (distribution)")
    .option("--channel <name>", "Release channel (distribution)")
    .option("--release-version <version>", "Release version (distribution)")
    .option("--source-commit <sha>", "Exact source commit (distribution)")
    .action(async (operation: string, options: Options) => {
      if (operation === "runtime-resources") {
        const allowed = new Set(["root", "output", "receipt", "resourceIds", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`runtime resource build does not accept --${key}`);
        await buildReleaseRuntimeResources({ root: required(options, "root"), output: required(options, "output"), receipt: required(options, "receipt"),
          ...(options.resourceIds == null ? {} : { resourceIds: JSON.parse(required(options, "resourceIds")) }) });
        return;
      }
      if (operation === "resource") {
        const allowed = new Set(["root", "resourceId", "output", "receipt", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) {
          throw new Error(`resource build does not accept --${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`);
        }
        await buildReleaseDataResource({ root: required(options, "root"), resourceId: required(options, "resourceId"),
          output: required(options, "output"), receipt: required(options, "receipt") });
        return;
      }
      if (options.resourceIds != null) throw new Error("--resource-ids is only supported by build runtime-resources");
      if (options.transportOutput != null && operation !== "distribution") throw new Error("--transport-output is only supported by build distribution");
      if (options.resourceId != null) throw new Error("--resource-id is only supported by build resource");
      if (options.runtimeArchive != null && operation !== "base") throw new Error("--runtime-archive is only supported by build base");
      if (options.baseReceipt != null && operation !== "distribution") throw new Error("--base-receipt is only supported by build distribution");
      if (options.baseDirectory != null && operation !== "distribution") throw new Error("--base-directory is only supported by build distribution");
      if (options.capsuleDirectory != null && operation !== "scene") throw new Error("--capsule-directory is only supported by build scene");
      if (operation === "capsule") {
        const allowed = new Set(["root", "shell", "target", "output", "receipt", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`Capsule build does not accept --${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`);
      }
      if (operation === "platform") {
        const allowed = new Set(["root", "shell", "target", "output", "receipt", "nodeArchive", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) {
          throw new Error(`platform build does not accept --${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)}`);
        }
      }
      const common = { root: required(options, "root"), shell: required(options, "shell"), target: required(options, "target"), output: required(options, "output"), receipt: required(options, "receipt") };
      if (operation !== "scene" && (options.capsuleContent != null || options.capsuleArchive != null)) throw new Error("prebuilt Capsule inputs are only supported by build scene");
      if (operation === "scene-inputs") await buildReleaseSceneInputs(common);
      else if (operation === "scene") await buildReleaseScene({ ...common,
        ...(options.capsuleDirectory == null ? {} : { capsuleDirectory: required(options, "capsuleDirectory") }),
        ...(options.capsuleContent == null ? {} : { capsuleContent: required(options, "capsuleContent") }),
        ...(options.capsuleArchive == null ? {} : { capsuleArchive: required(options, "capsuleArchive") }),
        ...(options.resources == null ? {} : { resources: required(options, "resources") }),
        ...(options.nodeArchive == null ? {} : { nodeArchive: required(options, "nodeArchive") }) });
      else if (operation === "capsule") await buildReleaseCapsule(common);
      else if (operation === "base") await buildReleaseBase({ ...common, scene: required(options, "scene"),
        ...(options.runtimeArchive == null ? {} : { runtimeArchive: required(options, "runtimeArchive") }) });
      else if (operation === "platform") await buildReleasePlatform({ ...common,
        ...(options.nodeArchive == null ? {} : { nodeArchive: required(options, "nodeArchive") }) });
      else if (operation === "distribution") {
        await buildReleaseDistribution({ ...common, ...(options.baseReceipt == null ? {} : { baseReceipt: required(options, "baseReceipt") }), scene: required(options, "scene"), prepared: required(options, "prepared"),
        ...(options.baseDirectory == null ? {} : { baseDirectory: required(options, "baseDirectory") }),
        policy: required(options, "policy"), channel: required(options, "channel"), releaseVersion: required(options, "releaseVersion"), sourceCommit: required(options, "sourceCommit") });
        if (options.transportOutput != null) await exportReleaseDistribution({ source: common.output, output: required(options, "transportOutput") });
      }
      else throw new Error("build operation must be resource, runtime-resources, platform, capsule, base, scene-inputs, scene or distribution");
    });
}
