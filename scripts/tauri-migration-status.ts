import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  m4PlatformGateLabels,
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
} from "./tauri-migration-policy.ts";

const execFileAsync = promisify(execFile);
const defaultRoot = resolve(import.meta.dirname, "..");

type DesktopRuntime = "electron" | "tauri";

type ParsedArgs = {
  json: boolean;
  root: string;
};

type ChecklistItemStatus = {
  checked: boolean;
  label: string;
};

type ChecklistGroupStatus = {
  checked: number;
  items: ChecklistItemStatus[];
  name: "M4" | "M5" | "M6";
  total: number;
};

type GitStatus = {
  base?: string;
  branch?: string;
  head?: string;
  trackedClean?: boolean;
  unavailable?: string;
};

type MigrationStatus = {
  defaults: {
    releaseBeta: DesktopRuntime;
    toolsDev: DesktopRuntime;
    toolsPack: DesktopRuntime;
  };
  git: GitStatus;
  groups: ChecklistGroupStatus[];
  nextActions: string[];
  phase: "M4" | "M5" | "M6" | "complete";
  root: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const status = await readMigrationStatus(args.root);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatMigrationStatus(status));
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { json: false, root: defaultRoot };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--root") {
      if (value == null) throw new Error("--root requires a path");
      parsed.root = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write("usage: tsx scripts/tauri-migration-status.ts [--root <repo>] [--json]\n");
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  return parsed;
}

async function readMigrationStatus(root: string): Promise<MigrationStatus> {
  const [migrationDoc, toolsDevConfig, toolsPackConfig, releaseBetaWorkflow, git] = await Promise.all([
    readFile(join(root, "docs", "electron-to-tauri-migration.md"), "utf8"),
    readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"),
    readFile(join(root, "tools", "pack", "src", "config.ts"), "utf8"),
    readFile(join(root, ".github", "workflows", "release-beta.yml"), "utf8"),
    readGitStatus(root),
  ]);
  const groups: ChecklistGroupStatus[] = [
    checklistGroup("M4", migrationDoc, m4PlatformGateLabels),
    checklistGroup("M5", migrationDoc, [
      m5ToolsDevDefaultLabel,
      m5ToolsPackDefaultLabel,
      m5ReleaseBetaDefaultLabel,
      m5ElectronFallbackLabel,
      m5PrimaryDocsLabel,
    ]),
    checklistGroup("M6", migrationDoc, [
      m6ElectronDepsLabel,
      m6ElectronRuntimeLabel,
      m6ElectronResourcesLabel,
      m6ElectronTestsLabel,
      m6ElectronGuidanceLabel,
    ]),
  ];
  const phase = currentPhase(groups);
  return {
    defaults: {
      releaseBeta: readReleaseBetaDefault(releaseBetaWorkflow),
      toolsDev: readDefaultDesktopRuntime(toolsDevConfig, "tools-dev"),
      toolsPack: readDefaultDesktopRuntime(toolsPackConfig, "tools-pack"),
    },
    git,
    groups,
    nextActions: nextActionsForPhase(phase),
    phase,
    root,
  };
}

function checklistGroup(name: ChecklistGroupStatus["name"], source: string, labels: readonly string[]): ChecklistGroupStatus {
  const items = labels.map((label) => ({ checked: isChecklistLineChecked(source, label), label }));
  return {
    checked: items.filter((item) => item.checked).length,
    items,
    name,
    total: items.length,
  };
}

function currentPhase(groups: ChecklistGroupStatus[]): MigrationStatus["phase"] {
  for (const group of groups) {
    if (group.checked < group.total) return group.name;
  }
  return "complete";
}

