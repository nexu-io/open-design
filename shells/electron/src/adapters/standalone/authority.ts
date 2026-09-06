import { join, resolve } from "node:path";

import {
  convergeSidecarLaunch,
  getSidecarStatus,
} from "@open-design/sidecar/authority";
import {
  canonicalJson,
  createStandaloneGenerationBinding,
  sha256Hex,
  StandaloneFeedbackEmitter,
  StandaloneStore,
  StandaloneUpdater,
  VersionedLauncher,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecyclePort,
  type LifecycleStatus,
  type StandaloneGenerationBinding,
  type StandaloneLifecycleTransitionResult,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeCommand,
  type StandaloneRuntimeStatus,
  type StandaloneShellUpdaterPort,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterAction,
  type UpdateActivationPolicy,
} from "@open-design/standalone";
import type {
  ElectronInstallerConfirmationReceipt,
  ElectronInstallerArtifactIdentity,
  ElectronInstallerHandoffReceipt,
  ElectronInstallerHandoffRequest,
  ElectronMacInstallerTrustReceipt,
  ElectronMacLastKnownGoodCaptureReceipt,
  ElectronInstallerRecoveryReceipt,
  ElectronShellManifest,
  ElectronStandaloneAuthorityFactory,
} from "@open-design/electron-kit/runtime";
import {
  createMacSystemInstallerTrustVerifier,
  captureMacElectronLastKnownGood,
  prepareMacElectronLastKnownGoodRestore,
  readMacElectronLastKnownGoodRestoreResult,
  scheduleMacElectronLastKnownGoodRestore,
  verifyElectronInstallerArtifact,
  verifyMacElectronInstallerTrust,
  type ElectronMacLastKnownGoodRestoreArmedReceipt,
  type ElectronMacLastKnownGoodRestorePreparationReceipt,
  type ElectronMacLastKnownGoodRestorePreparationRequest,
  type ElectronMacLastKnownGoodRestoreResult,
} from "@open-design/electron-kit/installation";

import { ElectronStandaloneControlClient, createElectronStandaloneControlTransport } from "./control-client.js";
import { ElectronStandaloneControlUpdater } from "./control-updater.js";
import { ELECTRON_STANDALONE_HOST_CONFIG_ENV } from "./host.js";
import {
  loadElectronStandaloneInstallation,
  resolveElectronStandaloneTarget,
} from "./installation.js";
import {
  bindElectronPhysicalResourceSet,
  validateElectronPhysicalResourceSet,
  type ElectronPhysicalResourceSetDeclaration,
} from "./physical-resources.js";
import { withElectronPhysicalResourceSetGuard } from "./guarded-lifecycle.js";
import { ElectronStandaloneHostLifecycle } from "./host-lifecycle.js";
import { ElectronStandaloneLifecycleLedger } from "./lifecycle-ledger.js";
import {
  assertElectronInstallerClaimIdentity,
  electronInstallerClaimIdentity,
  electronInstallerClaimSnapshot,
  electronInstallerHandoffDigest,
  ElectronStandaloneInstallerClaimLedger,
  validateElectronInstallerReceiptForRequest,
} from "./installer-claim.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";
import { ElectronReleaseExactFeed } from "./release-feed.js";
import { serializeInstallerRecoveryIntent } from "../updater/installer-recovery.js";

type HostStatus = Readonly<{
  control: "ready";
  generationPid: number;
  hostPid: number;
  hostSha256: string;
  layout: Readonly<{ dataRoot: string; logsRoot: string; resourceStoreRoot: string; runtimeRoot: string; sidecarSupervisorPath: string }>;
  supervisorSha256: string;
  dataRoot: string;
  runtimeRoot: string;
  resourceRoot: string;
  shell: ElectronShellManifest["shell"];
}>;

export function isElectronStandaloneScope(manifest: ElectronShellManifest, scope: Readonly<{ channel: string; namespace: string }>): boolean {
  return scope.channel === manifest.channel
    && (scope.namespace === manifest.namespace || scope.namespace === `${manifest.namespace}-headless`);
}

function projectRuntimeStatus(status: Awaited<ReturnType<ElectronStandaloneControlClient["status"]>>, bindingDigest: string, generationId: string): StandaloneRuntimeStatus {
  return Object.freeze({
    bindingDigest,
    generationId,
    instanceId: status.instanceId ?? `stopped-${status.fence}`,
    references: status.references,
    state: status.state,
  });
}

function exactHostStatus(value: unknown, expected: Omit<HostStatus, "control" | "generationPid" | "hostPid">): value is HostStatus {
  if (value == null || typeof value !== "object") return false;
  const status = value as Partial<HostStatus>;
  return status.control === "ready"
    && Number.isSafeInteger(status.generationPid)
    && Number.isSafeInteger(status.hostPid)
    && status.hostSha256 === expected.hostSha256
    && canonicalJson(status.layout) === canonicalJson(expected.layout)
    && status.supervisorSha256 === expected.supervisorSha256
    && status.dataRoot === expected.dataRoot
    && status.runtimeRoot === expected.runtimeRoot
    && status.resourceRoot === expected.resourceRoot
    && canonicalJson(status.shell) === canonicalJson(expected.shell);
}

function hostHasNoLogicalReferences(value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  const lifecycle = (value as { lifecycle?: unknown }).lifecycle;
  return lifecycle != null
    && typeof lifecycle === "object"
    && (lifecycle as { references?: unknown }).references === 0;
}

function installerInvocationError(error: unknown): Readonly<{ code: string; message: string; observedAt: string }> {
  const candidate = error as { code?: unknown };
  return Object.freeze({
    code: typeof candidate?.code === "string" && candidate.code.length > 0 ? candidate.code : "electron-installer-invocation-failed",
    message: error instanceof Error ? error.message : String(error),
    observedAt: new Date().toISOString(),
  });
}

