import type { CAC } from "cac";
import { required, emit, type Options } from "./command-input.ts";
import { materializeReleaseValidations, validateReleaseRecipe } from "./validation.ts";

export function registerValidationCommands(cli: CAC): void {
  cli.command("validation <operation>", "Materialize selected validation evidence and bind the current subject")
    .option("--sources <file>", "Selected validation inputs")
    .option("--root <directory>", "Workspace root")
    .option("--source-commit <sha>", "Current validation subject")
    .option("--output <directory>", "Evidence and binding output")
    .option("--receipt <file>", "Materialization receipt")
    .action(async (operation: string, options: Options) => {
      if (operation !== "materialize") throw new Error("unsupported validation operation");
      await emit(options, await materializeReleaseValidations({ sources: required(options, "sources"),
        root: required(options, "root"), sourceCommit: required(options, "sourceCommit"), output: required(options, "output") }));
    });
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
}
