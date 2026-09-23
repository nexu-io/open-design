import { cac } from "cac";

import { workspaceCommand, type WorkspaceCommandOptions } from "./workspace/command.js";

const cli = cac("tools-pack workspace");

cli.command("<action> <unit>", "Build, verify, export or import workspace outputs")
  .option("--web-output-mode <mode>", "web output: standalone|server", { default: "standalone" })
  .option("--output <path>", "export built outputs to an archive directory")
  .option("--scratch <path>", "isolated workspace import staging directory")
  .option("--url <url>", "verified source archive URL")
  .option("--sha256 <digest>", "expected source archive SHA-256")
  .option("--sources <json>", "JavaScript source descriptors: unit, url and sha256")
  .option("--json", "print JSON result metadata")
  .action(async (action: string, unit: string, options: WorkspaceCommandOptions) => {
    process.stdout.write(`${JSON.stringify(await workspaceCommand(action, unit, options), null, 2)}\n`);
  });

cli.help();
cli.parse();
