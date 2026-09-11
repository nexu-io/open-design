import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type ElectronSessionScope = Readonly<{
  productName: string; channel: string; namespace: string; presentation: "headless" | "interactive";
}>;

/** Platform root is environment-owned, never a per-session path override. */
function platformApplicationDataRoot(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support");
  if (process.platform === "win32" && process.env.APPDATA) return process.env.APPDATA;
  throw new Error("Electron application data root is unavailable on this platform");
}

export function resolveElectronProductDataRoot(productName: string, applicationDataRoot: string = platformApplicationDataRoot()): string {
  if (!productName || productName === "." || productName === ".." || /[\\/:\x00-\x1f]/u.test(productName)) throw new Error("invalid Electron product data identity");
  return join(resolve(applicationDataRoot), productName);
}

export function resolveElectronSessionPaths(session: ElectronSessionScope): ElectronNamespacePaths {
  if (Object.keys(session).sort().join(",") !== "channel,namespace,presentation,productName"
    || !["headless", "interactive"].includes(session.presentation)) throw new Error("invalid Electron session scope");
  return resolveElectronNamespacePaths(resolveElectronProductDataRoot(session.productName), {
    channel: session.channel, namespace: resolveElectronSessionNamespace(session.namespace, session.presentation),
  });
}

export type ElectronNamespacePaths = Readonly<{
  namespaceRoot: string;
  userDataRoot: string;
  sessionDataRoot: string;
  logsRoot: string;
  runtimeRoot: string;
}>;

export type ElectronPathApp = Readonly<{
  getPath(name: "appData"): string;
  setPath(name: "logs" | "sessionData" | "userData", path: string): void;
}>;

const segment = /^[a-z][a-z0-9.-]{1,127}$/u;

export function resolveElectronSessionNamespace(
  namespace: string,
  presentation: "headless" | "interactive",
): string {
  const resolved = presentation === "headless" ? `${namespace}-headless` : namespace;
  if (!segment.test(resolved) || namespace.includes("..")) throw new Error("invalid Electron session namespace");
  return resolved;
}

/** Recreate a selected effective session without appending the headless suffix twice. */
export function serializeElectronSessionLaunch(namespace: string, presentation: "headless" | "interactive"): readonly string[] {
  if (presentation !== "headless" && presentation !== "interactive") throw new Error("invalid Electron presentation");
  const logical = presentation === "headless" ? namespace.slice(0, -"-headless".length) : namespace;
  if (!segment.test(logical) || logical.includes("..") || resolveElectronSessionNamespace(logical, presentation) !== namespace) throw new Error("invalid Electron session launch scope");
  return Object.freeze([`--namespace=${logical}`, ...(presentation === "headless" ? ["--headless"] : [])]);
}

export function resolveElectronNamespacePaths(
  productDataRoot: string,
  scope: Readonly<{ channel: string; namespace: string }>,
): ElectronNamespacePaths {
  if (!segment.test(scope.channel) || !segment.test(scope.namespace) || scope.channel.includes("..") || scope.namespace.includes("..")) throw new Error("invalid Electron namespace scope");
  const namespaceRoot = join(resolve(productDataRoot), "exact", "channels", scope.channel, "namespaces", scope.namespace);
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
  scope: Readonly<{ channel: string; namespace: string; productName: string }>,
  ensureDirectory: (path: string) => void = (path) => { mkdirSync(path, { recursive: true }); },
): Promise<ElectronNamespacePaths> {
  const paths = resolveElectronNamespacePaths(resolveElectronProductDataRoot(scope.productName, app.getPath("appData")), scope);
  // No async boundary before path identity is installed: Chromium can publish
  // native CDP/session files under the bootstrap root as soon as we yield.
  for (const path of [paths.userDataRoot, paths.sessionDataRoot, paths.logsRoot, paths.runtimeRoot]) ensureDirectory(path);
  app.setPath("userData", paths.userDataRoot);
  app.setPath("sessionData", paths.sessionDataRoot);
  app.setPath("logs", paths.logsRoot);
  return paths;
}
