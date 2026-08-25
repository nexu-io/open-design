import type {
  LifecyclePort,
  StandaloneFeedbackEvent,
  StandaloneShellIdentity,
  StandaloneShellUpdaterPort,
} from "@open-design/standalone";

export const ELECTRON_KIT_CONTRACT_VERSION = 1 as const;

export const ELECTRON_CLOSURE_ENDPOINTS = Object.freeze([
  "bootstrap.handoff",
  "lifecycle.start",
  "lifecycle.awaitReady",
  "lifecycle.status",
  "lifecycle.heartbeat",
  "lifecycle.release",
  "lifecycle.stop",
  "lifecycle.beginTransition",
  "feedback.observe",
  "shellUpdater.readSnapshot",
  "shellUpdater.waitForChange",
  "shellUpdater.invoke",
  "shellUpdater.confirmInstalled",
] as const);

export type ElectronClosureEndpoint = (typeof ELECTRON_CLOSURE_ENDPOINTS)[number];

export type ElectronShellManifest = Readonly<{
  schemaVersion: typeof ELECTRON_KIT_CONTRACT_VERSION;
  appId: string;
  productName: string;
  executableName: string;
  version: string;
  channel: string;
  namespace: string;
  protocol: string;
  window: Readonly<{ width: number; height: number; title: string }>;
  shell: StandaloneShellIdentity;
}>;

export type ElectronShellHandlers = Readonly<{
  openDeepLink?(url: string): void | Promise<void>;
}>;

export type ElectronClosurePorts = Readonly<{
  lifecycle: LifecyclePort;
  updater: StandaloneShellUpdaterPort;
  observeFeedback?(event: StandaloneFeedbackEvent): void | Promise<void>;
}>;

export type ElectronShellDefinition = Readonly<{
  manifest: ElectronShellManifest;
  headless?: boolean;
  handlers?: ElectronShellHandlers;
  createPorts(input: Readonly<{ runtimeRoot: string; sidecarEntryPath: string }>): ElectronClosurePorts;
}>;

const token = /^[a-z][a-z0-9.-]{1,127}$/u;
const digest = /^[a-f0-9]{64}$/u;

export function validateElectronShellManifest(value: ElectronShellManifest): ElectronShellManifest {
  if (value.schemaVersion !== ELECTRON_KIT_CONTRACT_VERSION) throw new Error("unsupported Electron Shell manifest schema");
  for (const [name, candidate] of Object.entries({
    appId: value.appId,
    channel: value.channel,
    executableName: value.executableName,
    namespace: value.namespace,
    protocol: value.protocol,
  })) {
    if (!token.test(candidate)) throw new Error(`invalid Electron Shell ${name}`);
  }
  if (value.productName.trim().length === 0 || value.window.title.trim().length === 0) throw new Error("Electron Shell display identity is required");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value.version)) throw new Error("invalid Electron Shell version");
  if (!Number.isSafeInteger(value.window.width) || !Number.isSafeInteger(value.window.height) || value.window.width < 320 || value.window.height < 240) {
    throw new Error("invalid Electron Shell window dimensions");
  }
  if (value.shell.type !== "electron" || value.shell.version !== value.version || !digest.test(value.shell.buildHash) || !digest.test(value.shell.digest)) {
    throw new Error("Electron Shell identity does not match its manifest");
  }
  return structuredClone(value);
}

export function assertElectronClosureEndpoint(endpoint: string): ElectronClosureEndpoint {
  if (!(ELECTRON_CLOSURE_ENDPOINTS as readonly string[]).includes(endpoint)) {
    throw new Error(`unknown Electron/Closure endpoint: ${endpoint}`);
  }
  return endpoint as ElectronClosureEndpoint;
}
