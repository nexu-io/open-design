import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const uiP0WorkflowPath = ".github/workflows/ui-p0-pr.yml";
const ciWorkflowPath = ".github/workflows/ci.yml";

type NormalizedPathRule = {
  kind: "exact" | "prefix";
  value: string;
};

async function main(): Promise<void> {
  const [uiP0Workflow, ciWorkflow] = await Promise.all([
    readFile(path.join(repoRoot, uiP0WorkflowPath), "utf8"),
    readFile(path.join(repoRoot, ciWorkflowPath), "utf8"),
  ]);

  const uiP0Rules = normalizeRules(extractUiP0WorkflowPaths(uiP0Workflow));
  const ciRules = normalizeRules(extractCiUiP0Rules(ciWorkflow));

  const missingFromCi = difference(uiP0Rules, ciRules);
  const missingFromWorkflow = difference(ciRules, uiP0Rules);

  if (missingFromCi.length || missingFromWorkflow.length) {
    console.error("UI P0 PR path rules drifted between ui-p0-pr.yml and ci.yml.");
    if (missingFromCi.length) {
      console.error(`\nRules present in ${uiP0WorkflowPath} but missing from ${ciWorkflowPath}:`);
      for (const rule of missingFromCi) console.error(`- ${rule}`);
    }
    if (missingFromWorkflow.length) {
      console.error(`\nRules present in ${ciWorkflowPath} but missing from ${uiP0WorkflowPath}:`);
      for (const rule of missingFromWorkflow) console.error(`- ${rule}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`UI P0 PR path parity passed (${uiP0Rules.length} rules).`);
}

function extractUiP0WorkflowPaths(source: string): string[] {
  const blockMatch = source.match(/pull_request:\n\s+paths:\n(?<block>(?:\s+- .+\n)+)/u);
  const block = blockMatch?.groups?.block;
  if (!block) {
    throw new Error(`Unable to find pull_request.paths in ${uiP0WorkflowPath}.`);
  }

  return block
    .split("\n")
    .map((line) => line.trim().match(/^-\s+(.+)$/u)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function extractCiUiP0Rules(source: string): string[] {
  const blockMatch = source.match(/^\s*if \[\[ (?<condition>[^\n]+) \]\]; then\n\s+ui_p0_pr_required=true$/mu);
  const condition = blockMatch?.groups?.condition;
  if (!condition) {
    throw new Error(`Unable to find ui_p0_pr_required path condition in ${ciWorkflowPath}.`);
  }

  return [...condition.matchAll(/\$file"\s+==\s+"([^"]+)"(\*)?/gu)].map((match) => `${match[1]}${match[2] ?? ""}`);
}

function normalizeRules(paths: string[]): string[] {
  return paths
    .map(normalizeRule)
    .map((rule) => `${rule.kind}:${rule.value}`)
    .sort();
}

function normalizeRule(value: string): NormalizedPathRule {
  if (value.endsWith("/**")) {
    return { kind: "prefix", value: value.slice(0, -2) };
  }
  if (value.endsWith("*")) {
    return { kind: "prefix", value: value.slice(0, -1) };
  }
  return { kind: "exact", value };
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

await main();