function stagedArtifactIdentity(request: Readonly<{ handoff: { artifact: Readonly<{
  path: string; sha256: string; size: number; device?: string; inode?: string;
}> } }>): ElectronInstallerArtifactIdentity {
  const artifact = request.handoff.artifact;
  if (artifact.device == null || artifact.inode == null) throw new Error("Electron installer handoff lacks its staged artifact identity");
  return Object.freeze({ path: artifact.path, sha256: artifact.sha256, size: artifact.size, device: artifact.device, inode: artifact.inode });
}

type VerifyInstallerPlatformTrust = (input: Readonly<{
  artifact: ElectronInstallerArtifactIdentity;
  handoff: ElectronInstallerHandoffRequest["handoff"];
  manifest: ElectronShellManifest;
  runtimeRoot: string;
}>) => Promise<ElectronMacInstallerTrustReceipt>;

type CaptureInstallerLastKnownGood = (input: Readonly<{
  appPath: string;
  authorityRoot: string;
  shell: StandaloneShellIdentity;
  installIdentity: Readonly<{ appId: string; executableName: string; namespace: string; productName: string }>;
}>) => Promise<ElectronMacLastKnownGoodCaptureReceipt>;

type PrepareInstallerLastKnownGoodRestore = (input: ElectronMacLastKnownGoodRestorePreparationRequest) => Promise<ElectronMacLastKnownGoodRestorePreparationReceipt>;
type ScheduleInstallerLastKnownGoodRestore = (input: ElectronMacLastKnownGoodRestorePreparationReceipt) => Promise<ElectronMacLastKnownGoodRestoreArmedReceipt>;
type ReadInstallerLastKnownGoodRestoreResult = (input: ElectronMacLastKnownGoodRestorePreparationReceipt) => Promise<ElectronMacLastKnownGoodRestoreResult | null>;

const verifyInstallerPlatformTrust: VerifyInstallerPlatformTrust = async ({ artifact, handoff, manifest, runtimeRoot }) => {
  const trust = handoff.platformTrust;
  if (!handoff.target.startsWith("darwin-") || trust?.platform !== "macos") throw new Error("Electron installer handoff lacks signed macOS trust identity");
  if (trust.mode === "verify-only" && process.env.ELECTRON_KIT_FIXTURE_INSTALLER_VERIFY_ONLY !== "1") {
    throw new Error("Electron installer verify-only trust is restricted to explicit local fixtures");
  }
  return await verifyMacElectronInstallerTrust({
    container: artifact,
    expectation: {
      channel: manifest.channel,
      releaseVersion: handoff.releaseVersion,
      shell: handoff.shell,
      installIdentity: { appId: manifest.appId, executableName: manifest.executableName, namespace: manifest.namespace, productName: manifest.productName },
      designatedRequirement: trust.designatedRequirement,
      teamIdentifier: trust.teamIdentifier,
    },
    mode: trust.mode,
    mountRoot: join(resolve(runtimeRoot), "installer", "mounts", handoff.releaseVersion),
    verifier: createMacSystemInstallerTrustVerifier(),
  });
};

