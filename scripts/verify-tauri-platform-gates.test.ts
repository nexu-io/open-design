import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function runVerifier(...args: string[]): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, ["--import", "tsx", verifierPath, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
}

async function writeWindowsReport(reportRoot: string, options: { remainingPids?: number[] } = {}): Promise<void> {
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
