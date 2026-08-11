import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

import { uiP0CiMatrix, visualCiMatrix } from "../../lib/playwright/suites.ts";

// Characterization goldens for scripts/scopes.ts.
//
// These tests run the script exactly the way ci.yml does (subprocess, real env
// contract, gh stubbed through the existing OPEN_DESIGN_GH_NODE_SCRIPT seam)
// and pin the complete output plan for a matrix of changed-file sets × event
// contexts. They are implementation-independent on purpose: any internal
// restructuring of scopes.ts must keep every golden byte-for-byte identical.

const e2eRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const repoRoot = path.dirname(e2eRoot);
const scopesScript = path.join(repoRoot, "scripts", "scopes.ts");

// Hermetic gh stand-in, materialized per run: prints the changed-file list
// provided via OD_SCOPES_STUB_FILES regardless of which endpoint is asked for.
const GH_STUB_SOURCE = `if (process.argv[2] !== "api") {
  console.error("gh-stub expected an \\"api\\" invocation, got: " + process.argv.slice(2).join(" "));
  process.exit(1);
}
if (process.env.OD_SCOPES_STUB_FAIL === "1") {
  console.error("gh-stub simulated API failure");
  process.exit(1);
}
const files = process.env.OD_SCOPES_STUB_FILES ?? "";
const renameEachFromPrefix = process.env.OD_SCOPES_STUB_RENAME_EACH_FROM_PREFIX ?? "";
const jqIndex = process.argv.indexOf("--jq");
const jq = jqIndex >= 0 ? process.argv[jqIndex + 1] ?? "" : "";
const previousFilename = process.env.OD_SCOPES_STUB_RENAMED_FROM ?? "";
const fileLines = files.split("\\n").filter((line) => line.length > 0);
if (jq.length === 0) {
  console.log(JSON.stringify({
    files: fileLines.map((filename, index) => ({
      filename,
      ...(renameEachFromPrefix.length > 0
        ? { previous_filename: renameEachFromPrefix + index }
        : previousFilename.length > 0
          ? { previous_filename: previousFilename }
          : {}),
    })),
  }));
  process.exit(0);
}
let fileIndex = 0;
for (const line of fileLines) {
  console.log(line);
  if (renameEachFromPrefix.length > 0 && jq.includes("previous_filename")) {
    console.log(renameEachFromPrefix + fileIndex);
  }
  fileIndex += 1;
}
if (previousFilename.length > 0 && jq.includes("previous_filename")) {
  console.log(previousFilename);
}
`;

const UI_P0_MATRIX_JSON = JSON.stringify(uiP0CiMatrix);
const VISUAL_MATRIX_JSON = JSON.stringify(visualCiMatrix);

type EventContext =
  | { eventName: "pull_request" }
  | { eventName: "workflow_dispatch"; ciMode: "hot" | "full" }
  | { eventName: "merge_group" };

const SCOPE_KEYS = [
  "daemon_tests_required",
  "web_tests_required",
  "tools_dev_tests_required",
  "tools_pack_tests_required",
  "ui_critical_validation_required",
  "ui_p0_validation_required",
  "visual_validation_required",
  "workspace_validation_required",
] as const;

const RUN_KEYS = [
  "run_e2e_vitest",
  "run_playwright_critical",
  "run_playwright_visual",
  "run_ui_p0",
  "run_web_workspace_tests",
  "run_windows_tools_pack_payload_tests",
] as const;

type ScopeKey = (typeof SCOPE_KEYS)[number];
type RunKey = (typeof RUN_KEYS)[number];

function runScopes(
  command: string,
  context: EventContext,
  files: readonly string[],
  extraEnv: NodeJS.ProcessEnv = {},
): { stdout: string; outputPath: string; cleanup: () => void } {
  const workDir = mkdtempSync(path.join(tmpdir(), "scopes-test-"));
  const eventPath = path.join(workDir, "event.json");
  const outputPath = path.join(workDir, "github-output.txt");
  const ghStubPath = path.join(workDir, "gh-stub.mjs");
  writeFileSync(outputPath, "");
  writeFileSync(ghStubPath, GH_STUB_SOURCE);

  const payload =
    context.eventName === "pull_request"
      ? { pull_request: { number: 4321 } }
      : context.eventName === "workflow_dispatch"
        ? { inputs: { ci_mode: context.ciMode } }
        : {
            merge_group: {
              base_sha: "1111111111111111111111111111111111111111",
              head_sha: "2222222222222222222222222222222222222222",
            },
          };
  writeFileSync(eventPath, JSON.stringify(payload));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_EVENT_NAME: context.eventName,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: "nexu-io/open-design",
    GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
    GITHUB_OUTPUT: outputPath,
    // Keep subprocess trace emission out of the real CI step summary when the
    // test suite itself runs inside GitHub Actions.
    GITHUB_STEP_SUMMARY: "",
    OPEN_DESIGN_GH_NODE_SCRIPT: ghStubPath,
    OD_SCOPES_STUB_FILES: files.join("\n"),
    ...extraEnv,
  };

  const stdout = execFileSync(process.execPath, ["--experimental-strip-types", scopesScript, command], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });

  return { stdout, outputPath, cleanup: () => rmSync(workDir, { recursive: true, force: true }) };
}

