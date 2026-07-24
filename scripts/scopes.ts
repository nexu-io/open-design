import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { uiP0CiMatrix, visualCiMatrix } from "../e2e/lib/playwright/suites.ts";

// ---------------------------------------------------------------------------
// Scope model
//
// Every changed file is classified by the additive rule table below: a file
// may match several rules, its claimed blast radius is the union of their
// effects, and its confidence is the minimum confidence among the matched
// rules. An evaluation context brings a trust threshold; a file whose
// confidence sits below that threshold — or that matches no rule at all — is
// escalated fail-closed to the full radius (every scope armed).
//
// Trust thresholds per context:
// - pull_request / manual hot runs believe every rule ("medium").
// - the merge queue believes only "certain" rules; promoting a rule to
//   "certain" requires a `guard` naming the check that keeps its boundary
//   invariant true, and is a deliberate, reviewed behavior change.
// - manual full runs believe nothing and arm everything.
// ---------------------------------------------------------------------------

type CiMode = "hot" | "full";

export const SCOPE_EFFECTS = [
  "daemon_tests_required",
  "web_tests_required",
  "tools_dev_tests_required",
  "tools_pack_tests_required",
  "ui_critical_validation_required",
  "ui_p0_validation_required",
  "visual_validation_required",
  "workspace_validation_required",
] as const;

export type ScopeEffect = (typeof SCOPE_EFFECTS)[number];

export type ScopeOutputs = Record<ScopeEffect, boolean>;

export type Confidence = "medium" | "certain";

export type TrustThreshold = "medium" | "certain";

export type RuleMatch = {
  prefixes?: readonly string[];
  exact?: readonly string[];
  regexes?: readonly RegExp[];
  /**
   * Fallback-style matching: when no positive condition is present the rule
   * matches every file except those hit by excludeWhen.
   */
  excludeWhen?: RuleMatch;
};

export type ScopeRule = {
  id: string;
  match: RuleMatch;
  /** The blast radius this rule claims for a matching file. */
  effects: readonly ScopeEffect[];
  confidence: Confidence;
  /** Required for "certain" rules: the check that enforces the boundary. */
  guard?: string;
};

type ScopePlan = ScopeOutputs & {
  ci_mode: CiMode;
  run_e2e_vitest: boolean;
  run_playwright_critical: boolean;
  run_playwright_visual: boolean;
  run_preflight: boolean;
  run_ui_p0: boolean;
  run_web_workspace_tests: boolean;
  run_windows_tools_pack_payload_tests: boolean;
  run_workspace_unit_tests: boolean;
  ui_p0_matrix: string;
  visual_matrix: string;
};

type GitHubEvent = {
  pull_request?: {
    number?: number;
  };
  merge_group?: {
    base_sha?: string;
    head_sha?: string;
  };
  inputs?: {
    ci_mode?: string;
  };
};

// ---------------------------------------------------------------------------
// Rule table
// ---------------------------------------------------------------------------

const EXEMPT_PREFIXES = [
  ".vscode/",
  ".idea/",
  "docs/",
  "apps/landing-page/",
  "nix/",
  ".github/ISSUE_TEMPLATE/",
] as const;

const EXEMPT_EXACT = [
  "LICENSE",
  ".gitignore",
  ".editorconfig",
  ".github/CODEOWNERS",
  "flake.nix",
  "flake.lock",
  ".github/workflows/landing-page-ci.yml",
  ".github/workflows/landing-page-staging.yml",
  ".github/workflows/landing-page-production.yml",
  ".github/workflows/blog-indexing-on-deploy.yml",
  ".github/workflows/autofix.atom.yml",
  ".github/workflows/comment.atom.yml",
  ".github/workflows/report.atom.yml",
  ".github/workflows/docker-image.yml",
  ".github/workflows/nix.yml",
] as const;

const EXEMPT_REGEXES = [/\.(?:md|mdx|txt)$/] as const;

