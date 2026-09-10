import type {
  GenerationRecord,
  NodeRuntimeBinding,
  StandaloneGenerationBinding,
  StandaloneHandoffAttachment,
  StandaloneRuntimeHandle,
  StandaloneScope,
  StandaloneFeedbackEvent,
  StandaloneShellCapabilityPort,
  StandaloneShellIdentity,
  StandaloneShellUpdaterPort,
  StandaloneShellRestartHandoff,
  UpdateActivationPolicy,
  UpdatePreparation,
  SignedStandaloneChannelHead,
  StandaloneLifecycleOccupant,
  LifecycleStatus,
} from "@open-design/standalone";
import type { NodePlatformResource } from "@open-design/standalone/packages";
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type { ElectronPreflightResult } from "../runtime/startup/preflight/index.js";
import type { ElectronWarmupExecutor, ElectronWarmupTopology } from "../runtime/startup/warmup/index.js";
import type { ElectronInstallerClaimSnapshot, ElectronInstallerConfirmationReceipt, ElectronInstallerConfirmationRequest, ElectronInstallerHandoffReceipt, ElectronInstallerHandoffRequest, ElectronInstallerRecoveryIntent, ElectronInstallerRecoveryReceipt, ElectronInstallerRecoveryRequest } from "../update/installation/contracts.js";
export type { ElectronInstallerClaimIdentity, ElectronInstallerClaimSnapshot, ElectronInstallerConfirmationReceipt, ElectronInstallerConfirmationRequest, ElectronInstallerHandoffReceipt, ElectronInstallerHandoffRequest, ElectronInstallerRecoveryIntent, ElectronInstallerRecoveryReceipt, ElectronInstallerRecoveryRequest } from "../update/installation/contracts.js";
import type { ElectronMacRuntimePolicy } from "../platform/macos/contracts.js";
import type { ElectronRendererRecoveryPolicy } from "../runtime/window/crash-recovery.js";

export const ELECTRON_KIT_CONTRACT_VERSION = 2 as const;
export * from "./capsule.js";

export type ElectronShellManifest = Readonly<{
  schemaVersion: typeof ELECTRON_KIT_CONTRACT_VERSION;
  appId: string;
  productName: string;
  iconDataUrl?: string;
  publisher: string;
  executableName: string;
  version: string;
  channel: string;
  namespace: string;
  protocol: string;
  shell: StandaloneShellIdentity;
}>;

/** Product presentation belongs to the Capsule, not the physical OS identity. */
export type ElectronShellAppearance = Readonly<{
  schemaVersion: 1;
  window: Readonly<{ width: number; height: number; title: string }>;
  splash: Readonly<{
    width: number;
    height: number;
    minimumVisibleMs: number;
    backgroundColor: string;
    foregroundColor: string;
    mutedColor: string;
    initialLabel: string;
    readyLabel: string;
  }>;
}>;

export type ElectronShellActions = Readonly<{
  openDeepLink?(url: string): void | Promise<void>;
  scheduleRestart?(): Promise<void>;
  installUpdate?(request: ElectronInstallerHandoffRequest): ElectronInstallerHandoffReceipt | Promise<ElectronInstallerHandoffReceipt>;
  observeCommitted?(): void | Promise<void>;
  resolveInstallerRecovery?(input: Readonly<{
    claim: ElectronInstallerClaimSnapshot;
    snapshot: import("@open-design/standalone").StandaloneShellUpdaterSnapshot;
  }>): ElectronInstallerRecoveryIntent | null | Promise<ElectronInstallerRecoveryIntent | null>;
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
  readPrepared(): Promise<Extract<UpdatePreparation, { status: "prepared" }> | null>;
  prepareLatest(activationPolicy: UpdateActivationPolicy): Promise<UpdatePreparation>;
  prepareFromHead(head: SignedStandaloneChannelHead, activationPolicy: UpdateActivationPolicy): Promise<UpdatePreparation>;
  applyNow(options?: Readonly<{ force?: boolean; expectedGenerationId?: string; activationPolicy?: "authorize-user" | "authorize-silent" }>): Promise<ElectronStandaloneContentUpdateApplication>;
}

