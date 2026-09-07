import type { CAC } from "cac";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exactStorageObject } from "@open-design/release";
import { authorizeReleaseCapability, resolveReleasePolicy } from "../policy/release-profile.ts";
import { writeObject } from "./control-common.ts";
import { packSceneArtifact, unpackSceneArtifact } from "./scene-artifact.ts";
import { activateExactRelease, promoteAcceptedElectronBaseline, publishExactRelease, stageAcceptedElectronContribution } from "./control-release.ts";

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

  cli.command("baseline <operation>", "Stage an accepted Shell or promote a newly accepted baseline")
    .option("--publish-receipt <file>", "Publication receipt (promote)")
    .option("--activation-receipt <file>", "Activation receipt (promote)")
    .option("--acceptance <file>", "Installed Electron acceptance (promote)")
    .option("--channel-head <file>", "Relocated channel head (promote)")
    .option("--policy <file>", "Release policy receipt")
    .option("--root <directory>", "Checked-out source root")
    .option("--registry <file>", "Identity registry relative to root", { default: "tools/release/resources/exact-plan-identities.json" })
    .option("--plan <file>", "Accepted release plan (stage)")
    .option("--channel <name>", "Release channel (stage)")
    .option("--release-version <version>", "Release version (stage)")
    .option("--source-commit <sha>", "Source commit (stage)")
    .option("--target <target>", "Platform architecture (stage)")
    .option("--output <directory>", "Staged distribution (stage)")
    .option("--receipt <file>", "Result receipt")
    .action(async (operation: string, options: Options) => {
      const root = resolve(required(options, "root"));
      const shared = { root, registry: resolve(root, required(options, "registry")), policyReceipt: required(options, "policy") };
      const receipt = required(options, "receipt");
      if (operation === "stage") await stageAcceptedElectronContribution({ ...shared,
        releasePlan: required(options, "plan"), channel: required(options, "channel"), releaseVersion: required(options, "releaseVersion"),
        sourceCommit: required(options, "sourceCommit"), target: required(options, "target"), outputDirectory: required(options, "output") }, receipt);
      else if (operation === "promote") await promoteAcceptedElectronBaseline({ ...shared,
        publishReceipt: required(options, "publishReceipt"), activationReceipt: required(options, "activationReceipt"),
        acceptanceCredential: required(options, "acceptance"), channelHeadFile: required(options, "channelHead") }, receipt);
      else throw new Error("baseline operation must be stage or promote");
    });

  cli.command("scene <operation>", "Pack or unpack a lossless scene transport")
    .option("--scene <directory>", "Source scene (pack)")
    .option("--archive <file>", "Source archive (unpack)")
    .option("--output <path>", "New archive (pack) or new scene directory (unpack)")
    .option("--receipt <file>", "Optional receipt; defaults to stdout")
    .action(async (operation: string, options: Options) => {
      const output = required(options, "output");
      const result = operation === "pack" ? await packSceneArtifact(required(options, "scene"), output)
        : operation === "unpack" ? await unpackSceneArtifact(required(options, "archive"), output)
        : (() => { throw new Error("scene operation must be pack or unpack"); })();
      await emit(options, { schemaVersion: 1, operation: `exact.scene.${operation}`, ...result });
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
