import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { canonicalJson, replaceFile, sha256Hex, withStandaloneMaintenanceLock,
  type SignedDocument } from "@open-design/standalone";
import { validateElectronCapsuleManifest, type ElectronCapsuleManifest } from "../../contracts/capsule.js";
import { inspectElectronCapsule, type LoadElectronCapsuleInput } from "../startup/capsule.js";
import { inspectElectronStartup } from "./activation.js";
import { readElectronRecoveryIntent } from "./recovery.js";

export type ElectronCapsuleSelection = Readonly<{
  envelope: SignedDocument<ElectronCapsuleManifest>;
  root: string;
  closureGenerationId: string;
}>;
export type ElectronCapsuleSelectionState = Readonly<{
  schemaVersion: 1;
  revision: number;
  current: ElectronCapsuleSelection | null;
  pending: ElectronCapsuleSelection | null;
}>;

function selection(value: unknown): ElectronCapsuleSelection | null {
  if (value === null) return null;
  const input = value as ElectronCapsuleSelection;
  if (input == null || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join(",") !== "closureGenerationId,envelope,root"
    || typeof input.root !== "string" || !isAbsolute(input.root) || resolve(input.root) !== input.root
    || typeof input.closureGenerationId !== "string" || !/^[a-f0-9]{64}$/.test(input.closureGenerationId)
    || input.envelope == null || typeof input.envelope !== "object" || !Array.isArray(input.envelope.signatures)) {
    throw new Error("invalid Electron Capsule selection");
  }
  validateElectronCapsuleManifest(input.envelope.document);
  return structuredClone(input);
}

/** Shape inspection is not trust. The fixed loader must authenticate the
 * envelope and execute only its verified bytes on every process start. */
export async function readElectronCapsuleSelection(runtimeRoot: string): Promise<ElectronCapsuleSelectionState> {
  const bytes = await readFile(join(runtimeRoot, "capsule-selection.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (bytes == null) return { schemaVersion: 1, revision: 0, current: null, pending: null };
  const state = JSON.parse(bytes) as ElectronCapsuleSelectionState;
  if (state == null || typeof state !== "object" || Array.isArray(state) || state.schemaVersion !== 1
    || Object.keys(state).sort().join(",") !== "current,pending,revision,schemaVersion"
    || !Number.isSafeInteger(state.revision) || state.revision < 1
    || (state.current === null && state.pending === null)) throw new Error("invalid Electron Capsule selection state");
  return { schemaVersion: 1, revision: state.revision, current: selection(state.current), pending: selection(state.pending) };
}

async function writeSelection(runtimeRoot: string, state: ElectronCapsuleSelectionState): Promise<void> {
  const path = join(runtimeRoot, "capsule-selection.json"), temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, canonicalJson(state), { flag: "wx" });
    await replaceFile(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

/** Normal updates may arm only outside startup. Recovery additionally requires
 * the exact durable repair intent. Neither path commits Capsule or Closure. */
export async function armElectronCapsuleSelection(input: Readonly<{
  runtimeRoot: string;
  capsule: LoadElectronCapsuleInput;
  closureGenerationId: string;
  expectedRevision: number;
  recovery?: boolean;
}>): Promise<ElectronCapsuleSelectionState> {
  const snapshot = { ...input, capsule: { ...input.capsule, envelope: structuredClone(input.capsule.envelope) } };
  const candidate = selection({ envelope: snapshot.capsule.envelope, root: snapshot.capsule.root, closureGenerationId: snapshot.closureGenerationId })!;
  return withStandaloneMaintenanceLock(snapshot.runtimeRoot, async () => {
    if (snapshot.recovery === true) {
      const intent = await readElectronRecoveryIntent(snapshot.runtimeRoot);
      if (intent?.target.capsuleManifestSha256 !== sha256Hex(canonicalJson(candidate.envelope))
        || intent.target.closureGenerationId !== candidate.closureGenerationId) throw new Error("Capsule rearm differs from the exact recovery intent");
    } else if ((await inspectElectronStartup(snapshot.runtimeRoot)).required) {
      throw new Error("Capsule update cannot arm during incomplete startup or recovery");
    }
    const state = await readElectronCapsuleSelection(snapshot.runtimeRoot);
    if (state.revision !== snapshot.expectedRevision) throw new Error("stale Electron Capsule selection revision");
    if (snapshot.recovery !== true && state.pending != null) throw new Error("Electron Capsule selection is already pending");
    await inspectElectronCapsule(snapshot.capsule);
    const next = { ...state, revision: state.revision + 1, pending: candidate };
    await writeSelection(snapshot.runtimeRoot, next);
    return next;
  });
}

/** Fixed carrier only, deliberately absent from the public package exports.
 * The outer activation remains starting until this and Closure readiness have
 * both succeeded. A crash between commits still requires explicit recovery. */
export async function commitElectronCapsuleSelection(runtimeRoot: string, loaded: Readonly<{
  envelope: SignedDocument<ElectronCapsuleManifest>; root: string; revision: number;
}>, closureGenerationId: string): Promise<void> {
  await withStandaloneMaintenanceLock(runtimeRoot, async () => {
    const state = await readElectronCapsuleSelection(runtimeRoot);
    if (state.revision !== loaded.revision) throw new Error("Capsule selection changed during startup");
    const selected = state.pending ?? state.current;
    if (selected != null && (canonicalJson(selected.envelope) !== canonicalJson(loaded.envelope) || selected.root !== loaded.root)) {
      throw new Error("committed Capsule differs from the loaded selection");
    }
    if (state.pending != null && state.pending.closureGenerationId !== closureGenerationId) throw new Error("Capsule startup did not mount its exact prepared Closure");
    const current = selection({ envelope: loaded.envelope, root: loaded.root, closureGenerationId })!;
    await writeSelection(runtimeRoot, { ...state, revision: state.revision + 1, current, pending: null });
  });
}
