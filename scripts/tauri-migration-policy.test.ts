import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTauriMigrationOrder,
  m4EvidenceLogMarker,
  m4PlatformGateLabels,
  m4RemoteEvidenceLogMarker,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m6ElectronDepsLabel,
  m6ElectronGuidanceLabel,
  m6ElectronResourcesLabel,
  m6ElectronRuntimeLabel,
  m6ElectronTestsLabel,
  type TauriMigrationPolicyInputs,
} from "./tauri-migration-policy.ts";

type Runtime = "electron" | "tauri";

test("evaluateTauriMigrationOrder accepts the current parallel migration state", () => {
  assert.deepEqual(evaluateTauriMigrationOrder(baseInput()), []);
});

test("evaluateTauriMigrationOrder rejects partially checked M4 platform gates", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      migrationDoc: migrationDoc({ checked: [m4PlatformGateLabels[0]] }),
    }),
  );

  assertContains(violations, "M4 Windows/Linux platform gate checkboxes must move together");
});

test("evaluateTauriMigrationOrder rejects checked M4 gates without verifier evidence", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      migrationDoc: migrationDoc({ checked: [...m4PlatformGateLabels] }),
    }),
  );

  assertContains(violations, "missing the verifier-applied native evidence log marker");
});

test("evaluateTauriMigrationOrder rejects checked M4 gates without pushed remote evidence", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      migrationDoc: migrationDoc({ checked: [...m4PlatformGateLabels], extra: [m4EvidenceLogMarker] }),
    }),
  );

  assertContains(violations, "missing the pushed remote branch-head evidence log marker");
});

test("evaluateTauriMigrationOrder rejects default flips before M4 is complete", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      releaseBetaWorkflow: releaseBetaWorkflow("tauri"),
      toolsDevConfig: toolsConfig("tauri"),
      toolsPackConfig: toolsConfig("tauri"),
    }),
  );

  assertContains(violations, "desktop runtime defaults cannot flip to Tauri before all M4 Windows/Linux platform gates are checked");
});

test("evaluateTauriMigrationOrder rejects divergent tools-dev and tools-pack defaults", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      migrationDoc: migrationDoc({
        checked: [...m4PlatformGateLabels, m5ToolsDevDefaultLabel],
        extra: [m4EvidenceLogMarker, m4RemoteEvidenceLogMarker],
      }),
      toolsDevConfig: toolsConfig("tauri"),
    }),
  );

  assertContains(violations, "tools-dev and tools-pack DEFAULT_DESKTOP_RUNTIME must move together");
});

test("evaluateTauriMigrationOrder rejects M6 cleanup before the M5 default flip", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      migrationDoc: migrationDoc({
        checked: [m6ElectronRuntimeLabel],
      }),
    }),
  );

  assertContains(violations, "M6 Electron cleanup cannot be checked before the M5 Tauri default flip is complete");
});

test("evaluateTauriMigrationOrder rejects completed M6 cleanup while tools still accept Electron", () => {
  const violations = evaluateTauriMigrationOrder(
    postM5Input({
      migrationDoc: postM5MigrationDoc({
        m6Checked: [
          m6ElectronDepsLabel,
          m6ElectronRuntimeLabel,
          m6ElectronResourcesLabel,
          m6ElectronTestsLabel,
          m6ElectronGuidanceLabel,
        ],
      }),
      desktopPackageJson: packageJsonWithoutElectronDeps(),
      packagedPackageJson: packageJsonWithoutElectronDeps(),
      toolsPackPackageJson: packageJsonWithoutElectronDeps(),
      pnpmLock: lockfileWithoutElectronDeps(),
      remainingElectronRuntimeFiles: [],
      remainingElectronResourceFiles: [],
      electronTestReferenceFiles: [],
      electronGuidanceReferenceFiles: [],
    }),
  );

  assertContains(violations, "M6 Electron cleanup is complete, but tools-dev/tools-pack still accept the electron desktop runtime");
});

test("evaluateTauriMigrationOrder rejects checked dependency cleanup with stale lockfile importers", () => {
  const violations = evaluateTauriMigrationOrder(
    postM5Input({
      migrationDoc: postM5MigrationDoc({ m6Checked: [m6ElectronDepsLabel] }),
      desktopPackageJson: packageJsonWithoutElectronDeps(),
      packagedPackageJson: packageJsonWithoutElectronDeps(),
      toolsPackPackageJson: packageJsonWithoutElectronDeps(),
    }),
  );

  assertContains(violations, "pnpm-lock.yaml importers still include");
});