function printPlan(context: EventContext, files: readonly string[]): Record<string, unknown> {
  const run = runScopes("print", context, files);
  try {
    return JSON.parse(run.stdout) as Record<string, unknown>;
  } finally {
    run.cleanup();
  }
}

function expectedPlan(opts: {
  ciMode: "hot" | "full";
  scopes?: readonly ScopeKey[];
  runs?: readonly RunKey[];
}): Record<string, unknown> {
  const scopes = new Set<ScopeKey>(opts.scopes ?? []);
  const runs = new Set<RunKey>(opts.runs ?? []);
  const plan: Record<string, unknown> = {};
  for (const key of SCOPE_KEYS) plan[key] = scopes.has(key);
  const runBroadWorkspaceValidation = opts.ciMode === "hot" || scopes.size > 0;
  plan["ci_mode"] = opts.ciMode;
  plan["run_e2e_vitest"] = runs.has("run_e2e_vitest");
  plan["run_playwright_critical"] = runs.has("run_playwright_critical");
  plan["run_playwright_visual"] = runs.has("run_playwright_visual");
  plan["run_preflight"] = true;
  plan["run_preflight_typecheck"] = runBroadWorkspaceValidation;
  plan["run_ui_p0"] = runs.has("run_ui_p0");
  plan["run_web_workspace_tests"] = runs.has("run_web_workspace_tests");
  plan["run_windows_tools_pack_payload_tests"] = runs.has("run_windows_tools_pack_payload_tests");
  plan["run_workspace_unit_tests"] = runBroadWorkspaceValidation;
  plan["ui_p0_matrix"] = UI_P0_MATRIX_JSON;
  plan["visual_matrix"] = VISUAL_MATRIX_JSON;
  return plan;
}

function assertPlan(actual: Record<string, unknown>, expected: Record<string, unknown>): void {
  assert.deepEqual(actual, expected);
  assert.deepEqual(Object.keys(actual), Object.keys(expected), "output key order must stay frozen");
}

const PR: EventContext = { eventName: "pull_request" };

type GoldenCase = {
  name: string;
  context: EventContext;
  files: readonly string[];
  expected: Record<string, unknown>;
};

const FULL_PLAN = expectedPlan({
  ciMode: "full",
  scopes: SCOPE_KEYS,
  // run_playwright_critical stays false: the P0 suite subsumes the critical suite.
  runs: [
    "run_e2e_vitest",
    "run_playwright_visual",
    "run_ui_p0",
    "run_web_workspace_tests",
    "run_windows_tools_pack_payload_tests",
  ],
});

