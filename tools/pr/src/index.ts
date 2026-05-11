/**
 * tools-pr — maintainer PR-duty control plane for nexu-io/open-design.
 *
 * Thin gh wrapper that encodes review knowledge specific to this repo: lane
 * derivation, forbidden-surface flags, per-lane checklists, and validation
 * command derivation from touched paths.
 */

import { cac } from "cac";

import { runAssignment, type AssignmentOptions } from "./assignment.js";
import {
  runClassifyAll,
  runClassifyOne,
  type ClassifyOptions,
} from "./classify.js";
import { runList, type ListOptions } from "./list.js";
import { runView, type ViewOptions } from "./view.js";

const cli = cac("tools-pr");

cli
  .command("list", "Triage open PRs by lane and review state")
  .option("--json", "print JSON")
  .option("--include-drafts", "include draft PRs")
  .option("--limit <n>", "limit (default 1000; pass a smaller value to truncate)")
  .option("--lane <list>", "lane filter: skill,design-system,craft,contract,docs,default,multi")
  .option("--bucket <list>", "bucket filter: merge-ready,approved-blocked,needs-rebase,changes-requested,new,stale,draft")
  .option("--author <list>", "author login filter (comma-separated)")
  .action(async (options: ListOptions) => {
    await runList(options);
  });

cli
  .command("view <num>", "Agent-friendly review brief for a single PR")
  .option("--json", "print JSON")
  .action(async (numStr: string, options: ViewOptions) => {
    await runView(Number(numStr), options);
  });

cli
  .command(
    "assignment",
    "Assigner-perspective view of PR ownership — who has what, how long, what blockers",
  )
  .option("--json", "structured output to stdout")
  .option("--user <login>", "filter to one assignee (login or 'me')")
  .option("--unassigned", "list every unassigned PR (default collapses to count)")
  .option("--include-drafts", "include draft PRs (default skips)")
  .option("--limit <n>", "max open PRs to consider (default 1000)")
  .action(async (options: AssignmentOptions) => {
    await runAssignment(options);
  });

cli
  .command("classify [num]", "Emit script-level tags for one PR or the full open queue")
  .option("--all", "classify the full open queue and write JSON to .tmp/tools-pr/classify/")
  .option("--json", "with <num>: print JSON to stdout (default is human)")
  .option("--name <stem>", "with --all: filename stem (default: ISO timestamp)")
  .option("--print", "with --all: also print the report JSON to stdout")
  .option("--limit <n>", "with --all: limit (default 1000; pass a smaller value to truncate)")
  .action(async (numArg: string | undefined, options: ClassifyOptions) => {
    if (options.all) {
      await runClassifyAll(options);
      return;
    }
    if (numArg === undefined) {
      throw new Error("classify needs a PR number or --all");
    }
    await runClassifyOne(Number(numArg), options);
  });

cli.help();
cli.parse();
