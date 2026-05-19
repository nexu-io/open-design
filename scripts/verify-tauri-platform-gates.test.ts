import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsRoot, "..");
const verifierPath = join(scriptsRoot, "verify-tauri-platform-gates.ts");

test("verify-tauri-platform-gates accepts complete Windows and Linux report evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-gates-pass-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  const winReport = join(root, "win");
  const linuxReport = join(root, "linux");
  await writeWindowsReport(winReport);
  await writeLinuxReport(linuxReport);

  const result = await runVerifier("--win-report", winReport, "--linux-report", linuxReport);
  assert.match(result.stdout, /Tauri platform gate reports passed verification/);
  assert.match(result.stdout, /Windows NSIS M4 evidence/);
  assert.match(result.stdout, /executablePath=C:\/tmp\/install\/Open Design\.exe/);
  assert.match(result.stdout, /Linux AppImage\/headless M4 evidence/);
  assert.match(result.stdout, /headless\.stop\.remainingPids=\[\]/);
});

test("verify-tauri-platform-gates rejects skipped reports with no runtime summary", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-gates-skip-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  const linuxReport = join(root, "linux");
  await mkdir(linuxReport, { recursive: true });
  await writeJson(join(linuxReport, "manifest.json"), {
    platform: "linux",
    screenshot: "screenshots/open-design-linux-smoke.png",
    spec: "specs/linux.spec.ts",
  });
  await writeJson(join(linuxReport, "suite-result.json"), {
    exitCode: 0,
    platform: "linux",
    spec: "specs/linux.spec.ts",
    status: "success",
  });

  await assert.rejects(
    runVerifier("--linux-report", linuxReport),
    /required report file is missing: .*summary\.json/,
  );
});

test("verify-tauri-platform-gates rejects process residue in Windows stop evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-gates-residue-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  const winReport = join(root, "win");
  await writeWindowsReport(winReport, { remainingPids: [123] });

  await assert.rejects(runVerifier("--win-report", winReport), /win stop\.remainingPids must be an empty array/);
});

test("verify-tauri-platform-gates rejects missing installed executable evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-gates-executable-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  const winReport = join(root, "win");
  await writeWindowsReport(winReport, { omitExecutablePath: true });

  await assert.rejects(runVerifier("--win-report", winReport), /win start\.executablePath must be a non-empty string/);
});

test("verify-tauri-platform-gates can apply verified M4 evidence to the migration doc", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-gates-doc-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  const winReport = join(root, "win");
  const linuxReport = join(root, "linux");
  const migrationDoc = join(root, "electron-to-tauri-migration.md");
  await writeWindowsReport(winReport);
  await writeLinuxReport(linuxReport);
  await writeFile(
    migrationDoc,
    [
      "Last updated: 2026-05-20",
      "",
      "### M4 Platform package smoke",
      "",
      "- [ ] Windows NSIS: build, install, start, inspect status/eval/screenshot, stop.",
      "- [ ] Linux: build AppImage, install, start, inspect status/eval/screenshot, stop.",
      "- [ ] Linux headless platform smoke remains supported and unaffected.",
      "",
      "## Execution Log",
      "",
      "- 2026-05-20: Existing entry.",
      "",
      "### Platform Gate Runners",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await runVerifier(
    "--win-report",
    winReport,
    "--linux-report",
    linuxReport,
    "--update-migration-doc",
    migrationDoc,
  );
  const updated = await readFile(migrationDoc, "utf8");

  assert.match(result.stdout, /Updated migration document:/);
  assert.match(updated, /- \[x\] Windows NSIS: build, install, start, inspect status\/eval\/screenshot, stop\./);
  assert.match(updated, /- \[x\] Linux: build AppImage, install, start, inspect status\/eval\/screenshot, stop\./);
  assert.match(updated, /- \[x\] Linux headless platform smoke remains supported and unaffected\./);
  assert.match(updated, /Verified native Windows\/Linux M4 package smoke/);
  assert.match(updated, /### Platform Gate Runners/);
});

test("verify-tauri-platform-gates rejects migration doc updates without both platform reports", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "open-design-tauri-gates-doc-incomplete-"));
  t.after(() => void rm(root, { force: true, recursive: true }));

  const winReport = join(root, "win");
  const migrationDoc = join(root, "electron-to-tauri-migration.md");
  await writeWindowsReport(winReport);
  await writeFile(migrationDoc, "# Electron to Tauri Migration\n", "utf8");

  await assert.rejects(
    runVerifier("--win-report", winReport, "--update-migration-doc", migrationDoc),
    /--update-migration-doc requires both --win-report and --linux-report/,
  );
});

