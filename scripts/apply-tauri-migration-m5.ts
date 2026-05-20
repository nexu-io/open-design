import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  m4EvidenceLogMarker,
  m4PlatformGateLabels,
  hasM4RemoteEvidence,
  m4RemoteEvidenceLogMarker,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
  m5ReleaseBetaDefaultLabel,
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
} from "./tauri-migration-policy.ts";

const workspaceRoot = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);

const m5ChecklistLabels = [
  m5ToolsDevDefaultLabel,
  m5ToolsPackDefaultLabel,
  m5ReleaseBetaDefaultLabel,
  m5ElectronFallbackLabel,
  m5PrimaryDocsLabel,
] as const;

type Args = {
  dryRun: boolean;
  root: string;
  skipCleanCheck: boolean;
};

type FileEdit = {
  content: string;
  path: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun && !args.skipCleanCheck) {
    await assertTrackedWorktreeClean(args.root, "applying the M5 default flip");
  }
  const edits = await createM5Edits(args.root);

  if (!args.dryRun) {
    await Promise.all(edits.map((edit) => writeFile(edit.path, edit.content, "utf8")));
  }

  process.stdout.write(
    [
      `${args.dryRun ? "Prepared" : "Applied"} Tauri migration M5 default flip.`,
      `Root: ${args.root}`,
      "Updated files:",
      ...edits.map((edit) => `  - ${edit.path}`),
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    dryRun: false,
    root: workspaceRoot,
    skipCleanCheck: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--root") {
      if (value == null) throw new Error("--root requires a path");
      parsed.root = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--skip-clean-check") {
      parsed.skipCleanCheck = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "usage: tsx scripts/apply-tauri-migration-m5.ts [--root <repo>] [--dry-run]",
          "",
          "Applies the M5 default flip only after verified M4 platform evidence is recorded.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function assertTrackedWorktreeClean(root: string, action: string): Promise<void> {
  if (!(await isGitWorktree(root))) return;
  const status = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: root,
    maxBuffer: 1024 * 1024,
  });
  if (status.stdout.trim().length > 0) {
    throw new Error(`tracked worktree changes are present; commit or stash them before ${action}`);
  }
}

