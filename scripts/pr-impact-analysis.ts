import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const rulesRoot = path.join(repoRoot, "docs/testing/pr-impact-analysis");

const skippedDirectories = new Set([".git", ".od", ".tmp", "node_modules", "dist", ".next", "out"]);
const tierOrder = ["tier-0", "tier-1", "tier-2"] as const;

type Tier = (typeof tierOrder)[number];
type Validation = { required: string[]; recommended: string[]; optional: string[] };
type PathEvidence = { glob: string; weight: number; reason?: string };
type Capability = {
  id: string;
  groupId: string;
  name: string;
  priority: string;
  defaultTierOnMatch: Tier;
  confidence: string;
  reason: string;
  manualQaRequired: boolean;
  ownerRole: string;
  pathGlobs: PathEvidence[];
  validation?: unknown;
};
type CapabilityGroup = { id: string; childCapabilityIds: string[] };
type GlobalRiskSignal = {
  id: string;
  defaultTierOnMatch: Tier;
  pathGlobs: string[];
  reason: string;
  ownerRole?: string;
  validation?: Validation;
};
type CapabilitiesFile = {
  version: number;
  tiers: Record<Tier, unknown>;
  capabilityGroups: CapabilityGroup[];
  capabilities: Capability[];
  globalRiskSignals: GlobalRiskSignal[];
};
type CoverageRecord = {
  id: string;
  capabilityId: string;
  priority: string;
  confidence: string;
  reason: string;
  pathGlobs: string[];
  testPathGlobs: string[];
  validation: Validation;
  manualQaChecklistId: string;
};
type CoverageFile = { version: number; coverage: CoverageRecord[] };
type OwnersFile = {
  version: number;
  roles: { id: string }[];
  capabilityOwners: Owner[];
};
type Owner = { capabilityId: string; manualQa: { required: boolean; role: string; reason?: string }; checklist: string[] };
type Rules = { capabilities: CapabilitiesFile; coverage: CoverageFile; owners: OwnersFile };
type Match = { path: string; glob: string; weight?: number; reason?: string };
type CapabilityMatch = { capability: Capability; coverage: CoverageRecord; matches: Match[]; testEvidence: Match[] };
type CoverageEvidence = { coverage: CoverageRecord; testEvidence: Match[] };
type SignalMatch = { signal: GlobalRiskSignal; matches: Match[] };
type AnalysisResult = {
  advisory: true;
  tier: Tier;
  changedPaths: string[];
  capabilities: {
    id: string;
    name: string;
    groupId: string;
    confidence: string;
    reason: string;
    matchedFiles: Match[];
    changedTestEvidence: Match[];
    validation: Validation;
    manualQa: Owner | null;
  }[];
  testCoverageEvidence: { id: string; capabilityId: string; changedTestEvidence: Match[] }[];
  globalRiskSignals: {
    id: string;
    reason: string;
    matchedFiles: Match[];
    validation: Validation | null;
    ownerRole: string | null;
  }[];
  commands: string[];
  recommendedCommands: string[];
};

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  if (command === "validate") {
    const errors = await validateRules();
    if (errors.length > 0) {
      console.error(`PR impact analysis validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}).`);
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log("PR impact analysis validation passed.");
    return;
  }
  if (command === "analyze") {
    await analyze(args);
    return;
  }
  if (command === "format-github-comment") {
    const [analysisPath] = args;
    if (analysisPath == null) throw new Error("format-github-comment requires an analysis JSON path.");
    console.log(formatGithubComment(await readAnalysisResult(analysisPath)));
    return;
  }
  if (command === "required-ui-p0-shards") {
    const [analysisPath] = args;
    if (analysisPath == null) throw new Error("required-ui-p0-shards requires an analysis JSON path.");
    const knownShards = await readKnownUiP0Shards();
    for (const shard of requiredUiP0Shards(await readAnalysisResult(analysisPath), knownShards)) console.log(shard);
    return;
  }
  printUsage();
}

async function loadRules(): Promise<Rules> {
  const [capabilities, coverage, owners] = await Promise.all([
    readJson<CapabilitiesFile>("capabilities.json"),
    readJson<CoverageFile>("e2e-coverage.json"),
    readJson<OwnersFile>("owners.json"),
  ]);
  return { capabilities, coverage, owners };
}

