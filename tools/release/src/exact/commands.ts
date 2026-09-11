import type { CAC } from "cac";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exactStorageObject } from "@open-design/release";
import { authorizeReleaseCapability, resolveReleasePolicy } from "../policy/release-profile.ts";
import { writeObject } from "./control-common.ts";
import { importSceneArtifact, packSceneArtifact, unpackSceneArtifact, verifySceneArtifact } from "./scene-artifact.ts";
import { acquireSceneArtifacts } from "./scene-acquisition.ts";
import { acquireNativeArtifacts } from "./native-acquisition.ts";
import { activateExactRelease, promoteAcceptedElectronBaseline, publishExactRelease, fetchAcceptedElectronBaseline, inspectAcceptedElectronBaseline, selfCheckExactReleaseControl } from "./control-release.ts";
import { finalizeReleaseContent, prepareReleaseContent } from "./composition.ts";
import { registerResourceCommands } from "./resource-commands.ts";
import { registerRuntimeCommands } from "./runtime-commands.ts";
import { exportPlatform, importPlatform } from "./platform-artifact.ts";
import { exportCapsule, importCapsule } from "./capsule-artifact.ts";
import { exportBase, packBase, importBase, unpackBase } from "./base-artifact.ts";
import { fetchAcceptanceArtifact } from "./acceptance-artifact.ts";
import { collectReleaseAcceptance, updateAcceptanceClosure } from "./acceptance.ts";
import { collectExecutedAcceptance, exerciseReleaseInstallation } from "./acceptance-execution.ts";
import { registerValidationCommands } from "./validation-commands.ts";
import { registerDistributionCommands } from "./distribution-commands.ts";
import { registerToolchainCommands } from "./toolchain-commands.ts";
import { registerBuildCommands } from "./build-commands.ts";
import { required, emit, type Options } from "./command-input.ts";
import { acquireArtifactProduct } from "./artifact-product.ts";
import { exportInstallationInput } from "./installation-input.ts";