function nextActionsForPhase(phase: MigrationStatus["phase"]): string[] {
  if (phase === "M4") {
    return [
      "Push or import the migration branch on a write-capable machine.",
      "Run the Windows and Linux Tauri package smoke jobs.",
      "Verify reports with scripts/verify-tauri-platform-gates.ts --update-migration-doc docs/electron-to-tauri-migration.md.",
    ];
  }
  if (phase === "M5") {
    return [
      "Flip tools-dev, tools-pack, and release-beta defaults to Tauri together.",
      "Keep electron in DESKTOP_RUNTIME_KINDS for the fallback window.",
      "Update README, architecture docs, and directory guidance to Tauri-primary wording.",
    ];
  }
  if (phase === "M6") {
    return [
      "Remove Electron dependencies, runtime files, pack hooks, tests, and guidance together.",
      "Run pnpm install so pnpm-lock.yaml importer entries match the removed dependencies.",
      "Remove electron from DESKTOP_RUNTIME_KINDS only when the M6 cleanup checkboxes move together.",
    ];
  }
  return ["Run the full QA plan and archive the migration document as completed evidence."];
}

function isChecklistLineChecked(content: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^- \\[x\\] ${escaped}$`, "m").test(content)) return true;
  if (new RegExp(`^- \\[ \\] ${escaped}$`, "m").test(content)) return false;
  throw new Error(`missing migration checklist line: ${label}`);
}

function readDefaultDesktopRuntime(source: string, label: string): DesktopRuntime {
  const match = source.match(/export\s+const\s+DEFAULT_DESKTOP_RUNTIME\s*=\s*["']([^"']+)["']/);
  const runtime = match?.[1];
  if (runtime === "electron" || runtime === "tauri") return runtime;
  throw new Error(`${label} must export DEFAULT_DESKTOP_RUNTIME as "electron" or "tauri"`);
}

function readReleaseBetaDefault(source: string): DesktopRuntime {
  const lines = source.split(/\r?\n/);
  const inputIndex = lines.findIndex((line) => /^\s+desktop_runtime:\s*$/.test(line));
  if (inputIndex < 0) throw new Error('release-beta workflow must define a "desktop_runtime" input');
  const inputIndent = leadingWhitespaceLength(lines[inputIndex] ?? "");
  for (const line of lines.slice(inputIndex + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = leadingWhitespaceLength(line);
    if (indent <= inputIndent) break;
    const match = line.match(/^\s+default:\s*["']?(electron|tauri)["']?\s*$/);
    if (match?.[1] === "electron" || match?.[1] === "tauri") return match[1];
  }
  throw new Error('release-beta desktop_runtime input must default to "electron" or "tauri"');
}

function leadingWhitespaceLength(line: string): number {
  return line.match(/^(\s*)/)?.[1]?.length ?? 0;
}

async function readGitStatus(root: string): Promise<GitStatus> {
  try {
    const [branch, head, base, trackedStatus] = await Promise.all([
      git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["rev-parse", "origin/main"]),
      git(root, ["status", "--porcelain", "--untracked-files=no"]),
    ]);
    return {
      base: base.stdout.trim(),
      branch: branch.stdout.trim(),
      head: head.stdout.trim(),
      trackedClean: trackedStatus.stdout.trim().length === 0,
    };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

async function git(cwd: string, args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 });
}

function formatMigrationStatus(status: MigrationStatus): string {
  const lines = [
    "Tauri migration status",
    `Root: ${status.root}`,
    `Phase: ${status.phase}`,
    `Defaults: tools-dev=${status.defaults.toolsDev}, tools-pack=${status.defaults.toolsPack}, release-beta=${status.defaults.releaseBeta}`,
  ];
  if (status.git.unavailable != null) {
    lines.push(`Git: unavailable (${status.git.unavailable})`);
  } else {
    lines.push(
      `Git: ${status.git.branch ?? "unknown"} @ ${status.git.head ?? "unknown"} (base ${status.git.base ?? "unknown"}, trackedClean=${String(status.git.trackedClean)})`,
    );
  }
  for (const group of status.groups) {
    lines.push(`${group.name}: ${group.checked}/${group.total}`);
    for (const item of group.items.filter((candidate) => !candidate.checked)) {
      lines.push(`  - [ ] ${item.label}`);
    }
  }
  lines.push("Next actions:");
  for (const action of status.nextActions) {
    lines.push(`  - ${action}`);
  }
  return `${lines.join("\n")}\n`;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
