import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  LAUNCHER_SCHEMA_VERSION, resolveLauncherVersionPaths,
  validateLauncherApplicationArtifact, validateLauncherHostEnvironment,
  type LauncherHostEnvironment, type LauncherHostRunningCode, type LauncherPaths,
} from "@open-design/launcher-proto";

export function within(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export function safePath(root: string, path: unknown): string {
  if (typeof path !== "string" || isAbsolute(path)) throw new Error("invalid launcher payload path");
  const result = resolve(root, path);
  if (!within(root, result) || !within(realpathSync(root), realpathSync(result))) throw new Error("launcher payload path escapes its version root");
  return result;
}

export function resolvePayload(paths: LauncherPaths, version: string, environment: LauncherHostEnvironment, artifactRoot?: string): { running: LauncherHostRunningCode; entry: string } {
  const versionPaths = resolveLauncherVersionPaths({ ...paths, version });
  const root = artifactRoot == null ? versionPaths.versionRoot : resolve(artifactRoot);
  if (root !== versionPaths.versionRoot &&
      (!within(paths.stagingRoot, root) || !within(realpathSync(paths.stagingRoot), realpathSync(root)))) {
    throw new Error("candidate root is outside launcher version/staging storage");
  }
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("candidate root is not a plain directory");
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== LAUNCHER_SCHEMA_VERSION || manifest.platform !== environment.platform ||
      manifest.channel !== paths.channel || manifest.namespace !== paths.namespace || manifest.version !== version) {
    throw new Error(`payload ${version} is not compatible with this installed launcher; update the installer`);
  }
  const artifact = validateLauncherApplicationArtifact(manifest.host, environment);
  const appRoot = safePath(root, artifact.appRoot);
  const resourcesPath = safePath(root, artifact.resourcesPath);
  const main = safePath(root, artifact.entry);
  const executablePath = safePath(root, manifest.entry?.executable);
  if (!within(appRoot, main) || !within(realpathSync(appRoot), realpathSync(main)) ||
      !statSync(main).isFile() || !statSync(executablePath).isFile()) throw new Error("payload entry is incomplete");
  const config = JSON.parse(readFileSync(join(resourcesPath, "open-design-config.json"), "utf8"));
  if (config.appVersion !== version) throw new Error("payload host metadata mismatch");
  validateLauncherHostEnvironment(config.launcherHost, environment);
  return { entry: pathToFileURL(main).href, running: { appRoot, resourcesPath, executablePath, source: "payload", version } };
}
