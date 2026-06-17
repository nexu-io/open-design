import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const ciWorkflowPath = ".github/workflows/ci.yml";
const ciChangeScopesPath = "scripts/ci-change-scopes.ts";
const uiP0ShardsPath = "e2e/scripts/ui-p0-shards.ts";

async function main(): Promise<void> {
  const [ciWorkflow, ciChangeScopes, uiP0Shards] = await Promise.all([
    readFile(path.join(repoRoot, ciWorkflowPath), "utf8"),
    readFile(path.join(repoRoot, ciChangeScopesPath), "utf8"),
    readFile(path.join(repoRoot, uiP0ShardsPath), "utf8"),
  ]);

  const errors = [
    ...checkCiScopeOutput(ciWorkflow),
    ...checkUiP0Jobs(ciWorkflow),
    ...checkShardMatrix(ciWorkflow, uiP0Shards),
    ...checkScopeRules(ciChangeScopes),
  ];

  if (errors.length > 0) {
    console.error("UI P0 CI wiring check failed.");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("UI P0 CI wiring check passed.");
}

function checkCiScopeOutput(source: string): string[] {
  const required = [
    "ui_p0_pr_required: ${{ steps.detect.outputs.ui_p0_pr_required }}",
    "needs.change_scopes.outputs.ui_p0_pr_required == 'true'",
  ];
  return required
    .filter((needle) => !source.includes(needle))
    .map((needle) => `${ciWorkflowPath} is missing ${needle}`);
}

function checkUiP0Jobs(source: string): string[] {
  const required = [
    "ui_p0_smoke:",
    "name: UI P0 smoke",
    "ui_p0:",
    "name: UI P0 (${{ matrix.name }})",
    "pnpm -C e2e exec tsx scripts/ui-p0-shards.ts smoke",
    "pnpm -C e2e exec tsx scripts/ui-p0-shards.ts ${{ matrix.shard }}",
  ];
  return required
    .filter((needle) => !source.includes(needle))
    .map((needle) => `${ciWorkflowPath} is missing ${needle}`);
}

function checkShardMatrix(ciWorkflow: string, uiP0Shards: string): string[] {
  const matrixShards = extractCiMatrixShards(ciWorkflow);
  const definedShards = extractUiP0ShardNames(uiP0Shards).filter((name) => !["smoke", "settings-smoke"].includes(name));
  return [
    ...difference(definedShards, matrixShards).map((name) => `${ciWorkflowPath} matrix is missing UI P0 shard ${name}`),
    ...difference(matrixShards, definedShards).map((name) => `${ciWorkflowPath} matrix contains unknown UI P0 shard ${name}`),
  ];
}

function checkScopeRules(source: string): string[] {
  const required = [
    "function isUiP0RelevantFile(file: string): boolean",
    '"apps/web/"',
    '"apps/daemon/"',
    '"e2e/ui/"',
    '"e2e/lib/"',
    '"e2e/scripts/"',
    '".github/actions/setup-playwright/"',
    '".github/actions/setup-workspace/"',
    '".github/workflows/ci.yml"',
    '".github/workflows/ui-extended-main.yml"',
  ];
  return required
    .filter((needle) => !source.includes(needle))
    .map((needle) => `${ciChangeScopesPath} is missing ${needle}`);
}

function extractCiMatrixShards(source: string): string[] {
  const jobMatch = source.match(/\n  ui_p0:\n(?<body>[\s\S]+?)\n\n  playwright_visual:/u);
  const body = jobMatch?.groups?.body;
  if (!body) throw new Error(`Unable to find ui_p0 job in ${ciWorkflowPath}.`);
  return [...body.matchAll(/^\s+shard:\s+([a-z0-9-]+)\s*$/gmu)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .sort();
}

function extractUiP0ShardNames(source: string): string[] {
  const objectMatch = source.match(/const shards: Record<string, Shard> = \{(?<body>[\s\S]+?)\n\};/u);
  const body = objectMatch?.groups?.body;
  if (!body) throw new Error(`Unable to find shards object in ${uiP0ShardsPath}.`);
  return [...body.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s+\{/gmu)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

await main();
