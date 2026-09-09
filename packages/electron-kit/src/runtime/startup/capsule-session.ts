import type { StandaloneShellIdentity } from "@open-design/standalone";
import type { NodePlatformResource } from "@open-design/standalone/packages";
import type { ElectronShellManifest } from "../../contracts/index.js";
import type { ElectronActivationAttempt } from "../session/activation.js";
import type { installElectronLaunchIngress } from "../session/launch-ingress.js";
import type { ElectronRuntimeLog } from "../session/logging.js";
import type { ElectronNamespacePaths } from "../session/namespace-paths.js";
import type { ElectronProcessErrorLease } from "../session/process-errors.js";
import type { ElectronStartupAttemptFence, ElectronStartupSignal } from "./attempt.js";
import type { ElectronStartupCancellationSteps, ElectronStartupQuitBarrier } from "./cancellation.js";
import type { ElectronPreflightResult } from "./preflight/index.js";

export type ElectronCapsuleCleanup = Pick<ElectronStartupCancellationSteps,
  "disposeWarmup" | "settleRendererMount" | "releaseRendererIntegration" | "releaseStandaloneAttachment">;

export type ElectronCapsuleReady = Readonly<{
  signal: ElectronStartupSignal;
  generationId: string;
  /** Non-authoritative product notifications, only after the carrier commits. */
  afterCommit?(): void | Promise<void>;
}>;

export type ElectronCapsuleStartup = Pick<ElectronStartupAttemptFence,
  "attemptId" | "phase" | "bindingDigest" | "bind" | "accepts"> & Readonly<{
    advance(signal: ElectronStartupSignal, phase: "runtime-ready" | "renderer-mounted"): void;
  }>;

/** Established carrier authority, passed in-process to one verified Capsule.
 * Capsule supplies cleanup for its owners; the carrier owns cancellation,
 * activation bookkeeping and the final process/window teardown. */
export type ElectronCapsuleSession = Readonly<{
  manifest: ElectronShellManifest;
  /** Verified composite capability; manifest.shell remains physical installation proof. */
  shell: Readonly<StandaloneShellIdentity>;
  /** Authenticated by the loader, never taken from the module exports. */
  platform: NodePlatformResource;
  presentation: "headless" | "interactive";
  namespace: string;
  paths: ElectronNamespacePaths;
  preflight: ElectronPreflightResult;
  resourceRoot: string;
  log: ElectronRuntimeLog;
  processErrors: ElectronProcessErrorLease;
  ingress: ReturnType<typeof installElectronLaunchIngress>;
  activation: Pick<ElectronActivationAttempt, "stop">;
  startup: ElectronCapsuleStartup;
  startupQuit: Omit<ElectronStartupQuitBarrier, "commit">;
  registerCleanup(steps: ElectronCapsuleCleanup): void;
}>;
