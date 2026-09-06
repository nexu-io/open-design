import type { StandaloneShellUpdaterSnapshot } from "@open-design/standalone";

export type ElectronInstallerHandoff = NonNullable<StandaloneShellUpdaterSnapshot["handoff"]>;

export type ElectronInstallerHandoffRequest = Readonly<{
  handoff: ElectronInstallerHandoff;
  /** Shell-authority identity of the immutable artifact handed to the detached helper. */
  artifactIdentity?: ElectronInstallerArtifactIdentity;
  platformTrust?: ElectronMacInstallerTrustReceipt;
  installAttemptId: string;
  nodeExecutablePath: string;
  parentPid: number;
  runtimeRoot: string;
  mode?: "execute" | "verify-only";
  timeoutMs?: number;
}>;

export type ElectronInstallerHandoffReceipt = Readonly<{
  schemaVersion: 1;
  state: "armed";
  installAttemptId: string;
  artifactPath: string;
  artifactSha256: string;
  helperPath: string;
  resultPath: string;
  mode: "execute" | "verify-only";
  parentPid: number;
}>;

export type ElectronInstallerArtifactIdentity = Readonly<{
  path: string;
  sha256: string;
  size: number;
  device: string;
  inode: string;
}>;

export type ElectronInstallerArtifactStageRequest = Readonly<{
  artifact: ElectronInstallerHandoff["artifact"];
  authorityRoot: string;
}>;

export type ElectronInstallerArtifactStageReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.installer-artifact.stage";
  sourcePath: string;
  artifact: ElectronInstallerArtifactIdentity;
  platformTrust?: ElectronMacInstallerTrustReceipt;
  lastKnownGood?: ElectronMacLastKnownGoodCaptureReceipt;
}>;

export type ElectronMacInstallerTrustExpectation = Readonly<{
  channel: string;
  releaseVersion: string;
  shell: ElectronInstallerHandoff["shell"];
  installIdentity: Readonly<{
    appId: string;
    executableName: string;
    namespace: string;
    productName: string;
  }>;
  designatedRequirement: string;
  teamIdentifier: string;
}>;

export type ElectronMacInstallerTrustObservation = Readonly<{
  provider: "macos-system" | "verify-only";
  appBundleName: string;
  bundleId: string;
  executableName: string;
  productName: string;
  designatedRequirement: string;
  teamIdentifier: string;
  codesignVerified: boolean;
  gatekeeperAssessed: boolean;
}>;

export type ElectronMacInstallerTrustReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.macos-installer.trust";
  mode: "formal" | "verify-only";
  container: ElectronInstallerArtifactIdentity;
  release: ElectronMacInstallerTrustExpectation;
  app: ElectronMacInstallerTrustObservation;
}>;

export type ElectronMacInstallerTrustVerifier = Readonly<{
  verify(input: Readonly<{
    container: ElectronInstallerArtifactIdentity;
    mode: ElectronMacInstallerTrustReceipt["mode"];
    mountRoot: string;
  }>): Promise<ElectronMacInstallerTrustObservation>;
}>;

export type ElectronInstallerClaimIdentity = Readonly<{
  bindingDigest: string;
  generationId: string;
  handoffDigest: string;
  installAttemptId: string;
  lifecycleFence: number;
  revision: number;
}>;

export type ElectronInstallerClaimSnapshot = Readonly<{
  schemaVersion: 1;
  identity: ElectronInstallerClaimIdentity;
  state: "sealed" | "armed" | "expired" | "abandoned" | "confirmed" | "consumed";
  expiresAt: string;
  artifact: ElectronInstallerArtifactIdentity;
  invocation: Readonly<{
    state: "pending" | "armed" | "failed";
    lastError?: Readonly<{ code: string; message: string; observedAt: string }>;
  }>;
  restoration?: Readonly<{
    recoveryId: string;
    phase: "intent-persisted" | "restore-prepared" | "restore-armed" | "result-observed";
    helperPid?: number;
    result?: Readonly<{
      state: "restored" | "failed";
      error?: Readonly<{ code: string; message: string }>;
    }>;
  }>;
}>;

export type ElectronInstallerRecoveryIntent =
  | Readonly<{ action: "retry-original-artifact"; recoveryId: string; expected: ElectronInstallerClaimIdentity }>
  | Readonly<{ action: "abandon-and-restore"; recoveryId: string; expected: ElectronInstallerClaimIdentity }>;