async function isGitWorktree(root: string): Promise<boolean> {
  try {
    const result = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function createM5Edits(root: string): Promise<FileEdit[]> {
  const migrationDocPath = join(root, "docs", "electron-to-tauri-migration.md");
  const migrationDoc = await readFile(migrationDocPath, "utf8");
  assertM4Complete(migrationDoc);

  return [
    {
      path: migrationDocPath,
      content: checkM5Lines(migrationDoc),
    },
    {
      path: join(root, "tools", "dev", "src", "config.ts"),
      content: flipDefaultRuntime(await readFile(join(root, "tools", "dev", "src", "config.ts"), "utf8"), "tools-dev"),
    },
    {
      path: join(root, "tools", "pack", "src", "config.ts"),
      content: flipDefaultRuntime(await readFile(join(root, "tools", "pack", "src", "config.ts"), "utf8"), "tools-pack"),
    },
    {
      path: join(root, ".github", "workflows", "release-beta.yml"),
      content: updateReleaseBetaWorkflow(await readFile(join(root, ".github", "workflows", "release-beta.yml"), "utf8")),
    },
    {
      path: join(root, "README.md"),
      content: updateReadme(await readFile(join(root, "README.md"), "utf8")),
    },
    {
      path: join(root, "apps", "AGENTS.md"),
      content: updateAppsAgents(await readFile(join(root, "apps", "AGENTS.md"), "utf8")),
    },
    {
      path: join(root, "docs", "architecture.md"),
      content: updateArchitectureDoc(await readFile(join(root, "docs", "architecture.md"), "utf8")),
    },
  ];
}

function assertM4Complete(migrationDoc: string): void {
  for (const label of m4PlatformGateLabels) {
    if (!migrationDoc.includes(`- [x] ${label}`)) {
      throw new Error(`M5 default flip requires verified M4 platform gate: ${label}`);
    }
  }
  if (!migrationDoc.includes(m4EvidenceLogMarker)) {
    throw new Error("M5 default flip requires the verifier-applied native M4 evidence log marker");
  }
  if (!hasM4RemoteEvidence(migrationDoc)) {
    throw new Error("M5 default flip requires the pushed remote branch-head evidence log marker and matching branch/head detail");
  }
}

function checkM5Lines(migrationDoc: string): string {
  let updated = migrationDoc;
  for (const label of m5ChecklistLabels) {
    updated = replaceOnce(updated, `- [ ] ${label}`, `- [x] ${label}`, `M5 checklist line: ${label}`);
  }
  return updated;
}

function flipDefaultRuntime(source: string, label: string): string {
  const updated = source.replace(
    /export const DEFAULT_DESKTOP_RUNTIME = "electron" satisfies ([A-Za-z0-9_]+);/,
    'export const DEFAULT_DESKTOP_RUNTIME = "tauri" satisfies $1;',
  );
  if (updated === source) {
    throw new Error(`${label} DEFAULT_DESKTOP_RUNTIME is not the expected electron default`);
  }
  return updated;
}

function updateReleaseBetaWorkflow(source: string): string {
  return replaceMany(source, [
    [
      'description: "Desktop runtime to package. Keep electron for public beta; use tauri for migration smoke."',
      'description: "Desktop runtime to package. Tauri is the default release path; use electron only as the transition fallback."',
      "release-beta desktop_runtime description",
    ],
    ["        default: electron", "        default: tauri", "release-beta desktop_runtime default"],
  ]);
}

function updateReadme(source: string): string {
  return replaceMany(source, [
    [
      "| **Desktop** | Optional desktop shell with sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN). Electron is the current default; Tauri is available behind explicit migration flags. |",
      "| **Desktop** | Optional desktop shell with sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN). Tauri is the default; Electron remains available only through explicit transition flags. |",
      "README desktop summary row",
    ],
    [
      "| **Deployable to** | Local (`pnpm tools-dev`) · Vercel web layer · packaged desktop app. Public downloads are still Electron artifacts while Tauri packaging parity is being gated. |",
      "| **Deployable to** | Local (`pnpm tools-dev`) · Vercel web layer · packaged desktop app. Public downloads use Tauri by default after platform parity; Electron artifacts remain available only as explicit transition fallback. |",
      "README deployable summary row",
    ],
    [
      "| Desktop (optional) | Desktop shell — discovers the web URL through sidecar IPC, no port guessing; Electron is the default and Tauri is the explicit migration runtime. The same `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` channel powers `tools-dev inspect desktop …` for E2E |",
      "| Desktop (optional) | Desktop shell — discovers the web URL through sidecar IPC, no port guessing; Tauri is the default and Electron is the explicit transition fallback. The same `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` channel powers `tools-dev inspect desktop …` for E2E |",
      "README desktop architecture row",
    ],
    [
      "Open Design can run as a web app in your browser or as a desktop shell. Electron remains the default desktop runtime while the Tauri path is validated behind explicit flags; both modes share the same local daemon + web architecture.",
      "Open Design can run as a web app in your browser or as a desktop shell. Tauri is the default desktop runtime after native package parity; Electron remains available only behind explicit transition flags until M6 cleanup.",
      "README desktop runtime paragraph",
    ],
    [
      "The desktop app discovers the web URL automatically via sidecar IPC — no port guessing required. During the Electron-to-Tauri migration, `--desktop-runtime tauri` selects the opt-in Tauri path where supported.",
      "The desktop app discovers the web URL automatically via sidecar IPC — no port guessing required. During the Electron-to-Tauri transition, `--desktop-runtime electron` selects the explicit Electron fallback where supported.",
      "README desktop command paragraph",
    ],
    [
      "- [x] Packaged desktop build out of `apps/packaged/` — public macOS (Apple Silicon) and Windows (x64) downloads remain Electron while the Tauri package path is validated.",
      "- [x] Packaged desktop build out of `apps/packaged/` — public macOS (Apple Silicon), Windows (x64), and Linux downloads use Tauri by default after platform parity, with Electron retained only as an explicit transition fallback.",
      "README roadmap packaged desktop item",
    ],
  ]);
}

function updateAppsAgents(source: string): string {
  return replaceOnce(
    source,
    "- `apps/desktop`: Desktop host runtime. Electron remains the default during the Tauri migration, and `src-tauri/` is the opt-in Tauri runtime. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.",
    "- `apps/desktop`: Desktop host runtime. Tauri is the default during the transition window, and Electron remains available only as an explicit fallback until M6 cleanup. Desktop does not guess the web port; it reads runtime status through sidecar IPC and opens the reported web URL.",
    "apps/AGENTS desktop runtime guidance",
  );
}

function updateArchitectureDoc(source: string): string {
  return replaceOnce(
    source,
    "  Packaged Electron and packaged headless modes are unaffected",
    "  Packaged Tauri, Electron fallback, and packaged headless modes are unaffected",
    "architecture packaged mode note",
  );
}

function replaceMany(source: string, replacements: Array<[before: string, after: string, label: string]>): string {
  return replacements.reduce((current, [before, after, label]) => replaceOnce(current, before, after, label), source);
}

function replaceOnce(source: string, before: string, after: string, label: string): string {
  const updated = source.replace(before, after);
  if (updated === source) {
    throw new Error(`could not find expected text for ${label}`);
  }
  if (updated.replace(after, "").includes(before)) {
    throw new Error(`found duplicate text for ${label}`);
  }
  return updated;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
