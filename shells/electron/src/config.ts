import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { SIDECAR_DEFAULTS, normalizeNamespace } from "@open-design/sidecar/protocol";
import {
  PACKAGED_LAUNCH_CONTEXT_FILE,
  claimPackagedLaunchContext,
  createLaunchContextTarget,
  markPackagedLaunchContextRelaunchable,
  type PackagedLaunchContext,
} from "@open-design/shell/launch-context";


// `electron` is loaded lazily so this module can also be imported from the
// standalone entry, which runs in a plain Node process without the electron
// dependency on disk. Top-level `import { app } from "electron"` would crash
// standalone at module-load with ERR_MODULE_NOT_FOUND.
async function loadElectronApp() {
  const electron = await import("electron");
  return electron.app;
}

export const PACKAGED_CONFIG_PATH_ENV = "OD_PACKAGED_CONFIG_PATH";
export const PACKAGED_LAUNCH_CONTEXT_SESSION_ENV = "OD_PACKAGED_LAUNCH_CONTEXT_SESSION";
export const PACKAGED_NAMESPACE_ENV = "OD_PACKAGED_NAMESPACE";
export const PACKAGED_NAMESPACE_BASE_ROOT_ENV = "OD_PACKAGED_NAMESPACE_BASE_ROOT";
export const PACKAGED_STANDALONE_METADATA_URL_ENV = "OD_STANDALONE_METADATA_URL";
export const PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV = "OD_PACKAGED_ALLOW_WEB_OUTPUT_MODE_OVERRIDE";
export const PACKAGED_WEB_STANDALONE_ROOT_ENV = "OD_WEB_STANDALONE_ROOT";
export const PACKAGED_WEB_OUTPUT_MODE_ENV = "OD_WEB_OUTPUT_MODE";

export type PackagedWebOutputMode = "server" | "standalone";
export type PackagedAmrProfile = "prod" | "test" | "feature-test" | "local";

export type RawPackagedConfig = {
  amrProfile?: string;
  daemonCliEntryRelative?: string;
  daemonSidecarEntryRelative?: string;
  namespace?: string;
  namespaceBaseRoot?: string;
  nodeCommandRelative?: string;
  resourceRoot?: string;
  /** Package-launcher lifecycle version; independent from product release and reusable Shell bytes. */
  launcherVersion?: string;
  /** Release binding selected by the launcher; independent from Shell bytes. */
  releaseVersion?: string;
  shellVersion?: string;
  // Baked by tools/pack from OPEN_DESIGN_TELEMETRY_RELAY_URL and forwarded to
  // the daemon at runtime; Langfuse credentials never ship in packaged config.
  telemetryRelayUrl?: string;
  updateMetadataUrl?: string;
  // PostHog product-analytics ingest key, baked by tools/pack from
  // process.env.POSTHOG_KEY at packaging time. Forwarded to the daemon
  // sidecar's spawn env as POSTHOG_KEY. `phc_` keys are public ingest
  // tokens (write-only event capture); embedding them in the bundle is
  // the PostHog-recommended pattern. The integration short-circuits when
  // either this is absent or the user has declined Privacy → metrics.
  posthogKey?: string;
  posthogHost?: string;
  // Origin of the vela web console this build's AMR backend serves, baked by
  // tools/pack from OD_VELA_WEB_URL at packaging time. Forwarded to the daemon
  // spawn env as OD_VELA_WEB_URL, where it both gates the workspace-team
  // transports and supplies the workspace console links. Injected rather than
  // checked in because the non-prod AMR environments are internal deployments
  // and this repository is public; absent for prod and fork builds.
  velaWebUrl?: string;
  webSidecarEntryRelative?: string;
  webStandaloneRoot?: string;
  webOutputMode?: string;
};

