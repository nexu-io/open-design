import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalJson, replaceFile, sha256Hex, validateShellIdentity } from "@open-design/standalone";
import type {
  ElectronInstallerClaimIdentity,
  ElectronInstallerClaimSnapshot,
  ElectronInstallerConfirmationReceipt,
  ElectronInstallerArtifactIdentity,
  ElectronInstallerHandoffReceipt,
  ElectronInstallerHandoffRequest,
  ElectronMacInstallerTrustReceipt,
  ElectronMacLastKnownGoodCaptureReceipt,
  ElectronMacLastKnownGoodRestoreArmedReceipt,
  ElectronMacLastKnownGoodRestorePreparationReceipt,
  ElectronMacLastKnownGoodRestoreResult,
  ElectronInstallerRecoveryReceipt,
} from "@open-design/electron-kit/runtime";

import type { ElectronPhysicalRetirementCertificate } from "./guarded-lifecycle.js";

export type ElectronStandaloneInstallerClaim = Readonly<{
  schemaVersion: 1;
  revision: number;
  state: "sealed" | "armed" | "expired" | "abandoned" | "confirmed" | "consumed";
  bindingDigest: string;
  generationId: string;
  installAttemptId: string;
  handoffDigest: string;
  runtimeRoot: string;
  lifecycleFence: number;
  createdAt: string;
  expiresAt: string;
  artifact: ElectronInstallerArtifactIdentity;
  platformTrust?: ElectronMacInstallerTrustReceipt;
  lastKnownGood?: ElectronMacLastKnownGoodCaptureReceipt;
  invocation: Readonly<{
    state: "pending" | "armed" | "failed";
    lastError?: Readonly<{ code: string; message: string; observedAt: string }>;
  }>;
  retirement: ElectronPhysicalRetirementCertificate;
  receipt?: ElectronInstallerHandoffReceipt;
  restoration?: Readonly<{
    recoveryId: string;
    expected: ElectronInstallerClaimIdentity;
    phase: "intent-persisted" | "restore-prepared" | "restore-armed" | "result-observed";
    preparation?: ElectronMacLastKnownGoodRestorePreparationReceipt;
    armed?: ElectronMacLastKnownGoodRestoreArmedReceipt;
    result?: ElectronMacLastKnownGoodRestoreResult;
  }>;
  recovery?: Readonly<{ recoveryId: string; expected: ElectronInstallerClaimIdentity; receipt: ElectronInstallerRecoveryReceipt }>;
  confirmation?: Readonly<{
    proof: import("@open-design/standalone").StandaloneShellIdentity;
    receipt?: ElectronInstallerConfirmationReceipt;
  }>;
}>;

let sequence = 0;
const digestPattern = /^[a-f0-9]{64}$/u;
const tokenPattern = /^[A-Za-z0-9._-]{1,128}$/u;

function validTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function electronStandaloneInstallerClaimPath(storeRoot: string, scope: Readonly<{ channel: string; namespace: string }>): string {
  return join(resolve(storeRoot), "channels", scope.channel, "namespaces", scope.namespace, "electron-installer-claim.json");
}

export function electronInstallerHandoffDigest(request: Pick<ElectronInstallerHandoffRequest, "handoff" | "installAttemptId">): string {
  return sha256Hex(canonicalJson({ handoff: request.handoff, installAttemptId: request.installAttemptId }));
}

function validateReceipt(value: unknown, attemptId: string): ElectronInstallerHandoffReceipt {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Electron installer claim receipt is invalid");
  const receipt = value as ElectronInstallerHandoffReceipt;
  if (receipt.schemaVersion !== 1 || receipt.state !== "armed" || receipt.installAttemptId !== attemptId
    || typeof receipt.artifactPath !== "string" || !digestPattern.test(receipt.artifactSha256)
    || typeof receipt.helperPath !== "string" || typeof receipt.resultPath !== "string"
    || (receipt.mode !== "execute" && receipt.mode !== "verify-only")
    || !Number.isSafeInteger(receipt.parentPid) || receipt.parentPid <= 0) {
    throw new Error("Electron installer claim receipt is invalid");
  }
  return structuredClone(receipt);
}