export type ElectronShellRenderer = Readonly<{
  windowOptions?(input: Readonly<{
    acknowledgement: ElectronRendererMountAcknowledgement;
    manifest: ElectronShellManifest;
    windowPolicy: ElectronShellAppearance["window"];
    preflight: ElectronPreflightResult;
    presentation: "headless" | "interactive";
  }>): Readonly<BrowserWindowConstructorOptions>;
  mount(input: Readonly<{
    acknowledgement: ElectronRendererMountAcknowledgement;
    manifest: ElectronShellManifest;
    windowPolicy: ElectronShellAppearance["window"];
    preflight: ElectronPreflightResult;
    presentation: "headless" | "interactive";
    contentUpdater: ElectronStandaloneContentUpdaterPort;
    shellUpdater: StandaloneShellUpdaterPort;
    runtime: ElectronStandaloneRuntimeAccess;
    window: BrowserWindow;
  }>): Readonly<{ dispose(): void | Promise<void> }> | Promise<Readonly<{ dispose(): void | Promise<void> }>>;
}>;

export type ElectronStandalonePreparedRuntime = Readonly<{
  /** Release unclaimed preparation resources without disturbing sibling users. */
  dispose(): Promise<void>;
  binding: StandaloneGenerationBinding;
  generation: GenerationRecord;
  updater: StandaloneShellUpdaterPort;
  contentUpdater: ElectronStandaloneContentUpdaterPort;
  armShellRestart(request: Readonly<{ handoff: StandaloneShellRestartHandoff; installAttemptId: string }>): Promise<void>;
  readShellInstallationClaim(): Promise<ElectronInstallerClaimSnapshot | null>;
  confirmShellInstallation(request: ElectronInstallerConfirmationRequest): Promise<ElectronInstallerConfirmationReceipt>;
  armShellInstallation(input: Readonly<{
    request: ElectronInstallerHandoffRequest;
    install(request: ElectronInstallerHandoffRequest): ElectronInstallerHandoffReceipt | Promise<ElectronInstallerHandoffReceipt>;
  }>): Promise<ElectronInstallerHandoffReceipt>;
  recoverShellInstallation(input: Readonly<{
    request: ElectronInstallerRecoveryRequest;
    install?(request: ElectronInstallerHandoffRequest): ElectronInstallerHandoffReceipt | Promise<ElectronInstallerHandoffReceipt>;
  }>): Promise<ElectronInstallerRecoveryReceipt>;
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
  nodeRuntime: NodeRuntimeBinding;
  installedShellPath?: string;
  namespaceRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
  observeFeedback?(event: StandaloneFeedbackEvent): void | Promise<void>;
}>) => ElectronStandaloneAuthority;

export type ElectronStartupProgress = Readonly<{
  mode?: "first-install" | "update" | "startup" | "recovery";
  label: string;
  detail?: string;
  receivedBytes?: number;
  totalBytes?: number;
  resourceId?: string;
  state?: "begin" | "progress" | "reused" | "complete" | "failed";
}>;

export type ElectronStartupPresentation = Readonly<{
  window: BrowserWindow;
  setProgress(progress: ElectronStartupProgress): void;
}>;

export type ElectronBackgroundUpdatePolicy = Readonly<{
  schedule: Readonly<{ initialDelayMs: number; intervalMs: number; backoffInitialMs: number; backoffMaxMs: number }>;
  check(input: Readonly<{
    signal: AbortSignal;
    contentUpdater: ElectronStandaloneContentUpdaterPort;
    shellUpdater: StandaloneShellUpdaterPort;
    startupShellRevision: number;
    startupContentGenerationId: string | null;
    runtime: ElectronStandaloneRuntimeAccess;
  }>): Promise<void>;
}>;

