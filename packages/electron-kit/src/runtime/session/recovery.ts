import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@open-design/standalone";
import { acquireElectronSessionLease } from "./lease.js";

/** Exact identities only. Acquisition URLs, trust roots and product resource
 * retirement belong to the Shell adapter, not this durable startup blockade. */
export type ElectronRecoveryTarget = Readonly<{
  capsuleManifestSha256: string;
  closureGenerationId: string;
}>;
type RecoveryIntent = Readonly<{ schemaVersion: 1; target: ElectronRecoveryTarget }>;

export class ElectronRecoveryRequiredError extends Error {
  readonly code = "electron-recovery-required";
  constructor(message: string) { super(message); this.name = "ElectronRecoveryRequiredError"; }
}

function target(value: unknown): ElectronRecoveryTarget {
  const input = value as Partial<ElectronRecoveryTarget> | null;
  if (input == null || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join(",") !== "capsuleManifestSha256,closureGenerationId"
    || typeof input.capsuleManifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.capsuleManifestSha256)
    || typeof input.closureGenerationId !== "string" || !/^[a-f0-9]{64}$/.test(input.closureGenerationId)) {
    throw new Error("invalid exact Electron recovery target");
  }
  return Object.freeze({ capsuleManifestSha256: input.capsuleManifestSha256, closureGenerationId: input.closureGenerationId });
}

export async function readElectronRecoveryIntent(runtimeRoot: string): Promise<RecoveryIntent | null> {
  const bytes = await readFile(join(runtimeRoot, "recovery.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (bytes == null) return null;
  const value = JSON.parse(bytes) as RecoveryIntent;
  if (value == null || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1
    || Object.keys(value).sort().join(",") !== "schemaVersion,target") throw new Error("invalid Electron recovery intent; explicit metadata repair required");
  return Object.freeze({ schemaVersion: 1, target: target(value.target) });
}

/** Run without evaluating Capsule/Web/daemon. The caller must verify both
 * signed targets and all bytes, then rearm them under the physical resource
 * guard. A failure keeps the intent and original activation evidence. This is
 * a repair blockade, not a second commit/rollback authority. */
export async function recoverElectronStartup(input: Readonly<{
  runtimeRoot: string;
  target?: ElectronRecoveryTarget;
  selectTarget(): Promise<ElectronRecoveryTarget>;
  repair(target: ElectronRecoveryTarget): Promise<void>;
}>): Promise<RecoveryIntent> {
  const runtimeRoot = input.runtimeRoot, requested = input.target == null ? null : target(input.target);
  const lease = await acquireElectronSessionLease(runtimeRoot);
  try {
    const previous = await readElectronRecoveryIntent(runtimeRoot);
    if (previous != null && requested != null && canonicalJson(previous.target) !== canonicalJson(requested)) {
      throw new Error("Electron recovery is pinned to a different exact target");
    }
    const intent: RecoveryIntent = previous ?? Object.freeze({ schemaVersion: 1,
      target: requested ?? target(await input.selectTarget()) });
    const path = join(runtimeRoot, "recovery.json");
    // Exclusive create: a torn write remains an invalid blockade, never an
    // absent marker authorizing ordinary startup. Retry never replaces intent.
    if (previous == null) await writeFile(path, canonicalJson(intent), { flag: "wx" });
    await input.repair(intent.target);
    await rm(join(runtimeRoot, "activation.json"), { force: true });
    // Last operation: if removal fails or the process dies here, even a missing
    // activation record cannot let normal startup bypass unfinished recovery.
    await rm(path);
    return intent;
  } finally { await lease.release(); }
}
