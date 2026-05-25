import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, SIDECAR_SOURCES } from "@open-design/sidecar-proto";

const PRODUCT_NAME = "OpenDesign";
const RUN_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;

// Build the command written to the Windows Run registry key.
//
// process.argv[0] is the resolved binary that launched this process.
// When the tray runs under Electron (normal dev), argv[0] = electron.exe.
// When Windows restores from registry on login, argv[0] = the same path.
// We verify the path exists before writing it so stale paths are never stored.
//
// Must be called with the ACTUAL runtime namespace/ipc, not defaults, so
// the recovered session on login uses the same IPC path as normal startup.
function buildRunCommand(namespace: string, ipc: string): string {
  const electronExe = process.argv[0] ?? process.execPath;

  if (!existsSync(electronExe)) {
    throw new Error(`electron.exe not found at: ${electronExe} — cannot set auto-start`);
  }

  const stampArgs = [
    `--od-stamp-app=${APP_KEYS.TRAY}`,
    `--od-stamp-mode=dev`,
    `--od-stamp-namespace=${namespace}`,
    `--od-stamp-ipc=${ipc}`,
    `--od-stamp-source=${SIDECAR_SOURCES.TOOLS_DEV}`,
  ];

  // cmd /c "start "" /b <electron> <args>"
  // `start ""` (empty window title) is required — without it Windows interprets
  // the first token as the window title and the process never starts.
  // The electron exe path MUST be quoted when it contains spaces.
  const args = ["/c", "start", "", "/b", `"${electronExe}"`, ...stampArgs];

  // Build a command that works even with spaces in paths.
  return `cmd.exe ${args.join(" ")}`;
}

// ─── Registry helpers ─────────────────────────────────────────────────────

function execReg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("reg.exe", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

export async function enableAutoStart(namespace: string, ipc: string): Promise<void> {
  if (process.platform !== "win32") return;
  const command = buildRunCommand(namespace, ipc);
  await execReg([
    "add", RUN_KEY,
    "/v", PRODUCT_NAME,
    "/t", "REG_SZ",
    "/d", command,
    "/f",
  ]);
}

export async function disableAutoStart(): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    await execReg(["delete", RUN_KEY, "/v", PRODUCT_NAME, "/f"]);
  } catch {
    // ignore — key may not exist
  }
}

export async function isAutoStartEnabled(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const { stdout } = await execReg(["query", RUN_KEY]);
    return stdout.includes(PRODUCT_NAME);
  } catch {
    return false;
  }
}

// ─── macOS plist helpers ────────────────────────────────────────────────────

export async function enableAutoStartMac(exePath: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  const plistDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(plistDir, "ai.open-design.tray.plist");
  await mkdir(plistDir, { recursive: true });
  await writeFile(plistPath, generatePlist(exePath), "utf8");
}

export async function disableAutoStartMac(): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(join(homedir(), "Library", "LaunchAgents", "ai.open-design.tray.plist"));
  } catch {
    // ignore
  }
}

export async function isAutoStartEnabledMac(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  try {
    const { readFile } = await import("node:fs/promises");
    await readFile(join(homedir(), "Library", "LaunchAgents", "ai.open-design.tray.plist"));
    return true;
  } catch {
    return false;
  }
}

function generatePlist(exePath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.open-design.tray</string>
  <key>ProgramArguments</key>
  <array>
    <string>${exePath}</string>
    <string>--od-stamp-app=${APP_KEYS.TRAY}</string>
    <string>--od-stamp-mode=dev</string>
    <string>--od-stamp-source=startup</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>LaunchOnlyOnce</key>
  <true/>
</dict>
</plist>`;
}