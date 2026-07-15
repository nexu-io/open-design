/**
 * @module paths
 *
 * Namespace and runtime-path resolution for a sidecar. Derives the effective
 * namespace, the project/source runtime roots, the sidecar base, the
 * namespace/runtime roots and their pointer/manifest/log paths, per-app runtime
 * dirs/files, and the app IPC socket/pipe path — all from a host contract so no
 * Open Design-specific strings are hardcoded here. Depends on `node:path` and the
 * public types.
 */

import { dirname, isAbsolute, join, resolve } from "node:path";

import type {
  AppIpcPathRequest,
  AppRuntimePathRequest,
  BaseResolutionOptions,
  NamespaceResolutionOptions,
  ProjectRuntimePathRequest,
  RuntimePathRequest,
  RuntimeRootRequest,
  SidecarContractDescriptor,
  SidecarRuntimeContext,
  SidecarStampShape,
} from "./types.js";

/**
 * Resolve the effective namespace from an explicit value, the env var named by
 * the contract, or the contract default — then normalize it.
 * @returns The normalized namespace.
 */
export function resolveNamespace<TStamp extends SidecarStampShape>(options: NamespaceResolutionOptions<TStamp>): string {
  return options.contract.normalizeNamespace(
    options.namespace ??
      options.env?.[options.contract.env.namespace] ??
      options.contract.defaults.namespace,
  );
}

/**
 * Validate and resolve a project root to an absolute path.
 * @returns The resolved absolute project root.
 */
export function resolveProjectRoot(projectRoot: string): string {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new Error("projectRoot must be a non-empty string");
  }
  return resolve(projectRoot);
}

/**
 * Resolve the project's tmp root (`<projectRoot>/<projectTmpDirName>`).
 * @returns The resolved tmp root path.
 */
export function resolveProjectTmpRoot<TStamp extends SidecarStampShape>({
  contract,
  projectRoot,
}: {
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot: string;
}): string {
  return join(resolveProjectRoot(projectRoot), contract.defaults.projectTmpDirName);
}

/**
 * Resolve the source-scoped runtime root (`<projectTmpRoot>/<source>`).
 * @returns The resolved source runtime root path.
 */
export function resolveSourceRuntimeRoot<TStamp extends SidecarStampShape>({
  contract,
  projectRoot,
  source,
}: ProjectRuntimePathRequest<TStamp>): string {
  return join(resolveProjectTmpRoot({ contract, projectRoot }), contract.normalizeSource(source));
}

/**
 * Resolve the sidecar base from an explicit value, the env var named by the
 * contract, or the source runtime root.
 * @returns The resolved absolute base path.
 */
export function resolveSidecarBase<TStamp extends SidecarStampShape>({
  base,
  contract,
  env = process.env,
  projectRoot = process.cwd(),
  source,
}: BaseResolutionOptions<TStamp>): string {
  return resolve(base ?? env[contract.env.base] ?? resolveSourceRuntimeRoot({ contract, projectRoot, source }));
}

/**
 * Resolve the namespace root (`<base>/<namespace>`).
 * @returns The resolved namespace root path.
 */
export function resolveNamespaceRoot<TStamp extends SidecarStampShape>({
  base,
  contract,
  namespace,
}: RuntimePathRequest<TStamp>): string {
  return join(resolve(base), contract.normalizeNamespace(namespace));
}

/**
 * Resolve the namespace root (the directory that holds `logs/`, `runs/`,
 * `current.json`, …) from a *live* {@link SidecarRuntimeContext}.
 *
 * `resolveNamespaceRoot` alone is not enough here because the sidecar `base`
 * carries a different meaning depending on how the process was launched:
 *
 * - **dev (`tools-dev`):** every child is launched with `base` set to the
 *   pre-namespace source runtime root (see `tools/dev/src/config.ts`), so the
 *   namespace root is `base/<namespace>` — exactly what `resolveNamespaceRoot`
 *   computes.
 * - **packaged (runtime mode):** the orchestrator launches every child with
 *   `base = <namespaceRoot>/runtime` (see `apps/packaged/src/paths.ts` →
 *   `runtimeRoot`, wired in `apps/packaged/src/sidecars.ts`), while the actual
 *   logs live as a sibling at `<namespaceRoot>/logs`. Re-appending the
 *   namespace via `resolveNamespaceRoot` would yield
 *   `<namespaceRoot>/runtime/<namespace>`, so every daemon/web log file
 *   resolved that way is an ENOENT — which is why packaged diagnostics bundles
 *   used to capture none of them.
 *
 * Callers pass their contract's runtime-mode constant (e.g.
 * `SIDECAR_MODES.RUNTIME`) so this generic helper does not have to hardcode
 * Open Design's mode strings.
 */
