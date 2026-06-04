/**
 * auto-start.ts — Platform-specific auto-launch at login.
 *
 * Windows  writes a HKCU\...\Run registry value via `reg.exe add`.
 * macOS    writes a LaunchAgents plist file.
 *
 * Both platforms use OD_APP_NAME (env) to distinguish release channels:
 *   stable  → OpenDesign
 *   beta    → OpenDesignBeta
 *   preview → OpenDesignPreview
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  APP_KEYS,
  SIDECAR_SOURCES,
  resolveSidecarModeFromEnv,
} from "@open-design/sidecar-proto";
import { findAncestorWithApps } from "./workspace-root.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const REG_RUN_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;

// ─── Electron binary resolution ─────────────────────────────────────────────

/**
 * Resolve the absolute path to the electron executable.
 *
 * `process.execPath` is NOT reliable here because in a dev environment the
 * tray may be launched via tsx/pnpm wrappers, in which case execPath points
 * to node.exe rather than electron.exe.  Instead, we read the
 * `dist/path.txt` file inside the electron package — this is the file
 * Electron itself uses at runtime to locate its own binary.  This always
 * returns a path inside `dist/`, never the top-level `electron.exe` stub.
 */
function resolveElectronBinary(): string {
  const electronRequire = createRequire(import.meta.url);
  const pkgDir = dirname(electronRequire.resolve("electron/package.json"));
  const pathTxt = readFileSync(join(pkgDir, "dist", "path.txt"), "utf8").trim();
  return join(pkgDir, "dist", pathTxt);
}

/**
 * Resolve the workspace root directory for the tray app.
 * Used to find the entry script path for auto-start commands.
 */
function resolveWorkspaceRootForTray(): string {
  // Walk up from the electron binary until we find the workspace marker
  // (`apps/` directory). Works for both the pnpm-hoisted layout
  // (`<workspace>/node_modules/.pnpm/electron@x/node_modules/electron/dist/electron.exe`)
  // and a future non-hoisted layout, without hardcoding a level count
  // that pnpm changes every other release.
  const fromBinary = findAncestorWithApps(dirname(resolveElectronBinary()));
  if (fromBinary) return fromBinary;
  // Fallback: walk up from this module's URL (dev mode, when electron is
  // launched via tsx/pnpm and the binary resolver is the same source path).
  const fromSource = findAncestorWithApps(dirname(fileURLToPath(import.meta.url)));
  if (fromSource) return fromSource;
  throw new Error("Could not resolve workspace root for tray auto-start");
}

// ─── Name resolution ──────────────────────────────────────────────────────────

/**
 * App name written to the registry Run key / plist Label.
 * Controlled by the `OD_APP_NAME` environment variable so each packaged
 * release channel writes to its own slot and does not overwrite another.
 *
 * Defaults to "OpenDesign".  Packaged launchers set this to
 * "OpenDesignBeta" / "OpenDesignPreview" respectively.
 *
 * @throws if OD_APP_NAME contains characters outside the safe set.
 */
function resolveProductName(): string {
  const name = process.env.OD_APP_NAME ?? "OpenDesign";
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,64}$/.test(name)) {
    throw new Error(`OD_APP_NAME contains invalid characters: ${name}`);
  }
  return name;
}

/**
 * Stable identifier derived from the product name, used as the plist
 * filename fragment and registry key value on Windows.
 * All whitespace is collapsed so "Open Design Beta" → "OpenDesignBeta".
 */
function resolveAppId(): string {
  return resolveProductName().replaceAll(/\s+/g, "");
}

// ─── Path validation ─────────────────────────────────────────────────────────

/**
 * Guard against cmd.exe command-injection in the electron executable path.
 *
 * The path is interpolated verbatim into a `cmd /c start "" /b "…" "…"`
 * command, so anything cmd interprets must be rejected. The blocked
 * metacharacters cover the full set of cmd separators, quote/expansion
 * triggers, and any character that would break the outer double-quote:
 *   - `&` `<` `>` `|` `^` — cmd separators
 *   - `%` — variable/argument expansion (`%PATH%`, `%1`)
 *   - `!` — delayed expansion (only inside `setlocal EnableDelayedExpansion`,
 *     but cheap to ban unconditionally)
 *   - `"` — would close the outer quote and let subsequent args be parsed
 *     as a new token
 *
 * The path must also be an absolute Windows path (`C:\…`) so quoting is
 * safe.
 *
 * @throws if the path is invalid or contains shell metacharacters.
 */