async function readJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(path.join(rulesRoot, fileName), "utf8")) as T;
}

async function validateRules(): Promise<string[]> {
  const rules = await loadRules();
  const repoPaths = await listRepoPaths(repoRoot);
  const knownUiP0Shards = await readKnownUiP0Shards();
  const errors: string[] = [];
  const capabilityIds = new Set<string>();
  const capabilityById = new Map<string, Capability>();
  const groupIds = new Set(rules.capabilities.capabilityGroups.map((group) => group.id));
  const roleIds = new Set(rules.owners.roles.map((role) => role.id));
  const coverageIds = new Set<string>();
  const coverageCapabilityIds = new Set<string>();
  const ownerCapabilityIds = new Set(rules.owners.capabilityOwners.map((owner) => owner.capabilityId));

  for (const tier of tierOrder) {
    if (!(tier in rules.capabilities.tiers)) errors.push(`capabilities.tiers is missing ${tier}.`);
  }

  for (const capability of rules.capabilities.capabilities) {
    if (capabilityIds.has(capability.id)) errors.push(`Duplicate capability id: ${capability.id}.`);
    capabilityIds.add(capability.id);
    capabilityById.set(capability.id, capability);
    if (!groupIds.has(capability.groupId)) errors.push(`Capability ${capability.id} references missing group ${capability.groupId}.`);
    if (!roleIds.has(capability.ownerRole)) errors.push(`Capability ${capability.id} references missing owner role ${capability.ownerRole}.`);
    if (!ownerCapabilityIds.has(capability.id)) errors.push(`Capability ${capability.id} has no owners.json capabilityOwners entry.`);
    if (capability.validation != null) errors.push(`Capability ${capability.id} must not define validation; keep validation in e2e-coverage.json.`);
    for (const pathGlob of capability.pathGlobs) {
      validateGlobMatches(repoPaths, pathGlob.glob, `capability ${capability.id}`, errors);
      if (!Number.isInteger(pathGlob.weight) || pathGlob.weight < 1 || pathGlob.weight > 5) {
        errors.push(`Capability ${capability.id} glob ${pathGlob.glob} has invalid weight ${String(pathGlob.weight)}.`);
      }
    }
  }

  for (const group of rules.capabilities.capabilityGroups) {
    for (const childId of group.childCapabilityIds) {
      if (!capabilityIds.has(childId)) errors.push(`Group ${group.id} references missing capability ${childId}.`);
    }
  }

  for (const record of rules.coverage.coverage) {
    if (coverageIds.has(record.id)) errors.push(`Duplicate coverage id: ${record.id}.`);
    coverageIds.add(record.id);
    if (coverageCapabilityIds.has(record.capabilityId)) errors.push(`Multiple coverage records found for capability ${record.capabilityId}; keep validation guidance single-sourced.`);
    coverageCapabilityIds.add(record.capabilityId);
    if (!capabilityIds.has(record.capabilityId)) errors.push(`Coverage ${record.id} references missing capability ${record.capabilityId}.`);
    if (!ownerCapabilityIds.has(record.manualQaChecklistId)) errors.push(`Coverage ${record.id} references missing manual QA checklist ${record.manualQaChecklistId}.`);
    const capability = capabilityById.get(record.capabilityId);
    if (capability != null) validateCoveragePathParity(record, capability, errors);
    for (const glob of record.pathGlobs) validateGlobMatches(repoPaths, glob, `coverage ${record.id}`, errors);
    for (const glob of record.testPathGlobs) validateGlobMatches(repoPaths, glob, `coverage ${record.id} test`, errors);
    validateCommands(record.validation, `coverage ${record.id}`, knownUiP0Shards, errors);
  }

  for (const owner of rules.owners.capabilityOwners) {
    if (!capabilityIds.has(owner.capabilityId)) errors.push(`owners.json references missing capability ${owner.capabilityId}.`);
    if (!roleIds.has(owner.manualQa.role)) errors.push(`Owner ${owner.capabilityId} references missing role ${owner.manualQa.role}.`);
    if (owner.manualQa.required && owner.checklist.length === 0) errors.push(`Owner ${owner.capabilityId} requires manual QA but has an empty checklist.`);
  }

  for (const signal of rules.capabilities.globalRiskSignals) {
    if (!tierOrder.includes(signal.defaultTierOnMatch)) errors.push(`Global risk signal ${signal.id} has invalid tier ${signal.defaultTierOnMatch}.`);
    if (signal.ownerRole != null && !roleIds.has(signal.ownerRole)) errors.push(`Global risk signal ${signal.id} references missing owner role ${signal.ownerRole}.`);
    for (const glob of signal.pathGlobs) validateGlobMatches(repoPaths, glob, `global risk signal ${signal.id}`, errors);
    if (signal.defaultTierOnMatch === "tier-2" && signal.validation == null) errors.push(`Global risk signal ${signal.id} raises tier-2 but has no validation guidance.`);
    if (signal.validation != null) validateCommands(signal.validation, `global risk signal ${signal.id}`, knownUiP0Shards, errors);
  }

  validateNoPrivateIdentityFields(rules, errors);
  return errors;
}