test("evaluateTauriMigrationOrder rejects checked dependency cleanup with stale package scripts", () => {
  const violations = evaluateTauriMigrationOrder(
    postM5Input({
      migrationDoc: postM5MigrationDoc({ m6Checked: [m6ElectronDepsLabel] }),
      desktopPackageJson: packageJsonWithoutElectronDeps(),
      packagedPackageJson: packageJsonWithoutElectronDeps(),
      toolsPackPackageJson: packageJsonWithoutElectronDeps(),
      pnpmLock: lockfileWithoutElectronDeps(),
      electronPackageScriptReferences: ["tools/pack/package.json:scripts.electron:build"],
    }),
  );

  assertContains(violations, "package scripts still reference Electron");
});

test("evaluateTauriMigrationOrder rejects checked resource cleanup with stale release workflow references", () => {
  const violations = evaluateTauriMigrationOrder(
    postM5Input({
      migrationDoc: postM5MigrationDoc({ m6Checked: [m6ElectronResourcesLabel] }),
      remainingElectronResourceFiles: [],
      electronReleaseReferenceFiles: [".github/workflows/release-beta.yml"],
    }),
  );

  assertContains(violations, "release workflow files still reference Electron");
});

test("evaluateTauriMigrationOrder accepts verified M4 before the default flip", () => {
  const violations = evaluateTauriMigrationOrder(
    baseInput({
      migrationDoc: verifiedM4MigrationDoc(),
    }),
  );

  assert.deepEqual(violations, []);
});

test("evaluateTauriMigrationOrder accepts post-M5 with explicit Electron fallback", () => {
  const violations = evaluateTauriMigrationOrder(postM5Input());

  assert.deepEqual(violations, []);
});

test("evaluateTauriMigrationOrder accepts formatted runtime kind arrays during the fallback window", () => {
  const violations = evaluateTauriMigrationOrder(
    postM5Input({
      toolsDevConfig: formattedFallbackToolsConfig("tauri"),
      toolsPackConfig: formattedFallbackToolsConfig("tauri"),
      releaseBetaWorkflow: formattedReleaseBetaWorkflow("tauri"),
    }),
  );

  assert.deepEqual(violations, []);
});

test("evaluateTauriMigrationOrder accepts the final post-M6 cleanup state", () => {
  const violations = evaluateTauriMigrationOrder(
    postM5Input({
      migrationDoc: postM5MigrationDoc({
        m6Checked: [
          m6ElectronDepsLabel,
          m6ElectronRuntimeLabel,
          m6ElectronResourcesLabel,
          m6ElectronTestsLabel,
          m6ElectronGuidanceLabel,
        ],
      }),
      desktopPackageJson: packageJsonWithoutElectronDeps(),
      packagedPackageJson: packageJsonWithoutElectronDeps(),
      toolsDevConfig: tauriOnlyToolsConfig(),
      toolsPackConfig: tauriOnlyToolsConfig(),
      toolsPackPackageJson: packageJsonWithoutElectronDeps(),
      pnpmLock: lockfileWithoutElectronDeps(),
      remainingElectronRuntimeFiles: [],
      remainingElectronResourceFiles: [],
      electronReleaseReferenceFiles: [],
      electronPackageScriptReferences: [],
      electronTestReferenceFiles: [],
      electronGuidanceReferenceFiles: [],
    }),
  );

  assert.deepEqual(violations, []);
});

function assertContains(violations: string[], expected: string): void {
  assert.ok(
    violations.some((violation) => violation.includes(expected)),
    `expected violation containing ${JSON.stringify(expected)}, got:\n${violations.join("\n")}`,
  );
}

function baseInput(overrides: Partial<TauriMigrationPolicyInputs> = {}): TauriMigrationPolicyInputs {
  return {
    migrationDoc: migrationDoc(),
    pnpmLock: lockfileWithElectronDeps(),
    readme: "Tauri is available as the explicit migration runtime.",
    appsAgents: "Desktop runtime guidance is in migration state.",
    architectureDoc: "The desktop runtime is transitioning to Tauri.",
    toolsDevConfig: toolsConfig("electron"),
    toolsPackConfig: toolsConfig("electron"),
    releaseBetaWorkflow: releaseBetaWorkflow("electron"),
    desktopPackageJson: packageJsonWithDeps({ electron: "1.0.0" }),
    packagedPackageJson: packageJsonWithDeps({ "@electron/rebuild": "1.0.0" }),
    toolsPackPackageJson: packageJsonWithDeps({ "electron-builder": "1.0.0" }),
    remainingElectronRuntimeFiles: ["apps/desktop/src/main/runtime.ts"],
    remainingElectronResourceFiles: ["tools/pack/resources/web-standalone-after-pack.cjs"],
    electronReleaseReferenceFiles: [".github/workflows/release-beta.yml"],
    electronPackageScriptReferences: ["tools/pack/package.json:scripts.electron:build"],
    electronTestReferenceFiles: ["apps/desktop/tests/runtime.test.ts"],
    electronGuidanceReferenceFiles: ["AGENTS.md"],
    ...overrides,
  };
}