function boolean(options: Options, key: string): boolean {
  const value = options[key];
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be true or false`);
}
/** One command grammar for the workspace tool and its relocatable CI build. */
export function registerExactCommands(cli: CAC): void {
  registerRuntimeCommands(cli);
  registerValidationCommands(cli);
  cli.command("artifact <operation>", "Acquire a checksum-bound opaque transport without repacking it")
    .option("--descriptor <file>", "Immutable URL and SHA-256 descriptor")
    .option("--output <directory>", "Fresh transport directory")
    .action(async (operation: string, options: Options) => {
      if (operation !== "acquire") throw new Error("unsupported artifact operation");
      await emit(options, await acquireArtifactProduct({ descriptor: required(options, "descriptor"), output: required(options, "output") }));
    });
  cli.command("installation <operation>", "Exercise a published installation and collect its bound evidence")
    .option("--publication <file>", "Publication receipt")
    .option("--policy <file>", "Release policy")
    .option("--shell <name>", "electron or terminal")
    .option("--target <target>", "Native platform architecture")
    .option("--work-root <directory>", "Caller-owned installation execution workspace")
    .option("--artifact <file>", "Verified installer to exercise")
    .option("--mode <mode>", "first or hot")
    .option("--baseline-receipt <file>", "Verified baseline acquisition receipt (hot)")
    .option("--inspection <file>", "Baseline compatibility receipt (Electron collection)")
    .option("--receipt <file>", "Final installed acceptance credential")
    .action(async (operation: string, options: Options) => {
      const input = { publication: required(options, "publication"), policy: required(options, "policy"),
        shell: required(options, "shell"), target: required(options, "target"), workRoot: required(options, "workRoot") };
      if (operation === "exercise") await exerciseReleaseInstallation({ ...input, artifact: required(options, "artifact"),
        mode: required(options, "mode"), ...(options.baselineReceipt == null ? {} : { baselineReceipt: required(options, "baselineReceipt") }) });
      else if (operation === "collect") await collectExecutedAcceptance({ ...input, receipt: required(options, "receipt"),
        ...(options.inspection == null ? {} : { inspection: required(options, "inspection") }) });
      else throw new Error("installation operation must be exercise or collect");
    });
  cli.command("[command]", "Show help when no command is given").action((command?: string) => {
    if (command != null) throw new Error(`Unknown command: ${command}`);
    cli.outputHelp();
  });
  cli.command("self-check", "Verify exact channel transition algebra").action(() => selfCheckExactReleaseControl());
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

  registerBuildCommands(cli);
  registerDistributionCommands(cli);
  registerToolchainCommands(cli);

  cli.command("prepare", "Compose and sign content from the declared Shell scenes")
    .option("--policy <file>", "Release policy receipt")
    .option("--channel <name>", "Release channel")
    .option("--release-version <version>", "Release version")
    .option("--source-commit <sha>", "Exact source commit")
    .option("--root <directory>", "Checked-out source root")
    .option("--shells <file>", "Business Shell/target input inventory")
    .option("--scenes <directory>", "Downloaded scene artifacts")
    .option("--standalone-version <version>", "Standalone runtime version")
    .option("--previous-content <file>", "Optional verified previous content envelope")
    .option("--version-input <directory>", "Frozen version input directory; retained across preparation retries")
    .option("--freeze-storage <boolean>", "Freeze/recover this version's input snapshot in policy-bound release storage")
    .option("--closure-artifact <file>", "Current Closure artifact; defaults to the scene seed")
    .option("--standalone-artifact <file>", "Current Standalone launcher; defaults to the scene seed")
    .option("--resource-receipt <file>", "Current complete Closure resource collection; defaults to the scene seed")
    .option("--capsules <directory>", "Current Capsule products under <target>/; defaults to the scene Capsule")
    .option("--platforms <directory>", "Independent platform products under <target>/ (required for Electron)")
    .option("--data-resource <file>", "Independent data receipt beside its archive; repeat for the complete data set")
    .option("--data-resources <directory>", "Complete independent data products under <resource-id>/")
    .option("--output <directory>", "Prepared content directory")
    .option("--native-output <directory>", "Optional minimal bound installation inputs, without CDN resource payloads")
    .option("--receipt <file>", "Preparation receipt")
    .action(async (options: Options) => {
      await prepareReleaseContent({ policy: required(options, "policy"), channel: required(options, "channel"),
        releaseVersion: required(options, "releaseVersion"), sourceCommit: required(options, "sourceCommit"), sourceRoot: required(options, "root"),
        shellInputs: required(options, "shells"), scenesRoot: required(options, "scenes"), standaloneVersion: required(options, "standaloneVersion"),
        ...(options.versionInput == null ? {} : { versionInputDirectory: required(options, "versionInput") }),
        ...(options.freezeStorage == null ? {} : { freezeStorage: boolean(options, "freezeStorage") }),
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
      if (options.nativeOutput != null) await exportInstallationInput({ source: required(options, "output"), output: required(options, "nativeOutput") });
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
    .option("--mode <mode>", "accepted (default), or betahyx candidate baseline without channel activation")
    .option("--github-env <file>", "Optional acceptance eligibility projection (inspect)")
    .option("--publish-receipt <file>", "Publication receipt (promote)")
    .option("--activation-receipt <file>", "Activation receipt (promote)")
    .option("--acceptance <file>", "Installed Electron acceptance (promote)")
    .option("--channel-head <file>", "Relocated channel head (promote)")
    .option("--policy <file>", "Release policy receipt")
    .option("--baseline <file>", "Verified accepted baseline snapshot (fetch)")
    .option("--validation <file>", "Current successful Shell test result (fetch)")
    .option("--channel <name>", "Release channel (fetch)")
    .option("--release-version <version>", "Release version (fetch)")
    .option("--source-commit <sha>", "Source commit (fetch)")
    .option("--target <target>", "Platform architecture (fetch)")
    .option("--output <directory>", "Baseline installer for upgrade acceptance (fetch)")
    .option("--receipt <file>", "Result receipt")
    .action(async (operation: string, options: Options) => {
      const shared = { policyReceipt: required(options, "policy") };
      const receipt = required(options, "receipt");
      if (operation === "inspect") await inspectAcceptedElectronBaseline({ publication: required(options, "publishReceipt"),
        policy: required(options, "policy"), target: required(options, "target"), receipt,
        ...(options.mode == null ? {} : { mode: required(options, "mode") }),
        ...(options.githubEnv == null ? {} : { githubEnv: required(options, "githubEnv") }) });
      else if (operation === "fetch") await fetchAcceptedElectronBaseline({ ...shared,
        baselineReceipt: required(options, "baseline"), publishReceipt: required(options, "publishReceipt"), channel: required(options, "channel"), releaseVersion: required(options, "releaseVersion"),
        sourceCommit: required(options, "sourceCommit"), target: required(options, "target"), outputDirectory: required(options, "output"),
        validationReceipt: required(options, "validation") }, receipt);
      else if (operation === "promote") await promoteAcceptedElectronBaseline({ ...shared,
        ...(options.mode == null ? {} : { mode: required(options, "mode") }),
        publishReceipt: required(options, "publishReceipt"), activationReceipt: required(options, "activationReceipt"),
        acceptanceCredential: required(options, "acceptance"), channelHeadFile: required(options, "channelHead") }, receipt);
      else throw new Error("baseline operation must be inspect, fetch or promote");
    });

  for (const product of ["capsule", "platform", "base"] as const) {
    const command = cli.command(product + " <operation>", "Export or import a verified portable " + product + " artifact")
      .option("--sources <file>", "Complete native source set (capsule/platform acquire)")
      .option("--target <target>", "Expected native target")
      .option("--output <directory>", "New product directory")
      .option("--build-receipt <file>", "Business build receipt (export or pack)")
      .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
      .option("--receipt <file>", "Optional operation receipt; defaults to stdout");
    if (product === "base") command.option("--source <directory>", "Portable base transport directory (unpack)");
    command.action(async (operation: string, options: Options) => {
      if (operation === "acquire" && (product === "capsule" || product === "platform")) {
        await acquireNativeArtifacts({ product, sources: required(options, "sources"), output: required(options, "output") }); return;
      }
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

  registerResourceCommands(cli);

  cli.command("scene <operation>", "Transport or verify a release-neutral scene")
    .option("--sources <file>", "Complete business scene source set (acquire)")
    .option("--source-commit <sha>", "Current transport namespace (acquire)")
    .option("--scene <directory>", "Source scene (pack or verify)")
    .option("--archive <file>", "Source archive (unpack)")
    .option("--output <path>", "New archive (pack) or new scene directory (unpack/import)")
    .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
    .option("--transport <file>", "New local scene.tar for downstream transfer (import)")
    .option("--target <target>", "Expected scene target (verify)")
    .option("--receipt <file>", "Optional receipt; defaults to stdout")
    .action(async (operation: string, options: Options) => {
      if (operation === "acquire") {
        await acquireSceneArtifacts({ sources: required(options, "sources"), sourceCommit: required(options, "sourceCommit"), output: required(options, "output") });
        return;
      }
      if (operation === "verify") {
        await emit(options, { schemaVersion: 1, operation: "exact.scene.verify",
          ...await verifySceneArtifact(required(options, "scene"), required(options, "target")) }); return;
      }
      const output = required(options, "output");
      const result = operation === "pack" ? await packSceneArtifact(required(options, "scene"), output)
        : operation === "unpack" ? await unpackSceneArtifact(required(options, "archive"), output)
        : operation === "import" ? await importSceneArtifact({ descriptor: required(options, "descriptor"), transport: required(options, "transport"), output })
        : (() => { throw new Error("scene operation must be acquire, pack, unpack, import or verify"); })();
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
