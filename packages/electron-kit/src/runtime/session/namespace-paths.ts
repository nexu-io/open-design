import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export type ElectronNamespacePaths = Readonly<{
  namespaceRoot: string;
  userDataRoot: string;
  sessionDataRoot: string;
  logsRoot: string;
  runtimeRoot: string;
}>;

export type ElectronPathApp = Readonly<{
  getPath(name: "userData"): string;
  setPath(name: "logs" | "sessionData" | "userData", path: string): void;
}>;

const segment = /^[a-z][a-z0-9.-]{1,127}$/u;

export function resolveElectronSessionNamespace(
  namespace: string,
  presentation: "headless" | "interactive",
): string {
  const resolved = presentation === "headless" ? `${namespace}-headless` : namespace;
  if (!segment.test(resolved)) throw new Error("invalid Electron session namespace");
  return resolved;
}

export function resolveElectronNamespacePaths(
  baseUserDataRoot: string,
  scope: Readonly<{ channel: string; namespace: string }>,
): ElectronNamespacePaths {
  if (!segment.test(scope.channel) || !segment.test(scope.namespace)) throw new Error("invalid Electron namespace scope");
  const namespaceRoot = join(resolve(baseUserDataRoot), "exact", "channels", scope.channel, "namespaces", scope.namespace);
  return Object.freeze({
    namespaceRoot,
    userDataRoot: join(namespaceRoot, "electron"),
    sessionDataRoot: join(namespaceRoot, "electron-session"),
    logsRoot: join(namespaceRoot, "logs", "electron"),
    runtimeRoot: join(namespaceRoot, "runtime", "electron"),
  });
}

/** Prepare all Chromium identity paths before taking the process singleton. */
export async function prepareElectronNamespacePaths(
  app: ElectronPathApp,
  scope: Readonly<{ channel: string; namespace: string }>,
  ensureDirectory: (path: string) => Promise<unknown> = (path) => mkdir(path, { recursive: true }),
): Promise<ElectronNamespacePaths> {
  const paths = resolveElectronNamespacePaths(app.getPath("userData"), scope);
  await Promise.all([
    ensureDirectory(paths.userDataRoot),
    ensureDirectory(paths.sessionDataRoot),
    ensureDirectory(paths.logsRoot),
    ensureDirectory(paths.runtimeRoot),
  ]);
  app.setPath("userData", paths.userDataRoot);
  app.setPath("sessionData", paths.sessionDataRoot);
  app.setPath("logs", paths.logsRoot);
  return paths;
}
