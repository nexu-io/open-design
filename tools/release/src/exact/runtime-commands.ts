import type { CAC } from "cac";
import { required, type Options } from "./command-input.ts";
import { acquireRuntimeResources, buildRuntimeResourceBatch } from "./runtime-resources.ts";

export function registerRuntimeCommands(cli: CAC): void {
  cli.command("runtime <operation>", "Build runtime misses or acquire a complete scene input set")
    .option("--sources <file>", "Runtime resource IDs and optional verified artifact descriptors")
    .option("--target <target>", "Native platform architecture")
    .option("--root <directory>", "Prepared workspace (build)")
    .option("--products <directory>", "Current-run products (acquire)")
    .option("--output <directory>", "Fresh product directory")
    .option("--receipt <file>", "Operation result")
    .action(async (operation: string, options: Options) => {
      if (operation !== "build" && operation !== "acquire") throw new Error("runtime operation must be build or acquire");
      const allowed = new Set(["sources", "target", "output", "receipt", "--", operation === "build" ? "root" : "products"]);
      for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`runtime ${operation} does not accept --${key}`);
      const input = { sources: required(options, "sources"), target: required(options, "target"),
        output: required(options, "output"), receipt: required(options, "receipt") };
      if (operation === "build") await buildRuntimeResourceBatch({ ...input, root: required(options, "root") });
      else await acquireRuntimeResources({ ...input, products: required(options, "products") });
    });
}
