export type UiPlaywrightGroup = {
  files: readonly string[];
  fullyParallel?: boolean;
  grep: string;
  workers?: number;
};

export type UiP0CiMatrixEntry = {
  name: string;
  shard: string;
};

export type VisualCiMatrixEntry = {
  files: string;
  name: string;
};

export const uiP0Groups = {
  "critical-extras": {
    grep: "@merge-extra",
    workers: 1,
    files: ["ui/app.test.ts"],
  },
  "workspace-restoration": {
    fullyParallel: true,
    grep: String.raw`\[P0\]`,
    files: ["ui/app-restoration.test.ts", "ui/critical-smoke.test.ts"],
  },
  "entry-settings": {
    grep: String.raw`\[P0\]`,
    files: [
      "ui/entry-chrome-flows.test.ts",
      "ui/entry-configuration-flows.test.ts",
      "ui/amr-onboarding.test.ts",
      "ui/api-empty-response.test.ts",
      "ui/settings-api-protocol.test.ts",
      "ui/settings-connectors-auth-happy-path.test.ts",
      "ui/settings-connectors-auth-recovery.test.ts",
      "ui/workspace-team-interactions.test.ts",
    ],
  },
  "project-workspace": {
    grep: String.raw`\[P0\]`,
    workers: 1,
    files: [
      "ui/app.test.ts",
      "ui/project-management-flows.test.ts",
      "ui/workspace-keyboard-flows.test.ts",
    ],
  },
  // Keep editor-heavy files on a separate single-worker runtime. Running the
  // whole workspace domain serially took 11.6 minutes on CI, while enabling a
  // second worker in one job is unsafe because these flows share Workspace
  // authority state outside the worker-local daemon. Two runner-isolated jobs
  // preserve that boundary and balance the historical file timings.
  "project-workspace-editor": {
    grep: String.raw`\[P0\]`,
    workers: 1,
    files: [
      "ui/app-design-files.test.ts",
      "ui/app-manual-edit.test.ts",
      "ui/workspace-team-design-system-picker.test.ts",
    ],
  },
  // Split out of "project-workspace" (2026-08-04): the two multi-client collab
  // specs alone accounted for ~10 of that group's ~26min single-worker wall
  // time (workspace-multi-client-collab.test.ts spins up two isolated
  // client/daemon runtimes per case). Keep this shard limited to the cluster-
  // owned spec so it does not also boot the default worker runtime needed by
  // ordinary UI files.
  "project-collab": {
    grep: String.raw`\[P0\]`,
    workers: 1,
    files: ["ui/workspace-multi-client-collab.test.ts"],
  },
  "project-runtime": {
    grep: String.raw`\[P0\]`,
    workers: 1,
    files: [
      "ui/real-daemon-run.test.ts",
      "ui/amr-run-failure-recovery.test.ts",
      "ui/amr-logout-requires-relogin.test.ts",
      "ui/settings-local-cli-codex-fallback.test.ts",
    ],
  },
} as const satisfies Record<string, UiPlaywrightGroup>;

export type UiP0GroupName = keyof typeof uiP0Groups;

export const uiP0CiMatrix = [
  { name: "entry-settings", shard: "entry-settings" },
  { name: "project-workspace", shard: "project-workspace" },
  { name: "project-workspace-editor", shard: "project-workspace-editor" },
  { name: "project-collab", shard: "project-collab" },
  { name: "project-runtime", shard: "project-runtime" },
  { name: "workspace-restoration", shard: "workspace-restoration" },
] as const satisfies readonly UiP0CiMatrixEntry[];

export const visualCiMatrix = [
  { name: "entry-navigation", files: "ui/visual-entry.test.ts ui/visual-navigation.test.ts" },
  { name: "settings-workspace", files: "ui/visual-settings.test.ts ui/visual-workspace.test.ts" },
] as const satisfies readonly VisualCiMatrixEntry[];

const uiP0CoverageFiles = [
  "ui/amr-logout-requires-relogin.test.ts",
  "ui/amr-onboarding.test.ts",
  "ui/amr-run-failure-recovery.test.ts",
  "ui/api-empty-response.test.ts",
  "ui/app-design-files.test.ts",
  "ui/app-manual-edit.test.ts",
  "ui/app-restoration.test.ts",
  "ui/app.test.ts",
  "ui/critical-smoke.test.ts",
  "ui/entry-chrome-flows.test.ts",
  "ui/entry-configuration-flows.test.ts",
  "ui/project-management-flows.test.ts",
  "ui/real-daemon-run.test.ts",
  "ui/settings-api-protocol.test.ts",
  "ui/settings-connectors-auth-happy-path.test.ts",
  "ui/settings-connectors-auth-recovery.test.ts",
  "ui/settings-local-cli-codex-fallback.test.ts",
  "ui/workspace-team-interactions.test.ts",
  "ui/workspace-multi-client-collab.test.ts",
  "ui/workspace-team-design-system-picker.test.ts",
  "ui/workspace-keyboard-flows.test.ts",
] as const;

export function getUiP0Group(name: string): UiPlaywrightGroup | undefined {
  return uiP0Groups[name as UiP0GroupName];
}

export function listUiP0GroupNames(): string[] {
  return Object.keys(uiP0Groups).sort();
}

export function validatePlaywrightSuiteTopology(): string[] {
  const errors: string[] = [];
  const knownGroups = new Set(Object.keys(uiP0Groups));
  const coverageFiles = sortedUnique(uiP0CoverageFiles);
  const ciFiles = filesForUiP0Groups(uiP0CiMatrix.map((entry) => entry.shard));

  for (const entry of uiP0CiMatrix) {
    if (!knownGroups.has(entry.shard)) {
      errors.push(`UI P0 CI matrix references unknown group ${entry.shard}`);
    }
  }

  for (const file of difference(coverageFiles, ciFiles)) {
    errors.push(`UI P0 CI matrix does not cover ${file}`);
  }

  for (const file of difference(ciFiles, coverageFiles)) {
    errors.push(`UI P0 CI matrix unexpectedly covers ${file}`);
  }

  for (const entry of visualCiMatrix) {
    if (entry.files.trim().length === 0) {
      errors.push(`Visual CI matrix entry ${entry.name} has no files`);
    }
  }

  return errors;
}

function filesForUiP0Groups(names: readonly string[]): string[] {
  return sortedUnique(names.flatMap((name) => uiP0Groups[name as UiP0GroupName]?.files ?? []));
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