async function runVerifier(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", verifierPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function writeWindowsReport(reportRoot: string, options: { omitExecutablePath?: boolean; remainingPids?: number[] } = {}): Promise<void> {
  await mkdir(join(reportRoot, "screenshots"), { recursive: true });
  await writeFile(join(reportRoot, "screenshots", "open-design-win-smoke.png"), "png");
  await writeJson(join(reportRoot, "manifest.json"), {
    platform: "win",
    screenshot: "screenshots/open-design-win-smoke.png",
    spec: "specs/win-tauri.spec.ts",
  });
  await writeJson(join(reportRoot, "suite-result.json"), {
    exitCode: 0,
    platform: "win",
    spec: "specs/win-tauri.spec.ts",
    status: "success",
  });
  await writeJson(join(reportRoot, "summary.json"), {
    build: {
      installerPath: "C:/tmp/OpenDesign.exe",
      to: "nsis",
    },
    health: healthyEval(1234),
    install: {
      installDir: "C:/tmp/install",
      uninstallerPath: "C:/tmp/install/Uninstall.exe",
    },
    screenshot: "screenshots/open-design-win-smoke.png",
    start: {
      ...(options.omitExecutablePath === true ? {} : { executablePath: "C:/tmp/install/Open Design.exe" }),
      pid: 123,
      source: "installed",
      status: runningStatus(1234),
    },
    stop: {
      remainingPids: options.remainingPids ?? [],
    },
    uninstall: {
      residueObservation: {
        installedExeExists: false,
        managedProcessPids: [],
        productNamespaceRootExists: false,
        registryResidues: [],
        uninstallerExists: false,
      },
    },
  });
}

async function writeLinuxReport(reportRoot: string): Promise<void> {
  await mkdir(join(reportRoot, "screenshots"), { recursive: true });
  await writeFile(join(reportRoot, "screenshots", "open-design-linux-smoke.png"), "png");
  await writeJson(join(reportRoot, "manifest.json"), {
    platform: "linux",
    screenshot: "screenshots/open-design-linux-smoke.png",
    spec: "specs/linux.spec.ts",
  });
  await writeJson(join(reportRoot, "suite-result.json"), {
    exitCode: 0,
    platform: "linux",
    spec: "specs/linux.spec.ts",
    status: "success",
  });
  await writeJson(join(reportRoot, "summary.json"), {
    build: {
      appImagePath: "/tmp/OpenDesign.AppImage",
      to: "appimage",
    },
    headless: {
      install: {
        launcherPath: "/tmp/open-design-headless",
      },
      start: {
        pid: 345,
        status: {
          url: "http://127.0.0.1:3456/",
        },
      },
      stop: {
        remainingPids: [],
      },
    },
    health: healthyEval(2345),
    install: {
      appImagePath: "/tmp/OpenDesign.AppImage",
    },
    screenshot: "screenshots/open-design-linux-smoke.png",
    start: {
      executablePath: "/tmp/OpenDesign.AppImage",
      pid: 234,
      source: "installed",
      status: runningStatus(2345),
    },
    stop: {
      remainingPids: [],
    },
    uninstall: {
      removed: {
        appImage: "removed",
        desktop: "removed",
        icon: "removed",
      },
    },
  });
}

function runningStatus(port: number): { state: string; url: string } {
  return {
    state: "running",
    url: `http://127.0.0.1:${port}/`,
  };
}

function healthyEval(port: number): { health: { ok: boolean; version: string }; href: string; status: number } {
  return {
    health: {
      ok: true,
      version: "0.7.0",
    },
    href: `http://127.0.0.1:${port}/`,
    status: 200,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
