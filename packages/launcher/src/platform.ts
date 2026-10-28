import type { LauncherHostEnvironment, LauncherPaths, LauncherVersionPointer } from "@open-design/launcher-proto";

export type LauncherRelaunch = { predecessorPid: number; target: LauncherVersionPointer | null };
export interface LauncherPlatform {
  readonly environment: LauncherHostEnvironment;
  installedAppPath(executablePath: string): string;
  installedConfigPath(installedAppPath: string): string;
  openInstalled(path: string, argv: readonly string[]): Promise<void>;
  relaunchInstalled(path: string, request: LauncherRelaunch): Promise<void>;
  synchronizeSystemEntries(input: { installedAppPath: string; executablePath: string; paths: LauncherPaths }): Promise<void>;
}
