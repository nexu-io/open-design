import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { canonicalJson, replaceFile, sha256Hex } from "@open-design/standalone";
import type { ElectronStandalonePreparedRuntime } from "@open-design/electron-kit/runtime";

import type { ElectronPhysicalRetirementCertificate } from "./guarded-lifecycle.js";

type ElectronInstallerHandoffInput = Parameters<ElectronStandalonePreparedRuntime["armShellInstallation"]>[0];
type ElectronInstallerHandoffRequest = ElectronInstallerHandoffInput["request"];
type ElectronInstallerHandoffReceipt = Awaited<ReturnType<ElectronStandalonePreparedRuntime["armShellInstallation"]>>;

export type ElectronStandaloneInstallerClaim = Readonly<{
  schemaVersion: 1;
  state: "sealed" | "armed";
  bindingDigest: string;
  generationId: string;
  installAttemptId: string;
  handoffDigest: string;
  runtimeRoot: string;
  retirement: ElectronPhysicalRetirementCertificate;
  receipt?: ElectronInstallerHandoffReceipt;
}>;

let sequence = 0;

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
    || typeof receipt.artifactPath !== "string" || !/^[a-f0-9]{64}$/u.test(receipt.artifactSha256)
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
  const expectedKeys = claim.state === "armed"
    ? ["bindingDigest", "generationId", "handoffDigest", "installAttemptId", "receipt", "retirement", "runtimeRoot", "schemaVersion", "state"]
    : ["bindingDigest", "generationId", "handoffDigest", "installAttemptId", "retirement", "runtimeRoot", "schemaVersion", "state"];
  if (JSON.stringify(Object.keys(claim).sort()) !== JSON.stringify(expectedKeys)) throw new Error("Electron installer claim fields are invalid");
  if (claim.schemaVersion !== 1 || (claim.state !== "sealed" && claim.state !== "armed")
    || !/^[a-f0-9]{64}$/u.test(claim.bindingDigest) || !/^[a-f0-9]{64}$/u.test(claim.generationId)
    || !/^[a-f0-9]{64}$/u.test(claim.handoffDigest) || !/^[A-Za-z0-9._-]{1,128}$/u.test(claim.installAttemptId)
    || resolve(claim.runtimeRoot) !== claim.runtimeRoot
    || claim.retirement?.schemaVersion !== 1
    || claim.retirement.bindingDigest !== claim.bindingDigest
    || claim.retirement.generationId !== claim.generationId
    || !Array.isArray(claim.retirement.resources)) throw new Error("Electron installer claim identity is invalid");
  if (claim.state === "armed") validateReceipt(claim.receipt, claim.installAttemptId);
  else if (claim.receipt != null) throw new Error("sealed Electron installer claim cannot contain a receipt");
  return structuredClone(claim);
}

export class ElectronStandaloneInstallerClaimLedger {
  readonly path: string;

  constructor(storeRoot: string, scope: Readonly<{ channel: string; namespace: string }>) {
    this.path = electronStandaloneInstallerClaimPath(storeRoot, scope);
  }

  async read(): Promise<ElectronStandaloneInstallerClaim | null> {
    try { return validateClaim(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  async write(claim: ElectronStandaloneInstallerClaim): Promise<void> {
    const exact = validateClaim(claim);
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
    await writeFile(temporary, canonicalJson(exact), { encoding: "utf8", flag: "wx" });
    try { await replaceFile(temporary, this.path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
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