function postM5Input(overrides: Partial<TauriMigrationPolicyInputs> = {}): TauriMigrationPolicyInputs {
  return baseInput({
    migrationDoc: postM5MigrationDoc(),
    readme: "Tauri is the primary desktop runtime.",
    appsAgents: "apps/desktop is the Tauri desktop shell.",
    architectureDoc: "Tauri owns the primary desktop shell.",
    toolsDevConfig: toolsConfig("tauri"),
    toolsPackConfig: toolsConfig("tauri"),
    releaseBetaWorkflow: releaseBetaWorkflow("tauri"),
    ...overrides,
  });
}

function migrationDoc(options: { checked?: readonly string[]; extra?: readonly string[] } = {}): string {
  const checked = new Set(options.checked ?? []);
  return [
    "# Electron to Tauri Migration",
    "",
    ...[
      ...m4PlatformGateLabels,
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
      m6ElectronDepsLabel,
      m6ElectronRuntimeLabel,
      m6ElectronResourcesLabel,
      m6ElectronTestsLabel,
      m6ElectronGuidanceLabel,
    ].map((label) => `- [${checked.has(label) ? "x" : " "}] ${label}`),
    "",
    ...(options.extra ?? []),
  ].join("\n");
}

function postM5MigrationDoc(options: { m6Checked?: readonly string[] } = {}): string {
  return migrationDoc({
    checked: [
      ...m4PlatformGateLabels,
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
      ...(options.m6Checked ?? []),
    ],
    extra: [m4EvidenceLogMarker, m4RemoteEvidenceLogMarker],
  });
}

function verifiedM4MigrationDoc(): string {
  return migrationDoc({
    checked: [...m4PlatformGateLabels],
    extra: [m4EvidenceLogMarker, m4RemoteEvidenceLogMarker],
  });
}

function toolsConfig(defaultRuntime: Runtime): string {
  return [
    'export const DESKTOP_RUNTIME_KINDS = ["electron", "tauri"] as const;',
    `export const DEFAULT_DESKTOP_RUNTIME = "${defaultRuntime}";`,
  ].join("\n");
}

function formattedFallbackToolsConfig(defaultRuntime: Runtime): string {
  return [
    "export const DESKTOP_RUNTIME_KINDS = [",
    "  'tauri',",
    "  'electron',",
    "] as const;",
    "export const DEFAULT_DESKTOP_RUNTIME",
    `  = '${defaultRuntime}' satisfies DesktopRuntimeKind;`,
  ].join("\n");
}

function tauriOnlyToolsConfig(): string {
  return [
    'export const DESKTOP_RUNTIME_KINDS = ["tauri"] as const;',
    'export const DEFAULT_DESKTOP_RUNTIME = "tauri";',
  ].join("\n");
}

function releaseBetaWorkflow(defaultRuntime: Runtime): string {
  return [
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      desktop_runtime:",
    `        default: ${defaultRuntime}`,
  ].join("\n");
}

function formattedReleaseBetaWorkflow(defaultRuntime: Runtime): string {
  return [
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      desktop_runtime:",
    `        default: "${defaultRuntime}"`,
  ].join("\n");
}

function packageJsonWithDeps(dependencies: Record<string, string>): string {
  return JSON.stringify({ dependencies });
}

function packageJsonWithoutElectronDeps(): string {
  return JSON.stringify({ dependencies: {} });
}

function lockfileWithElectronDeps(): string {
  return [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "  apps/desktop:",
    "    devDependencies:",
    "      electron:",
    "        specifier: 1.0.0",
    "  apps/packaged:",
    "    dependencies:",
    "      '@electron/rebuild':",
    "        specifier: 1.0.0",
    "  tools/pack:",
    "    dependencies:",
    "      electron-builder:",
    "        specifier: 1.0.0",
  ].join("\n");
}

function lockfileWithoutElectronDeps(): string {
  return [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "  apps/desktop:",
    "    dependencies:",
    "      '@tauri-apps/cli':",
    "        specifier: 2.11.2",
    "  apps/packaged:",
    "    dependencies:",
    "      '@open-design/sidecar':",
    "        specifier: workspace:*",
    "  tools/pack:",
    "    dependencies:",
    "      '@tauri-apps/cli':",
    "        specifier: 2.11.2",
  ].join("\n");
}