const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: "pull_request docs-only changes trigger only the base lanes",
    context: PR,
    files: ["README.md", "docs/architecture.md"],
    expected: expectedPlan({ ciMode: "hot" }),
  },
  {
    name: "pull_request empty change set triggers only the base lanes",
    context: PR,
    files: [],
    expected: expectedPlan({ ciMode: "hot" }),
  },
  {
    name: "pull_request web source change runs web, e2e, ui-p0 and visual lanes",
    context: PR,
    files: ["apps/web/src/components/App.tsx"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "web_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "visual_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_playwright_visual", "run_ui_p0", "run_web_workspace_tests"],
    }),
  },
  {
    name: "pull_request daemon source change runs daemon and ui-p0 lanes without visual",
    context: PR,
    files: ["apps/daemon/src/server.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "daemon_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_ui_p0"],
    }),
  },
  {
    name: "pull_request contracts change fans out to daemon, web and ui-p0",
    context: PR,
    files: ["packages/contracts/src/api/tasks.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "daemon_tests_required",
        "web_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_ui_p0", "run_web_workspace_tests"],
    }),
  },
  {
    name: "pull_request scripts change arms daemon+web and falls back to the critical suite",
    context: PR,
    files: ["scripts/guard.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "daemon_tests_required",
        "web_tests_required",
        "ui_critical_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_playwright_critical", "run_web_workspace_tests"],
    }),
  },
  {
    name: "pull_request script-contract test change runs e2e Vitest",
    context: PR,
    files: ["e2e/tests/scripts/guard.test.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "daemon_tests_required",
        "web_tests_required",
        "ui_critical_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_playwright_critical", "run_web_workspace_tests"],
    }),
  },
  {
    name: "pull_request infra-cancel rerun surface arms e2e Vitest topology coverage",
    context: PR,
    files: [".github/scripts/rerun_infra_cancel.py"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "web_tests_required",
        "ui_critical_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_playwright_critical", "run_web_workspace_tests"],
    }),
  },
  {
    name: "pull_request packaged-smoke topology test change runs e2e Vitest",
    context: PR,
    files: ["e2e/tests/packaged-smoke-workflow.test.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "web_tests_required",
        "ui_critical_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_playwright_critical", "run_web_workspace_tests"],
    }),
  },
  {
    // Weird-but-current: a markdown file under skills/ triggers daemon+web tests
    // through the runtime-content prefix, while its .md extension exempts it from
    // arming the ui-critical fallback. workspace_validation is then re-derived
    // from the armed test scopes.
    name: "pull_request skills markdown triggers daemon+web without the critical fallback",
    context: PR,
    files: ["skills/deck/brief.md"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: ["daemon_tests_required", "web_tests_required", "workspace_validation_required"],
      runs: ["run_e2e_vitest", "run_web_workspace_tests"],
    }),
  },
  {
    name: "pull_request tools-pack change stays out of the ui-critical fallback",
    context: PR,
    files: ["tools/pack/src/build.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: ["tools_dev_tests_required", "tools_pack_tests_required", "workspace_validation_required"],
      runs: ["run_windows_tools_pack_payload_tests"],
    }),
  },
  {
    name: "pull_request desktop change maps to tools-pack tests without ui lanes",
    context: PR,
    files: ["apps/desktop/src/main/index.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: ["tools_dev_tests_required", "tools_pack_tests_required", "workspace_validation_required"],
      runs: ["run_windows_tools_pack_payload_tests"],
    }),
  },
  {
    name: "pull_request unknown root file arms only the fail-closed fallbacks",
    context: PR,
    files: ["mystery.xyz"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: ["ui_critical_validation_required", "workspace_validation_required"],
      runs: ["run_playwright_critical"],
    }),
  },
  {
    name: "pull_request root package.json fans out to all test scopes and ui-p0",
    context: PR,
    files: ["package.json"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "daemon_tests_required",
        "web_tests_required",
        "tools_dev_tests_required",
        "tools_pack_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_ui_p0", "run_web_workspace_tests", "run_windows_tools_pack_payload_tests"],
    }),
  },
  {
    name: "pull_request pnpm-lock change arms every scope",
    context: PR,
    files: ["pnpm-lock.yaml"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: SCOPE_KEYS,
      runs: [
        "run_e2e_vitest",
        "run_playwright_visual",
        "run_ui_p0",
        "run_web_workspace_tests",
        "run_windows_tools_pack_payload_tests",
      ],
    }),
  },
  {
    // Weird-but-current: e2e/ui/ markdown arms ui_p0 through the prefix rule while
    // the .md exemption keeps workspace_validation false (the post-loop derivation
    // only reacts to the four test scopes).
    name: "pull_request e2e/ui markdown arms ui-p0 while workspace validation stays off",
    context: PR,
    files: ["e2e/ui/notes.md"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: ["ui_p0_validation_required"],
      runs: ["run_e2e_vitest", "run_ui_p0"],
    }),
  },
  {
    name: "pull_request mixed batch unions every matched scope",
    context: PR,
    files: ["docs/a.md", "apps/web/src/x.ts", "tools/pack/src/y.ts"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "web_tests_required",
        "tools_dev_tests_required",
        "tools_pack_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "visual_validation_required",
        "workspace_validation_required",
      ],
      runs: [
        "run_e2e_vitest",
        "run_playwright_visual",
        "run_ui_p0",
        "run_web_workspace_tests",
        "run_windows_tools_pack_payload_tests",
      ],
    }),
  },
  {
    // Legacy asymmetry pinned on purpose: the dispatch-hot branch never re-derives
    // workspace_validation from the armed test scopes, unlike pull_request.
    name: "workflow_dispatch hot skills markdown keeps workspace validation off",
    context: { eventName: "workflow_dispatch", ciMode: "hot" },
    files: ["skills/deck/brief.md"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: ["daemon_tests_required", "web_tests_required"],
      runs: ["run_e2e_vitest", "run_web_workspace_tests"],
    }),
  },
  {
    name: "workflow_dispatch hot web source change matches the pull_request plan",
    context: { eventName: "workflow_dispatch", ciMode: "hot" },
    files: ["apps/web/src/components/App.tsx"],
    expected: expectedPlan({
      ciMode: "hot",
      scopes: [
        "web_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "visual_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_playwright_visual", "run_ui_p0", "run_web_workspace_tests"],
    }),
  },
  {
    name: "workflow_dispatch full ignores changed files and runs everything",
    context: { eventName: "workflow_dispatch", ciMode: "full" },
    files: ["README.md"],
    expected: FULL_PLAN,
  },
  {
    // Empty union-diff resolution is treated as an anomaly and fails open.
    name: "merge_group with an empty resolution runs everything",
    context: { eventName: "merge_group" },
    files: [],
    expected: FULL_PLAN,
  },
  {
    // Root markdown stays medium-tier (the global md regex is not promotable:
    // its safety depends on other rules covering runtime-markdown directories),
    // so one README.md in the group escalates and keeps the queue full even
    // though docs/ itself is certain-tier.
    name: "merge_group group with root markdown still runs everything at the certain threshold",
    context: { eventName: "merge_group" },
    files: ["README.md", "docs/architecture.md"],
    expected: FULL_PLAN,
  },
  {
    // The first certain-tier promotion: a group confined to the certain-exempt
    // core (docs/, landing-page, editor configs, LICENSE/CODEOWNERS) drops to
    // the preflight policy floor instead of running everything. Guarded by
    // the "certain-exempt surface consumption" guard check; methodology in
    // specs/current/ci.md.
    name: "merge_group certain-exempt core group drops to the policy floor",
    context: { eventName: "merge_group" },
    files: ["docs/architecture.md", "docs/nested/guide.mdx", "apps/landing-page/src/pages/index.astro", "LICENSE", ".github/CODEOWNERS"],
    expected: expectedPlan({ ciMode: "full" }),
  },
  {
    name: "merge_group packaged-leaf core uses the guarded narrow plan",
    context: { eventName: "merge_group" },
    files: [
      "apps/desktop/src/main/index.ts",
      "apps/packaged/tests/launcher.test.ts",
      "tools/pack/resources/linux/open-design.desktop.template",
    ],
    expected: expectedPlan({
      ciMode: "full",
      scopes: ["tools_dev_tests_required", "tools_pack_tests_required", "workspace_validation_required"],
      runs: ["run_windows_tools_pack_payload_tests"],
    }),
  },
  {
    name: "merge_group daemon core keeps behavior coverage without unrelated consumers",
    context: { eventName: "merge_group" },
    files: [
      "apps/daemon/src/server.ts",
      "apps/daemon/src/routes/chat.ts",
      "apps/daemon/tests/routes/chat.test.ts",
    ],
    expected: expectedPlan({
      ciMode: "full",
      scopes: [
        "daemon_tests_required",
        "ui_critical_validation_required",
        "ui_p0_validation_required",
        "workspace_validation_required",
      ],
      runs: ["run_e2e_vitest", "run_ui_p0"],
    }),
  },
  {
    name: "merge_group excluded daemon surfaces stay full",
    context: { eventName: "merge_group" },
    files: ["apps/daemon/src/sidecar/server.ts", "apps/daemon/src/runtimes/defs/claude.ts"],
    expected: FULL_PLAN,
  },
  {
    name: "merge_group packaged configuration outside the certain core stays full",
    context: { eventName: "merge_group" },
    files: ["apps/desktop/package.json", "tools/pack/bin/tools-pack.mjs"],
    expected: FULL_PLAN,
  },
  {
    name: "merge_group mixed group runs everything at the certain threshold",
    context: { eventName: "merge_group" },
    files: ["apps/web/src/x.ts", "tools/pack/src/y.ts"],
    expected: FULL_PLAN,
  },
];

