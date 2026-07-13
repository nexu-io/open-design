import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { pathExists } from "./fs.js";
import { resolveWinInstallIdentity } from "./identity.js";
import type { WinPaths, WindowsUninstallRegistryEntry } from "./types.js";

const execFileAsync = promisify(execFile);

function normalizeRegistryPath(value: string | null | undefined): string {
  return (value ?? "").replace(/[\\/]+$/, "").toLowerCase();
}

export function stripRegistryQuotedValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.startsWith('"')) {
    const closingQuote = trimmed.indexOf('"', 1);
    if (closingQuote > 0) return trimmed.slice(1, closingQuote);
  }
  return trimmed;
}

function createEmptyRegistryEntry(keyPath: string): WindowsUninstallRegistryEntry {
  return {
    displayIcon: null,
    displayName: null,
    displayVersion: null,
    installLocation: null,
    keyPath,
    publisher: null,
    quietUninstallString: null,
    uninstallString: null,
  };
}

function normalizeRegistryKeyPath(value: string): string {
  return value
    .replace(/^HKCU\\/i, "HKEY_CURRENT_USER\\")
    .replace(/^HKLM\\/i, "HKEY_LOCAL_MACHINE\\")
    .toLowerCase();
}

function namespaceRegistryKeyPath(config: Pick<ToolPackConfig, "namespace">): string {
  return normalizeRegistryKeyPath(`HKCU\\${resolveWinInstallIdentity(config).registryKey}`);
}

async function execReg(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync("reg.exe", args, { cwd, env: process.env, windowsHide: true });
}

function registryEntryMatches(
  paths: WinPaths,
  entry: WindowsUninstallRegistryEntry,
  config?: Pick<ToolPackConfig, "namespace">,
): boolean {
  if (config != null && normalizeRegistryKeyPath(entry.keyPath) === namespaceRegistryKeyPath(config)) return true;
  const targetInstallDir = normalizeRegistryPath(paths.installDir);
  const targetUninstaller = normalizeRegistryPath(paths.uninstallerPath);
  const installLocation = normalizeRegistryPath(entry.installLocation);
  const displayIcon = normalizeRegistryPath(stripRegistryQuotedValue(entry.displayIcon));
  const uninstallString = normalizeRegistryPath(stripRegistryQuotedValue(entry.uninstallString));
  const quietUninstallString = normalizeRegistryPath(stripRegistryQuotedValue(entry.quietUninstallString));
  return (
    installLocation === targetInstallDir ||
    displayIcon.includes(normalizeRegistryPath(paths.installedExePath)) ||
    uninstallString.includes(targetUninstaller) ||
    quietUninstallString.includes(targetUninstaller)
  );
}

export async function queryWinRegistryEntries(
  paths: WinPaths,
  config?: Pick<ToolPackConfig, "namespace">,
): Promise<WindowsUninstallRegistryEntry[]> {
  const roots = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ];
  const entries: WindowsUninstallRegistryEntry[] = [];
  for (const root of roots) {
    let stdout = "";
    try {
      ({ stdout } = await execReg(["query", root, "/s"], await pathExists(paths.appBuilderOutputRoot) ? paths.appBuilderOutputRoot : process.cwd()));
    } catch {
      continue;
    }
    let current: WindowsUninstallRegistryEntry | null = null;
    const collect = () => {
      if (current != null && registryEntryMatches(paths, current, config)) entries.push(current);
    };
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (line.length === 0) continue;
      if (line.startsWith("HKEY_")) {
        collect();
        current = createEmptyRegistryEntry(line);
        continue;
      }
      if (current == null) continue;
      const [name, , ...valueParts] = line.trim().split(/\s{2,}/);
      if (name == null || valueParts.length === 0) continue;
      const value = valueParts.join("  ");
      if (name === "DisplayIcon") current.displayIcon = value;
      else if (name === "DisplayName") current.displayName = value;
      else if (name === "DisplayVersion") current.displayVersion = value;
      else if (name === "InstallLocation") current.installLocation = value;
      else if (name === "Publisher") current.publisher = value;
      else if (name === "QuietUninstallString") current.quietUninstallString = value;
      else if (name === "UninstallString") current.uninstallString = value;
    }
    collect();
  }
  return entries;
}

export async function queryWinNamespaceRegistryEntry(
  config: Pick<ToolPackConfig, "namespace">,
  paths: WinPaths,
): Promise<WindowsUninstallRegistryEntry | null> {
  const identity = resolveWinInstallIdentity(config);
  let stdout = "";
  try {
    ({ stdout } = await execReg(
      ["query", `HKCU\\${identity.registryKey}`],
      await pathExists(paths.appBuilderOutputRoot) ? paths.appBuilderOutputRoot : process.cwd(),
    ));
  } catch {
    return null;
  }
  const entry = createEmptyRegistryEntry(`HKEY_CURRENT_USER\\${identity.registryKey}`);
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0 || line.startsWith("HKEY_")) continue;
    const [name, , ...valueParts] = line.trim().split(/\s{2,}/);
    if (name == null || valueParts.length === 0) continue;
    const value = valueParts.join("  ");
    if (name === "DisplayIcon") entry.displayIcon = value;
    else if (name === "DisplayName") entry.displayName = value;
    else if (name === "DisplayVersion") entry.displayVersion = value;
    else if (name === "InstallLocation") entry.installLocation = value;
    else if (name === "Publisher") entry.publisher = value;
    else if (name === "QuietUninstallString") entry.quietUninstallString = value;
    else if (name === "UninstallString") entry.uninstallString = value;
  }
  return entry;
}

export async function resolveWinRegisteredPaths(config: ToolPackConfig, paths: WinPaths): Promise<WinPaths> {
  const entry = await queryWinNamespaceRegistryEntry(config, paths);
  if (entry == null) return paths;
  const identity = resolveWinInstallIdentity(config);
  const uninstallerFromRegistry = stripRegistryQuotedValue(entry.quietUninstallString) || stripRegistryQuotedValue(entry.uninstallString);
  const installDir = stripRegistryQuotedValue(entry.installLocation) || (uninstallerFromRegistry.length > 0 ? dirname(uninstallerFromRegistry) : paths.installDir);
  const uninstallerPath = uninstallerFromRegistry.length > 0 ? uninstallerFromRegistry : join(installDir, identity.uninstallerName);
  return {
    ...paths,
    installDir,
    installedExePath: join(installDir, identity.exeName),
    uninstallerPath,
  };
}

export async function cleanupWinRegistryResidues(
  paths: WinPaths,
  config?: Pick<ToolPackConfig, "namespace">,
): Promise<string[]> {
  const entries = await queryWinRegistryEntries(paths, config);
  const removed: string[] = [];
  for (const entry of entries) {
    try {
      await execReg(["delete", entry.keyPath, "/f"], await pathExists(paths.appBuilderOutputRoot) ? paths.appBuilderOutputRoot : process.cwd());
      removed.push(entry.keyPath);
    } catch {
      // HKLM residues may require elevation; keep observing them instead of hiding failure.
    }
  }
  return removed;
}
