import type { LauncherHost } from "@open-design/launcher-proto";

type ElectronApp = {
  getPath(name: "userData"): string;
  setPath(name: "userData", path: string): void;
  setAppPath(path: string): void;
  requestSingleInstanceLock(data?: Record<string, unknown>): boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  exit(code: number): void;
};
export type LauncherEntryOptions = {
  app: ElectronApp;
  appRoot: string;
  bundledEntry: string;
  platform?: NodeJS.Platform;
  arch?: string;
  processPid?: number;
  executablePath?: string;
  resourcesPath?: string;
  electronVersion?: string;
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  publish?: (host: LauncherHost) => void;
};
export type LauncherEntry = { entry: string; source: "bundled" | "payload" | "legacy" };