function validateElectronPath(path: string): void {
  if (!/^[A-Za-z]:[^<>|&^%!"]{1,512}$/.test(path)) {
    throw new Error(`unsafe or non-absolute electron path: ${path}`);
  }
}

// ─── Windows implementation ─────────────────────────────────────────────────

/**
 * Build the command-line string stored in the registry Run key.
 *
 * Windows interprets the first token after `cmd /c start` as a window title
 * unless it is preceded by an explicit empty `""` — hence `start "" /b`.
 *
 * The electron path is double-quoted so that paths containing spaces are
 * handled correctly without any further escaping.
 *
 * Implementation note: this MUST be a template literal, not `args.join(" ")`,
 * because `join` collapses the empty-string title into a double space and
 * produces `start  /b`. cmd then parses `/b` as the window title and the
 * first quoted arg (`electron.exe`) is consumed as a label — the real
 * command is never executed. The literal `""` token after `start` is the
 * only thing cmd uses to disambiguate.
 */
function buildRunCommand(namespace: string, ipc: string): string {
  const electronExe = resolveElectronBinary();
  // Resolve the tray entry script path relative to workspace
  const workspaceRoot = resolveWorkspaceRootForTray();
  const entryScript = join(workspaceRoot, "apps/tray/dist/main/index.js");

  if (!existsSync(electronExe)) {
    throw new Error(`electron not found at: ${electronExe}`);
  }

  validateElectronPath(electronExe);

  // Stamp values are individually quoted so namespace/ipc that contain
  // spaces or other cmd metacharacters survive the round-trip through
  // `cmd /c start`. The double quotes around `""` after `start` are the
  // explicit empty window title. Mode reads from `OD_SIDECAR_MODE` via
  // sidecar-proto (defaulting to "dev" for dev tooling, "runtime" for
  // packaged launchers); a typo in the env var throws at boot instead
  // of writing an unrecognised stamp.
  const stamp = [
    `--od-stamp-app=${APP_KEYS.TRAY}`,
    `--od-stamp-mode=${resolveSidecarModeFromEnv()}`,
    `--od-stamp-namespace="${namespace}"`,
    `--od-stamp-ipc="${ipc}"`,
    `--od-stamp-source=${SIDECAR_SOURCES.TOOLS_DEV}`,
  ];

  return `cmd.exe /c start "" /b "${electronExe}" "${entryScript}" ${stamp.join(" ")}`;
}

// ─── Registry I/O ─────────────────────────────────────────────────────────────

function execReg(args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("reg.exe", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

export async function enableAutoStart(namespace: string, ipc: string): Promise<void> {
  if (process.platform !== "win32") return;
  await execReg([
    "add", REG_RUN_KEY,
    "/v", resolveProductName(),
    "/t", "REG_SZ",
    "/d", buildRunCommand(namespace, ipc),
    "/f",
  ]);
}

export async function disableAutoStart(): Promise<void> {
  if (process.platform !== "win32") return;
  try {
    await execReg(["delete", REG_RUN_KEY, "/v", resolveProductName(), "/f"]);
  } catch {
    // ignore — key may not exist yet
  }
}

export async function isAutoStartEnabled(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const { stdout } = await execReg(["query", REG_RUN_KEY]);
    return stdout.includes(resolveProductName());
  } catch {
    return false;
  }
}

// ─── macOS implementation ───────────────────────────────────────────────────

export async function enableAutoStartMac(exePath: string, namespace: string, ipc: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  const appId = resolveAppId();
  const plistDir = join(homedir(), "Library", "LaunchAgents");
  await mkdir(plistDir, { recursive: true });
  const plistPath = join(plistDir, `ai.open-design.${appId}.plist`);
  await writeFile(plistPath, generatePlist(exePath, appId, namespace, ipc), "utf8");
}

export async function disableAutoStartMac(): Promise<void> {
  if (process.platform !== "darwin") return;
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(join(homedir(), "Library", "LaunchAgents", `ai.open-design.${resolveAppId()}.plist`));
  } catch {
    // ignore
  }
}

export async function isAutoStartEnabledMac(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const { readFile } = await import("node:fs/promises");
  try {
    await readFile(join(homedir(), "Library", "LaunchAgents", `ai.open-design.${resolveAppId()}.plist`));
    return true;
  } catch {
    return false;
  }
}

// ─── Platform-aware public API ────────────────────────────────────────────────

/**
 * Enable or disable auto-start on login (platform-aware).
 * Windows: writes registry Run key
 * macOS: writes LaunchAgent plist (requires exePath)
 */
/**
 * Resolve the absolute path to the electron executable.
 * Exported for use by the platform-aware setAutoStart wrapper.
 */
export { resolveElectronBinary };

export async function setAutoStart(enabled: boolean, exePath?: string, namespace?: string, ipc?: string): Promise<void> {
  if (process.platform === "win32") {
    if (enabled) {
      await enableAutoStart(namespace ?? "default", ipc ?? "");
    } else {
      await disableAutoStart();
    }
  } else if (process.platform === "darwin") {
    if (!exePath || !namespace || !ipc) {
      console.warn("[tray] setAutoStart: macOS requires exePath, namespace, ipc");
      return;
    }
    if (enabled) {
      await enableAutoStartMac(exePath, namespace, ipc);
    } else {
      await disableAutoStartMac();
    }
  }
  // Other platforms: no-op
}

/**
 * Query whether auto-start is enabled (platform-aware).
 */
export async function queryAutoStart(): Promise<boolean> {
  if (process.platform === "win32") {
    return isAutoStartEnabled();
  } else if (process.platform === "darwin") {
    return isAutoStartEnabledMac();
  }
  return false;
}

/**
 * Escape a string for safe inclusion in an XML plist element.
 * Without this, values containing < > & would break the XML structure
 * or enable injection of arbitrary plist keys.
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
    }
    return ch;
  });
}

function generatePlist(exePath: string, appId: string, namespace: string, ipc: string): string {
  // Resolve the entry script path relative to workspace
  const workspaceRoot = resolveWorkspaceRootForTray();
  const entryScript = join(workspaceRoot, "apps/tray/dist/main/index.js");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `<key>Label</key>`,
    `<string>ai.open-design.${appId}</string>`,
    `<key>ProgramArguments</key>`,
    `<array>`,
    `<string>${escapeXml(exePath)}</string>`,
    `<string>${escapeXml(entryScript)}</string>`,
    `<string>--od-stamp-app=${APP_KEYS.TRAY}</string>`,
    `<string>--od-stamp-mode=${resolveSidecarModeFromEnv()}</string>`,
    `<string>--od-stamp-namespace=${escapeXml(namespace)}</string>`,
    `<string>--od-stamp-ipc=${escapeXml(ipc)}</string>`,
    `<string>--od-stamp-source=${SIDECAR_SOURCES.TOOLS_DEV}</string>`,
    `</array>`,
    `<key>RunAtLoad</key>`,
    `<true/>`,
    `</dict>`,
    `</plist>`,
  ].join("\n");
}