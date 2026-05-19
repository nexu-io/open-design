export const m4PlatformGateLabels = [
  "Windows NSIS: build, install, start, inspect status/eval/screenshot, stop.",
  "Linux: build AppImage, install, start, inspect status/eval/screenshot, stop.",
  "Linux headless platform smoke remains supported and unaffected.",
] as const;

export const m4EvidenceLogMarker =
  "Verified native Windows/Linux M4 package smoke with `scripts/verify-tauri-platform-gates.ts --update-migration-doc`.";
export const m5ToolsDevDefaultLabel = "Change `tools-dev` default desktop runtime to Tauri.";
export const m5ToolsPackDefaultLabel = "Change `tools-pack` default desktop runtime to Tauri.";
export const m5ReleaseBetaDefaultLabel = "Change `release-beta` desktop runtime workflow default to Tauri.";
export const m5ElectronFallbackLabel = "Keep Electron fallback explicit during the transition window.";
export const m5PrimaryDocsLabel = "Update README, architecture docs, and directory guidance to describe Tauri as the primary runtime.";
export const m6ElectronDepsLabel = "Remove `electron`, `electron-builder`, `@electron/rebuild`, and Electron-only package scripts.";
export const m6ElectronRuntimeLabel = "Remove Electron preload/runtime code after Tauri bridge and packaging parity are complete.";
export const m6ElectronResourcesLabel = "Remove Electron-only resources/hooks from `tools-pack`.";
export const m6ElectronTestsLabel = "Delete or rewrite Electron-only tests.";
export const m6ElectronGuidanceLabel = "Update AGENTS guidance and PR checklist references from Electron to Tauri.";

type DesktopRuntime = "electron" | "tauri";

export type TauriMigrationPolicyInputs = {
  migrationDoc: string;
  pnpmLock: string;
  readme: string;
  appsAgents: string;
  architectureDoc: string;
  toolsDevConfig: string;
  toolsPackConfig: string;
  releaseBetaWorkflow: string;
  desktopPackageJson: string;
  packagedPackageJson: string;
  toolsPackPackageJson: string;
  remainingElectronRuntimeFiles: string[];
  remainingElectronResourceFiles: string[];
  electronPackageScriptReferences: string[];
  electronTestReferenceFiles: string[];
  electronGuidanceReferenceFiles: string[];
};

export function containsElectronPackageScriptReference(scriptName: string, scriptValue: string): boolean {
  return containsElectronGuidanceReference(`${scriptName}\n${scriptValue}`);
}

export function containsElectronTestReference(source: string): boolean {
  return /\b[Ee]lectron\b|@electron\/|electron-builder|electronuserland/.test(source);
}

export function containsElectronGuidanceReference(source: string): boolean {
  return /\b[Ee]lectron\b|electron-builder|electronuserland/.test(source);
}