async function analyze(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const changedPaths = uniqueStrings((await readChangedPaths(args.filter((arg) => arg !== "--json"))).map(normalizeRepoPath)).sort();
  if (changedPaths.length === 0) {
    throw new Error("No changed paths supplied. Pass paths as arguments or via stdin.");
  }
  const rules = await loadRules();
  const capabilityById = new Map(rules.capabilities.capabilities.map((capability) => [capability.id, capability]));
  const ownerByCapabilityId = new Map(rules.owners.capabilityOwners.map((owner) => [owner.capabilityId, owner]));
  const capabilityMatches: CapabilityMatch[] = [];
  const testCoverageEvidence: CoverageEvidence[] = [];
  const signalMatches: SignalMatch[] = [];

  for (const record of rules.coverage.coverage) {
    const capability = capabilityById.get(record.capabilityId);
    if (capability == null) continue;
    const evidenceByGlob = new Map(capability.pathGlobs.map((item) => [item.glob, item]));
    const matches = matchPathGlobs(changedPaths, record.pathGlobs, evidenceByGlob);
    const testEvidence = matchPathGlobs(changedPaths, record.testPathGlobs);
    if (testEvidence.length > 0) testCoverageEvidence.push({ coverage: record, testEvidence });
    if (matches.length === 0) continue;
    capabilityMatches.push({
      capability,
      coverage: record,
      matches,
      testEvidence,
    });
  }

  for (const signal of rules.capabilities.globalRiskSignals) {
    const matches = matchPathGlobs(changedPaths, signal.pathGlobs);
    if (matches.length > 0) signalMatches.push({ signal, matches });
  }

  const tier = highestTier([
    ...capabilityMatches.map((match) => match.capability.defaultTierOnMatch),
    ...signalMatches.map((match) => match.signal.defaultTierOnMatch),
    capabilityMatches.length > 0 || signalMatches.length > 0 ? "tier-1" : "tier-0",
  ]);
  const result: AnalysisResult = {
    advisory: true,
    tier,
    changedPaths,
    capabilities: capabilityMatches.map((match) => ({
      id: match.capability.id,
      name: match.capability.name,
      groupId: match.capability.groupId,
      confidence: match.capability.confidence,
      reason: match.capability.reason,
      matchedFiles: match.matches,
      changedTestEvidence: match.testEvidence,
      validation: match.coverage.validation,
      manualQa: ownerByCapabilityId.get(match.coverage.manualQaChecklistId) ?? null,
    })),
    testCoverageEvidence: testCoverageEvidence
      .filter((evidence) => !capabilityMatches.some((match) => match.coverage.id === evidence.coverage.id))
      .map((evidence) => ({
        id: evidence.coverage.id,
        capabilityId: evidence.coverage.capabilityId,
        changedTestEvidence: evidence.testEvidence,
      })),
    globalRiskSignals: signalMatches.map((match) => ({
      id: match.signal.id,
      reason: match.signal.reason,
      matchedFiles: match.matches,
      validation: match.signal.validation ?? null,
      ownerRole: match.signal.ownerRole ?? null,
    })),
    commands: uniqueStrings([
      ...capabilityMatches.flatMap((match) => match.coverage.validation.required),
      ...signalMatches.flatMap((match) => match.signal.validation?.required ?? []),
    ]),
    recommendedCommands: uniqueStrings([
      ...capabilityMatches.flatMap((match) => match.coverage.validation.recommended),
      ...signalMatches.flatMap((match) => match.signal.validation?.recommended ?? []),
    ]),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printReport(result);
}

function printReport(result: AnalysisResult): void {
  console.log(`Tier: ${result.tier} (advisory dry-run)`);
  if (result.capabilities.length === 0 && result.globalRiskSignals.length === 0 && result.testCoverageEvidence.length === 0) {
    console.log("No PR impact analysis rules matched.");
    return;
  }
  for (const capability of result.capabilities) {
    console.log(`\nCapability: ${capability.id} (${capability.confidence})`);
    for (const match of capability.matchedFiles) {
      console.log(`- ${match.path} ← ${match.glob}${match.weight == null ? "" : ` (weight ${match.weight})`}`);
    }
    if (capability.changedTestEvidence.length === 0) {
      console.log("Test evidence: no mapped E2E test file changed.");
    } else {
      console.log("Test evidence:");
      for (const match of capability.changedTestEvidence) console.log(`- ${match.path} ← ${match.glob}`);
    }
    if (capability.manualQa != null) {
      console.log(`Manual QA: ${capability.manualQa.manualQa.required ? "required" : "not required"} (${capability.manualQa.manualQa.role})`);
      if (capability.manualQa.manualQa.reason != null) console.log(`Reason: ${capability.manualQa.manualQa.reason}`);
      if (capability.manualQa.checklist.length > 0) {
        console.log("Checklist:");
        for (const item of capability.manualQa.checklist) console.log(`- ${item}`);
      }
    }
  }
  if (result.testCoverageEvidence.length > 0) {
    console.log("\nChanged mapped E2E coverage:");
    for (const evidence of result.testCoverageEvidence) {
      console.log(`- ${evidence.id} (${evidence.capabilityId})`);
      for (const match of evidence.changedTestEvidence) console.log(`  - ${match.path} ← ${match.glob}`);
    }
  }
  for (const signal of result.globalRiskSignals) {
    console.log(`\nGlobal risk: ${signal.id}`);
    if (signal.ownerRole != null) console.log(`Owner role: ${signal.ownerRole}`);
    for (const match of signal.matchedFiles) console.log(`- ${match.path} ← ${match.glob}`);
  }
  if (result.commands.length > 0) {
    console.log("\nRequired validation:");
    for (const command of result.commands) console.log(`- ${command}`);
  }
  if (result.recommendedCommands.length > 0) {
    console.log("\nRecommended validation:");
    for (const command of result.recommendedCommands) console.log(`- ${command}`);
  }
}

async function readAnalysisResult(filePath: string): Promise<AnalysisResult> {
  return JSON.parse(await readFile(filePath, "utf8")) as AnalysisResult;
}

function formatGithubComment(result: AnalysisResult): string {
  const lines = [
    "<!-- pr-impact-analysis -->",
    "## PR impact analysis",
    "",
    "> Advisory only. Required CI remains authoritative; this tool does not downgrade required validation or approve overrides.",
    "",
    `Risk tier: \`${result.tier}\``,
    "",
  ];

  if (result.capabilities.length === 0 && result.globalRiskSignals.length === 0 && result.testCoverageEvidence.length === 0) {
    lines.push("No impact rules matched the changed files.", "");
  }

  if (result.capabilities.length > 0) {
    lines.push("### Matched capabilities", "", "| Capability | Group | Confidence | Matched files |", "| --- | --- | --- | --- |");
    for (const capability of result.capabilities) {
      lines.push(
        `| \`${markdownEscape(capability.id)}\` | \`${markdownEscape(capability.groupId)}\` | ${markdownEscape(capability.confidence)} | ${matchedFilesSummary(capability.matchedFiles)} |`,
      );
    }
    lines.push("");
  }

  if (result.globalRiskSignals.length > 0) {
    lines.push("### Global risk signals", "", "| Signal | Matched files |", "| --- | --- |");
    for (const signal of result.globalRiskSignals) {
      lines.push(`| \`${markdownEscape(signal.id)}\` | ${matchedFilesSummary(signal.matchedFiles)} |`);
    }
    lines.push("");
  }

  if (result.commands.length > 0) {
    lines.push("### Required validation", "");
    for (const command of result.commands) lines.push(`- \`${markdownEscape(command)}\``);
    lines.push("");
  }

  if (result.recommendedCommands.length > 0) {
    lines.push("### Recommended validation", "");
    for (const command of result.recommendedCommands) lines.push(`- \`${markdownEscape(command)}\``);
    lines.push("");
  }

  const manualQaItems = uniqueStrings(result.capabilities.flatMap((capability) => capability.manualQa?.checklist ?? []));
  if (manualQaItems.length > 0) {
    lines.push("### Manual QA checklist", "");
    for (const item of manualQaItems) lines.push(`- ${markdownEscape(item)}`);
    lines.push("");
  }

  if (result.testCoverageEvidence.length > 0) {
    lines.push("### Changed mapped E2E tests", "");
    for (const evidence of result.testCoverageEvidence) {
      lines.push(`- \`${markdownEscape(evidence.capabilityId)}\`: ${matchedFilesSummary(evidence.changedTestEvidence)}`);
    }
    lines.push("");
  }

  lines.push(`<sub>Analyzed ${result.changedPaths.length} changed path${result.changedPaths.length === 1 ? "" : "s"}. Generated from deterministic rules in \`docs/testing/pr-impact-analysis/\`.</sub>`);
  return lines.join("\n");
}

function requiredUiP0Shards(result: AnalysisResult, knownShards: Set<string>): string[] {
  const shards = result.commands
    .map((command) => command.match(/ui-p0-shards\.ts (?<shard>[a-z0-9-]+)/u)?.groups?.shard)
    .filter((shard): shard is string => shard != null && knownShards.has(shard));
  return uniqueStrings(shards);
}

function matchedFilesSummary(matches: Match[]): string {
  const files = uniqueStrings(matches.map((match) => match.path)).sort();
  if (files.length === 0) return "n/a";
  const visible = files.slice(0, 4).map(codeTag).join("<br>");
  const hiddenCount = files.length - 4;
  return hiddenCount > 0 ? `${visible}<br>+${hiddenCount} more` : visible;
}

function codeTag(value: string): string {
  return `<code>${htmlEscape(value)}</code>`;
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function markdownEscape(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/`/gu, "\\`");
}

async function readChangedPaths(args: string[]): Promise<string[]> {
  if (args.length > 0) return args;
  if (process.stdin.isTTY) return [];
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks)
    .toString("utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function matchPathGlobs(paths: string[], globs: string[], evidenceByGlob = new Map<string, PathEvidence>()): Match[] {
  const matches: Match[] = [];
  for (const filePath of paths) {
    for (const glob of globs) {
      if (!globMatches(glob, filePath)) continue;
      const evidence = evidenceByGlob.get(glob);
      matches.push({
        path: filePath,
        glob,
        ...(evidence == null ? {} : { weight: evidence.weight }),
        ...(evidence?.reason == null ? {} : { reason: evidence.reason }),
      });
    }
  }
  return matches;
}

function highestTier(tiers: Tier[]): Tier {
  return tiers.reduce((highest, tier) => (tierOrder.indexOf(tier) > tierOrder.indexOf(highest) ? tier : highest), "tier-0");
}

async function listRepoPaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const repoPath = normalizeRepoPath(path.relative(repoRoot, fullPath));
    if (entry.isDirectory()) {
      paths.push(...(await listRepoPaths(fullPath)));
    } else {
      paths.push(repoPath);
    }
  }
  return paths;
}