function validateClaim(value: unknown): ElectronStandaloneInstallerClaim {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Electron installer claim is invalid");
  const claim = value as ElectronStandaloneInstallerClaim;
  const expectedKeys = ["artifact", "bindingDigest", "createdAt", "expiresAt", "generationId", "handoffDigest", "installAttemptId", "invocation", "lifecycleFence", "retirement", "revision", "runtimeRoot", "schemaVersion", "state",
    ...(claim.platformTrust == null ? [] : ["platformTrust"]),
    ...(claim.lastKnownGood == null ? [] : ["lastKnownGood"]),
    ...(claim.receipt == null ? [] : ["receipt"]), ...(claim.recovery == null ? [] : ["recovery"]),
    ...(claim.restoration == null ? [] : ["restoration"]),
    ...(claim.confirmation == null ? [] : ["confirmation"])].sort();
  if (JSON.stringify(Object.keys(claim).sort()) !== JSON.stringify(expectedKeys)) throw new Error("Electron installer claim fields are invalid");
  if (claim.schemaVersion !== 1 || !Number.isSafeInteger(claim.revision) || claim.revision < 0
    || !["sealed", "armed", "expired", "abandoned", "confirmed", "consumed"].includes(claim.state)
    || !digestPattern.test(claim.bindingDigest) || !digestPattern.test(claim.generationId)
    || !digestPattern.test(claim.handoffDigest) || !tokenPattern.test(claim.installAttemptId)
    || resolve(claim.runtimeRoot) !== claim.runtimeRoot
    || !Number.isSafeInteger(claim.lifecycleFence) || claim.lifecycleFence < 1
    || !validTime(claim.createdAt) || !validTime(claim.expiresAt) || Date.parse(claim.expiresAt) <= Date.parse(claim.createdAt)
    || claim.artifact == null || resolve(claim.artifact.path) !== claim.artifact.path || !digestPattern.test(claim.artifact.sha256)
    || !Number.isSafeInteger(claim.artifact.size) || claim.artifact.size < 0
    || !/^\d+$/u.test(claim.artifact.device) || !/^\d+$/u.test(claim.artifact.inode)
    || claim.invocation == null || !["pending", "armed", "failed"].includes(claim.invocation.state)
    || (claim.invocation.state === "failed") !== (claim.invocation.lastError != null)
    || (claim.invocation.lastError != null && (typeof claim.invocation.lastError.code !== "string"
      || typeof claim.invocation.lastError.message !== "string" || !validTime(claim.invocation.lastError.observedAt)))
    || claim.retirement?.schemaVersion !== 1
    || claim.retirement.bindingDigest !== claim.bindingDigest
    || claim.retirement.generationId !== claim.generationId
    || !Array.isArray(claim.retirement.resources)) throw new Error("Electron installer claim identity is invalid");
  if (claim.platformTrust != null && (claim.platformTrust.schemaVersion !== 1
    || claim.platformTrust.operation !== "electron.macos-installer.trust"
    || canonicalJson(claim.platformTrust.container) !== canonicalJson(claim.artifact))) {
    throw new Error("Electron installer claim platform trust is invalid");
  }
  if (claim.lastKnownGood != null && (claim.lastKnownGood.schemaVersion !== 1
    || claim.lastKnownGood.operation !== "electron.macos-lkg.capture"
    || claim.lastKnownGood.source.sha256 !== claim.lastKnownGood.backup.sha256
    || claim.lastKnownGood.source.entries !== claim.lastKnownGood.backup.entries
    || claim.lastKnownGood.source.size !== claim.lastKnownGood.backup.size)) {
    throw new Error("Electron installer claim LKG capture is invalid");
  }
  if (claim.restoration != null) {
    const restoration = claim.restoration;
    const preparation = restoration.preparation;
    const armed = restoration.armed;
    const result = restoration.result;
    if (!tokenPattern.test(restoration.recoveryId)
      || canonicalJson(restoration.expected) !== canonicalJson({ ...electronInstallerClaimIdentity(claim), revision: restoration.expected.revision })
      || !["intent-persisted", "restore-prepared", "restore-armed", "result-observed"].includes(restoration.phase)
      || (restoration.phase === "intent-persisted" && (preparation != null || armed != null || result != null))
      || (restoration.phase === "restore-prepared" && (preparation == null || armed != null || result != null))
      || (restoration.phase === "restore-armed" && (preparation == null || armed == null || result != null))
      || (restoration.phase === "result-observed" && (preparation == null || result == null))
      || (preparation != null && (preparation.recoveryId !== restoration.recoveryId
        || canonicalJson(preparation.claim) !== canonicalJson(restoration.expected)
        || canonicalJson(preparation.capture) !== canonicalJson(claim.lastKnownGood)
        || canonicalJson(preparation.trust) !== canonicalJson(claim.platformTrust)))
      || (armed != null && (armed.recoveryId !== restoration.recoveryId
        || canonicalJson(armed.claim) !== canonicalJson(restoration.expected)
        || canonicalJson(armed.preparation) !== canonicalJson(preparation)))
      || (result != null && (result.recoveryId !== restoration.recoveryId
        || canonicalJson(result.claim) !== canonicalJson(restoration.expected)))) {
      throw new Error("Electron installer claim restoration is invalid");
    }
  }
  if (claim.state === "armed") {
    validateReceipt(claim.receipt, claim.installAttemptId);
    if (claim.invocation.state !== "armed") throw new Error("armed Electron installer claim invocation is invalid");
  }
  if (claim.state === "sealed" && (claim.receipt != null || claim.recovery != null)) throw new Error("sealed Electron installer claim contains recovery output");
  if (claim.state === "abandoned" && (claim.recovery?.receipt.action !== "abandon-and-restore" || claim.recovery.receipt.state !== "restored"
    || claim.restoration?.phase !== "result-observed" || claim.restoration.result?.state !== "restored"
    || canonicalJson(claim.recovery.receipt.result) !== canonicalJson(claim.restoration.result) || claim.receipt != null)) throw new Error("abandoned Electron installer claim receipt is invalid");
  if ((claim.state === "confirmed" || claim.state === "consumed") && claim.confirmation == null) throw new Error("confirmed Electron installer claim lacks replacement proof");
  if (claim.state === "consumed" && claim.confirmation?.receipt?.state !== "consumed") throw new Error("consumed Electron installer claim receipt is invalid");
  if (claim.confirmation != null) validateShellIdentity(claim.confirmation.proof);
  if (claim.recovery != null && (!tokenPattern.test(claim.recovery.recoveryId) || claim.recovery.receipt.recoveryId !== claim.recovery.recoveryId
    || canonicalJson(claim.recovery.expected) !== canonicalJson({ ...claim.recovery.receipt.claim, revision: claim.recovery.expected.revision }))) {
    throw new Error("Electron installer claim recovery identity is invalid");
  }
  return structuredClone(claim);
}