export function resolveRuntimeNamespaceRoot<TStamp extends SidecarStampShape>({
  contract,
  runtime,
  runtimeMode,
}: {
  contract: SidecarContractDescriptor<TStamp>;
  runtime: Pick<SidecarRuntimeContext<TStamp>, "base" | "mode" | "namespace">;
  runtimeMode: TStamp["mode"] | string;
}): string {
  if (runtime.mode === runtimeMode) {
    // packaged: `base` already points INTO the namespace tree
    // (`<namespaceRoot>/runtime`), so the namespace root is its parent.
    return dirname(resolve(runtime.base));
  }
  // dev / tools-dev: `base` is the pre-namespace source runtime root.
  return resolveNamespaceRoot({ base: runtime.base, contract, namespace: runtime.namespace });
}

/**
 * Resolve a per-run runtime root (`<namespaceRoot>/runs/<runId>`).
 * @returns The resolved run runtime root path.
 */
export function resolveRuntimeRoot<TStamp extends SidecarStampShape>({
  base,
  contract,
  namespace,
  runId,
}: RuntimeRootRequest<TStamp>): string {
  return join(resolveNamespaceRoot({ base, contract, namespace }), "runs", runId);
}

/**
 * Resolve the namespace pointer file (`<namespaceRoot>/current.json`).
 * @returns The resolved pointer path.
 */
export function resolvePointerPath<TStamp extends SidecarStampShape>({ base, contract, namespace }: RuntimePathRequest<TStamp>): string {
  return join(resolveNamespaceRoot({ base, contract, namespace }), "current.json");
}

/**
 * Resolve a run's manifest file (`<runtimeRoot>/manifest.json`).
 * @returns The resolved manifest path.
 */
export function resolveManifestPath({ runtimeRoot }: { runtimeRoot: string }): string {
  return join(runtimeRoot, "manifest.json");
}

/**
 * Resolve an app's logs directory (`<runtimeRoot>/logs/<app>`).
 * @returns The resolved logs directory path.
 */
export function resolveLogsDir<TStamp extends SidecarStampShape>({
  app,
  contract,
  runtimeRoot,
}: {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  runtimeRoot: string;
}): string {
  return join(runtimeRoot, "logs", contract.normalizeApp(app));
}

/**
 * Resolve an app's log file (`<logsDir>/<fileName>`, default `latest.log`).
 * @returns The resolved log file path.
 */
export function resolveLogFilePath<TStamp extends SidecarStampShape>({
  app,
  contract,
  fileName = "latest.log",
  runtimeRoot,
}: {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  fileName?: string;
  runtimeRoot: string;
}): string {
  return join(resolveLogsDir({ app, contract, runtimeRoot }), fileName);
}

/**
 * Resolve an app's runtime dir under a namespace root (`<namespaceRoot>/<app>`).
 * @returns The resolved app runtime directory path.
 */
export function resolveAppRuntimeDir<TStamp extends SidecarStampShape>({
  app,
  contract,
  namespaceRoot,
}: AppRuntimePathRequest<TStamp>): string {
  return join(namespaceRoot, contract.normalizeApp(app));
}

/**
 * Resolve a file inside an app's runtime dir, rejecting non-simple file names.
 * @returns The resolved app runtime file path.
 */
export function resolveAppRuntimePath<TStamp extends SidecarStampShape>({
  app,
  contract,
  fileName,
  namespaceRoot,
}: AppRuntimePathRequest<TStamp> & { fileName: string }): string {
  if (fileName.length === 0 || fileName.includes("\0") || /[\\/]/.test(fileName)) {
    throw new Error(`app runtime fileName must be a simple path segment: ${fileName}`);
  }
  return join(resolveAppRuntimeDir({ app, contract, namespaceRoot }), fileName);
}

/**
 * Resolve an app's IPC endpoint: a Windows named pipe, or a unix socket under
 * `<ipcBase>/<namespace>/<app>.sock`.
 * @returns The resolved IPC socket/pipe path.
 */
export function resolveAppIpcPath<TStamp extends SidecarStampShape>({
  app,
  contract,
  env = process.env,
  namespace,
}: AppIpcPathRequest<TStamp>): string {
  const normalizedApp = contract.normalizeApp(app);
  const normalizedNamespace = contract.normalizeNamespace(namespace);

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${contract.defaults.windowsPipePrefix}-${normalizedNamespace}-${normalizedApp}`;
  }

  const ipcBase = resolve(env[contract.env.ipcBase] ?? contract.defaults.ipcBase);
  return join(ipcBase, normalizedNamespace, `${normalizedApp}.sock`);
}