function validateGlobMatches(repoPaths: string[], glob: string, context: string, errors: string[]): void {
  if (!hasGlobMeta(glob)) {
    if (!existsSync(path.join(repoRoot, glob))) errors.push(`${context} path does not exist: ${glob}.`);
    return;
  }
  if (!repoPaths.some((repoPath) => globMatches(glob, repoPath))) {
    errors.push(`${context} glob does not match any tracked path: ${glob}.`);
  }
}

function validateCommands(validation: Validation, context: string, knownUiP0Shards: Set<string>, errors: string[]): void {
  const commandGroups: (keyof Validation)[] = ["required", "recommended", "optional"];
  for (const group of commandGroups) {
    if (!Array.isArray(validation[group])) errors.push(`${context} validation.${group} must be an array.`);
    for (const command of validation[group] ?? []) {
      const shard = command.match(/ui-p0-shards\.ts (?<shard>[a-z0-9-]+)/u)?.groups?.shard;
      if (shard != null && !knownUiP0Shards.has(shard)) errors.push(`${context} references unknown UI P0 shard ${shard}.`);
    }
  }
}

function validateCoveragePathParity(record: CoverageRecord, capability: Capability, errors: string[]): void {
  const coverageGlobs = normalizeStringSet(record.pathGlobs);
  const capabilityGlobs = normalizeStringSet(capability.pathGlobs.map((pathGlob) => pathGlob.glob));
  const missingFromCoverage = [...capabilityGlobs].filter((glob) => !coverageGlobs.has(glob));
  const missingFromCapability = [...coverageGlobs].filter((glob) => !capabilityGlobs.has(glob));
  for (const glob of missingFromCoverage) errors.push(`Coverage ${record.id} is missing capability ${capability.id} path glob ${glob}.`);
  for (const glob of missingFromCapability) errors.push(`Coverage ${record.id} path glob ${glob} is not defined on capability ${capability.id}.`);
}