for (const goldenCase of GOLDEN_CASES) {
  test(`golden: ${goldenCase.name}`, () => {
    assertPlan(printPlan(goldenCase.context, goldenCase.files), goldenCase.expected);
  });
}

test("merge_group changed-file resolution failure fails open to the full plan", () => {
  const run = runScopes("print", { eventName: "merge_group" }, ["README.md"], { OD_SCOPES_STUB_FAIL: "1" });
  try {
    assertPlan(JSON.parse(run.stdout) as Record<string, unknown>, FULL_PLAN);
  } finally {
    run.cleanup();
  }
});

test("merge_group compare result at GitHub's 300-file ceiling fails open to the full plan", () => {
  const files = Array.from({ length: 300 }, (_, index) => `docs/changed-${index}.md`);
  const run = runScopes("print", { eventName: "merge_group" }, files);
  try {
    assertPlan(JSON.parse(run.stdout) as Record<string, unknown>, FULL_PLAN);
  } finally {
    run.cleanup();
  }
});

test("merge_group counts rename records rather than flattened paths at the 300-file ceiling", () => {
  const files = Array.from({ length: 150 }, (_, index) => `docs/renamed-${index}.md`);
  const run = runScopes("print", { eventName: "merge_group" }, files, {
    OD_SCOPES_STUB_RENAME_EACH_FROM_PREFIX: "docs/original-",
  });
  try {
    assertPlan(JSON.parse(run.stdout) as Record<string, unknown>, expectedPlan({ ciMode: "full" }));
  } finally {
    run.cleanup();
  }
});

test("pull_request changed-file resolution failure still fails the run", () => {
  assert.throws(() => {
    const run = runScopes("print", PR, ["README.md"], { OD_SCOPES_STUB_FAIL: "1" });
    run.cleanup();
  });
});