const EXEMPT_SURFACE: RuleMatch = {
  prefixes: EXEMPT_PREFIXES,
  exact: EXEMPT_EXACT,
  regexes: EXEMPT_REGEXES,
};

export const scopeRules: readonly ScopeRule[] = [
  {
    id: "exempt-surface",
    match: EXEMPT_SURFACE,
    effects: [],
    confidence: "medium",
  },
  {
    id: "daemon-sources",
    match: {
      prefixes: [
        "apps/daemon/",
        "packages/release/",
        "packages/contracts/",
        "packages/platform/",
        "packages/sidecar/",
        "packages/sidecar-proto/",
      ],
    },
    effects: ["daemon_tests_required"],
    confidence: "medium",
  },
  {
    id: "web-sources",
    match: {
      prefixes: [
        "apps/web/",
        "packages/release/",
        "packages/components/",
        "packages/contracts/",
        "packages/host/",
        "packages/platform/",
        "packages/sidecar/",
        "packages/sidecar-proto/",
      ],
    },
    effects: ["web_tests_required"],
    confidence: "medium",
  },
  {
    id: "runtime-content",
    match: {
      prefixes: ["scripts/", "assets/", "skills/", "prompt-templates/", "design-systems/", "design-templates/", "craft/"],
    },
    effects: ["daemon_tests_required", "web_tests_required"],
    confidence: "medium",
  },
  {
    id: "script-contract-tests",
    match: {
      prefixes: ["e2e/tests/scripts/"],
    },
    effects: ["daemon_tests_required", "web_tests_required"],
    confidence: "medium",
  },
  {
    id: "tools-dev-sources",
    match: {
      prefixes: ["tools/dev/", "packages/platform/", "packages/sidecar/", "packages/sidecar-proto/"],
    },
    effects: ["tools_dev_tests_required"],
    confidence: "medium",
  },
  {
    id: "tools-pack-sources",
    match: {
      prefixes: [
        "tools/pack/",
        "apps/packaged/",
        "apps/desktop/",
        "packages/release/",
        "packages/components/",
        "packages/host/",
        "packages/platform/",
        "packages/sidecar/",
        "packages/sidecar-proto/",
      ],
    },
    effects: ["tools_pack_tests_required"],
    confidence: "medium",
  },
  {
    id: "workspace-manifests-and-ci",
    match: {
      exact: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".github/workflows/ci.yml", "e2e/package.json"],
      regexes: [/^apps\/[^/]+\/package\.json$/, /^packages\/[^/]+\/package\.json$/, /^tools\/[^/]+\/package\.json$/],
    },
    effects: ["daemon_tests_required", "web_tests_required", "tools_dev_tests_required", "tools_pack_tests_required"],
    confidence: "medium",
  },
  {
    id: "ui-p0-surface",
    match: {
      prefixes: [
        "apps/web/",
        "apps/daemon/",
        "packages/release/",
        "packages/components/",
        "packages/contracts/",
        "packages/host/",
        "packages/platform/",
        "packages/sidecar/",
        "packages/sidecar-proto/",
        "e2e/ui/",
        "e2e/lib/",
        "e2e/resources/",
        "e2e/scripts/",
        ".github/actions/setup-playwright/",
        ".github/actions/setup-workspace/",
      ],
      exact: [
        "e2e/package.json",
        "e2e/playwright.config.ts",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        ".github/workflows/ci.yml",
        ".github/workflows/ui-extended-main.yml",
      ],
    },
    effects: ["ui_p0_validation_required"],
    confidence: "medium",
  },
  {
    id: "visual-surface",
    match: {
      prefixes: ["apps/web/", "e2e/lib/playwright/", ".github/actions/setup-playwright/", ".github/actions/setup-workspace/"],
      exact: [
        "e2e/package.json",
        "e2e/playwright.visual.config.ts",
        "e2e/scripts/playwright.ts",
        "e2e/scripts/visual-report.ts",
        "pnpm-lock.yaml",
        ".github/scripts/handoff.py",
        ".github/workflows/ci.yml",
        ".github/workflows/comment.atom.yml",
        ".github/workflows/report.atom.yml",
        ".github/workflows/visual-baseline.yml",
      ],
      regexes: [/^e2e\/ui\/visual-[^/]+\.test\.ts$/],
    },
    effects: ["visual_validation_required"],
    confidence: "medium",
  },
  {
    id: "workspace-fallback",
    match: { excludeWhen: EXEMPT_SURFACE },
    effects: ["workspace_validation_required"],
    confidence: "medium",
  },
  {
    // Fail-closed critical gate: Playwright starts `tools-dev web` (daemon +
    // web runtimes) and never launches the desktop, packaged, or tools-pack
    // entrypoints, so a change confined to those leaf roots cannot alter what
    // the critical suite exercises. Every other non-exempt file — tools-dev,
    // any transitive package (including undeclared edges like metatool),
    // scripts, runtime resources, unknown roots — keeps the fallback armed.
    id: "ui-critical-fallback",
    match: {
      excludeWhen: {
        prefixes: [...EXEMPT_PREFIXES, "apps/desktop/", "apps/packaged/", "tools/pack/"],
        exact: EXEMPT_EXACT,
        regexes: EXEMPT_REGEXES,
      },
    },
    effects: ["ui_critical_validation_required"],
    confidence: "medium",
  },
];