export type ElectronShellDefinition = Readonly<{
  manifest: ElectronShellManifest;
  appearance: ElectronShellAppearance;
  createStartupPresentation(): Promise<ElectronStartupPresentation>;
  prepareNodeRuntime(input: Readonly<{ runtimeRoot: string; platform: NodePlatformResource; signal: AbortSignal;
    scope: StandaloneScope; observeProgress(progress: ElectronStartupProgress): void }>): Promise<NodeRuntimeBinding>;
  describeStartupFeedback(event: StandaloneFeedbackEvent): ElectronStartupProgress;
  mac: ElectronMacRuntimePolicy;
  warmup: ElectronWarmupTopology;
  headless?: boolean;
  actions?: ElectronShellActions;
  renderer: ElectronShellRenderer;
  backgroundUpdates?: ElectronBackgroundUpdatePolicy;
  rendererRecovery?: Readonly<{
    policy: ElectronRendererRecoveryPolicy;
    prompt: Readonly<{ title: string; message: string; detail: string; retryLabel: string; quitLabel: string }>;
  }>;
  warmupExecutors?: Readonly<Record<string, ElectronWarmupExecutor>>;
  createStandaloneAuthority: ElectronStandaloneAuthorityFactory;
}>;

const token = /^[a-z][a-z0-9.-]{1,127}$/u;
const digest = /^[a-f0-9]{64}$/u;
const version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export function validateElectronShellManifest(value: ElectronShellManifest): ElectronShellManifest {
  if (value.schemaVersion !== ELECTRON_KIT_CONTRACT_VERSION) throw new Error("unsupported Electron Shell manifest schema");
  if ("window" in value || "splash" in value || "appearance" in value) throw new Error("presentation must not be embedded in the physical Shell manifest");
  for (const [name, candidate] of Object.entries({
    appId: value.appId,
    channel: value.channel,
    executableName: value.executableName,
    namespace: value.namespace,
    protocol: value.protocol,
  })) {
    if (!token.test(candidate)) throw new Error(`invalid Electron Shell ${name}`);
  }
  if (value.productName.trim().length === 0 || value.publisher.trim().length === 0 || value.publisher.length > 128) throw new Error("Electron Shell display identity is required");
  if (!version.test(value.version)) throw new Error("invalid Electron Shell version");
  if (value.iconDataUrl != null && (typeof value.iconDataUrl !== "string" || value.iconDataUrl.length > 2_000_000
    || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u.test(value.iconDataUrl))) {
    throw new Error("invalid Electron Shell icon: expected an embedded PNG");
  }
  if (value.shell.type !== "electron" || !version.test(value.shell.version) || !digest.test(value.shell.buildHash) || !digest.test(value.shell.digest)) {
    throw new Error("Electron Shell compatibility identity is invalid");
  }
  return structuredClone(value);
}

export function validateElectronShellAppearance(value: ElectronShellAppearance): ElectronShellAppearance {
  if (value.schemaVersion !== 1 || Object.keys(value).sort().join(",") !== "schemaVersion,splash,window"
    || value.window == null || value.splash == null
    || Object.keys(value.window).sort().join(",") !== "height,title,width"
    || Object.keys(value.splash).sort().join(",") !== "backgroundColor,foregroundColor,height,initialLabel,minimumVisibleMs,mutedColor,readyLabel,width") {
    throw new Error("invalid Electron Capsule appearance schema");
  }
  if (typeof value.window.title !== "string" || value.window.title.trim().length === 0
    || !Number.isSafeInteger(value.window.width) || !Number.isSafeInteger(value.window.height) || value.window.width < 320 || value.window.height < 240) {
    throw new Error("invalid Electron Shell window dimensions");
  }
  if (!Number.isSafeInteger(value.splash.width) || !Number.isSafeInteger(value.splash.height)
    || value.splash.width < 240 || value.splash.height < 160
    || !Number.isSafeInteger(value.splash.minimumVisibleMs) || value.splash.minimumVisibleMs < 0
    || value.splash.minimumVisibleMs > 30_000
    || !/^#[0-9a-f]{6}$/iu.test(value.splash.backgroundColor)
    || !/^#[0-9a-f]{6}$/iu.test(value.splash.foregroundColor)
    || !/^#[0-9a-f]{6}$/iu.test(value.splash.mutedColor)
    || typeof value.splash.initialLabel !== "string" || typeof value.splash.readyLabel !== "string"
    || value.splash.initialLabel.trim().length === 0 || value.splash.readyLabel.trim().length === 0) {
    throw new Error("invalid Electron Shell splash policy");
  }
  return structuredClone(value);
}