export type ElectronInstallerRecoveryRequest =
  | Readonly<{
      action: "retry-original-artifact";
      recoveryId: string;
      expected: ElectronInstallerClaimIdentity;
      installer: ElectronInstallerHandoffRequest;
    }>
  | Readonly<{
      action: "abandon-and-restore";
      recoveryId: string;
      expected: ElectronInstallerClaimIdentity;
    }>;

export type ElectronInstallerRecoveryReceipt =
  | Readonly<{
      schemaVersion: 1;
      action: "retry-original-artifact";
      recoveryId: string;
      claim: ElectronInstallerClaimIdentity;
      installer: ElectronInstallerHandoffReceipt;
    }>
  | Readonly<{
      schemaVersion: 1;
      action: "abandon-and-restore";
      recoveryId: string;
      claim: ElectronInstallerClaimIdentity;
      state: "quit-required";
      restore: ElectronMacLastKnownGoodRestoreArmedReceipt;
    }>
  | Readonly<{
      schemaVersion: 1;
      action: "abandon-and-restore";
      recoveryId: string;
      claim: ElectronInstallerClaimIdentity;
      updaterRevision: number;
      state: "restored";
      result: ElectronMacLastKnownGoodRestoreResult;
    }>;

export type ElectronInstallerConfirmationRequest = Readonly<{
  expected: ElectronInstallerClaimIdentity;
  proof: import("@open-design/standalone").StandaloneShellIdentity;
}>;

export type ElectronInstallerConfirmationReceipt = Readonly<{
  schemaVersion: 1;
  state: "consumed";
  claim: ElectronInstallerClaimIdentity;
  installAttemptId: string;
  updaterRevision: number;
}>;

export type ElectronMacLastKnownGoodTreeIdentity = Readonly<{
  path: string;
  sha256: string;
  entries: number;
  size: number;
}>;

export type ElectronMacLastKnownGoodCaptureRequest = Readonly<{
  appPath: string;
  authorityRoot: string;
  shell: import("@open-design/standalone").StandaloneShellIdentity;
  installIdentity: Readonly<{
    appId: string;
    executableName: string;
    namespace: string;
    productName: string;
  }>;
}>;

export type ElectronMacLastKnownGoodCaptureReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.macos-lkg.capture";
  source: ElectronMacLastKnownGoodTreeIdentity;
  backup: ElectronMacLastKnownGoodTreeIdentity;
  shell: import("@open-design/standalone").StandaloneShellIdentity;
  installIdentity: ElectronMacLastKnownGoodCaptureRequest["installIdentity"];
}>;

export type ElectronMacLastKnownGoodRestorePreparationRequest = Readonly<{
  capture: ElectronMacLastKnownGoodCaptureReceipt;
  claim: ElectronInstallerClaimIdentity;
  trust: ElectronMacInstallerTrustReceipt;
  recoveryId: string;
  nodeExecutablePath: string;
  parentPid: number;
  runtimeRoot: string;
  relaunchArguments: readonly string[];
  relaunch?: boolean;
  mode: "formal" | "verify-only";
}>;

export type ElectronMacLastKnownGoodRestorePreparationReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.macos-lkg.restore.prepare";
  state: "prepared";
  recoveryId: string;
  claim: ElectronInstallerClaimIdentity;
  capture: ElectronMacLastKnownGoodCaptureReceipt;
  trust: ElectronMacInstallerTrustReceipt;
  helperPath: string;
  helperSha256: string;
  inputPath: string;
  inputSha256: string;
  resultPath: string;
  lockPath: string;
  nodeExecutablePath: string;
  parentPid: number;
  mode: "formal" | "verify-only";
}>;

export type ElectronMacLastKnownGoodRestoreArmedReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.macos-lkg.restore.schedule";
  state: "armed";
  recoveryId: string;
  claim: ElectronInstallerClaimIdentity;
  preparation: ElectronMacLastKnownGoodRestorePreparationReceipt;
  helperPid: number;
}>;

export type ElectronMacLastKnownGoodRestoreResult = Readonly<{
  schemaVersion: 1;
  operation: "electron.macos-lkg.restore.result";
  recoveryId: string;
  claim: ElectronInstallerClaimIdentity;
  state: "restored" | "failed";
  restoredAppPath?: string;
  forensicAppPath?: string;
  error?: Readonly<{ code: string; message: string }>;
}>;