async function readKnownUiP0Shards(): Promise<Set<string>> {
  const source = await readFile(path.join(repoRoot, "e2e/scripts/ui-p0-shards.ts"), "utf8");
  const shards = [...source.matchAll(/^\s{2}['"]?(?<name>[a-z0-9-]+)['"]?:\s*\{/gmu)].map((match) => match.groups?.name).filter((name): name is string => name != null);
  return new Set(shards);
}

function normalizeStringSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeRepoPath));
}

function validateNoPrivateIdentityFields(rules: Rules, errors: string[]): void {
  const serialized = JSON.stringify(rules);
  for (const forbidden of ["feishuNames", "larkNames"]) {
    if (serialized.includes(forbidden)) errors.push(`Rules must not include private identity field ${forbidden}.`);
  }
}

function globMatches(glob: string, value: string): boolean {
  return matchSegments(glob.split("/"), normalizeRepoPath(value).split("/"));
}

function matchSegments(globSegments: string[], pathSegments: string[]): boolean {
  const [globSegment, ...remainingGlob] = globSegments;
  if (globSegment == null) return pathSegments.length === 0;
  if (globSegment === "**") {
    if (matchSegments(remainingGlob, pathSegments)) return true;
    return pathSegments.length > 0 && matchSegments(globSegments, pathSegments.slice(1));
  }
  const [pathSegment, ...remainingPath] = pathSegments;
  return pathSegment != null && segmentMatches(globSegment, pathSegment) && matchSegments(remainingGlob, remainingPath);
}

function segmentMatches(globSegment: string, pathSegment: string): boolean {
  const pattern = `^${globSegment.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, "[^/]*")}$`;
  return new RegExp(pattern, "u").test(pathSegment);
}

function hasGlobMeta(glob: string): boolean {
  return glob.includes("*");
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function printUsage(): void {
  console.log(`Usage:
  pnpm exec tsx scripts/pr-impact-analysis.ts validate
  pnpm exec tsx scripts/pr-impact-analysis.ts analyze [--json] <changed-path>...
  pnpm exec tsx scripts/pr-impact-analysis.ts format-github-comment <analysis-json>
  pnpm exec tsx scripts/pr-impact-analysis.ts required-ui-p0-shards <analysis-json>
  git diff --name-only main...HEAD | pnpm exec tsx scripts/pr-impact-analysis.ts analyze
`);
}

await main();
