import type { CAC } from "cac";
import { exportDataResource, importDataResource } from "./resource-artifact.ts";
import { buildReleaseDataResources, materializeReleaseDataResources } from "./resource-build.ts";
import { acquireReleaseDataResources } from "./resource-acquisition.ts";
import { required, emit, type Options } from "./command-input.ts";

export function registerResourceCommands(cli: CAC): void {
  cli.command("resource <operation>", "Export or import an independently verified data resource")
    .option("--root <directory>", "Source data checkout (build)")
    .option("--resource-ids <json>", "Selected resource IDs as a JSON array (build)")
    .option("--sources <file>", "Business resource sources: IDs and optional verified artifact descriptors (materialize/acquire)")
    .option("--products <directory>", "Current-run local products (acquire)")
    .option("--resource-id <id>", "Public Closure data resource group")
    .option("--output <directory>", "New resource directory")
    .option("--resource-receipt <file>", "Business build receipt (export)")
    .option("--descriptor <file>", "Exact artifact URL and SHA-256 (import)")
    .option("--receipt <file>", "Optional operation receipt; defaults to stdout")
    .action(async (operation: string, options: Options) => {
      if (operation === "acquire") {
        const allowed = new Set(["sources", "products", "output", "receipt", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`resource acquire does not accept --${key}`);
        await acquireReleaseDataResources({ sources: required(options, "sources"), products: required(options, "products"),
          output: required(options, "output"), receipt: required(options, "receipt") });
        return;
      }
      if (operation === "materialize") {
        const allowed = new Set(["root", "sources", "output", "receipt", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`resource materialize does not accept --${key}`);
        await materializeReleaseDataResources({ root: required(options, "root"), sources: required(options, "sources"),
          output: required(options, "output"), receipt: required(options, "receipt") });
        return;
      }
      if (operation === "build") {
        const allowed = new Set(["root", "resourceIds", "output", "receipt", "--"]);
        for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`resource batch build does not accept --${key}`);
        await buildReleaseDataResources({ root: required(options, "root"), resourceIds: JSON.parse(required(options, "resourceIds")),
          output: required(options, "output"), receipt: required(options, "receipt") });
        return;
      }
      if (options.resourceIds != null || options.root != null || options.sources != null || options.products != null) throw new Error("batch options require resource build, materialize or acquire");
      const common = { resourceId: required(options, "resourceId"), output: required(options, "output") };
      const result = operation === "import" ? await importDataResource({ ...common, descriptor: required(options, "descriptor") })
        : operation === "export" ? await exportDataResource({ ...common, resourceReceipt: required(options, "resourceReceipt") })
        : (() => { throw new Error("resource operation must be export or import"); })();
      await emit(options, { schemaVersion: 1, operation: "exact.resource." + operation, ...result });
    });
}
