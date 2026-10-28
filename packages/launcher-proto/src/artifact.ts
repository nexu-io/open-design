import { LAUNCHER_HOST_CONTRACT_VERSION } from "./host.js";

export type LauncherHostEnvironment = Readonly<{
  contractVersion: typeof LAUNCHER_HOST_CONTRACT_VERSION;
  platform: "darwin" | "win32" | "linux";
  arch: string;
  electronVersion: string;
}>;
/** All paths are relative to the artifact root, using portable '/' separators. */
export type LauncherApplicationArtifact = LauncherHostEnvironment & Readonly<{
  appRoot: string;
  resourcesPath: string;
  entry: string;
}>;

export function validateLauncherHostEnvironment(value: unknown, expected: LauncherHostEnvironment): LauncherHostEnvironment {
  const host = value as LauncherHostEnvironment | null;
  if (host == null || host.contractVersion !== LAUNCHER_HOST_CONTRACT_VERSION ||
      host.platform !== expected.platform || host.arch !== expected.arch ||
      host.electronVersion !== expected.electronVersion) {
    throw new Error("artifact is not compatible with this installed launcher; update the installer");
  }
  return host;
}

export function validateLauncherApplicationArtifact(value: unknown, expected: LauncherHostEnvironment): LauncherApplicationArtifact {
  validateLauncherHostEnvironment(value, expected);
  const artifact = value as LauncherApplicationArtifact;
  for (const path of [artifact.appRoot, artifact.resourcesPath, artifact.entry]) {
    if (typeof path !== "string" || path === "" || path.includes("\\") || path.includes("\0") ||
        path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").some(part => part === ".." || part === "." || part === "")) {
      throw new Error("invalid launcher artifact relative path");
    }
  }
  if (!artifact.entry.startsWith(`${artifact.appRoot}/`)) throw new Error("launcher entry is outside application root");
  return artifact;
}
