import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";

type ScopeOutputs = {
  daemon_tests_required: boolean;
  web_tests_required: boolean;
  tools_dev_tests_required: boolean;
  tools_pack_tests_required: boolean;
  nix_validation_required: boolean;
  ui_p0_pr_required: boolean;
  visual_validation_required: boolean;
  docker_validation_required: boolean;
  workspace_validation_required: boolean;
};

type GitHubEvent = {
  pull_request?: {
    number?: number;
  };
};

const outputs: ScopeOutputs = {
  daemon_tests_required: false,
  web_tests_required: false,
  tools_dev_tests_required: false,
  tools_pack_tests_required: false,
  nix_validation_required: false,
  ui_p0_pr_required: false,
  visual_validation_required: false,
  docker_validation_required: false,
  workspace_validation_required: false,
};

const eventName = requiredEnv("GITHUB_EVENT_NAME");

if (eventName === "pull_request") {
  for (const file of changedPullRequestFiles()) {
    applyChangedFile(file, outputs);
    if (allOutputsTrue(outputs)) break;
  }

  if (
    outputs.daemon_tests_required ||
    outputs.web_tests_required ||
    outputs.tools_dev_tests_required ||
    outputs.tools_pack_tests_required
  ) {
    outputs.workspace_validation_required = true;
  }
} else if (eventName === "push") {
  outputs.daemon_tests_required = true;
  outputs.web_tests_required = true;
  outputs.tools_dev_tests_required = true;
  outputs.tools_pack_tests_required = true;
  // Main already runs .github/workflows/nix-check.yml, so keep this workflow's
  // push path focused on the non-Nix workspace signal.
  outputs.nix_validation_required = false;
  // Main Docker publishing stays owned by .github/workflows/docker-image.yml.
  outputs.docker_validation_required = false;
  outputs.workspace_validation_required = true;
} else {
  outputs.daemon_tests_required = true;
  outputs.web_tests_required = true;
  outputs.tools_dev_tests_required = true;
  outputs.tools_pack_tests_required = true;
  outputs.nix_validation_required = true;
  if (eventName === "workflow_dispatch") {
    outputs.ui_p0_pr_required = true;
  }
  outputs.visual_validation_required = true;
  outputs.docker_validation_required = true;
  outputs.workspace_validation_required = true;
}

writeOutputs(outputs);