export function createElectronStandaloneAuthorityFactory(
  manifest: ElectronShellManifest,
  resourcesInput: ElectronPhysicalResourceSetDeclaration,
  options: Readonly<{
    verifyInstallerPlatformTrust?: VerifyInstallerPlatformTrust;
    captureInstallerLastKnownGood?: CaptureInstallerLastKnownGood;
    prepareInstallerLastKnownGoodRestore?: PrepareInstallerLastKnownGoodRestore;
    scheduleInstallerLastKnownGoodRestore?: ScheduleInstallerLastKnownGoodRestore;
    readInstallerLastKnownGoodRestoreResult?: ReadInstallerLastKnownGoodRestoreResult;
    channelHeadUrl?: string;
  }> = {},
): ElectronStandaloneAuthorityFactory {
  const resources = validateElectronPhysicalResourceSet(resourcesInput);
  const runtimeResource = resources.resources.find(({ id }) => id === "standalone-runtime");
  if (runtimeResource == null) throw new Error("Electron physical resource set lacks standalone-runtime");
  return ({ installedShellPath, namespaceRoot, officialNodeExecutablePath, observeFeedback, resourceRoot, runtimeRoot }) => ({
    async prepare(request) {
      if (!isElectronStandaloneScope(manifest, request.scope)) throw new Error("Electron Standalone authority request escaped its Shell scope");
      if (canonicalJson(request.shell) !== canonicalJson(manifest.shell)) throw new Error("Electron Standalone authority request escaped its Shell identity");
      const installation = await loadElectronStandaloneInstallation({ resourceRoot, channel: request.scope.channel, target: resolveElectronStandaloneTarget() });
      const channelHeadUrl = options.channelHeadUrl ?? installation.declaration.update.channelHeadUrl;
      const storeRoot = join(runtimeRoot, "standalone-store");
      const sidecarRuntimeRoot = join(runtimeRoot, "standalone-sidecar");
      const layout = Object.freeze({
        dataRoot: join(namespaceRoot, "data", "product"),
        logsRoot: join(namespaceRoot, "logs", "product"),
        resourceStoreRoot: storeRoot,
        runtimeRoot: join(namespaceRoot, "runtime", "product"),
        sidecarSupervisorPath: installation.supervisorPath,
      });
      const store = new StandaloneStore(storeRoot, request.scope);
      const feedback = new StandaloneFeedbackEmitter(request.correlationId, request.scope, observeFeedback);
      const installedGenerationId = sha256Hex(canonicalJson(installation.envelope.metadata));
      let state = await store.readState();
      if (state.activationAttempt != null) {
        await store.recoverInterruptedAttempt();
        state = await store.readState();
      }
      if (state.active == null) {
        if (state.prepared == null) {
          await store.prepare(installation.envelope, installation.trustedKeys, { candidates: installation.candidates, feedback: observeFeedback });
          state = await store.readState();
        }
        if (state.prepared !== installedGenerationId) throw new Error("Electron Standalone cold start cannot authorize a generation outside its installed seed");
        if (state.activationIntent?.generationId !== state.prepared) {
          await store.authorizePrepared(state.prepared, "silent", "installed-seed", state.revision);
          state = await store.readState();
        }
        await store.activatePrepared(state.prepared!, request.shell, state.revision);
      }
      const generation = await store.activeGeneration();
      const binding = createStandaloneGenerationBinding(generation, request.scope);
      const hostExpected = Object.freeze({
        hostSha256: installation.declaration.host.sha256,
        layout,
        supervisorSha256: installation.declaration.supervisor.sha256,
        supervisorPath: installation.supervisorPath,
        dataRoot: storeRoot,
        runtimeRoot: sidecarRuntimeRoot,
        resourceRoot: resolve(resourceRoot),
        shell: request.shell,
      });
      const hostConfig = Object.freeze({
        schemaVersion: 1,
        scope: request.scope,
        storeRoot,
        runtimeRoot: sidecarRuntimeRoot,
        resourceRoot: resolve(resourceRoot),
        hostPath: installation.hostPath,
        hostSha256: hostExpected.hostSha256,
        layout,
        supervisorPath: installation.supervisorPath,
        supervisorSha256: hostExpected.supervisorSha256,
        shell: request.shell,
        channelHeadUrl,
      });
      const launchHost = async (nextBinding: StandaloneGenerationBinding) => {
        const resourceSet = bindElectronPhysicalResourceSet(resources, nextBinding);
        const stamp = resourceSet.resources.find(({ id }) => id === runtimeResource.id)!.stamp;
        const converged = await convergeSidecarLaunch({
          args: [installation.hostPath],
          command: officialNodeExecutablePath,
          cwd: resourceRoot,
          env: { ...process.env, [ELECTRON_STANDALONE_HOST_CONFIG_ENV]: JSON.stringify(hostConfig) },
          resources: { dataRoot: storeRoot, ownerPid: null, port: 0, runtimeRoot: sidecarRuntimeRoot },
          stamp,
        });
        const status = await getSidecarStatus<unknown>(stamp, { generationPid: converged.description.resources.pid });
        if (!exactHostStatus(status, hostExpected)) throw new Error("Electron Standalone Sidecar host escaped its installed launch contract");
        const transport = createElectronStandaloneControlTransport(stamp);
        return Object.freeze({
          binding: nextBinding,
          lifecycle: new ElectronStandaloneControlClient(request.scope, transport),
          resourceSet,
          stamp,
          updater: new ElectronStandaloneControlUpdater(request.shell.type, request.scope, transport),
        });
      };
      const initialResourceSet = bindElectronPhysicalResourceSet(resources, binding);
      const initialStamp = initialResourceSet.resources.find(({ id }) => id === runtimeResource.id)!.stamp;
      let activeHost!: Awaited<ReturnType<typeof launchHost>>;
      await withElectronPhysicalResourceSetGuard(initialResourceSet, async (guard) => {
        const existing = await getSidecarStatus<unknown>(initialStamp, { timeoutMs: 500 }).catch(() => null);
        // A fossil host deliberately keeps its first launcher selection for
        // its entire process lifetime. Once it has no logical references it
        // must be retired before a later cold start, otherwise a newly
        // installed generation can never be selected in this namespace.
        if (existing != null && (!exactHostStatus(existing, hostExpected) || hostHasNoLogicalReferences(existing))) await guard.retire();
        activeHost = await launchHost(binding);
      });
      feedback.emit({ phase: "generation-prepared", state: "complete", generationId: generation.id });
      let activeGeneration = generation;
      let activeAttachment: LifecycleAttachment | null = null;
      let sealedRuntimeStatus: StandaloneRuntimeStatus | null = null;
      const updater: StandaloneShellUpdaterPort = Object.freeze({
        shellType: request.shell.type,
        readSnapshot: () => activeHost.updater.readSnapshot(),
        waitForChange: (afterRevision: number, timeoutMs: number) => activeHost.updater.waitForChange(afterRevision, timeoutMs),
        invoke: (action: StandaloneShellUpdaterAction["id"]) => activeHost.updater.invoke(action),
        confirmInstalled: (proof: StandaloneShellIdentity) => activeHost.updater.confirmInstalled(proof),
      });
      const content = new StandaloneUpdater(
        request.scope.channel,
        "content",
        request.shell,
        installation.trustedKeys,
        store,
        new ElectronReleaseExactFeed({
          cacheRoot: storeRoot,
          channel: request.scope.channel,
          channelHeadUrl,
          currentReleaseVersion: installation.declaration.releaseVersion,
          shell: request.shell,
          target: installation.declaration.target,
          trustedKeys: installation.trustedKeys,
        }),
        observeFeedback,
      );
      const updaterLedger = new ElectronStandaloneShellUpdaterLedger(storeRoot, request.scope, request.shell.type);
      const lifecycleLedger = new ElectronStandaloneLifecycleLedger(storeRoot, request.scope);
      const installerClaimLedger = new ElectronStandaloneInstallerClaimLedger(storeRoot, request.scope);
      return Object.freeze({
        binding,
        generation,
        updater,
        async readShellInstallationClaim() {
          const claim = await installerClaimLedger.read();
          return claim == null ? null : electronInstallerClaimSnapshot(claim);
        },
        async confirmShellInstallation(confirmationRequest) {
          return await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => {
            let claim = await installerClaimLedger.read();
            if (claim == null) throw new Error("Electron replacement Shell cannot confirm a missing installer claim");
            assertElectronInstallerClaimIdentity(claim, confirmationRequest.expected);
            if ((claim.state === "sealed" || claim.state === "armed") && Date.now() >= Date.parse(claim.expiresAt)) {
              const expiredClaim = Object.freeze({ ...claim, revision: claim.revision + 1, state: "expired" as const });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), expiredClaim);
              throw new Error("Electron replacement Shell cannot confirm an expired installer claim");
            }
            if (claim.state !== "armed" && claim.state !== "confirmed" && claim.state !== "consumed") {
              throw new Error("Electron replacement Shell installer claim is not armed");
            }
            const snapshot = await updaterLedger.read();
            if ((snapshot.state !== "applying" && snapshot.state !== "handed-off" && snapshot.state !== "installed")
              || snapshot.installAttemptId !== claim.installAttemptId || snapshot.handoff == null
              || electronInstallerHandoffDigest({ handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId }) !== claim.handoffDigest) {
              throw new Error("Electron replacement confirmation differs from the durable updater transition");
            }
            const expectedShell = snapshot.handoff.shell;
            const proof = confirmationRequest.proof;
            if (canonicalJson(proof) !== canonicalJson(request.shell)
              || proof.type !== expectedShell.type || proof.version !== expectedShell.version || proof.buildHash !== expectedShell.buildHash
              || claim.receipt?.installAttemptId !== claim.installAttemptId || claim.receipt.artifactPath !== claim.artifact.path
              || claim.receipt.artifactSha256 !== claim.artifact.sha256) {
              throw new Error("Electron replacement Shell proof differs from the armed installer claim");
            }
            const lifecycleState = await lifecycleLedger.readOrInitial();
            if (lifecycleState.transition != null) {
              if (lifecycleState.transition.kind !== "shell-install" || lifecycleState.transition.phase !== "stopped-sealed"
                || lifecycleState.transition.token !== claim.installAttemptId || lifecycleState.transition.fence !== claim.lifecycleFence) {
                throw new Error("Electron replacement confirmation lifecycle fence differs from its claim");
              }
            } else if (claim.state !== "confirmed" && claim.state !== "consumed") {
              throw new Error("Electron replacement confirmation lacks its sealed lifecycle transition");
            } else if (lifecycleState.state !== "stopped" || lifecycleState.attachments.length !== 0) {
              throw new Error("Electron replacement confirmation cannot prove its sealed lifecycle was consumed");
            }
            if (claim.state === "consumed" && snapshot.state === "installed") return claim.confirmation!.receipt!;

            if (claim.state === "armed") {
              const confirmedClaim = Object.freeze({
                ...claim,
                revision: claim.revision + 1,
                state: "confirmed" as const,
                confirmation: Object.freeze({ proof: structuredClone(proof) }),
              });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), confirmedClaim);
              claim = confirmedClaim;
            } else if (canonicalJson(claim.confirmation?.proof) !== canonicalJson(proof)) {
              throw new Error("Electron replacement confirmation proof changed after claim confirmation");
            }

            await guard.retire();
            if (lifecycleState.transition != null) {
              const continuation = new ElectronStandaloneHostLifecycle(request.scope, { statePort: lifecycleLedger });
              await continuation.confirmStoppedShellInstall(claim.installAttemptId, claim.lifecycleFence);
            }

            let confirmationReceipt = claim.confirmation?.receipt;
            if (claim.state !== "consumed") {
              const nextIdentity = Object.freeze({ ...electronInstallerClaimIdentity(claim), revision: claim.revision + 1 });
              confirmationReceipt = Object.freeze({
                schemaVersion: 1,
                state: "consumed",
                claim: nextIdentity,
                installAttemptId: claim.installAttemptId,
                updaterRevision: snapshot.state === "installed" ? snapshot.revision : snapshot.revision + 1,
              }) satisfies ElectronInstallerConfirmationReceipt;
              const consumedClaim = Object.freeze({
                ...claim,
                revision: nextIdentity.revision,
                state: "consumed" as const,
                confirmation: Object.freeze({ proof: structuredClone(proof), receipt: confirmationReceipt }),
              });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), consumedClaim);
              claim = consumedClaim;
            }
            if (snapshot.state !== "installed") {
              await updaterLedger.update({ expectedRevision: snapshot.revision, state: "installed" });
            }
            activeHost = await launchHost(activeHost.binding);
            return confirmationReceipt!;
          });
        },
        async armShellInstallation({ install, request: installationRequest }) {
          const artifactIdentity = stagedArtifactIdentity(installationRequest);
          await verifyElectronInstallerArtifact(artifactIdentity);
          const handoffDigest = electronInstallerHandoffDigest(installationRequest);
          const snapshot = await updaterLedger.read();
          if ((snapshot.state !== "applying" && snapshot.state !== "handed-off")
            || snapshot.installAttemptId !== installationRequest.installAttemptId
            || canonicalJson(snapshot.handoff) !== canonicalJson(installationRequest.handoff)) {
            throw new Error("Electron installer handoff differs from the durable updater transition");
          }
          return await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => {
            const guardedSnapshot = await updaterLedger.read();
            if ((guardedSnapshot.state !== "applying" && guardedSnapshot.state !== "handed-off")
              || guardedSnapshot.installAttemptId !== installationRequest.installAttemptId
              || canonicalJson(guardedSnapshot.handoff) !== canonicalJson(installationRequest.handoff)) {
              throw new Error("Electron installer handoff changed before its guarded continuation");
            }
            const persisted = await installerClaimLedger.read();
            const superseded = persisted?.state === "abandoned" || persisted?.state === "consumed" ? persisted : null;
            let existing = superseded == null ? persisted : null;
            if (existing != null && (existing.bindingDigest !== activeHost.binding.digest
              || existing.generationId !== activeGeneration.id
              || existing.installAttemptId !== installationRequest.installAttemptId
              || existing.handoffDigest !== handoffDigest
              || existing.runtimeRoot !== resolve(installationRequest.runtimeRoot))) {
              throw new Error("Electron installer claim differs from the guarded continuation");
            }
            if (existing != null && (existing.state === "sealed" || existing.state === "armed") && Date.now() >= Date.parse(existing.expiresAt)) {
              const expiredClaim = Object.freeze({ ...existing, revision: existing.revision + 1, state: "expired" as const });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(existing), expiredClaim);
              existing = expiredClaim;
            }
            if (existing?.state === "armed") {
              if (guardedSnapshot.state === "applying") await updaterLedger.update({ expectedRevision: guardedSnapshot.revision, state: "handed-off" });
              return existing.receipt!;
            }
            if (existing != null) throw new Error("Electron installer claim requires explicit recovery");

            const platformTrust = await (options.verifyInstallerPlatformTrust ?? verifyInstallerPlatformTrust)({
              artifact: artifactIdentity,
              handoff: installationRequest.handoff,
              manifest,
              runtimeRoot: installationRequest.runtimeRoot,
            });
            if (installedShellPath == null) throw new Error("Electron installer cannot capture LKG without the installed Shell path");
            const lastKnownGood = await (options.captureInstallerLastKnownGood ?? captureMacElectronLastKnownGood)({
              appPath: resolve(installedShellPath),
              authorityRoot: storeRoot,
              shell: request.shell,
              installIdentity: { appId: manifest.appId, executableName: manifest.executableName, namespace: manifest.namespace, productName: manifest.productName },
            });
            const exactInstallationRequest = Object.freeze({ ...installationRequest, artifactIdentity, platformTrust });

            const retirement = await guard.retire();
            const continuation = new ElectronStandaloneHostLifecycle(request.scope, { statePort: lifecycleLedger });
            const transition = await continuation.beginTransition("shell-install", {
              attemptId: installationRequest.installAttemptId,
              ownerShellType: request.shell.type,
              force: true,
            });
            if (transition.state !== "acquired") throw new Error("Electron installer lifecycle transition is unavailable after physical retirement");
            const sealed = await continuation.forceStopTransition(transition.transition.token, transition.transition.fence);
            if (sealed.phase !== "stopped-sealed" || sealed.attemptId !== installationRequest.installAttemptId) throw new Error("Electron installer lifecycle transition was not sealed");
            sealedRuntimeStatus = Object.freeze({
              bindingDigest: activeHost.binding.digest,
              generationId: activeGeneration.id,
              instanceId: `stopped-${sealed.fence}`,
              references: 0,
              state: "stopped" as const,
            });
            activeAttachment = null;
            const sealedClaim = existing ?? Object.freeze({
              schemaVersion: 1 as const,
              revision: superseded == null ? 0 : superseded.revision + 1,
              state: "sealed" as const,
              bindingDigest: activeHost.binding.digest,
              generationId: activeGeneration.id,
              installAttemptId: installationRequest.installAttemptId,
              handoffDigest,
              runtimeRoot: resolve(installationRequest.runtimeRoot),
              lifecycleFence: sealed.fence,
              createdAt: new Date().toISOString(),
              expiresAt: sealed.expiresAt,
              artifact: artifactIdentity,
              platformTrust,
              lastKnownGood,
              invocation: Object.freeze({ state: "pending" as const }),
              retirement,
            });
            if (existing == null) await installerClaimLedger.compareAndSet(superseded == null ? null : electronInstallerClaimIdentity(superseded), sealedClaim);
            let receipt: Awaited<ReturnType<typeof install>>;
            try {
              receipt = validateElectronInstallerReceiptForRequest(await install(exactInstallationRequest), exactInstallationRequest);
            } catch (error) {
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(sealedClaim), Object.freeze({
                ...sealedClaim,
                revision: sealedClaim.revision + 1,
                invocation: Object.freeze({ state: "failed" as const, lastError: installerInvocationError(error) }),
              }));
              throw error;
            }
            await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(sealedClaim), Object.freeze({
              ...sealedClaim,
              revision: sealedClaim.revision + 1,
              state: "armed" as const,
              invocation: Object.freeze({ state: "armed" as const }),
              receipt,
            }));
            const current = await updaterLedger.read();
            if (current.state === "applying") await updaterLedger.update({ expectedRevision: current.revision, state: "handed-off" });
            else if (current.state !== "handed-off") throw new Error("Electron updater escaped its installer handoff transition");
            return receipt;
          });
        },
        async recoverShellInstallation({ install, request: recoveryRequest }) {
          return await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => {
            let claim = await installerClaimLedger.read();
            if (claim == null) throw new Error("Electron installer recovery claim is unavailable");
            if (claim.recovery?.recoveryId === recoveryRequest.recoveryId) {
              if (claim.recovery.receipt.action !== recoveryRequest.action) throw new Error("Electron installer recovery id was reused for another action");
              if (canonicalJson(claim.recovery.expected) !== canonicalJson(recoveryRequest.expected)) throw new Error("Electron installer recovery id has a different expected claim");
              return claim.recovery.receipt;
            }
            if (claim.restoration != null) {
              if (recoveryRequest.action !== "abandon-and-restore" || claim.restoration.recoveryId !== recoveryRequest.recoveryId
                || canonicalJson(claim.restoration.expected) !== canonicalJson(recoveryRequest.expected)) {
                throw new Error("Electron installer claim has another restoration in progress");
              }
            } else {
              assertElectronInstallerClaimIdentity(claim, recoveryRequest.expected);
            }
            if (claim.restoration == null && (claim.state === "sealed" || claim.state === "armed") && Date.now() >= Date.parse(claim.expiresAt)) {
              const expiredClaim = Object.freeze({ ...claim, revision: claim.revision + 1, state: "expired" as const });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), expiredClaim);
              claim = expiredClaim;
            }
            if (claim.state !== "sealed" && claim.state !== "expired") throw new Error("Electron installer claim is not recoverable");
            const snapshot = await updaterLedger.read();
            const updaterContinuesRestoration = claim.restoration != null && snapshot.state === "failed"
              && snapshot.error?.code === "electron-installer-abandoned";
            if ((!updaterContinuesRestoration && snapshot.state !== "applying" && snapshot.state !== "handed-off")
              || snapshot.installAttemptId !== claim.installAttemptId || snapshot.handoff == null
              || electronInstallerHandoffDigest({ handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId }) !== claim.handoffDigest) {
              throw new Error("Electron installer recovery differs from the durable updater transition");
            }
            // prepare() may need a control-only Sidecar host to inspect the
            // durable updater state. No recovery side effect may overlap that
            // host (or any sibling resource in the bound set): retire and
            // verify the complete set while retaining this same guard.
            await guard.retire();

            if (recoveryRequest.action === "retry-original-artifact") {
                const installerRequest = recoveryRequest.installer;
                const artifactIdentity = stagedArtifactIdentity(installerRequest);
              let installerReceipt: ElectronInstallerHandoffReceipt;
              try {
                if (install == null) throw new Error("Electron installer retry requires an installer handler");
                if (installerRequest.installAttemptId !== claim.installAttemptId
                  || resolve(installerRequest.runtimeRoot) !== claim.runtimeRoot
                  || electronInstallerHandoffDigest(installerRequest) !== claim.handoffDigest
                  || installerRequest.handoff.artifact.path !== claim.artifact.path
                  || installerRequest.handoff.artifact.sha256 !== claim.artifact.sha256
                  || installerRequest.handoff.artifact.size !== claim.artifact.size) {
                  throw new Error("Electron installer retry changed the original handoff");
                }
                if (canonicalJson(artifactIdentity) !== canonicalJson(claim.artifact)) throw new Error("Electron installer retry original artifact identity mismatch");
                await verifyElectronInstallerArtifact(claim.artifact);
                const platformTrust = await (options.verifyInstallerPlatformTrust ?? verifyInstallerPlatformTrust)({
                  artifact: claim.artifact,
                  handoff: installerRequest.handoff,
                  manifest,
                  runtimeRoot: installerRequest.runtimeRoot,
                });
                if (claim.platformTrust == null || canonicalJson(platformTrust) !== canonicalJson(claim.platformTrust)) {
                  throw new Error("Electron installer retry platform trust differs from the original handoff");
                }
                const exactInstallerRequest = Object.freeze({ ...installerRequest, artifactIdentity: claim.artifact, platformTrust });
                installerReceipt = validateElectronInstallerReceiptForRequest(await install(exactInstallerRequest), exactInstallerRequest);
              } catch (error) {
                await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), Object.freeze({
                  ...claim,
                  revision: claim.revision + 1,
                  invocation: Object.freeze({ state: "failed" as const, lastError: installerInvocationError(error) }),
                }));
                throw error;
              }
              const nextIdentity = Object.freeze({ ...electronInstallerClaimIdentity(claim), revision: claim.revision + 1 });
              const recoveryReceipt: ElectronInstallerRecoveryReceipt = Object.freeze({
                schemaVersion: 1,
                action: "retry-original-artifact",
                recoveryId: recoveryRequest.recoveryId,
                claim: nextIdentity,
                installer: installerReceipt,
              });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), Object.freeze({
                ...claim,
                revision: nextIdentity.revision,
                state: "armed" as const,
                expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
                invocation: Object.freeze({ state: "armed" as const }),
                receipt: installerReceipt,
                recovery: Object.freeze({ recoveryId: recoveryRequest.recoveryId, expected: recoveryRequest.expected, receipt: recoveryReceipt }),
              }));
              if (snapshot.state === "applying") await updaterLedger.update({ expectedRevision: snapshot.revision, state: "handed-off" });
              return recoveryReceipt;
            }

            if (claim.lastKnownGood == null || claim.platformTrust == null) {
              throw new Error("Electron installer abandon cannot restore without its LKG and platform trust receipts");
            }
            const restoreCapture = claim.lastKnownGood;
            const restoreTrust = claim.platformTrust;
            let scheduledThisInvocation = false;
            let preparedThisInvocation = false;
            if (claim.restoration == null) {
              const next = Object.freeze({
                ...claim,
                revision: claim.revision + 1,
                restoration: Object.freeze({ recoveryId: recoveryRequest.recoveryId, expected: structuredClone(recoveryRequest.expected), phase: "intent-persisted" as const }),
              });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), next);
              claim = next;
            }
            if (claim.restoration!.phase === "intent-persisted") {
              const preparation = await (options.prepareInstallerLastKnownGoodRestore ?? prepareMacElectronLastKnownGoodRestore)({
                capture: restoreCapture,
                claim: claim.restoration!.expected,
                trust: restoreTrust,
                recoveryId: claim.restoration!.recoveryId,
                nodeExecutablePath: officialNodeExecutablePath,
                parentPid: process.pid,
                runtimeRoot: claim.runtimeRoot,
                relaunchArguments: serializeInstallerRecoveryIntent({ action: "abandon-and-restore", recoveryId: claim.restoration!.recoveryId, expected: claim.restoration!.expected }),
                mode: restoreTrust.mode,
              });
              const next = Object.freeze({
                ...claim,
                revision: claim.revision + 1,
                restoration: Object.freeze({ ...claim.restoration!, phase: "restore-prepared" as const, preparation }),
              });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), next);
              claim = next;
              preparedThisInvocation = true;
            }
            if (claim.restoration!.phase === "restore-prepared") {
              const existingResult = preparedThisInvocation ? null
                : await (options.readInstallerLastKnownGoodRestoreResult ?? readMacElectronLastKnownGoodRestoreResult)(claim.restoration!.preparation!);
              if (existingResult != null) {
                const next = Object.freeze({
                  ...claim,
                  revision: claim.revision + 1,
                  restoration: Object.freeze({ ...claim.restoration!, phase: "result-observed" as const, result: existingResult }),
                });
                await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), next);
                claim = next;
              } else {
                const armed = await (options.scheduleInstallerLastKnownGoodRestore ?? scheduleMacElectronLastKnownGoodRestore)(claim.restoration!.preparation!);
                const next = Object.freeze({
                  ...claim,
                  revision: claim.revision + 1,
                  restoration: Object.freeze({ ...claim.restoration!, phase: "restore-armed" as const, armed }),
                });
                await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), next);
                claim = next;
                scheduledThisInvocation = true;
              }
            }
            if (claim.restoration!.phase === "restore-armed") {
              if (scheduledThisInvocation) {
                return Object.freeze({ schemaVersion: 1, action: "abandon-and-restore", recoveryId: claim.restoration!.recoveryId,
                  claim: electronInstallerClaimIdentity(claim), state: "quit-required", restore: claim.restoration!.armed! });
              }
              const result = await (options.readInstallerLastKnownGoodRestoreResult ?? readMacElectronLastKnownGoodRestoreResult)(claim.restoration!.preparation!);
              if (result == null) throw new Error("Electron installer LKG restore is armed but has no durable result");
              const next = Object.freeze({
                ...claim,
                revision: claim.revision + 1,
                restoration: Object.freeze({ ...claim.restoration!, phase: "result-observed" as const, result }),
              });
              await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), next);
              claim = next;
            }
            const restoreResult = claim.restoration!.result;
            if (restoreResult?.state !== "restored") {
              const failure = restoreResult?.error;
              throw new Error(`Electron installer LKG restore failed${failure == null ? "" : `: ${failure.code}: ${failure.message}`}`);
            }

            const lifecycleState = await lifecycleLedger.readOrInitial();
            if (lifecycleState.transition != null) {
              if (lifecycleState.transition.kind !== "shell-install" || lifecycleState.transition.phase !== "stopped-sealed"
                || lifecycleState.transition.token !== claim.installAttemptId || lifecycleState.transition.fence !== claim.lifecycleFence) {
                throw new Error("Electron installer recovery lifecycle fence differs from its claim");
              }
              const continuation = new ElectronStandaloneHostLifecycle(request.scope, { statePort: lifecycleLedger });
              await continuation.abandonStoppedTransition(claim.installAttemptId, claim.lifecycleFence);
            } else {
              if (lifecycleState.state !== "stopped" || lifecycleState.attachments.length !== 0) {
                throw new Error("Electron installer abandon cannot prove the sealed lifecycle was restored");
              }
            }
            activeHost = await launchHost(activeHost.binding);
            const failed = snapshot.state === "failed" ? snapshot : await updaterLedger.update({
              expectedRevision: snapshot.revision,
              state: "failed",
              error: { code: "electron-installer-abandoned", message: "Installer recovery restored the exact last-known-good Shell" },
            });
            const nextIdentity = Object.freeze({ ...electronInstallerClaimIdentity(claim), revision: claim.revision + 1 });
            const recoveryReceipt: ElectronInstallerRecoveryReceipt = Object.freeze({
              schemaVersion: 1,
              action: "abandon-and-restore",
              recoveryId: recoveryRequest.recoveryId,
              claim: nextIdentity,
              updaterRevision: failed.revision,
              state: "restored",
              result: restoreResult,
            });
            const { receipt: _installerReceipt, ...claimWithoutInstallerReceipt } = claim;
            await installerClaimLedger.compareAndSet(electronInstallerClaimIdentity(claim), Object.freeze({
              ...claimWithoutInstallerReceipt,
              revision: nextIdentity.revision,
              state: "abandoned" as const,
              recovery: Object.freeze({ recoveryId: recoveryRequest.recoveryId, expected: recoveryRequest.expected, receipt: recoveryReceipt }),
            }));
            return recoveryReceipt;
          });
        },
        contentUpdater: Object.freeze({
          prepareLatest: (activationPolicy: UpdateActivationPolicy) => content.prepareLatest(activationPolicy),
          async applyNow(options = {}) {
            const attachment = activeAttachment;
            if (attachment == null) throw new Error("Electron content update requires an active runtime attachment");
            return await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => {
              const continuation = new ElectronStandaloneHostLifecycle(request.scope, { statePort: lifecycleLedger });
              let nextHost = activeHost;
              let attemptedResourceSet: ReturnType<typeof bindElectronPhysicalResourceSet> | null = null;
              let retired = false;
              const lifecycle: LifecyclePort = {
                start: async () => { throw new Error("Electron guarded content restart cannot perform an unbound start"); },
                awaitReady: async (scope, readiness) => await nextHost.lifecycle.awaitReady(scope, readiness),
                heartbeat: async (scope, owner) => await nextHost.lifecycle.heartbeat(scope, owner),
                release: async (scope, attachmentId) => await nextHost.lifecycle.release(scope, attachmentId),
                status: async () => await continuation.status(),
                stop: async (_scope, fence) => await continuation.stop(fence),
                beginTransition: async (_scope, kind, transitionOptions): Promise<StandaloneLifecycleTransitionResult> => {
                  const acquired = await continuation.beginTransition(kind, transitionOptions);
                  if (acquired.state === "blocked") return acquired;
                  let descriptor = acquired.transition;
                  return Object.freeze({
                    state: "acquired" as const,
                    transition: Object.freeze({
                      attemptId: descriptor.attemptId,
                      get fence() { return descriptor.fence; },
                      get expiresAt() { return descriptor.expiresAt; },
                      heartbeatIntervalMs: descriptor.heartbeatIntervalMs,
                      occupants: descriptor.occupants,
                      get phase() { return descriptor.phase; },
                      async renew() { descriptor = await continuation.renewTransition(descriptor.token, descriptor.fence); },
                      async release() { await continuation.releaseTransition(descriptor.token, descriptor.fence); },
                      async forceStop() {
                        await guard.retire();
                        retired = true;
                        descriptor = await continuation.forceStopTransition(descriptor.token, descriptor.fence);
                      },
                      async completeBoundStart(nextGeneration: GenerationRecord, owner: LifecycleAttachment, nextBinding: StandaloneGenerationBinding) {
                        attemptedResourceSet = bindElectronPhysicalResourceSet(resources, nextBinding);
                        nextHost = await launchHost(nextBinding);
                        const started = await nextHost.lifecycle.completeTransitionStart(descriptor.token, descriptor.fence, nextGeneration, owner, nextBinding);
                        activeHost = nextHost;
                        activeGeneration = nextGeneration;
                        return started;
                      },
                    }),
                  });
                },
              };
              const launcher = new VersionedLauncher(store, lifecycle, request.shell, attachment.id, observeFeedback);
              let applied: Awaited<ReturnType<StandaloneUpdater["applyNow"]>>;
              try {
                applied = await content.applyNow(launcher, options);
              } catch (error) {
                if (!retired) throw error;
                try {
                  if (attemptedResourceSet != null) await guard.retireReplacement(attemptedResourceSet);
                  const fallbackGeneration = await store.activeGeneration();
                  const fallbackBinding = createStandaloneGenerationBinding(fallbackGeneration, request.scope);
                  const stateAfterFailure = await lifecycleLedger.read();
                  const recovery = await continuation.beginTransition("content-restart", {
                    ...(stateAfterFailure?.transition == null ? {} : { attemptId: stateAfterFailure.transition.token }),
                    ownerAttachmentId: attachment.id,
                    ownerShellType: attachment.shell.type,
                    force: true,
                  });
                  if (recovery.state !== "acquired") throw new Error("Electron content rollback could not reacquire its lifecycle transition");
                  let recoveryTransition = recovery.transition;
                  if (recoveryTransition.phase !== "stopped-sealed") {
                    recoveryTransition = await continuation.forceStopTransition(recoveryTransition.token, recoveryTransition.fence);
                  }
                  const fallbackHost = await launchHost(fallbackBinding);
                  const restarted = await fallbackHost.lifecycle.completeTransitionStart(
                    recoveryTransition.token,
                    recoveryTransition.fence,
                    fallbackGeneration,
                    attachment,
                    fallbackBinding,
                  );
                  if (restarted.instanceId == null) throw new Error("Electron content rollback did not return a runtime instance");
                  await fallbackHost.lifecycle.awaitReady(request.scope, {
                    generationId: fallbackGeneration.id,
                    bindingDigest: fallbackBinding.digest,
                    instanceId: restarted.instanceId,
                    attachmentId: attachment.id,
                  });
                  activeHost = fallbackHost;
                  activeGeneration = fallbackGeneration;
                } catch (recoveryError) {
                  throw new AggregateError([error, recoveryError], "Electron content update and guarded rollback failed");
                }
                throw error;
              }
              if (applied.status === "blocked") return applied;
              return Object.freeze({ status: "applied" as const, lifecycle: applied.lifecycle, binding: activeHost.binding, generation: activeGeneration });
            });
          },
        }),
        async start({ attachment }): Promise<StandaloneRuntimeHandle> {
          if (activeAttachment != null) throw new Error("Electron Standalone prepared runtime already owns an attachment");
          const launcher = new VersionedLauncher(store, activeHost.lifecycle, request.shell, attachment.id, observeFeedback);
          let started: Awaited<ReturnType<VersionedLauncher["start"]>>;
          try {
            started = await launcher.start();
          } catch (error) {
            // A client can lose the start response after the host has already
            // retained its attachment. Retire both a zero-reference host and a
            // host occupied only by this failed caller; sibling attachments
            // remain an absolute retirement boundary.
            try {
              const current = await activeHost.lifecycle.status(request.scope);
              const occupiedOnlyByFailedCaller = current.occupants.length > 0
                && current.occupants.every(({ attachmentId }) => attachmentId === attachment.id);
              if (current.references === 0 || occupiedOnlyByFailedCaller) {
                await withElectronPhysicalResourceSetGuard(activeHost.resourceSet, async (guard) => await guard.retire());
              }
            } catch (cleanupError) {
              throw new AggregateError([error, cleanupError], "Electron Standalone start and zero-reference host retirement failed");
            }
            throw error;
          }
          activeAttachment = attachment;
          sealedRuntimeStatus = null;
          let closed: StandaloneRuntimeStatus | null = null;
          let heartbeatTask = Promise.resolve();
          const heartbeat = setInterval(() => {
            heartbeatTask = heartbeatTask.then(async () => { await activeHost.lifecycle.heartbeat(request.scope, attachment); }).catch(() => undefined);
          }, started.lease?.heartbeatIntervalMs ?? 5_000);
          heartbeat.unref();
          return Object.freeze({
            async readStatus() { return closed ?? sealedRuntimeStatus ?? projectRuntimeStatus(await activeHost.lifecycle.status(request.scope), activeHost.binding.digest, activeGeneration.id); },
            async invoke(command: StandaloneRuntimeCommand) {
              if (sealedRuntimeStatus != null) throw new Error("Electron Standalone runtime is sealed for replacement");
              return await activeHost.lifecycle.invoke(command);
            },
            async close() {
              if (closed != null) return closed;
              clearInterval(heartbeat);
              await heartbeatTask;
              if (sealedRuntimeStatus != null) {
                closed = sealedRuntimeStatus;
                return closed;
              }
              const status = await activeHost.lifecycle.release(request.scope, attachment.id);
              closed = Object.freeze({ ...projectRuntimeStatus(status, activeHost.binding.digest, activeGeneration.id), state: "stopped" as const });
              activeAttachment = null;
              return closed;
            },
            async waitForTerminal() {
              if (closed != null) return closed;
              if (sealedRuntimeStatus != null) return sealedRuntimeStatus;
              for (;;) {
                const status = projectRuntimeStatus(await activeHost.lifecycle.status(request.scope), activeHost.binding.digest, activeGeneration.id);
                if (status.state !== "running") return status;
                await new Promise((resolveWait) => setTimeout(resolveWait, 100));
              }
            },
          });
        },
      });
    },
  });
}
