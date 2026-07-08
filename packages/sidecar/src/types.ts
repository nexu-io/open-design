/**
 * @module types
 *
 * Public data types for the generic sidecar runtime: the stamp shape and
 * contract descriptor a host supplies, the request/option records for namespace
 * and runtime-path resolution, the launch-env and bootstrap inputs, the resolved
 * runtime context, port allocation shapes, and the JSON-IPC handler/handle types.
 * Pure type declarations with no runtime code and no dependency on sibling files.
 */

/** Minimal shape of a sidecar process stamp: the five identity fields. */
export type SidecarStampShape = {
  app: string;
  ipc: string;
  mode: string;
  namespace: string;
  source: string;
};

/**
 * Host-supplied contract: default path/namespace values, env var names, and the
 * normalizers that validate/canonicalize app, namespace, source, and full stamp.
 */
export type SidecarContractDescriptor<TStamp extends SidecarStampShape = SidecarStampShape> = {
  defaults: {
    host: string;
    ipcBase: string;
    namespace: string;
    projectTmpDirName: string;
    windowsPipePrefix: string;
  };
  env: {
    base: string;
    ipcBase: string;
    ipcPath: string;
    namespace: string;
    source: string;
  };
  normalizeApp(app: unknown): TStamp["app"];
  normalizeNamespace(namespace: unknown): string;
  normalizeSource(source: unknown): TStamp["source"];
  normalizeStamp(input: unknown): TStamp;
};

/** Inputs for resolving the effective namespace (explicit, env, or default). */
export type NamespaceResolutionOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  namespace?: string | null;
};

/** Inputs for resolving a source-scoped runtime root under a project. */
export type ProjectRuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot: string;
  source: TStamp["source"] | string;
};

/** Inputs for resolving the sidecar base (explicit, env, or project-derived). */
export type BaseResolutionOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base?: string | null;
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  source: TStamp["source"] | string;
};

/** Inputs for resolving a namespace-scoped path from a base + namespace. */
export type RuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base: string;
  contract: SidecarContractDescriptor<TStamp>;
  namespace: string;
};

/** {@link RuntimePathRequest} plus a run id, for a per-run runtime root. */
export type RuntimeRootRequest<TStamp extends SidecarStampShape = SidecarStampShape> = RuntimePathRequest<TStamp> & {
  runId: string;
};

/** Inputs for resolving an app's IPC socket/pipe path. */
export type AppIpcPathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  namespace: string;
};

/** Inputs for resolving an app-scoped runtime dir/file under a namespace root. */
export type AppRuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  namespaceRoot: string;
};

/** The resolved live runtime context of a bootstrapped sidecar process. */
export type SidecarRuntimeContext<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"];
  base: string;
  ipc: string;
  mode: TStamp["mode"];
  namespace: string;
  source: TStamp["source"];
};

/** Inputs for composing the env a child sidecar is launched with. */
export type SidecarLaunchEnvRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base: string;
  contract: SidecarContractDescriptor<TStamp>;
  extraEnv?: NodeJS.ProcessEnv;
  stamp: TStamp;
};

/** Inputs for bootstrapping a sidecar runtime from a stamp + env. */
export type BootstrapSidecarRuntimeOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  base?: string | null;
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot?: string;
};

/** Result of allocating a port: the chosen port and how it was chosen. */
export type PortAllocation = {
  port: number;
  source: "dynamic" | "forced";
};

/** Inputs for {@link allocatePort}. */
export type PortRequest = {
  host?: string;
  label?: string;
  port?: number | string | null;
  reserved?: Set<number>;
};

/** Handler invoked with each decoded JSON-IPC message, returning the reply. */
export type JsonIpcHandler = (message: any) => unknown | Promise<unknown>;

/** Handle to a running JSON-IPC server. */
export type JsonIpcServerHandle = {
  close(): Promise<void>;
};