for (const renameCase of [
  { name: "pull_request", context: PR, filename: "e2e/tests/server-identifier-scope.test.ts", ciMode: "hot" },
  {
    name: "workflow_dispatch hot",
    context: { eventName: "workflow_dispatch", ciMode: "hot" } as const,
    filename: "e2e/tests/server-identifier-scope.test.ts",
    ciMode: "hot",
  },
  {
    name: "merge_group",
    context: { eventName: "merge_group" } as const,
    filename: "docs/server-identifier-scope.md",
    ciMode: "full",
  },
] as const) {
  test(`${renameCase.name} rename keeps validation scopes from the previous filename`, () => {
    const run = runScopes("print", renameCase.context, [renameCase.filename], {
      OD_SCOPES_STUB_RENAMED_FROM: "apps/daemon/tests/server-identifier-scope.test.ts",
    });
    try {
      assertPlan(
        JSON.parse(run.stdout) as Record<string, unknown>,
        expectedPlan({
          ciMode: renameCase.ciMode,
          scopes: [
            "daemon_tests_required",
            "ui_critical_validation_required",
            "ui_p0_validation_required",
            "workspace_validation_required",
          ],
          runs: ["run_e2e_vitest", "run_ui_p0"],
        }),
      );
    } finally {
      run.cleanup();
    }
  });
}

// ---------------------------------------------------------------------------
// Unit layer: rule-table invariants and evaluator semantics, imported directly.
// ---------------------------------------------------------------------------