function changedPullRequestFiles(): string[] {
  const eventPath = requiredEnv("GITHUB_EVENT_PATH");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as GitHubEvent;
  const prNumber = event.pull_request?.number;
  if (prNumber == null) {
    throw new Error("pull_request event payload did not include pull_request.number");
  }

  const stdout = execFileSync(
    "gh",
    ["api", "--paginate", `repos/${repository}/pulls/${prNumber}/files`, "--jq", ".[].filename"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return stdout.split(/\r?\n/).filter(Boolean);
}

function applyChangedFile(file: string, target: ScopeOutputs): void {
  if (
    startsWithAny(file, [
      "apps/daemon/",
      "packages/contracts/",
      "packages/platform/",
      "packages/sidecar/",
      "packages/sidecar-proto/",
    ])
  ) {
    target.daemon_tests_required = true;
  }

  if (
    startsWithAny(file, [
      "apps/web/",
      "packages/components/",
      "packages/contracts/",
      "packages/host/",
      "packages/platform/",
      "packages/sidecar/",
      "packages/sidecar-proto/",
    ])
  ) {
    target.web_tests_required = true;
  }

  if (startsWithAny(file, ["scripts/", "assets/", "skills/", "prompt-templates/", "design-systems/", "design-templates/", "craft/"])) {
    target.daemon_tests_required = true;
    target.web_tests_required = true;
  }

  if (startsWithAny(file, ["tools/dev/", "packages/platform/", "packages/sidecar/", "packages/sidecar-proto/"])) {
    target.tools_dev_tests_required = true;
  }

  if (
    startsWithAny(file, [
      "tools/pack/",
      "apps/packaged/",
      "apps/desktop/",
      "packages/components/",
      "packages/host/",
      "packages/platform/",
      "packages/sidecar/",
      "packages/sidecar-proto/",
    ])
  ) {
    target.tools_pack_tests_required = true;
  }

  if (isWorkspaceManifestOrCiFile(file)) {
    target.daemon_tests_required = true;
    target.web_tests_required = true;
    target.tools_dev_tests_required = true;
    target.tools_pack_tests_required = true;
  }

  if (isUiP0RelevantFile(file)) {
    target.ui_p0_pr_required = true;
  }

  if (isVisualRelevantFile(file)) {
    target.visual_validation_required = true;
  }

  if (isDockerRelevantFile(file)) {
    target.docker_validation_required = true;
  }

  if (isNixRelevantFile(file)) {
    target.nix_validation_required = true;
  }

  if (!isWorkspaceValidationExemptFile(file)) {
    target.workspace_validation_required = true;
  }
}

function isWorkspaceManifestOrCiFile(file: string): boolean {
  return (
    file === "package.json" ||
    file === "pnpm-lock.yaml" ||
    file === "pnpm-workspace.yaml" ||
    file === ".github/workflows/ci.yml" ||
    /^apps\/[^/]+\/package\.json$/.test(file) ||
    /^packages\/[^/]+\/package\.json$/.test(file) ||
    /^tools\/[^/]+\/package\.json$/.test(file) ||
    file === "e2e/package.json"
  );
}

function isUiP0RelevantFile(file: string): boolean {
  return (
    startsWithAny(file, [
      "apps/web/",
      "apps/daemon/",
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
    ]) ||
    [
      "e2e/package.json",
      "e2e/playwright.config.ts",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".github/workflows/ci.yml",
      ".github/workflows/ui-extended-main.yml",
    ].includes(file)
  );
}

function isVisualRelevantFile(file: string): boolean {
  return (
    startsWithAny(file, [
      "apps/web/",
      "e2e/lib/playwright/",
      ".github/actions/setup-playwright/",
      ".github/actions/setup-workspace/",
    ]) ||
    /^e2e\/ui\/visual-[^/]+\.test\.ts$/.test(file) ||
    [
      "e2e/package.json",
      "e2e/playwright.visual.config.ts",
      "e2e/scripts/playwright.ts",
      "e2e/scripts/visual-report.ts",
      "pnpm-lock.yaml",
      ".github/workflows/ci.yml",
      ".github/workflows/visual-baseline.yml",
      ".github/workflows/visual-pr-comment.yml",
    ].includes(file)
  );
}

function isDockerRelevantFile(file: string): boolean {
  return (
    startsWithAny(file, [
      "deploy/",
      "apps/daemon/",
      "apps/web/",
      "apps/packaged/",
      "packages/",
      "tools/",
      "assets/",
      "plugins/",
      "skills/",
      "design-systems/",
      "design-templates/",
      "craft/",
      "prompt-templates/",
    ]) ||
    [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".dockerignore",
      ".github/workflows/ci.yml",
      ".github/workflows/docker-image.yml",
    ].includes(file)
  );
}

function isNixRelevantFile(file: string): boolean {
  return (
    startsWithAny(file, [
      "nix/",
      "apps/daemon/",
      "apps/web/",
      "packages/components/",
      "packages/contracts/",
      "packages/registry-protocol/",
      "packages/agui-adapter/",
      "packages/plugin-runtime/",
      "packages/sidecar-proto/",
      "packages/sidecar/",
      "packages/platform/",
      "packages/diagnostics/",
      "packages/host/",
      "assets/",
      "plugins/",
      "skills/",
      "design-systems/",
      "design-templates/",
      "craft/",
      "prompt-templates/",
    ]) ||
    [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "flake.nix",
      "flake.lock",
      ".github/workflows/ci.yml",
      ".github/workflows/nix-check.yml",
      ".github/workflows/nix-hash-autofix.yml",
      "scripts/update-nix-pnpm-deps-hash.ts",
    ].includes(file)
  );
}

function isWorkspaceValidationExemptFile(file: string): boolean {
  return (
    isDocumentationOrMetadataFile(file) ||
    startsWithAny(file, [
      "apps/landing-page/",
      "nix/",
      ".github/ISSUE_TEMPLATE/",
    ]) ||
    [
      "flake.nix",
      "flake.lock",
      ".github/workflows/nix-check.yml",
      ".github/workflows/landing-page-ci.yml",
      ".github/workflows/landing-page-staging.yml",
      ".github/workflows/landing-page-production.yml",
      ".github/workflows/blog-indexing-on-deploy.yml",
      ".github/workflows/blog-indexing-monitor.yml",
      ".github/workflows/blog-3day-report.yml",
      ".github/workflows/seo-daily-report.yml",
      ".github/workflows/visual-pr-comment.yml",
      ".github/workflows/docker-image.yml",
    ].includes(file)
  );
}

function isDocumentationOrMetadataFile(file: string): boolean {
  return (
    /\.(?:md|mdx|txt)$/.test(file) ||
    file === "LICENSE" ||
    file === ".gitignore" ||
    file === ".editorconfig" ||
    startsWithAny(file, [".vscode/", ".idea/", "docs/"]) ||
    file === ".github/CODEOWNERS"
  );
}

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function allOutputsTrue(value: ScopeOutputs): boolean {
  return Object.values(value).every(Boolean);
}

function writeOutputs(value: ScopeOutputs): void {
  const lines = Object.entries(value).map(([key, enabled]) => `${key}=${enabled ? "true" : "false"}`);
  console.log(lines.join("\n"));
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath != null && outputPath.length > 0) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