export function electronInstallerClaimIdentity(claim: ElectronStandaloneInstallerClaim): ElectronInstallerClaimIdentity {
  return Object.freeze({
    bindingDigest: claim.bindingDigest,
    generationId: claim.generationId,
    handoffDigest: claim.handoffDigest,
    installAttemptId: claim.installAttemptId,
    lifecycleFence: claim.lifecycleFence,
    revision: claim.revision,
  });
}

export function electronInstallerClaimSnapshot(claim: ElectronStandaloneInstallerClaim): ElectronInstallerClaimSnapshot {
  const restoration = claim.restoration == null ? undefined : Object.freeze({
    recoveryId: claim.restoration.recoveryId,
    phase: claim.restoration.phase,
    ...(claim.restoration.armed == null ? {} : { helperPid: claim.restoration.armed.helperPid }),
    ...(claim.restoration.result == null ? {} : {
      result: Object.freeze({ state: claim.restoration.result.state, ...(claim.restoration.result.error == null ? {} : { error: structuredClone(claim.restoration.result.error) }) }),
    }),
  });
  return Object.freeze({
    schemaVersion: 1,
    state: claim.state,
    expiresAt: claim.expiresAt,
    identity: electronInstallerClaimIdentity(claim),
    artifact: structuredClone(claim.artifact),
    invocation: structuredClone(claim.invocation),
    ...(restoration == null ? {} : { restoration }),
  });
}

export function assertElectronInstallerClaimIdentity(claim: ElectronStandaloneInstallerClaim, expected: ElectronInstallerClaimIdentity): void {
  if (canonicalJson(electronInstallerClaimIdentity(claim)) !== canonicalJson(expected)) throw new Error("stale Electron installer claim identity");
}

export class ElectronStandaloneInstallerClaimLedger {
  readonly path: string;
  #tail: Promise<void> = Promise.resolve();

  constructor(storeRoot: string, scope: Readonly<{ channel: string; namespace: string }>) {
    this.path = electronStandaloneInstallerClaimPath(storeRoot, scope);
  }

  async read(): Promise<ElectronStandaloneInstallerClaim | null> {
    try { return validateClaim(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  async compareAndSet(expected: ElectronInstallerClaimIdentity | null, claim: ElectronStandaloneInstallerClaim): Promise<void> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolveTail) => { release = resolveTail; });
    await previous;
    try {
      const exact = validateClaim(claim);
      const current = await this.read();
      if (expected == null) {
        if (current != null || exact.revision !== 0) throw new Error("stale Electron installer claim identity");
      } else {
        if (current == null) throw new Error("stale Electron installer claim identity");
        assertElectronInstallerClaimIdentity(current, expected);
        if (exact.revision !== expected.revision + 1) throw new Error("Electron installer claim CAS revision did not advance exactly once");
      }
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
      await writeFile(temporary, canonicalJson(exact), { encoding: "utf8", flag: "wx" });
      try { await replaceFile(temporary, this.path); }
      catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
    } finally {
      release();
    }
  }
}

export function validateElectronInstallerReceiptForRequest(receipt: unknown, request: ElectronInstallerHandoffRequest): ElectronInstallerHandoffReceipt {
  const exact = validateReceipt(receipt, request.installAttemptId);
  if (exact.artifactPath !== request.handoff.artifact.path || exact.artifactSha256 !== request.handoff.artifact.sha256
    || exact.parentPid !== request.parentPid || exact.mode !== (request.mode ?? "execute")) {
    throw new Error("Electron installer receipt differs from its exact handoff request");
  }
  return exact;
}
