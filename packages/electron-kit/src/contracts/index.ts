import type {
  GenerationRecord,
  StandaloneGenerationBinding,
  StandaloneHandoffAttachment,
  StandaloneRuntimeHandle,
  StandaloneScope,
  StandaloneFeedbackEvent,
  StandaloneShellCapabilityPort,
  StandaloneShellIdentity,
  StandaloneShellUpdaterPort,
  UpdateActivationPolicy,
  UpdatePreparation,
  StandaloneLifecycleOccupant,
  LifecycleStatus,
} from "@open-design/standalone";
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type { ElectronPreflightResult, ElectronPreflightTopology } from "../runtime/startup/preflight/index.js";
import type { ElectronWarmupExecutor, ElectronWarmupTopology } from "../runtime/startup/warmup/index.js";
import type { ElectronInstallerHandoffReceipt, ElectronInstallerHandoffRequest } from "../update/installation/contracts.js";
export type { ElectronInstallerHandoffReceipt, ElectronInstallerHandoffRequest } from "../update/installation/contracts.js";
import type { ElectronMacRuntimePolicy } from "../platform/macos/contracts.js";

export const ELECTRON_KIT_CONTRACT_VERSION = 1 as const;

export type ElectronShellManifest = Readonly<{
  schemaVersion: typeof ELECTRON_KIT_CONTRACT_VERSION;
  appId: string;
  productName: string;
  publisher: string;
  executableName: string;
  version: string;
  channel: string;
  namespace: string;
  protocol: string;
  window: Readonly<{ width: number; height: number; title: string }>;
  shell: StandaloneShellIdentity;
}>;

export type ElectronShellActions = Readonly<{
  openDeepLink?(url: string): void | Promise<void>;
  installUpdate?(request: ElectronInstallerHandoffRequest): ElectronInstallerHandoffReceipt | Promise<ElectronInstallerHandoffReceipt>;
  observeCommitted?(): void | Promise<void>;
}>;

export type ElectronRendererWindow = Readonly<{
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}>;

export type ElectronRendererLease = Readonly<{
  window: ElectronRendererWindow;
  releaseIntegration(): void | Promise<void>;
  destroy(): void;
}>;

export type ElectronRendererMountAcknowledgement = Readonly<{
  attemptId: string;
  bindingDigest: string;
  channel: string;
  nonce: string;
}>;

/** Exact generation access passed to a Shell-owned renderer adapter. */
export type ElectronStandaloneRuntimeAccess = Readonly<{
  attachment: StandaloneHandoffAttachment;
  binding: StandaloneGenerationBinding;
  handle: StandaloneRuntimeHandle;
}>;

export type ElectronStandaloneContentUpdateApplication =
  | Readonly<{
      status: "applied";
      binding: StandaloneGenerationBinding;
      generation: GenerationRecord;
      lifecycle: LifecycleStatus;
    }>
  | Readonly<{
      status: "blocked";
      reason: "occupied" | "transition-active" | "unavailable";
      occupants: readonly StandaloneLifecycleOccupant[];
    }>;

export interface ElectronStandaloneContentUpdaterPort {
  prepareLatest(activationPolicy: UpdateActivationPolicy): Promise<UpdatePreparation>;
  applyNow(options?: Readonly<{ force?: boolean }>): Promise<ElectronStandaloneContentUpdateApplication>;
}

export type ElectronShellRenderer = Readonly<{
  windowOptions?(input: Readonly<{
    acknowledgement: ElectronRendererMountAcknowledgement;
    manifest: ElectronShellManifest;
    preflight: ElectronPreflightResult;
    presentation: "headless" | "interactive";
  }>): Readonly<BrowserWindowConstructorOptions>;
  mount(input: Readonly<{
    acknowledgement: ElectronRendererMountAcknowledgement;
    manifest: ElectronShellManifest;
    preflight: ElectronPreflightResult;
    presentation: "headless" | "interactive";
    contentUpdater: ElectronStandaloneContentUpdaterPort;
    runtime: ElectronStandaloneRuntimeAccess;
    window: BrowserWindow;
  }>): Readonly<{ dispose(): void | Promise<void> }> | Promise<Readonly<{ dispose(): void | Promise<void> }>>;
}>;

export type ElectronStandalonePreparedRuntime = Readonly<{
  binding: StandaloneGenerationBinding;
  generation: GenerationRecord;
  updater: StandaloneShellUpdaterPort;
  contentUpdater: ElectronStandaloneContentUpdaterPort;
  armShellInstallation(input: Readonly<{
    request: ElectronInstallerHandoffRequest;
    install(request: ElectronInstallerHandoffRequest): ElectronInstallerHandoffReceipt | Promise<ElectronInstallerHandoffReceipt>;
  }>): Promise<ElectronInstallerHandoffReceipt>;
  start(input: Readonly<{
    attachment: StandaloneHandoffAttachment;
    capabilities: StandaloneShellCapabilityPort;
  }>): Promise<StandaloneRuntimeHandle>;
}>;

export interface ElectronStandaloneAuthority {
  prepare(request: Readonly<{
    correlationId: string;
    scope: StandaloneScope;
    shell: StandaloneShellIdentity;
  }>): Promise<ElectronStandalonePreparedRuntime>;
}

export type ElectronStandaloneAuthorityFactory = (input: Readonly<{
  officialNodeExecutablePath: string;
  resourceRoot: string;
  runtimeRoot: string;
  observeFeedback?(event: StandaloneFeedbackEvent): void | Promise<void>;
}>) => ElectronStandaloneAuthority;

export type ElectronShellDefinition = Readonly<{
  manifest: ElectronShellManifest;
  mac: ElectronMacRuntimePolicy;
  preflight: ElectronPreflightTopology;
  warmup: ElectronWarmupTopology;
  headless?: boolean;
  actions?: ElectronShellActions;
  renderer: ElectronShellRenderer;
  warmupExecutors?: Readonly<Record<string, ElectronWarmupExecutor>>;
  createStandaloneAuthority: ElectronStandaloneAuthorityFactory;
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
  if (value.productName.trim().length === 0 || value.publisher.trim().length === 0 || value.publisher.length > 128
    || value.window.title.trim().length === 0) throw new Error("Electron Shell display identity is required");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value.version)) throw new Error("invalid Electron Shell version");
  if (!Number.isSafeInteger(value.window.width) || !Number.isSafeInteger(value.window.height) || value.window.width < 320 || value.window.height < 240) {
    throw new Error("invalid Electron Shell window dimensions");
  }
  if (value.shell.type !== "electron" || value.shell.version !== value.version || !digest.test(value.shell.buildHash) || !digest.test(value.shell.digest)) {
    throw new Error("Electron Shell identity does not match its manifest");
  }
  return structuredClone(value);
}