export type PackagedConfig = {
  amrProfile: PackagedAmrProfile | null;
  daemonCliEntry: string | null;
  daemonSidecarEntry: string | null;
  namespace: string;
  namespaceBaseRoot: string;
  nodeCommand: string | null;
  resourceRoot: string;
  launcherVersion: string | null;
  launchContext?: { path: string; sessionId: string } | null;
  releaseVersion: string | null;
  shellVersion: string | null;
  telemetryRelayUrl: string | null;
  updateMetadataUrl: string | null;
  posthogKey: string | null;
  posthogHost: string | null;
  velaWebUrl: string | null;
  webSidecarEntry: string | null;
  webStandaloneRoot: string | null;
  webOutputMode: PackagedWebOutputMode;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath: string): Promise<RawPackagedConfig | null> {
  if (!(await pathExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8")) as RawPackagedConfig;
}

function resolveDefaultConfigPath(): string {
  return join(process.resourcesPath, "open-design-config.json");
}

async function claimLaunchContext(
  electronUserDataRoot: string,
  sessionId?: string,
): Promise<PackagedLaunchContext | null> {
  return await claimPackagedLaunchContext({
    path: join(electronUserDataRoot, PACKAGED_LAUNCH_CONTEXT_FILE),
    ...(sessionId == null ? {} : { sessionId }),
  });
}

async function readRawPackagedConfig(electronUserDataRoot: string): Promise<{
  launchContext: PackagedLaunchContext | null;
  raw: RawPackagedConfig;
}> {
  const explicit = process.env[PACKAGED_CONFIG_PATH_ENV];
  if (explicit != null && explicit.length > 0) {
    const config = await readJsonIfExists(resolve(explicit));
    if (config == null) throw new Error(`packaged config not found at ${explicit}`);
    const sessionId = process.env[PACKAGED_LAUNCH_CONTEXT_SESSION_ENV]?.trim();
    if (sessionId != null && sessionId.length > 0) {
      const launchContext = await claimLaunchContext(electronUserDataRoot, sessionId);
      const target = createLaunchContextTarget(config);
      if (launchContext == null || target == null) {
        throw new Error("packaged launch context could not be claimed");
      }
      if (
        launchContext.target.namespace !== target.namespace
        || launchContext.target.namespaceBaseRoot !== target.namespaceBaseRoot
      ) {
        throw new Error("packaged launch context target does not match the explicit config");
      }
      return { launchContext, raw: config };
    }
    return { launchContext: null, raw: config };
  }

  const electronApp = await loadElectronApp();
  const embedded = (
    (await readJsonIfExists(resolveDefaultConfigPath())) ??
    (await readJsonIfExists(join(electronApp.getAppPath(), "open-design-config.json"))) ??
    {}
  );
  const launchContext = await claimLaunchContext(electronUserDataRoot);
  return {
    launchContext,
    raw: launchContext == null ? embedded : { ...embedded, ...launchContext.target },
  };
}

function resolveOptionalPath(value: string | undefined): string | undefined {
  return value == null || value.length === 0 ? undefined : resolve(value);
}

export function resolvePackagedNamespaceBaseRoot(
  rawNamespaceBaseRoot: string | undefined,
  electronUserDataRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolveOptionalPath(env[PACKAGED_NAMESPACE_BASE_ROOT_ENV])
    ?? resolveOptionalPath(rawNamespaceBaseRoot)
    ?? join(electronUserDataRoot, "namespaces");
}

export function resolveDefaultPackagedNodeCommandRelative(
  platform: NodeJS.Platform = process.platform,
): string {
  return join("open-design", "bin", platform === "win32" ? "node.exe" : "node");
}

// Config DTOs use null for optional scalar values consumed by runtime options;
// optional paths use undefined so callers can distinguish "no path" from a resolved path string.
function cleanOptionalString(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function resolvePackagedWebOutputMode(value: string | undefined): PackagedWebOutputMode {
  if (value == null || value.length === 0) return "server";
  if (value === "server" || value === "standalone") return value;
  throw new Error(`unsupported packaged web output mode: ${value}`);
}

export function resolvePackagedAmrProfile(value: string | undefined): PackagedAmrProfile | null {
  const cleaned = cleanOptionalString(value);
  if (cleaned == null) return null;
  if (cleaned === "prod" || cleaned === "test" || cleaned === "feature-test" || cleaned === "local") {
    return cleaned;
  }
  throw new Error(`unsupported packaged AMR profile; expected prod, test, feature-test, or local: ${value}`);
}

/**
 * Resolve the Closure feed independently from the outer Shell updater feed.
 *
 * Release metadata can describe both layers, but local payload-update fixtures
 * intentionally describe only the outer Shell. Keeping their runtime override
 * out of Standalone discovery prevents a relaunched payload from treating an
 * updater-only document as a Closure v2 manifest.
 */
export function resolvePackagedStandaloneMetadataUrl(
  configuredUrl: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return cleanOptionalString(env[PACKAGED_STANDALONE_METADATA_URL_ENV])
    ?? cleanOptionalString(configuredUrl ?? undefined);
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function resolvePackagedWebStandaloneRoot(
  webOutputMode: PackagedWebOutputMode,
  value: string | undefined,
): string | null {
  const configured = resolveOptionalPath(value);
  if (configured != null) return configured;
  if (webOutputMode !== "standalone") return null;
  return join(process.resourcesPath, "open-design-web-standalone");
}

async function resolvePackagedRelativeEntry(value: string | undefined): Promise<string | null> {
  const cleaned = cleanOptionalString(value);
  if (cleaned == null) return null;
  const entry = join(process.resourcesPath, cleaned);
  if (!(await pathExists(entry))) {
    throw new Error(`configured packaged entry not found at ${entry}`);
  }
  return entry;
}

export async function readPackagedConfig(): Promise<PackagedConfig> {
  const electronApp = await loadElectronApp();
  const electronUserDataRoot = electronApp.getPath("userData");
  const { launchContext, raw } = await readRawPackagedConfig(electronUserDataRoot);
  const namespace = normalizeNamespace(
    process.env[PACKAGED_NAMESPACE_ENV] ?? raw.namespace ?? SIDECAR_DEFAULTS.namespace,
  );
  const namespaceBaseRoot = resolvePackagedNamespaceBaseRoot(
    raw.namespaceBaseRoot,
    electronUserDataRoot,
  );
  const resourceRoot = resolveOptionalPath(raw.resourceRoot) ?? join(process.resourcesPath, "open-design");
  const relativeNodeCommand =
    raw.nodeCommandRelative == null || raw.nodeCommandRelative.length === 0
      ? resolveDefaultPackagedNodeCommandRelative()
      : raw.nodeCommandRelative;
  const nodeCommandCandidate = join(process.resourcesPath, relativeNodeCommand);
  const nodeCommand = (await pathExists(nodeCommandCandidate)) ? nodeCommandCandidate : null;
  const allowWebOutputModeOverride = isTruthyEnv(process.env[PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV]);
  const webOutputMode = resolvePackagedWebOutputMode(
    allowWebOutputModeOverride
      ? process.env[PACKAGED_WEB_OUTPUT_MODE_ENV] ?? raw.webOutputMode
      : raw.webOutputMode,
  );
  const webStandaloneRoot = resolvePackagedWebStandaloneRoot(
    webOutputMode,
    allowWebOutputModeOverride
      ? process.env[PACKAGED_WEB_STANDALONE_ROOT_ENV] ?? raw.webStandaloneRoot
      : raw.webStandaloneRoot,
  );
  const daemonCliEntry = await resolvePackagedRelativeEntry(raw.daemonCliEntryRelative);
  const daemonSidecarEntry = await resolvePackagedRelativeEntry(raw.daemonSidecarEntryRelative);
  const webSidecarEntry = await resolvePackagedRelativeEntry(raw.webSidecarEntryRelative);

  return {
    amrProfile: resolvePackagedAmrProfile(raw.amrProfile),
    daemonCliEntry,
    daemonSidecarEntry,
    namespace,
    namespaceBaseRoot,
    nodeCommand,
    resourceRoot,
    launcherVersion: cleanOptionalString(raw.launcherVersion)
      ?? cleanOptionalString(raw.releaseVersion)
      ?? cleanOptionalString(raw.shellVersion),
    launchContext: launchContext == null ? null : {
      path: join(electronUserDataRoot, PACKAGED_LAUNCH_CONTEXT_FILE),
      sessionId: launchContext.sessionId,
    },
    releaseVersion: cleanOptionalString(raw.releaseVersion),
    shellVersion: cleanOptionalString(raw.shellVersion),
    telemetryRelayUrl: cleanOptionalString(raw.telemetryRelayUrl),
    updateMetadataUrl: cleanOptionalString(raw.updateMetadataUrl),
    posthogKey: cleanOptionalString(raw.posthogKey),
    posthogHost: cleanOptionalString(raw.posthogHost),
    velaWebUrl: cleanOptionalString(raw.velaWebUrl),
    webSidecarEntry,
    webStandaloneRoot,
    webOutputMode,
  };
}

export async function parkPackagedLaunchContext(
  context: PackagedConfig["launchContext"],
): Promise<boolean> {
  if (context == null) return false;
  return await markPackagedLaunchContextRelaunchable({
    ownerPid: process.pid,
    path: context.path,
    sessionId: context.sessionId,
  });
}
