import type { CAC } from "cac";
import { required, emit, type Options } from "./command-input.ts";
import { buildToolchain, importToolchain, unpackToolchain } from "./toolchain-artifact.ts";

export function registerToolchainCommands(cli: CAC): void {
  cli.command("toolchain <operation>", "Produce or acquire an immutable native build package")
    .option("--root <directory>", "Built workspace (build)")
    .option("--target <target>", "Matching native host")
    .option("--output <directory>", "New artifact or restored package directory")
    .option("--source <directory>", "Portable product directory (unpack)")
    .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
    .option("--receipt <file>", "Optional result receipt")
    .action(async (operation: string, options: Options) => {
      const common = { target: required(options, "target"), output: required(options, "output") };
      if (operation === "build") await emit(options, await buildToolchain({ ...common, root: required(options, "root") }));
      else if (operation === "unpack") await emit(options, await unpackToolchain({ ...common, source: required(options, "source") }));
      else if (operation === "import") await emit(options, await importToolchain({ ...common, descriptor: required(options, "descriptor") }));
      else throw new Error("toolchain operation must be build, unpack or import");
    });
}