export function evaluateTauriMigrationOrder(input: TauriMigrationPolicyInputs): string[] {
  const toolsDevDefault = readDefaultDesktopRuntime(input.toolsDevConfig, "tools-dev");
  const toolsPackDefault = readDefaultDesktopRuntime(input.toolsPackConfig, "tools-pack");
  const releaseBetaDefault = readReleaseBetaDesktopRuntimeDefault(input.releaseBetaWorkflow);
  const packageDependencyNames = new Set([
    ...readPackageDependencyNames(input.desktopPackageJson, "apps/desktop/package.json"),
    ...readPackageDependencyNames(input.packagedPackageJson, "apps/packaged/package.json"),
    ...readPackageDependencyNames(input.toolsPackPackageJson, "tools/pack/package.json"),
  ]);
  const lockfileDependencyNames = new Set([
    ...readPnpmImporterDependencyNames(input.pnpmLock, "apps/desktop"),
    ...readPnpmImporterDependencyNames(input.pnpmLock, "apps/packaged"),
    ...readPnpmImporterDependencyNames(input.pnpmLock, "tools/pack"),
  ]);
  const m4PlatformGateStates = m4PlatformGateLabels.map((label) => isChecklistLineChecked(input.migrationDoc, label));
  const m4Complete = m4PlatformGateStates.every(Boolean);
  const m4PartiallyComplete = m4PlatformGateStates.some(Boolean) && !m4Complete;
  const m4EvidenceLogMarked = input.migrationDoc.includes(m4EvidenceLogMarker);
  const toolsDevDefaultFlipped = isChecklistLineChecked(input.migrationDoc, m5ToolsDevDefaultLabel);
  const toolsPackDefaultFlipped = isChecklistLineChecked(input.migrationDoc, m5ToolsPackDefaultLabel);
  const releaseBetaDefaultFlipped = isChecklistLineChecked(input.migrationDoc, m5ReleaseBetaDefaultLabel);
  const fallbackMarked = isChecklistLineChecked(input.migrationDoc, m5ElectronFallbackLabel);
  const primaryDocsMarked = isChecklistLineChecked(input.migrationDoc, m5PrimaryDocsLabel);
  const electronDepsRemoved = isChecklistLineChecked(input.migrationDoc, m6ElectronDepsLabel);
  const electronRuntimeRemoved = isChecklistLineChecked(input.migrationDoc, m6ElectronRuntimeLabel);
  const electronResourcesRemoved = isChecklistLineChecked(input.migrationDoc, m6ElectronResourcesLabel);
  const electronTestsRemoved = isChecklistLineChecked(input.migrationDoc, m6ElectronTestsLabel);
  const electronGuidanceUpdated = isChecklistLineChecked(input.migrationDoc, m6ElectronGuidanceLabel);
  const m6CleanupStates = [
    electronDepsRemoved,
    electronRuntimeRemoved,
    electronResourcesRemoved,
    electronTestsRemoved,
    electronGuidanceUpdated,
  ];
  const anyM6CleanupMarked = m6CleanupStates.some(Boolean);
  const m6CleanupComplete = m6CleanupStates.every(Boolean);
  const toolsAllowElectronFallback =
    sourceAllowsElectronFallback(input.toolsDevConfig) && sourceAllowsElectronFallback(input.toolsPackConfig);

  const violations: string[] = [];
  if (m4PartiallyComplete) {
    violations.push(
      "M4 Windows/Linux platform gate checkboxes must move together through the verified --update-migration-doc path.",
    );
  }
  if (m4Complete && !m4EvidenceLogMarked) {
    violations.push(
      "M4 platform gates are checked, but the migration doc is missing the verifier-applied native evidence log marker.",
    );
  }
  if (!m4Complete && (toolsDevDefault === "tauri" || toolsPackDefault === "tauri" || releaseBetaDefault === "tauri")) {
    violations.push("desktop runtime defaults cannot flip to Tauri before all M4 Windows/Linux platform gates are checked.");
  }
  if ((toolsDevDefault === "tauri") !== toolsDevDefaultFlipped) {
    violations.push("tools-dev DEFAULT_DESKTOP_RUNTIME and the M5 tools-dev checklist line must be updated together.");
  }
  if ((toolsPackDefault === "tauri") !== toolsPackDefaultFlipped) {
    violations.push("tools-pack DEFAULT_DESKTOP_RUNTIME and the M5 tools-pack checklist line must be updated together.");
  }
  if ((releaseBetaDefault === "tauri") !== releaseBetaDefaultFlipped) {
    violations.push("release-beta desktop_runtime default and the M5 release-beta checklist line must be updated together.");
  }
  const bothDefaultsTauri = toolsDevDefault === "tauri" && toolsPackDefault === "tauri";
  if (toolsDevDefault !== toolsPackDefault) {
    violations.push("tools-dev and tools-pack DEFAULT_DESKTOP_RUNTIME must move together during the M5 default flip.");
  }
  if ((releaseBetaDefault === "tauri") !== bothDefaultsTauri) {
    violations.push("release-beta desktop_runtime default must move with the tools-dev/tools-pack Tauri default flip.");
  }
  if (bothDefaultsTauri !== fallbackMarked) {
    violations.push("the M5 Electron fallback checklist line must reflect the post-flip runtime state.");
  }
  if (primaryDocsMarked !== bothDefaultsTauri) {
    violations.push("the M5 Tauri-primary documentation checklist line must move with the default runtime flip.");
  }
  if (anyM6CleanupMarked && !bothDefaultsTauri) {
    violations.push("M6 Electron cleanup cannot be checked before the M5 Tauri default flip is complete.");
  }
  if (
    primaryDocsMarked &&
    [input.readme, input.appsAgents, input.architectureDoc].some((source) =>
      containsElectronDefaultTransitionText(source),
    )
  ) {
    violations.push("Tauri-primary docs are checked, but README/app/architecture docs still describe Electron as the default.");
  }
  if (fallbackMarked && !m6CleanupComplete && !toolsAllowElectronFallback) {
    violations.push("Electron fallback is checked, but a tool no longer accepts both electron and tauri runtime values.");
  }
  if (m6CleanupComplete && toolsAllowElectronFallback) {
    violations.push("M6 Electron cleanup is complete, but tools-dev/tools-pack still accept the electron desktop runtime.");
  }
  const electronDependencyNames = ["electron", "electron-builder", "@electron/rebuild"];
  const electronDependenciesPresent = electronDependencyNames.filter((dependencyName) =>
    packageDependencyNames.has(dependencyName),
  );
  const electronLockfileDependenciesPresent = electronDependencyNames.filter((dependencyName) =>
    lockfileDependencyNames.has(dependencyName),
  );
  const electronDependencyOrScriptPresent =
    electronDependenciesPresent.length > 0 ||
    electronLockfileDependenciesPresent.length > 0 ||
    input.electronPackageScriptReferences.length > 0;
  if (electronDepsRemoved && electronDependenciesPresent.length > 0) {
    violations.push(
      `the M6 Electron dependency cleanup is checked, but package manifests still include: ${electronDependenciesPresent.join(", ")}.`,
    );
  }
  if (!electronDepsRemoved && electronDependenciesPresent.length === 0) {
    violations.push("Electron dependencies were removed, but the M6 dependency cleanup checklist line is not checked.");
  }
  if (electronDepsRemoved && electronLockfileDependenciesPresent.length > 0) {
    violations.push(
      `the M6 Electron dependency cleanup is checked, but pnpm-lock.yaml importers still include: ${electronLockfileDependenciesPresent.join(", ")}.`,
    );
  }
  if (electronDepsRemoved && input.electronPackageScriptReferences.length > 0) {
    violations.push(
      `the M6 Electron dependency cleanup is checked, but package scripts still reference Electron: ${input.electronPackageScriptReferences.join(", ")}.`,
    );
  }
  if (!electronDepsRemoved && !electronDependencyOrScriptPresent) {
    violations.push(
      "Electron dependencies and package scripts were removed, but the M6 dependency cleanup checklist line is not checked.",
    );
  }
  if (electronRuntimeRemoved && input.remainingElectronRuntimeFiles.length > 0) {
    violations.push(
      `the M6 Electron runtime cleanup is checked, but these files still exist: ${input.remainingElectronRuntimeFiles.join(", ")}.`,
    );
  }
  if (!electronRuntimeRemoved && input.remainingElectronRuntimeFiles.length === 0) {
    violations.push("Electron runtime files were removed, but the M6 runtime cleanup checklist line is not checked.");
  }
  if (electronResourcesRemoved && input.remainingElectronResourceFiles.length > 0) {
    violations.push(
      `the M6 Electron resources cleanup is checked, but these files still exist: ${input.remainingElectronResourceFiles.join(", ")}.`,
    );
  }
  if (!electronResourcesRemoved && input.remainingElectronResourceFiles.length === 0) {
    violations.push("Electron-only tools-pack resources were removed, but the M6 resources cleanup checklist line is not checked.");
  }
  if (electronTestsRemoved && input.electronTestReferenceFiles.length > 0) {
    violations.push(
      `the M6 Electron test cleanup is checked, but these tests still reference Electron: ${input.electronTestReferenceFiles.join(", ")}.`,
    );
  }
  if (!electronTestsRemoved && input.electronTestReferenceFiles.length === 0) {
    violations.push("Electron-only tests no longer reference Electron, but the M6 test cleanup checklist line is not checked.");
  }
  if (electronGuidanceUpdated && input.electronGuidanceReferenceFiles.length > 0) {
    violations.push(
      `the M6 AGENTS/PR guidance cleanup is checked, but these guidance files still reference Electron: ${input.electronGuidanceReferenceFiles.join(", ")}.`,
    );
  }
  if (!electronGuidanceUpdated && input.electronGuidanceReferenceFiles.length === 0) {
    violations.push("AGENTS/PR guidance no longer references Electron, but the M6 guidance cleanup checklist line is not checked.");
  }

  return violations;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isChecklistLineChecked(content: string, label: string): boolean {
  const checked = new RegExp(`^- \\[x\\] ${escapeRegExp(label)}$`, "m");
  const unchecked = new RegExp(`^- \\[ \\] ${escapeRegExp(label)}$`, "m");
  if (checked.test(content)) return true;
  if (unchecked.test(content)) return false;
  throw new Error(`missing migration checklist line: ${label}`);
}

function readDefaultDesktopRuntime(source: string, label: string): DesktopRuntime {
  const match = source.match(/export\s+const\s+DEFAULT_DESKTOP_RUNTIME\s*=\s*["']([^"']+)["']/);
  const runtime = match?.[1];
  if (runtime === "electron" || runtime === "tauri") return runtime;
  throw new Error(`${label} must export DEFAULT_DESKTOP_RUNTIME as "electron" or "tauri"`);
}

function leadingWhitespaceLength(line: string): number {
  return line.match(/^(\s*)/)?.[1]?.length ?? 0;
}

function readReleaseBetaDesktopRuntimeDefault(source: string): DesktopRuntime {
  const lines = source.split(/\r?\n/);
  const desktopRuntimeIndex = lines.findIndex((line) => /^\s+desktop_runtime:\s*$/.test(line));
  if (desktopRuntimeIndex < 0) {
    throw new Error('release-beta workflow must define a "desktop_runtime" input');
  }

  const desktopRuntimeIndent = leadingWhitespaceLength(lines[desktopRuntimeIndex] ?? "");
  for (const line of lines.slice(desktopRuntimeIndex + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const indent = leadingWhitespaceLength(line);
    if (indent <= desktopRuntimeIndent) {
      break;
    }

    const match = line.match(/^\s+default:\s*["']?(electron|tauri)["']?\s*$/);
    if (match?.[1] === "electron" || match?.[1] === "tauri") {
      return match[1];
    }
  }

  throw new Error('release-beta desktop_runtime input must default to "electron" or "tauri"');
}

function sourceAllowsElectronFallback(source: string): boolean {
  const runtimeKinds = readDesktopRuntimeKinds(source);
  return runtimeKinds.has("electron") && runtimeKinds.has("tauri");
}

function containsElectronDefaultTransitionText(source: string): boolean {
  return (
    /Electron (?:remains|is) the (?:current )?default/i.test(source) ||
    /Public downloads are still Electron artifacts/i.test(source)
  );
}

function readDesktopRuntimeKinds(source: string): Set<DesktopRuntime> {
  const match = source.match(/export const DESKTOP_RUNTIME_KINDS\s*=\s*\[([^\]]*)\]/s);
  if (match?.[1] == null) return new Set();

  const runtimeKinds = new Set<DesktopRuntime>();
  for (const runtimeMatch of match[1].matchAll(/["']([^"']+)["']/g)) {
    const runtime = runtimeMatch[1];
    if (runtime === "electron" || runtime === "tauri") {
      runtimeKinds.add(runtime);
    }
  }
  return runtimeKinds;
}

function readPackageDependencyNames(source: string, label: string): Set<string> {
  let parsed: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  try {
    parsed = JSON.parse(source) as typeof parsed;
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return new Set([
    ...Object.keys(parsed.dependencies ?? {}),
    ...Object.keys(parsed.devDependencies ?? {}),
    ...Object.keys(parsed.optionalDependencies ?? {}),
  ]);
}

function readPnpmImporterDependencyNames(source: string, importer: string): Set<string> {
  const lines = source.split(/\r?\n/);
  const importerHeader = importer === "." ? "  .:" : `  ${importer}:`;
  const startIndex = lines.indexOf(importerHeader);
  if (startIndex < 0) {
    throw new Error(`pnpm-lock.yaml must include importer ${importer}`);
  }

  const dependencyNames = new Set<string>();
  for (const line of lines.slice(startIndex + 1)) {
    if (/^  [^ ].*:$/.test(line)) {
      break;
    }

    const match = line.match(/^      ('?[@/A-Za-z0-9._-]+'?):\s*$/);
    if (match?.[1] != null) {
      dependencyNames.add(match[1].replace(/^'|'$/g, ""));
    }
  }
  return dependencyNames;
}
