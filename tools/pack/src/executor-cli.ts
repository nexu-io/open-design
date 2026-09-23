import { cac } from "cac";

import { exportReleaseExecutorProduct } from "./executor/product.js";

const cli = cac("tools-pack executor");

cli.command("export", "Export the platform release executor as one immutable product")
  .option("--output <path>", "release executor tar.gz destination")
  .option("--json", "print JSON result metadata")
  .action(async (options: { json?: boolean; output?: string }) => {
    if (options.output == null || options.output.length === 0) throw new Error("--output is required");
    const result = await exportReleaseExecutorProduct({ output: options.output });
    process.stdout.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
  });

cli.help();
cli.parse();
