import { win32 } from "node:path";

function normalizeWindowsExecutablePath(value: string): string {
  return win32.normalize(value.trim().replaceAll("/", "\\")).replace(/\\+$/u, "").toLowerCase();
}

export function readWindowsCommandExecutable(command: string | null | undefined): string | null {
  const value = command?.trim() ?? "";
  if (value.length === 0) return null;
  if (value.startsWith('"')) {
    const closingQuote = value.indexOf('"', 1);
    return closingQuote < 0 ? null : value.slice(1, closingQuote);
  }
  const separator = value.search(/\s/u);
  return separator < 0 ? value : value.slice(0, separator);
}

export function windowsCommandBelongsToExecutable(input: Readonly<{
  command: string | null | undefined;
  executablePath: string;
}>): boolean {
  const commandExecutable = readWindowsCommandExecutable(input.command);
  return commandExecutable != null
    && normalizeWindowsExecutablePath(commandExecutable) === normalizeWindowsExecutablePath(input.executablePath);
}

export type ElectronWindowsOwnedRegistryCleanup = Readonly<{
  appPaths: boolean;
  protocol: boolean;
  uninstall: boolean;
}>;

export function resolveElectronWindowsOwnedRegistryCleanup(input: Readonly<{
  appPathValue: string | null;
  executablePath: string;
  installLocation: string | null;
  protocolCommand: string | null;
  targetInstallDirectory: string;
}>): ElectronWindowsOwnedRegistryCleanup {
  return Object.freeze({
    appPaths: input.appPathValue != null
      && normalizeWindowsExecutablePath(input.appPathValue) === normalizeWindowsExecutablePath(input.executablePath),
    protocol: windowsCommandBelongsToExecutable({ command: input.protocolCommand, executablePath: input.executablePath }),
    uninstall: input.installLocation != null
      && normalizeWindowsExecutablePath(input.installLocation) === normalizeWindowsExecutablePath(input.targetInstallDirectory),
  });
}
