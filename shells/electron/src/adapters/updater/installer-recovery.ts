import type { ElectronInstallerClaimIdentity, ElectronInstallerRecoveryIntent, ElectronShellActions } from "@open-design/electron-kit/runtime";

const actionPrefix = "--od-installer-recovery-action=";
const claimPrefix = "--od-installer-recovery-claim=";
const idPrefix = "--od-installer-recovery-id=";
const tokenPattern = /^[A-Za-z0-9._-]{1,128}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function one(argv: readonly string[], prefix: string): string | null {
  const values = argv.filter((argument) => argument.startsWith(prefix)).map((argument) => argument.slice(prefix.length));
  if (values.length > 1) throw new Error(`duplicate Electron installer recovery argument: ${prefix.slice(2, -1)}`);
  return values[0] ?? null;
}

function claimIdentity(encoded: string): ElectronInstallerClaimIdentity {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new Error("invalid Electron installer recovery claim encoding"); }
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid Electron installer recovery claim identity");
  const identity = value as ElectronInstallerClaimIdentity;
  const keys = Object.keys(identity).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["bindingDigest", "generationId", "handoffDigest", "installAttemptId", "lifecycleFence", "revision"])
    || !digestPattern.test(identity.bindingDigest) || !digestPattern.test(identity.generationId) || !digestPattern.test(identity.handoffDigest)
    || !tokenPattern.test(identity.installAttemptId) || !Number.isSafeInteger(identity.lifecycleFence) || identity.lifecycleFence < 1
    || !Number.isSafeInteger(identity.revision) || identity.revision < 0) {
    throw new Error("invalid Electron installer recovery claim identity");
  }
  return Object.freeze(structuredClone(identity));
}

export function parseInstallerRecoveryIntent(argv: readonly string[]): ElectronInstallerRecoveryIntent | null {
  const action = one(argv, actionPrefix);
  const encodedClaim = one(argv, claimPrefix);
  const recoveryId = one(argv, idPrefix);
  if (action == null && encodedClaim == null && recoveryId == null) return null;
  if ((action !== "retry-original-artifact" && action !== "abandon-and-restore") || encodedClaim == null || recoveryId == null || !tokenPattern.test(recoveryId)) {
    throw new Error("incomplete Electron installer recovery intent");
  }
  return Object.freeze({ action, recoveryId, expected: claimIdentity(encodedClaim) });
}

export function serializeInstallerRecoveryIntent(intent: ElectronInstallerRecoveryIntent): readonly string[] {
  if (!tokenPattern.test(intent.recoveryId)) throw new Error("invalid Electron installer recovery id");
  return Object.freeze([
    `${actionPrefix}${intent.action}`,
    `${idPrefix}${intent.recoveryId}`,
    `${claimPrefix}${Buffer.from(JSON.stringify(intent.expected), "utf8").toString("base64url")}`,
  ]);
}

export function createInstallerRecoveryIntentAdapter(argv: readonly string[] = process.argv): NonNullable<ElectronShellActions["resolveInstallerRecovery"]> {
  const intent = parseInstallerRecoveryIntent(argv);
  return () => intent;
}
