import type { CAC } from "cac";
import { appendFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exactStorageObject } from "@open-design/release";
import { authorizeReleaseCapability, resolveReleasePolicy } from "../policy/release-profile.ts";
import { writeObject } from "./control-common.ts";
import { importSceneArtifact, packSceneArtifact, unpackSceneArtifact, verifySceneArtifact } from "./scene-artifact.ts";
import { activateExactRelease, promoteAcceptedElectronBaseline, publishExactRelease, fetchAcceptedElectronBaseline, selfCheckExactReleaseControl } from "./control-release.ts";
import { finalizeReleaseContent, prepareReleaseContent } from "./composition.ts";
import { projectReleaseTopology } from "./topology.ts";
import { buildReleaseBase, buildReleaseCapsule, buildReleaseDistribution, buildReleasePlatform, buildReleaseScene } from "./native-build.ts";
import { buildReleaseDataResource, buildReleaseRuntimeResources } from "./resource-build.ts";
import { exportDataResource, importDataResource } from "./resource-artifact.ts";
import { exportPlatform, importPlatform } from "./platform-artifact.ts";
import { exportCapsule, importCapsule } from "./capsule-artifact.ts";
import { exportBase, packBase, importBase, unpackBase } from "./base-artifact.ts";
import { fetchAcceptanceArtifact } from "./acceptance-artifact.ts";
import { collectReleaseAcceptance, updateAcceptanceClosure } from "./acceptance.ts";
import { validateReleaseRecipe } from "./validation.ts";