test("rule ids are unique", async () => {
  const { scopeRules } = await import("../../../scripts/scopes.ts");
  const ids = scopeRules.map((rule) => rule.id);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test("certain rules must name a guard that resolves to a real guard check", async () => {
  const { scopeRules } = await import("../../../scripts/scopes.ts");
  // guard.ts must run through tsx (its check modules use .js-suffixed TS-ESM
  // specifiers), so go through the root guard script exactly like CI does.
  const guardCheckNames = new Set(
    execFileSync("pnpm", ["--silent", "guard", "--list-checks"], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter(Boolean),
  );
  for (const rule of scopeRules) {
    if (rule.confidence === "certain") {
      assert.ok(
        rule.guard != null && guardCheckNames.has(rule.guard),
        `rule ${rule.id} is "certain" but its guard ${JSON.stringify(rule.guard)} does not resolve to a scripts/guard.ts check; promotion requires the live check that keeps its boundary invariant true`,
      );
    }
  }
});

test("certain-exempt markdown matches only the certain rule (no medium co-match neutralizes the promotion)", async () => {
  const { scopeRules, matchesRuleMatch } = await import("../../../scripts/scopes.ts");
  for (const file of ["docs/architecture.md", "docs/nested/guide.mdx", "apps/landing-page/README.md"]) {
    const matched = scopeRules.filter((rule) => matchesRuleMatch(file, rule.match)).map((rule) => rule.id);
    assert.deepEqual(matched, ["certain-exempt-surface"], file);
  }
});

test("merge-queue threshold trusts the certain-exempt core without escalation", async () => {
  const { evaluateScopeOutputs, SCOPE_EFFECTS } = await import("../../../scripts/scopes.ts");
  const atQueue = evaluateScopeOutputs(["docs/architecture.md"], "certain", {
    deriveWorkspaceValidationFromTestScopes: true,
  });
  assert.deepEqual(
    Object.values(atQueue.outputs),
    SCOPE_EFFECTS.map(() => false),
  );
  assert.deepEqual(atQueue.decisions[0], {
    file: "docs/architecture.md",
    matchedRules: ["certain-exempt-surface"],
    escalated: false,
  });
});

test("packaged-leaf core matches only its certain rule with the guarded effects", async () => {
  const { evaluateScopeOutputs, matchesRuleMatch, scopeRules } = await import("../../../scripts/scopes.ts");
  const files = [
    "apps/desktop/src/main.ts",
    "apps/packaged/tests/main.test.ts",
    "tools/pack/resources/linux/open-design.desktop.template",
  ];
  for (const file of files) {
    const matched = scopeRules.filter((rule) => matchesRuleMatch(file, rule.match)).map((rule) => rule.id);
    assert.deepEqual(matched, ["certain-packaged-leaf-sources"], file);
  }
  const evaluation = evaluateScopeOutputs(files, "certain", {
    deriveWorkspaceValidationFromTestScopes: true,
  });
  assert.deepEqual(evaluation.decisions.map((decision) => decision.escalated), [false, false, false]);
  assert.deepEqual(
    Object.entries(evaluation.outputs)
      .filter(([, enabled]) => enabled)
      .map(([effect]) => effect),
    ["tools_dev_tests_required", "tools_pack_tests_required", "workspace_validation_required"],
  );
});

test("daemon core matches only its certain rule while excluded daemon surfaces stay medium", async () => {
  const { evaluateScopeOutputs, matchesRuleMatch, scopeRules } = await import("../../../scripts/scopes.ts");
  const files = [
    "apps/daemon/src/server.ts",
    "apps/daemon/src/policy.md",
    "apps/daemon/tests/server.test.ts",
  ];
  for (const file of files) {
    const matched = scopeRules.filter((rule) => matchesRuleMatch(file, rule.match)).map((rule) => rule.id);
    assert.deepEqual(matched, ["certain-daemon-core"], file);
  }

  const evaluation = evaluateScopeOutputs(files, "certain", {
    deriveWorkspaceValidationFromTestScopes: true,
  });
  assert.deepEqual(evaluation.decisions.map((decision) => decision.escalated), [false, false, false]);
  assert.deepEqual(
    Object.entries(evaluation.outputs)
      .filter(([, enabled]) => enabled)
      .map(([effect]) => effect),
    [
      "daemon_tests_required",
      "ui_critical_validation_required",
      "ui_p0_validation_required",
      "workspace_validation_required",
    ],
  );

  for (const file of [
    "apps/daemon/src/sidecar/server.ts",
    "apps/daemon/src/runtimes/defs/claude.ts",
    "apps/daemon/tests/runtimes/agent-args.test.ts",
  ]) {
    const outside = evaluateScopeOutputs([file], "certain", {
      deriveWorkspaceValidationFromTestScopes: true,
    });
    assert.equal(outside.decisions[0]?.escalated, true, file);
    assert.equal(outside.decisions[0]?.matchedRules.includes("certain-daemon-core"), false, file);
  }
});

test("packaged-leaf consumption collector resolves imports, packages, and static paths", async () => {
  const { collectPackagedLeafConsumptionFromSource } = await import(
    "../../../scripts/check-packaged-leaf-boundary.ts"
  );
  const violations = collectPackagedLeafConsumptionFromSource(
    "packages/example/src/index.ts",
    [
      `import "@open-design/desktop/main";`,
      `await import("../../../apps/packaged/src/index.ts");`,
      `const source = path.join(repoRoot, "tools", "pack", "src", "index.ts");`,
      `const prose = "desktop behavior is packaged elsewhere";`,
    ].join("\n"),
  );
  assert.deepEqual(
    violations.map((violation) => violation.lineNumber),
    [1, 2, 3],
  );
});

test("the consumption guard folds repository paths while allowing sandbox fixture writers", async () => {
  const { collectCertainExemptConsumptionFromSource } = await import(
    "../../../scripts/check-certain-exempt-consumption.ts"
  );

  // Dot-relative resolution into docs/ is consumption anywhere, tests included.
  const relative = collectCertainExemptConsumptionFromSource(
    "apps/daemon/tests/example.test.ts",
    `const spec = readFileSync("../../../docs/spec.md", "utf8");`,
  );
  assert.deepEqual(relative.map((violation) => violation.literal), ["../../../docs/spec.md"]);

  // Bare repo-relative literals are consumption in non-test source...
  const bareInSource = collectCertainExemptConsumptionFromSource(
    "tools/example/src/config.ts",
    `const changelog = "docs/CHANGELOG";`,
  );
  assert.deepEqual(bareInSource.map((violation) => violation.literal), ["docs/CHANGELOG"]);

  // ...and in tests when a repo-root helper reads them.
  const repoReadInTest = collectCertainExemptConsumptionFromSource(
    "apps/daemon/tests/runtimes/trae-cli.test.ts",
    `await readRepoFile("docs/agent-adapters.md");`,
  );
  assert.deepEqual(repoReadInTest.map((violation) => violation.literal), [
    "docs/agent-adapters.md",
  ]);

  const splitJoin = collectCertainExemptConsumptionFromSource(
    "apps/daemon/src/example.ts",
    `await readFile(path.join(repoRoot, "docs", "agent-adapters.md"));`,
  );
  assert.deepEqual(splitJoin.map((violation) => violation.literal), [
    `path.join(repoRoot, "docs", "agent-adapters.md")`,
  ]);

  const splitResolve = collectCertainExemptConsumptionFromSource(
    "apps/daemon/src/example.ts",
    `await readFile(path.resolve("docs", "agent-adapters.md"));`,
  );
  assert.deepEqual(splitResolve.map((violation) => violation.literal), [
    `path.resolve("docs", "agent-adapters.md")`,
  ]);

  const interpolatedPrefix = collectCertainExemptConsumptionFromSource(
    "apps/daemon/src/example.ts",
    "await readFile(`docs/${adapter}.md`);",
  );
  assert.deepEqual(interpolatedPrefix.map((violation) => violation.literal), [
    "`docs/${adapter}.md`",
  ]);

  // Known project writers resolve the same-looking paths inside a sandbox.
  for (const source of [
    `await writeProjectFile("docs/empty.md", "");`,
    `await fixture.writeProjectFile("docs/empty.md", "");`,
    `await writeProjectFile(path.join("docs", "empty.md"), "");`,
    "await writeProjectFile(`docs/${name}.md`, \"\");",
  ]) {
    const fixtureWrite = collectCertainExemptConsumptionFromSource(
      "apps/daemon/tests/example.test.ts",
      source,
    );
    assert.deepEqual(fixtureWrite, []);
  }

  // Prose that merely mentions a docs path does not start with the prefix.
  const prose = collectCertainExemptConsumptionFromSource(
    "apps/web/src/copy.ts",
    `const footer = "Spec: docs/skills-protocol.md covers the adapter surface.";`,
  );
  assert.deepEqual(prose, []);
});

test("the consumption guard exempts only the promoted adapter document for its daemon consumer", async () => {
  const { collectDisallowedCertainExemptConsumptionFromSource } = await import(
    "../../../scripts/check-certain-exempt-consumption.ts"
  );
  const violations = collectDisallowedCertainExemptConsumptionFromSource(
    "apps/daemon/tests/runtimes/trae-cli.test.ts",
    [
      `await readRepoFile("docs/agent-adapters.md");`,
      `await readRepoFile("docs/other.md");`,
    ].join("\n"),
  );

  assert.deepEqual(violations.map((violation) => violation.literal), ["docs/other.md"]);
});

test("the adapter documentation is daemon-core because daemon tests consume it", async () => {
  const { evaluateScopeOutputs } = await import("../../../scripts/scopes.ts");
  const plan = evaluateScopeOutputs(["docs/agent-adapters.md"], "certain", {
    deriveWorkspaceValidationFromTestScopes: true,
  });
  assert.equal(plan.outputs.daemon_tests_required, true);
  assert.deepEqual(plan.decisions[0]?.matchedRules, ["certain-daemon-core"]);
});

test("the rule table classifies every file: no path escapes both fallbacks", async () => {
  const { scopeRules, matchesRuleMatch } = await import("../../../scripts/scopes.ts");
  const samples = [
    "README.md",
    "docs/architecture.md",
    "apps/web/src/x.ts",
    "apps/desktop/src/main.ts",
    "tools/pack/src/build.ts",
    "mystery.xyz",
    "some/deeply/nested/unknown.bin",
    ".github/workflows/nix.yml",
    "e2e/ui/notes.md",
    "",
  ];
  for (const file of samples) {
    const matched = scopeRules.filter((rule) => matchesRuleMatch(file, rule.match));
    assert.ok(matched.length > 0, `no rule matched ${JSON.stringify(file)}`);
  }
});

test("fallback matching honors excludeWhen semantics", async () => {
  const { scopeRules, matchesRuleMatch } = await import("../../../scripts/scopes.ts");
  const byId = new Map(scopeRules.map((rule) => [rule.id, rule]));
  const workspaceFallback = byId.get("workspace-fallback")!;
  const uiCriticalFallback = byId.get("ui-critical-fallback")!;

  assert.equal(matchesRuleMatch("README.md", workspaceFallback.match), false);
  assert.equal(matchesRuleMatch("mystery.xyz", workspaceFallback.match), true);
  assert.equal(matchesRuleMatch("tools/pack/src/build.ts", workspaceFallback.match), false);
  assert.equal(matchesRuleMatch("tools/pack/bin/tools-pack.mjs", workspaceFallback.match), true);

  assert.equal(matchesRuleMatch("tools/pack/src/build.ts", uiCriticalFallback.match), false);
  assert.equal(matchesRuleMatch("apps/desktop/src/main.ts", uiCriticalFallback.match), false);
  assert.equal(matchesRuleMatch("mystery.xyz", uiCriticalFallback.match), true);
});

test("merge-queue threshold escalates medium-confidence files to the full radius", async () => {
  const { evaluateScopeOutputs, SCOPE_EFFECTS } = await import("../../../scripts/scopes.ts");
  const options = { deriveWorkspaceValidationFromTestScopes: true };

  const atPr = evaluateScopeOutputs(["README.md"], "medium", options);
  assert.deepEqual(
    Object.values(atPr.outputs),
    SCOPE_EFFECTS.map(() => false),
  );
  assert.equal(atPr.decisions[0]!.escalated, false);

  const atQueue = evaluateScopeOutputs(["README.md"], "certain", options);
  assert.deepEqual(
    Object.values(atQueue.outputs),
    SCOPE_EFFECTS.map(() => true),
  );
  assert.deepEqual(atQueue.decisions[0], {
    file: "README.md",
    matchedRules: ["exempt-surface"],
    escalated: true,
    reason: "below-threshold",
  });
});

test("runtime-definition changes produce only a four-domain UI P0 shadow candidate", async () => {
  const { evaluateUiP0Shadow } = await import("../../../scripts/scopes.ts");
  const decision = evaluateUiP0Shadow([
    "apps/daemon/src/runtimes/defs/atomcode.ts",
    "apps/daemon/src/runtimes/metadata.ts",
    "apps/daemon/tests/runtimes/atomcode.test.ts",
  ]);
  assert.equal(decision.mode, "candidate");
  assert.equal(decision.capability, "daemon-runtime-definition");
  assert.deepEqual(
    decision.matrix.map((entry) => entry.name),
    ["entry-settings", "project-workspace", "project-collab", "project-runtime"],
  );
  assert.deepEqual(decision.outsideCapabilityFiles, []);
});

test("runtime-definition shadow fails closed for mixed, unknown, empty, and unresolved changes", async () => {
  const { evaluateUiP0Shadow } = await import("../../../scripts/scopes.ts");
  for (const files of [
    ["apps/daemon/src/runtimes/defs/atomcode.ts", "apps/daemon/src/server.ts"],
    ["apps/daemon/src/runtimes/detection.ts"],
    ["mystery.xyz"],
    [],
  ]) {
    const decision = evaluateUiP0Shadow(files);
    assert.equal(decision.mode, "full-fallback", files.join(", "));
    assert.deepEqual(
      decision.matrix.map((entry) => entry.name),
      [
        "entry-settings",
        "project-workspace",
        "project-workspace-editor",
        "project-collab",
        "project-runtime",
        "workspace-restoration",
      ],
    );
  }
  assert.equal(evaluateUiP0Shadow([], false).reason, "files-unresolved");
});

test("UI P0 shadow guard pins full applied coverage and closed fallbacks", async () => {
  const { daemonCoreScopeContractErrors, uiP0ShadowContractErrors } = await import(
    "../../../scripts/lib/guard/scope.ts"
  );
  assert.deepEqual(uiP0ShadowContractErrors(), []);
  assert.deepEqual(daemonCoreScopeContractErrors(), []);
});

test("plan command evaluates offline at the pr threshold", () => {
  const stdout = execFileSync(
    process.execPath,
    ["--experimental-strip-types", scopesScript, "plan", "--context", "pr", "--files", "README.md", "docs/a.md"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout) as { plan: Record<string, unknown>; trace: Record<string, unknown> };
  assertPlan(result.plan, expectedPlan({ ciMode: "hot" }));
  assert.equal(result.trace["threshold"], "medium");
  assert.equal(result.trace["fileCount"], 2);
  assert.deepEqual(result.trace["escalations"], []);
});

test("plan trace reports the runtime-definition UI P0 shadow without changing the applied plan", () => {
  const stdout = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      scopesScript,
      "plan",
      "--context",
      "pr",
      "--files",
      "apps/daemon/src/runtimes/defs/atomcode.ts",
      "apps/daemon/tests/runtimes/atomcode.test.ts",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout) as {
    plan: Record<string, unknown>;
    trace: { uiP0Shadow: { mode: string; matrix: Array<{ name: string }> } };
  };
  assert.equal(result.plan["ui_p0_matrix"], UI_P0_MATRIX_JSON);
  assert.equal(result.trace.uiP0Shadow.mode, "candidate");
  assert.deepEqual(
    result.trace.uiP0Shadow.matrix.map((entry) => entry.name),
    ["entry-settings", "project-workspace", "project-collab", "project-runtime"],
  );
});

test("plan command surfaces queue-tier escalation and the trust-all shadow column", () => {
  const stdout = execFileSync(
    process.execPath,
    ["--experimental-strip-types", scopesScript, "plan", "--context", "merge-queue", "--files", "README.md"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const result = JSON.parse(stdout) as {
    plan: Record<string, unknown>;
    trace: { escalations: unknown[]; plans: { applied: Record<string, unknown>; ifTrustAll: Record<string, unknown> } };
  };
  for (const key of SCOPE_KEYS) assert.equal(result.plan[key], true, key);
  assert.equal(result.plan["ci_mode"], "full");
  assert.equal(result.trace.escalations.length, 1);
  // The shadow column shows what medium-confidence rules would have allowed.
  for (const key of SCOPE_KEYS) assert.equal(result.trace.plans.ifTrustAll[key], false, `ifTrustAll ${key}`);
});

test("github-output writes exactly the frozen 20-key contract, in order", () => {
  const expected = GOLDEN_CASES[2]!;
  const run = runScopes("github-output", expected.context, expected.files);
  try {
    const expectedLines = Object.entries(expected.expected).map(([key, value]) => `${key}=${value}`);
    const outputLines = readFileSync(run.outputPath, "utf8").split("\n").filter(Boolean);
    assert.deepEqual(outputLines, expectedLines);
    // stdout must lead with the same contract lines; anything after (e.g. a
    // decision trace) is log-only and not part of the contract.
    assert.deepEqual(run.stdout.split("\n").slice(0, expectedLines.length), expectedLines);
  } finally {
    run.cleanup();
  }
});
