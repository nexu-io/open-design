// Exit codes: 0 clean, 1 issues found, 2 setup error.

import { statSync } from "node:fs";
import { resolve } from "node:path";
import { cac } from "cac";

import { renderFixHuman, renderHuman, renderJson } from "./report.js";
import { proposeFixes, scanOdProjects } from "./scan.js";

type CliOptions = {
  json?: boolean;
  quiet?: boolean;
  fix?: boolean;
  apply?: boolean;
};

function resolveOdRoot(arg: string | undefined): string {
  const candidate = arg ? resolve(arg) : resolve(".od/projects");
  let st;
  try {
    st = statSync(candidate);
  } catch {
    throw new Error(`OD projects root not found at ${candidate}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`OD projects root is not a directory: ${candidate}`);
  }
  return candidate;
}

async function run(arg: string | undefined, options: CliOptions): Promise<void> {
  const odRoot = resolveOdRoot(arg);
  if (options.fix === true) {
    const summary = proposeFixes(odRoot, options.apply === true);
    if (options.json === true) {
      process.stdout.write(`${renderJson({ fix: summary, scan: scanOdProjects(odRoot) })}\n`);
    } else if (options.quiet !== true) {
      process.stdout.write(renderFixHuman(summary));
    }
    process.exit(summary.proposals.length > 0 && !summary.applied ? 1 : 0);
  }
  const result = scanOdProjects(odRoot);
  if (options.json === true) {
    process.stdout.write(`${renderJson(result)}\n`);
  } else if (options.quiet !== true) {
    process.stdout.write(renderHuman(result));
  }
  const totalIssues =
    result.totals.deadRefs +
    result.totals.schemaProjects +
    result.totals.orphanProjects;
  process.exit(totalIssues > 0 ? 1 : 0);
}

const die = (error: unknown): never => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
};

process.on("uncaughtException", die);
process.on("unhandledRejection", die);

const cli = cac("tools-link-check");

cli
  .command("[od-root]", "Scan an .od/projects/ tree for dead links, schema issues, and orphan files")
  .option("--json", "Print JSON instead of human report")
  .option("--quiet", "Suppress report; exit 0/1 only")
  .option("--fix", "Propose rewrites of dead refs to the current numbered sibling (dry-run by default)")
  .option("--apply", "With --fix, actually rewrite the files in place")
  .action((odRoot: string | undefined, options: CliOptions) => {
    void run(odRoot, options).catch(die);
  });

cli.help();
cli.parse();