// ---------------------------------------------------------------------------
// Matching and evaluation
// ---------------------------------------------------------------------------

export function matchesRuleMatch(file: string, match: RuleMatch): boolean {
  const hasPositive = match.prefixes != null || match.exact != null || match.regexes != null;
  if (hasPositive) {
    const positive =
      (match.prefixes?.some((prefix) => file.startsWith(prefix)) ?? false) ||
      (match.exact?.includes(file) ?? false) ||
      (match.regexes?.some((regex) => regex.test(file)) ?? false);
    if (!positive) return false;
  }
  if (match.excludeWhen != null && matchesRuleMatch(file, match.excludeWhen)) return false;
  return true;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { medium: 0, certain: 1 };

function believes(threshold: TrustThreshold, confidence: Confidence): boolean {
  return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[threshold];
}

export type FileDecision = {
  file: string;
  matchedRules: readonly string[];
  escalated: boolean;
  reason?: "unmatched" | "below-threshold";
};

export type ScopeEvaluation = {
  outputs: ScopeOutputs;
  decisions: readonly FileDecision[];
};

export type EvaluateOptions = {
  /**
   * Legacy asymmetry preserved on purpose: pull_request runs re-derive
   * workspace_validation from the four armed test scopes, dispatch-hot runs
   * never did. Candidate cleanup once the tiered structure has settled.
   */
  deriveWorkspaceValidationFromTestScopes: boolean;
};

export function evaluateScopeOutputs(
  files: readonly string[],
  threshold: TrustThreshold,
  options: EvaluateOptions,
): ScopeEvaluation {
  const outputs = emptyScopeOutputs();
  const decisions: FileDecision[] = [];

  for (const file of files) {
    const matched = scopeRules.filter((rule) => matchesRuleMatch(file, rule.match));
    if (matched.length === 0) {
      armEveryScope(outputs);
      decisions.push({ file, matchedRules: [], escalated: true, reason: "unmatched" });
      continue;
    }
    const matchedIds = matched.map((rule) => rule.id);
    if (!matched.every((rule) => believes(threshold, rule.confidence))) {
      armEveryScope(outputs);
      decisions.push({ file, matchedRules: matchedIds, escalated: true, reason: "below-threshold" });
      continue;
    }
    for (const rule of matched) {
      for (const effect of rule.effects) outputs[effect] = true;
    }
    decisions.push({ file, matchedRules: matchedIds, escalated: false });
  }

  if (
    options.deriveWorkspaceValidationFromTestScopes &&
    (outputs.daemon_tests_required ||
      outputs.web_tests_required ||
      outputs.tools_dev_tests_required ||
      outputs.tools_pack_tests_required)
  ) {
    outputs.workspace_validation_required = true;
  }

  return { outputs, decisions };
}

function emptyScopeOutputs(): ScopeOutputs {
  const outputs = {} as ScopeOutputs;
  for (const effect of SCOPE_EFFECTS) outputs[effect] = false;
  return outputs;
}

function armEveryScope(outputs: ScopeOutputs): void {
  for (const effect of SCOPE_EFFECTS) outputs[effect] = true;
}

function everyScopeArmed(): ScopeOutputs {
  const outputs = emptyScopeOutputs();
  armEveryScope(outputs);
  return outputs;
}

// ---------------------------------------------------------------------------
// Run plan (scope → job mapping; rule iteration never touches this layer)
// ---------------------------------------------------------------------------

function createRunPlan(
  outputs: ScopeOutputs,
  ciMode: CiMode,
  // `ci_mode` is a reported label; `fullLanes` is what actually forces every
  // lane on. They only diverge in the merge queue, which reports "full" but
  // derives its lanes from the certain-threshold evaluation so promoted rules
  // can actually skip work there.
  fullLanes: boolean = ciMode === "full",
): Omit<ScopePlan, keyof ScopeOutputs | "ui_p0_matrix" | "visual_matrix"> {
  const isFull = fullLanes;
  const runUiP0 = isFull || outputs.ui_p0_validation_required;

  return {
    ci_mode: ciMode,
    run_e2e_vitest: isFull || outputs.web_tests_required || outputs.ui_p0_validation_required,
    run_playwright_critical: outputs.ui_critical_validation_required && !runUiP0,
    run_playwright_visual: isFull || outputs.visual_validation_required,
    run_preflight: true,
    run_ui_p0: runUiP0,
    run_web_workspace_tests: isFull || outputs.web_tests_required,
    run_windows_tools_pack_payload_tests: isFull || outputs.tools_pack_tests_required,
    run_workspace_unit_tests: true,
  };
}

function buildScopePlan(outputs: ScopeOutputs, ciMode: CiMode, fullLanes?: boolean): ScopePlan {
  return {
    ...outputs,
    ...createRunPlan(outputs, ciMode, fullLanes ?? ciMode === "full"),
    ui_p0_matrix: JSON.stringify(uiP0CiMatrix),
    visual_matrix: JSON.stringify(visualCiMatrix),
  };
}

// ---------------------------------------------------------------------------
// Decision trace
// ---------------------------------------------------------------------------

export type ScopeTrace = {
  source: string;
  threshold: TrustThreshold | "none";
  filesResolved: boolean;
  fileCount: number;
  ruleHits: Record<string, number>;
  escalations: readonly { file: string; reason: string }[];
  plans: {
    applied: ScopePlan;
    /**
     * Shadow column: what the plan would be if every rule were believed.
     * Identical to `applied` at the medium threshold; in the merge queue it
     * shows what medium-confidence rules would have allowed, which is the
     * evidence stream for promoting rules to "certain".
     */
    ifTrustAll?: ScopePlan;
  };
};

function buildTrace(
  source: string,
  threshold: TrustThreshold,
  evaluation: ScopeEvaluation,
  appliedPlan: ScopePlan,
  ifTrustAllPlan: ScopePlan,
): ScopeTrace {
  const ruleHits: Record<string, number> = {};
  for (const decision of evaluation.decisions) {
    for (const ruleId of decision.matchedRules) {
      ruleHits[ruleId] = (ruleHits[ruleId] ?? 0) + 1;
    }
  }
  return {
    source,
    threshold,
    filesResolved: true,
    fileCount: evaluation.decisions.length,
    ruleHits,
    escalations: evaluation.decisions
      .filter((decision) => decision.escalated)
      .map((decision) => ({ file: decision.file, reason: decision.reason ?? "unknown" })),
    plans: { applied: appliedPlan, ifTrustAll: ifTrustAllPlan },
  };
}

function buildEverythingTrace(source: string, appliedPlan: ScopePlan): ScopeTrace {
  return {
    source,
    threshold: "none",
    filesResolved: false,
    fileCount: 0,
    ruleHits: {},
    escalations: [],
    plans: { applied: appliedPlan },
  };
}

// ---------------------------------------------------------------------------
// GitHub environment resolution
// ---------------------------------------------------------------------------

type PlanWithTrace = { plan: ScopePlan; trace: ScopeTrace };

function createEnvScopePlan(): PlanWithTrace {
  const eventName = requiredEnv("GITHUB_EVENT_NAME");

  if (eventName === "pull_request") {
    return evaluateChangedFilesPlan(eventName, changedPullRequestFiles(), {
      threshold: "medium",
      ciMode: "hot",
      evaluate: { deriveWorkspaceValidationFromTestScopes: true },
    });
  }

  if (eventName === "workflow_dispatch" && resolveManualCiMode() === "hot") {
    return evaluateChangedFilesPlan(`${eventName}:hot`, changedManualFiles(), {
      threshold: "medium",
      ciMode: "hot",
      evaluate: { deriveWorkspaceValidationFromTestScopes: false },
    });
  }

  if (eventName === "merge_group") {
    // The merge queue evaluates the whole queued group's union diff at the
    // "certain" threshold. While the certain rule set is empty every file
    // escalates and the plan stays full, so this path is behavior-preserving;
    // its trace's ifTrustAll shadow column is the evidence stream for future
    // promotions. Resolution anomalies fail open to the full plan: queue
    // throughput must never depend on this evaluation succeeding.
    let files: string[];
    try {
      files = changedMergeGroupFiles();
    } catch (error) {
      console.error(`::warning::merge_group changed-file resolution failed; falling back to the full plan: ${String(error)}`);
      const plan = buildScopePlan(everyScopeArmed(), "full");
      return { plan, trace: buildEverythingTrace("merge_group:resolution-error", plan) };
    }
    if (files.length === 0) {
      const plan = buildScopePlan(everyScopeArmed(), "full");
      return { plan, trace: buildEverythingTrace("merge_group:empty-resolution", plan) };
    }
    return evaluateChangedFilesPlan(eventName, files, {
      threshold: "certain",
      ciMode: "full",
      fullLanes: false,
      evaluate: { deriveWorkspaceValidationFromTestScopes: true },
    });
  }

  // workflow_dispatch full and any unknown event stay fail-closed: trust
  // nothing, arm everything.
  const plan = buildScopePlan(everyScopeArmed(), "full");
  return { plan, trace: buildEverythingTrace(eventName, plan) };
}

type ChangedFilesPlanOptions = {
  threshold: TrustThreshold;
  ciMode: CiMode;
  fullLanes?: boolean;
  evaluate: EvaluateOptions;
};

function evaluateChangedFilesPlan(
  source: string,
  files: readonly string[],
  options: ChangedFilesPlanOptions,
): PlanWithTrace {
  const fullLanes = options.fullLanes ?? options.ciMode === "full";
  const evaluation = evaluateScopeOutputs(files, options.threshold, options.evaluate);
  const plan = buildScopePlan(evaluation.outputs, options.ciMode, fullLanes);
  const trustAll = evaluateScopeOutputs(files, "medium", options.evaluate);
  const trustAllPlan = buildScopePlan(trustAll.outputs, options.ciMode, fullLanes);
  return { plan, trace: buildTrace(source, options.threshold, evaluation, plan, trustAllPlan) };
}

function resolveManualCiMode(): CiMode {
  const event = JSON.parse(readFileSync(requiredEnv("GITHUB_EVENT_PATH"), "utf8")) as GitHubEvent;
  const input = event.inputs?.ci_mode ?? "full";
  if (input === "hot" || input === "full") return input;
  throw new Error(`Unsupported workflow_dispatch ci_mode: ${input}`);
}

function changedPullRequestFiles(): string[] {
  const eventPath = requiredEnv("GITHUB_EVENT_PATH");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as GitHubEvent;
  const prNumber = event.pull_request?.number;
  if (prNumber == null) {
    throw new Error("pull_request event payload did not include pull_request.number");
  }

  const stdout = runGh(["api", "--paginate", `repos/${repository}/pulls/${prNumber}/files`, "--jq", ".[].filename"]);
  return stdout.split(/\r?\n/).filter(Boolean);
}

// Removed files stay in every changed-file resolution on purpose: deleting a
// runtime source file must trigger the same validation scopes as editing it.
function changedManualFiles(): string[] {
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const sha = requiredEnv("GITHUB_SHA");
  const stdout = runGh([
    "api",
    "--paginate",
    `repos/${repository}/compare/main...${sha}`,
    "--jq",
    "(.files // [])[] | .filename",
  ]);
  return stdout.split(/\r?\n/).filter(Boolean);
}

function changedMergeGroupFiles(): string[] {
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const event = JSON.parse(readFileSync(requiredEnv("GITHUB_EVENT_PATH"), "utf8")) as GitHubEvent;
  const baseSha = event.merge_group?.base_sha;
  const headSha = event.merge_group?.head_sha;
  if (baseSha == null || baseSha.length === 0 || headSha == null || headSha.length === 0) {
    throw new Error("merge_group event payload did not include merge_group.base_sha and merge_group.head_sha");
  }

  const stdout = runGh([
    "api",
    "--paginate",
    `repos/${repository}/compare/${baseSha}...${headSha}`,
    "--jq",
    "(.files // [])[] | .filename",
  ]);
  const files = stdout.split(/\r?\n/).filter(Boolean);
  // The compare API caps the complete comparison at 300 files, and only the
  // first page contains the files array. Exactly 300 names therefore cannot
  // prove that the resolution is complete; fail closed before a future
  // certain-confidence rule can trust a truncated merge-group union diff.
  if (files.length >= 300) {
    throw new Error("merge_group compare result reached GitHub's 300-file ceiling");
  }
  return files;
}

function runGh(args: string[]): string {
  const nodeScript = process.env.OPEN_DESIGN_GH_NODE_SCRIPT;
  if (nodeScript != null && nodeScript.length > 0) {
    return execFileSync(process.execPath, [nodeScript, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  }
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function writeGithubOutputs(value: ScopePlan): void {
  const lines = Object.entries(value).map(([key, output]) => `${key}=${formatOutput(output)}`);
  console.log(lines.join("\n"));
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath != null && outputPath.length > 0) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  }
}

function formatOutput(value: boolean | string): string {
  return typeof value === "boolean" ? (value ? "true" : "false") : value;
}

function emitTraceLog(trace: ScopeTrace): void {
  console.log(`scope decision trace:\n${JSON.stringify(trace, null, 2)}`);
}

function emitTraceStepSummary(trace: ScopeTrace): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath == null || summaryPath.length === 0) return;
  const lines = [
    "### Scope decision trace",
    "",
    `- source: \`${trace.source}\`, trust threshold: \`${trace.threshold}\``,
    `- files: ${trace.filesResolved ? trace.fileCount : "not resolved"}, escalated: ${trace.escalations.length}`,
  ];
  const hits = Object.entries(trace.ruleHits);
  if (hits.length > 0) {
    lines.push("", "| Rule | Hits |", "| --- | ---: |");
    for (const [ruleId, count] of hits.sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${ruleId} | ${count} |`);
    }
  }
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

type PlanCliArgs = {
  context: "pr" | "merge-queue" | "full";
  files: string[];
};

function parsePlanArgs(args: readonly string[]): PlanCliArgs {
  let context: PlanCliArgs["context"] = "pr";
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--context") {
      const value = args[index + 1];
      if (value !== "pr" && value !== "merge-queue" && value !== "full") {
        throw new Error(`--context expects pr|merge-queue|full, got: ${value ?? "(missing)"}`);
      }
      context = value;
      index += 1;
    } else if (arg === "--files") {
      for (let rest = index + 1; rest < args.length; rest += 1) {
        const file = args[rest];
        if (file == null || file.startsWith("--")) break;
        files.push(file);
        index = rest;
      }
    } else if (arg === "--files-from") {
      const value = args[index + 1];
      if (value == null) throw new Error("--files-from expects a path or -");
      const content = value === "-" ? readFileSync(0, "utf8") : readFileSync(value, "utf8");
      files.push(...content.split(/\r?\n/).filter(Boolean));
      index += 1;
    } else {
      throw new Error(`Unknown plan argument: ${arg ?? "(missing)"}`);
    }
  }
  return { context, files };
}

function createCliScopePlan(args: readonly string[]): PlanWithTrace {
  const parsed = parsePlanArgs(args);
  if (parsed.context === "full") {
    const plan = buildScopePlan(everyScopeArmed(), "full");
    return { plan, trace: buildEverythingTrace("cli:full", plan) };
  }
  const isQueue = parsed.context === "merge-queue";
  return evaluateChangedFilesPlan(`cli:${parsed.context}`, parsed.files, {
    threshold: isQueue ? "certain" : "medium",
    ciMode: isQueue ? "full" : "hot",
    ...(isQueue ? { fullLanes: false } : {}),
    evaluate: { deriveWorkspaceValidationFromTestScopes: true },
  });
}

function printRules(): void {
  for (const rule of scopeRules) {
    const parts = [
      `${rule.id}`,
      `  confidence: ${rule.confidence}${rule.guard != null ? ` (guard: ${rule.guard})` : ""}`,
      `  effects: ${rule.effects.length > 0 ? rule.effects.join(", ") : "(none)"}`,
      `  match: ${describeMatch(rule.match)}`,
    ];
    console.log(parts.join("\n"));
  }
}

function describeMatch(match: RuleMatch): string {
  const parts: string[] = [];
  if (match.prefixes != null) parts.push(`prefixes[${match.prefixes.length}]`);
  if (match.exact != null) parts.push(`exact[${match.exact.length}]`);
  if (match.regexes != null) parts.push(`regexes[${match.regexes.length}]`);
  if (match.excludeWhen != null) parts.push(`all except (${describeMatch(match.excludeWhen)})`);
  return parts.join(" + ");
}

function printUsage(): void {
  console.log(`Usage: node --experimental-strip-types scripts/scopes.ts <command>

Commands:
  github-output  Write validation scope outputs for GitHub Actions
  print          Print the validation scope plan as JSON
  plan           Evaluate offline: plan [--context pr|merge-queue|full]
                 (--files <file...> | --files-from <path|->)
                 Prints { plan, trace } as JSON; no GitHub environment needed.
  rules          List the scope rule table
  help           Show this help
`);
}

function main(): void {
  const commandName = process.argv[2] ?? "github-output";

  if (commandName === "github-output") {
    const { plan, trace } = createEnvScopePlan();
    writeGithubOutputs(plan);
    emitTraceLog(trace);
    emitTraceStepSummary(trace);
  } else if (commandName === "print") {
    console.log(JSON.stringify(createEnvScopePlan().plan, null, 2));
  } else if (commandName === "plan") {
    console.log(JSON.stringify(createCliScopePlan(process.argv.slice(3)), null, 2));
  } else if (commandName === "rules") {
    printRules();
  } else if (commandName === "help") {
    printUsage();
  } else {
    console.error(`Unknown scopes command: ${commandName}`);
    printUsage();
    process.exitCode = 1;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