type Options = Record<string, unknown>;
function required(options: Options, key: string): string {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)} is required`);
  return value;
}
function boolean(options: Options, key: string): boolean {
  const value = options[key];
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be true or false`);
}
async function emit(options: Options, receipt: unknown): Promise<void> {
  if (options.receipt != null) await writeObject(required(options, "receipt"), receipt);
  else process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

/** One command grammar for the workspace tool and its relocatable CI build. */
export function registerExactCommands(cli: CAC): void {
  cli.command("[command]", "Show help when no command is given").action((command?: string) => {
    if (command != null) throw new Error(`Unknown command: ${command}`);
    cli.outputHelp();
  });
  cli.command("self-check", "Verify exact channel transition algebra").action(() => selfCheckExactReleaseControl());
  cli.command("validate <node>", "Execute a named validation recipe and retain its execution receipt")
    .option("--coverage <name>", "architecture (default), or explicit Closure business aggregate", { default: "architecture" })
    .option("--reason <text>", "Required risk reason for business coverage")
    .option("--root <directory>", "Checked-out workspace with built prerequisites")
    .option("--target <target>", "Expected native execution target")
    .option("--source-commit <sha>", "Source checkout commit")
    .option("--log <file>", "Fresh test output file")
    .option("--receipt <file>", "Successful validation receipt")
    .action(async (node: string, options: Options) => {
      await validateReleaseRecipe({ node, root: required(options, "root"), target: required(options, "target"),
        sourceCommit: required(options, "sourceCommit"), log: required(options, "log"), receipt: required(options, "receipt"),
        coverage: required(options, "coverage"), ...(options.reason == null ? {} : { reason: required(options, "reason") }) });
    });
  cli.command("acceptance <operation>", "Acquire the exact published installer selected for acceptance")
    .option("--publication <file>", "Publication receipt")
    .option("--policy <file>", "Release policy")
    .option("--shell <name>", "electron or terminal")
    .option("--target <target>", "Published platform architecture")
    .option("--output <directory>", "Directory for public-shell-artifact with native suffix")
    .option("--receipt <file>", "Selected required acceptance, unchanged")
    .option("--github-env <file>", "Optional installed identity projection for GitHub")
    .option("--base-user-data-root <directory>", "Explicit Electron bootstrap user-data root (collect/hot-update)")
    .option("--installed-root <directory>", "Installed resource root (collect)")
    .option("--runtime-proof-root <directory>", "Terminal lifecycle receipts (collect)")
    .option("--hot-receipt <file>", "Completed CDP hot-update receipt (collect)")
    .option("--first-install-root <directory>", "Current release installed resources, separate from upgraded baseline (collect)")
    .option("--first-install-user-data-root <directory>", "Current release first-install runtime evidence (collect)")
    .action(async (operation: string, options: Options) => {
      const common = { publication: required(options, "publication"), policy: required(options, "policy"),
        shell: required(options, "shell"), target: required(options, "target"), receipt: required(options, "receipt"),
        ...(options.baseUserDataRoot == null ? {} : { baseUserDataRoot: required(options, "baseUserDataRoot") }) };
      if (operation === "fetch") await fetchAcceptanceArtifact({ ...common, output: required(options, "output"), ...(options.githubEnv == null ? {} : { githubEnv: required(options, "githubEnv") }) });
      else if (operation === "hot-update") await updateAcceptanceClosure(common);
      else if (operation === "collect") await collectReleaseAcceptance({ ...common, installedRoot: required(options, "installedRoot"), runtimeProofRoot: required(options, "runtimeProofRoot"),
        ...(options.firstInstallRoot == null ? {} : { firstInstallRoot: required(options, "firstInstallRoot") }),
        ...(options.firstInstallUserDataRoot == null ? {} : { firstInstallUserDataRoot: required(options, "firstInstallUserDataRoot") }),
        ...(options.hotReceipt == null ? {} : { hotAcceptanceReceipt: required(options, "hotReceipt") }) });
      else throw new Error("acceptance operation must be fetch or hot-update or collect");
    });

  cli.command("build <operation>", "Build independent resources, platform, Capsule content, native scenes or distributions")
    .option("--root <directory>", "Checked-out workspace with built inputs")
    .option("--shell <name>", "electron or terminal")
    .option("--target <target>", "Native platform architecture")
    .option("--output <directory>", "Build output")
    .option("--receipt <file>", "Build receipt")
    .option("--resource-id <id>", "Closure data resource group (resource)")
    .option("--resources <file>", "Closure runtime-only resource receipt (Electron scene)")
    .option("--node-archive <file>", "Optional local locked official Node archive (Terminal scene or independent platform)")
    .option("--capsule-content <file>", "Prebuilt Capsule content descriptor (Electron scene; paired with archive)")
    .option("--capsule-archive <file>", "Prebuilt Capsule archive (Electron scene; paired with content)")
    .option("--base-receipt <file>", "Verified neutral base receipt (Electron distribution)")
    .option("--scene <directory>", "Verified scene (distribution)")
    .option("--prepared <directory>", "Prepared signed content (distribution)")
    .option("--policy <file>", "Release policy (distribution)")
    .option("--channel <name>", "Release channel (distribution)")
    .option("--release-version <version>", "Release version (distribution)")
    .option("--source-commit <sha>", "Exact source commit (distribution)")
    .action(async (operation: string, options: Options) => {
      if (operation === "runtime-resources") {
        const allowed = new Set(["root", "output", "receipt", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`runtime resource build does not accept --${key}`);
        await buildReleaseRuntimeResources({ root: required(options, "root"), output: required(options, "output"), receipt: required(options, "receipt") });
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
      if (options.resourceId != null) throw new Error("--resource-id is only supported by build resource");
      if (options.baseReceipt != null && operation !== "distribution") throw new Error("--base-receipt is only supported by build distribution");
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
      if (operation === "scene") await buildReleaseScene({ ...common,
        ...(options.capsuleContent == null ? {} : { capsuleContent: required(options, "capsuleContent") }),
        ...(options.capsuleArchive == null ? {} : { capsuleArchive: required(options, "capsuleArchive") }),
        ...(options.resources == null ? {} : { resources: required(options, "resources") }),
        ...(options.nodeArchive == null ? {} : { nodeArchive: required(options, "nodeArchive") }) });
      else if (operation === "capsule") await buildReleaseCapsule(common);
      else if (operation === "base") await buildReleaseBase({ ...common, scene: required(options, "scene") });
      else if (operation === "platform") await buildReleasePlatform({ ...common,
        ...(options.nodeArchive == null ? {} : { nodeArchive: required(options, "nodeArchive") }) });
      else if (operation === "distribution") await buildReleaseDistribution({ ...common, ...(options.baseReceipt == null ? {} : { baseReceipt: required(options, "baseReceipt") }), scene: required(options, "scene"), prepared: required(options, "prepared"),
        policy: required(options, "policy"), channel: required(options, "channel"), releaseVersion: required(options, "releaseVersion"), sourceCommit: required(options, "sourceCommit") });
      else throw new Error("build operation must be resource, runtime-resources, platform, capsule, base, scene or distribution");
    });

  cli.command("topology", "Project release actions over declared runner and target data")
    .option("--declaration <file>", "Active and deferred target declaration")
    .option("--plans <directory>", "Release plan receipts")
    .option("--output <directory>", "Resolved topology, scope and runner receipts")
    .option("--github-output <file>", "Optional GitHub matrix output destination")
    .option("--receipt <file>", "Optional receipt; defaults to stdout")
    .action(async (options: Options) => {
      const result = await projectReleaseTopology({ declaration: required(options, "declaration"), plans: required(options, "plans"), output: required(options, "output") });
      if (options.githubOutput != null) await appendFile(required(options, "githubOutput"),
        `shell_matrix=${JSON.stringify(result.matrix)}\nvalidation_matrix=${JSON.stringify(result.validationMatrix)}\nplatform_matrix=${JSON.stringify(result.platformMatrix)}\ncapsule_matrix=${JSON.stringify(result.capsuleMatrix)}\ndata_matrix=${JSON.stringify(result.dataMatrix)}\n`);
      await emit(options, result);
    });

  cli.command("prepare", "Compose and sign content from the declared Shell scenes")
    .option("--policy <file>", "Release policy receipt")
    .option("--channel <name>", "Release channel")
    .option("--release-version <version>", "Release version")
    .option("--source-commit <sha>", "Exact source commit")
    .option("--root <directory>", "Checked-out source root")
    .option("--topology <file>", "Resolved active Shell topology")
    .option("--scenes <directory>", "Downloaded scene artifacts")
    .option("--standalone-version <version>", "Standalone runtime version")
    .option("--previous-content <file>", "Optional verified previous content envelope")
    .option("--closure-artifact <file>", "Current Closure artifact; defaults to the scene seed")
    .option("--standalone-artifact <file>", "Current Standalone launcher; defaults to the scene seed")
    .option("--resource-receipt <file>", "Current complete Closure resource collection; defaults to the scene seed")
    .option("--capsules <directory>", "Current Capsule products under <target>/; defaults to the scene Capsule")
    .option("--platforms <directory>", "Independent platform products under <target>/ (required for Electron)")
    .option("--data-resource <file>", "Independent data receipt beside its archive; repeat for the complete data set")
    .option("--data-resources <directory>", "Complete independent data products under <resource-id>/")
    .option("--output <directory>", "Prepared content directory")
    .option("--receipt <file>", "Preparation receipt")
    .action(async (options: Options) => {
      await prepareReleaseContent({ policy: required(options, "policy"), channel: required(options, "channel"),
        releaseVersion: required(options, "releaseVersion"), sourceCommit: required(options, "sourceCommit"), sourceRoot: required(options, "root"),
        topology: required(options, "topology"), scenesRoot: required(options, "scenes"), standaloneVersion: required(options, "standaloneVersion"),
        ...(options.previousContent == null ? {} : { previousContentMetadataFile: required(options, "previousContent") }),
        ...(options.closureArtifact == null ? {} : { closureArtifactFile: required(options, "closureArtifact") }),
        ...(options.standaloneArtifact == null ? {} : { standaloneArtifactFile: required(options, "standaloneArtifact") }),
        ...(options.resourceReceipt == null ? {} : { resourceReceiptFile: required(options, "resourceReceipt") }),
        ...(options.capsules == null ? {} : { capsulesRoot: required(options, "capsules") }),
        ...(options.platforms == null ? {} : { platformsRoot: required(options, "platforms") }),
        ...(options.dataResources == null ? {} : { dataResourcesRoot: required(options, "dataResources") }),
        ...(options.dataResource == null ? {} : { dataResourceReceiptFiles: Array.isArray(options.dataResource)
          ? options.dataResource as string[] : [required(options, "dataResource")] }),
        output: required(options, "output"), receipt: required(options, "receipt") });
    });

  cli.command("finalize", "Verify contributions and finalize signed release metadata")
    .option("--policy <file>", "Release policy receipt")
    .option("--prepared <directory>", "Downloaded prepared content")
    .option("--distributions <directory>", "Downloaded Shell contributions")
    .option("--output <directory>", "Finalized output")
    .option("--receipt <file>", "Finalized pack receipt")
    .action(async (options: Options) => {
      await finalizeReleaseContent({ policy: required(options, "policy"), prepared: required(options, "prepared"),
        distributions: required(options, "distributions"), output: required(options, "output"), receipt: required(options, "receipt") });
    });

  cli.command("publish", "Publish and read back immutable release objects")
    .option("--pack-receipt <file>", "Finalized pack receipt")
    .option("--policy <file>", "Release policy receipt")
    .option("--endpoint-url <url>", "Storage endpoint")
    .option("--bucket <name>", "Storage bucket")
    .option("--public-base-url <url>", "Public storage origin")
    .option("--receipt <file>", "Publication receipt")
    .action(async (options: Options) => {
      await publishExactRelease({ packReceipt: required(options, "packReceipt"), policyReceipt: required(options, "policy"),
        endpointUrl: required(options, "endpointUrl"), bucket: required(options, "bucket"), publicBaseUrl: required(options, "publicBaseUrl") }, required(options, "receipt"));
    });

  cli.command("activate", "Activate a published release after complete acceptance")
    .option("--publish-receipt <file>", "Unmodified publication receipt")
    .option("--policy <file>", "Release policy receipt")
    .option("--channel-head <file>", "Relocated channel head; original digest remains authoritative")
    .option("--acceptances <directory>", "Installed acceptance credentials")
    .option("--receipt <file>", "Activation receipt")
    .action(async (options: Options) => {
      const directory = required(options, "acceptances");
      const acceptanceCredentials = (await readdir(directory)).filter(name => name.endsWith(".json")).sort().map(name => join(directory, name));
      await activateExactRelease({ publishReceipt: required(options, "publishReceipt"), policyReceipt: required(options, "policy"),
        channelHeadFile: required(options, "channelHead"), acceptanceCredentials }, required(options, "receipt"));
    });

  cli.command("baseline <operation>", "Fetch an upgrade-test baseline or promote a newly accepted baseline")
    .option("--publish-receipt <file>", "Publication receipt (promote)")
    .option("--activation-receipt <file>", "Activation receipt (promote)")
    .option("--acceptance <file>", "Installed Electron acceptance (promote)")
    .option("--channel-head <file>", "Relocated channel head (promote)")
    .option("--policy <file>", "Release policy receipt")
    .option("--root <directory>", "Checked-out source root")
    .option("--registry <file>", "Identity registry relative to root", { default: "tools/release/resources/exact-plan-identities.json" })
    .option("--plan <file>", "Accepted release plan (fetch)")
    .option("--validation <file>", "Current successful Shell test result (fetch)")
    .option("--channel <name>", "Release channel (fetch)")
    .option("--release-version <version>", "Release version (fetch)")
    .option("--source-commit <sha>", "Source commit (fetch)")
    .option("--target <target>", "Platform architecture (fetch)")
    .option("--output <directory>", "Baseline installer for upgrade acceptance (fetch)")
    .option("--receipt <file>", "Result receipt")
    .action(async (operation: string, options: Options) => {
      const root = resolve(required(options, "root"));
      const shared = { root, registry: resolve(root, required(options, "registry")), policyReceipt: required(options, "policy") };
      const receipt = required(options, "receipt");
      if (operation === "fetch") await fetchAcceptedElectronBaseline({ ...shared,
        releasePlan: required(options, "plan"), channel: required(options, "channel"), releaseVersion: required(options, "releaseVersion"),
        sourceCommit: required(options, "sourceCommit"), target: required(options, "target"), outputDirectory: required(options, "output"),
        validationReceipt: required(options, "validation") }, receipt);
      else if (operation === "promote") await promoteAcceptedElectronBaseline({ ...shared,
        publishReceipt: required(options, "publishReceipt"), activationReceipt: required(options, "activationReceipt"),
        acceptanceCredential: required(options, "acceptance"), channelHeadFile: required(options, "channelHead") }, receipt);
      else throw new Error("baseline operation must be fetch or promote");
    });

  for (const product of ["capsule", "platform", "base"] as const) {
    const command = cli.command(product + " <operation>", "Export or import a verified portable " + product + " artifact")
      .option("--target <target>", "Expected native target")
      .option("--output <directory>", "New product directory")
      .option("--build-receipt <file>", "Business build receipt (export or pack)")
      .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
      .option("--receipt <file>", "Optional operation receipt; defaults to stdout");
    if (product === "base") command.option("--source <directory>", "Portable base transport directory (unpack)");
    command.action(async (operation: string, options: Options) => {
      const common = { target: required(options, "target"), output: required(options, "output") };
      if (product === "base" && (operation === "pack" || operation === "unpack")) {
        const result = operation === "pack" ? await packBase({ ...common, buildReceipt: required(options, "buildReceipt") })
          : await unpackBase({ ...common, source: required(options, "source") });
        await emit(options, { schemaVersion: 1, operation: "exact.base." + operation, ...result }); return;
      }
      const importer = product === "platform" ? importPlatform : product === "capsule" ? importCapsule : importBase;
      const exporter = product === "platform" ? exportPlatform : product === "capsule" ? exportCapsule : exportBase;
      const result = operation === "import" ? await importer({ ...common, descriptor: required(options, "descriptor") })
        : operation === "export" ? await exporter({ ...common, buildReceipt: required(options, "buildReceipt") })
        : (() => { throw new Error(product + " operation must be export or import"); })();
      await emit(options, { schemaVersion: 1, operation: "exact." + product + "." + operation, ...result });
    });
  }

  cli.command("resource <operation>", "Export or import an independently verified data resource")
    .option("--resource-id <id>", "Public Closure data resource group")
    .option("--output <directory>", "New resource directory")
    .option("--resource-receipt <file>", "Business build receipt (export)")
    .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
    .option("--receipt <file>", "Optional operation receipt; defaults to stdout")
    .action(async (operation: string, options: Options) => {
      const common = { resourceId: required(options, "resourceId"), output: required(options, "output") };
      const result = operation === "import" ? await importDataResource({ ...common, descriptor: required(options, "descriptor") })
        : operation === "export" ? await exportDataResource({ ...common, resourceReceipt: required(options, "resourceReceipt") })
        : (() => { throw new Error("resource operation must be export or import"); })();
      await emit(options, { schemaVersion: 1, operation: "exact.resource." + operation, ...result });
    });

  cli.command("scene <operation>", "Transport or verify a release-neutral scene")
    .option("--scene <directory>", "Source scene (pack or verify)")
    .option("--archive <file>", "Source archive (unpack)")
    .option("--output <path>", "New archive (pack) or new scene directory (unpack/import)")
    .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
    .option("--transport <file>", "New local scene.tar for downstream transfer (import)")
    .option("--target <target>", "Expected scene target (verify)")
    .option("--receipt <file>", "Optional receipt; defaults to stdout")
    .action(async (operation: string, options: Options) => {
      if (operation === "verify") {
        await emit(options, { schemaVersion: 1, operation: "exact.scene.verify",
          ...await verifySceneArtifact(required(options, "scene"), required(options, "target")) }); return;
      }
      const output = required(options, "output");
      const result = operation === "pack" ? await packSceneArtifact(required(options, "scene"), output)
        : operation === "unpack" ? await unpackSceneArtifact(required(options, "archive"), output)
        : operation === "import" ? await importSceneArtifact({ descriptor: required(options, "descriptor"), transport: required(options, "transport"), output })
        : (() => { throw new Error("scene operation must be pack, unpack, import or verify"); })();
      await emit(options, { schemaVersion: 1, operation: "exact.scene." + operation, ...result });
    });

  cli.command("policy <operation>", "Resolve release policy or authorize an operation")
    .option("--profile <name>", "Release profile (resolve)")
    .option("--channel <name>", "Release channel")
    .option("--release-version <version>", "Channel-scoped release version")
    .option("--source-commit <sha>", "Exact source commit")
    .option("--source-ref <ref>", "Source reference (resolve)")
    .option("--endpoint-url <url>", "Storage endpoint (resolve)")
    .option("--bucket <name>", "Storage bucket (resolve)")
    .option("--public-base-url <url>", "Public storage origin (resolve)")
    .option("--end-user-distribution <boolean>", "Explicit true or false (resolve)")
    .option("--stable-authorized <boolean>", "Explicit true or false (resolve)")
    .option("--policy <file>", "Policy receipt (authorize)")
    .option("--capability <name>", "Required capability (authorize)")
    .option("--receipt <file>", "Optional receipt; defaults to stdout")
    .action(async (operation: string, options: Options) => {
      const identity = { channel: required(options, "channel"), releaseVersion: required(options, "releaseVersion"), sourceCommit: required(options, "sourceCommit") };
      if (operation === "authorize") {
        await emit(options, await authorizeReleaseCapability({ schemaVersion: 1, operation: "release.authorize", ...identity,
          policyReceipt: required(options, "policy"), capability: required(options, "capability") }));
      } else if (operation === "resolve") {
        const endpointUrl = required(options, "endpointUrl"), bucket = required(options, "bucket");
        await emit(options, resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", ...identity,
          profile: required(options, "profile"), sourceRef: required(options, "sourceRef"),
          switches: { endUserDistribution: boolean(options, "endUserDistribution"), stableAuthorized: boolean(options, "stableAuthorized") },
          target: { endpointUrl, bucket, publicBaseUrl: required(options, "publicBaseUrl"),
            latestChannelHeadUrl: `${endpointUrl}/${bucket}/${exactStorageObject({ channel: identity.channel, kind: "channel-head" }).key}` },
        }));
      } else throw new Error("policy operation must be resolve or authorize");
    });
}
