import type { CAC } from "cac";
import { required, type Options } from "./command-input.ts";
import { buildReleaseDistribution } from "./distribution-build.ts";
import { exportReleaseDistribution } from "./distribution-artifact.ts";

/** Version-bound delivery grammar is not a reusable production recipe. */
export function registerDistributionCommands(cli: CAC): void {
  cli.command("distribution <operation>", "Assemble or restore a version-bound native installer")
    .option("--root <directory>", "Workspace owning the native build toolchain")
    .option("--shell <name>", "electron or terminal")
    .option("--target <target>", "Native platform architecture")
    .option("--output <directory>", "Native installer output")
    .option("--receipt <file>", "Distribution receipt")
    .option("--transport-output <directory>", "Fresh installer-only publication transport")
    .option("--retain-result <boolean>", "Persist/reuse completed version-bound installer bytes")
    .option("--base-receipt <file>", "Verified neutral base receipt (Electron)")
    .option("--base-directory <directory>", "Restored neutral base product (Electron)")
    .option("--scene <directory>", "Verified scene")
    .option("--prepared <directory>", "Bound signed installation inputs")
    .option("--policy <file>", "Release policy")
    .option("--channel <name>", "Release channel")
    .option("--release-version <version>", "Release version")
    .option("--source-commit <sha>", "Exact source commit")
    .action(async (operation: string, options: Options) => {
      if (operation !== "build") throw new Error("distribution operation must be build");
      if (options.retainResult != null && !["true", "false"].includes(String(options.retainResult))) {
        throw new Error("--retain-result requires true or false");
      }
      await buildReleaseDistribution({
        root: required(options, "root"), shell: required(options, "shell"), target: required(options, "target"),
        output: required(options, "output"), receipt: required(options, "receipt"),
        scene: required(options, "scene"), prepared: required(options, "prepared"),
        policy: required(options, "policy"), channel: required(options, "channel"),
        releaseVersion: required(options, "releaseVersion"), sourceCommit: required(options, "sourceCommit"),
        retainResult: options.retainResult === "true",
        ...(options.baseReceipt == null ? {} : { baseReceipt: required(options, "baseReceipt") }),
        ...(options.baseDirectory == null ? {} : { baseDirectory: required(options, "baseDirectory") }),
      });
      if (options.transportOutput != null) await exportReleaseDistribution({
        source: required(options, "output"), output: required(options, "transportOutput"),
      });
    });
}
