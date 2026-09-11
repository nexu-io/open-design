import { describeElectronRuntimeDiagnostics, updateElectronClosureThroughCdp, inspectElectronSelectedCapsule,
  inspectElectronBoundCapsule,
  prepareElectronShellThroughCdp, applyElectronShellThroughCdp, inspectElectronStartupThroughCdp, waitForElectronShutdown,
  closeElectronDiagnosticSession,
  type ElectronDiagnosticSession } from "@open-design/shell-electron/lifecycle/inspection";
import { canonicalBytes, writeObject } from "./control-common.ts";
import { acceptInstalledRelease } from "./control-release.ts";
import { readPublishedAcceptance } from "./installed-acceptance.ts";

type AcceptanceInput = Readonly<{ publication: string; policy: string; shell: string; target: string; receipt: string; namespace?: string }>;
async function session(input: AcceptanceInput): Promise<ElectronDiagnosticSession> {
  if (input.shell !== "electron" || !input.namespace) throw new Error("Electron acceptance requires --namespace");
  const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
  if (typeof required.installIdentity?.namespace !== "string") throw new Error("published Electron acceptance lacks namespace");
  return { namespace: input.namespace, channel: policy.channel, productName: required.installIdentity.productName, presentation: "headless" };
}

export async function updateAcceptanceClosure(input: AcceptanceInput): Promise<void> {
  await writeObject(input.receipt, await updateElectronClosureThroughCdp(await session(input)));
}

/** Same carrier, two public update paths. Capsule replacement owns its exact
 * Closure transition; never fake a second Closure apply after that transition. */
export async function updateAcceptanceSameCarrier(input: AcceptanceInput & Readonly<{ installedRoot: string; candidateRoot: string }>) {
  const diagnosticSession = await session(input);
  const candidate = await inspectElectronBoundCapsule(input.candidateRoot);
  const expected = candidate.envelope;
  const before = await inspectElectronSelectedCapsule(diagnosticSession, input.installedRoot);
  // Per-version URLs/signatures are not a content upgrade. The verified owner
  // supplies logical Shell identity; release control never recomputes it.
  if (before.shell.buildHash === candidate.shell.buildHash && before.shell.version === candidate.shell.version) return updateAcceptanceClosure(input);
  const prepared = await prepareElectronShellThroughCdp(diagnosticSession);
  const stages: Record<string, unknown> = { schemaVersion: 1, operation: "electron.capsule.upgrade.stages", before, prepared };
  const stageReceipt = input.receipt + ".stages.json";
  await writeObject(stageReceipt, stages);
  const ready = prepared.results.at(-1) as { lines?: { shell?: { state?: string; blockedBy?: number } } } | undefined;
  if (ready?.lines?.shell?.state !== "ready") throw new Error("Shell updater did not prepare the candidate Capsule");
  if ((ready.lines.shell.blockedBy ?? 0) > 0) throw new Error("Isolated Shell acceptance has unexpected blockers");
  const startedAfter = Date.now();
  try {
    const applied = await applyElectronShellThroughCdp(diagnosticSession);
    stages.applied = applied;
    await writeObject(stageReceipt, stages);
    const result = applied.results.at(-1) as { outcome?: string; lines?: { shell?: { state?: string } } } | undefined;
    if (result?.outcome !== "context-destroyed" && result?.lines?.shell?.state !== "applying") {
      throw new Error("Shell updater did not start Capsule replacement");
    }
    const restarted = await inspectElectronStartupThroughCdp(diagnosticSession, startedAfter, 180_000);
    stages.restarted = restarted;
    await writeObject(stageReceipt, stages);
    await waitForElectronShutdown(diagnosticSession, startedAfter);
    const after = await inspectElectronSelectedCapsule(diagnosticSession, input.installedRoot);
    if (!canonicalBytes(after.envelope).equals(canonicalBytes(expected)) || after.revision <= before.revision
      || after.closureGenerationId === before.closureGenerationId) throw new Error("Shell updater did not commit the exact Capsule and Closure replacement");
    await writeObject(input.receipt, { schemaVersion: 1, operation: "electron.capsule.upgrade", before, prepared, applied, restarted, after });
  } catch (error) {
    // The original process owner cannot reap a native Electron relaunch child.
    // Scope cleanup to this caller-owned CDP session, never a global app kill.
    await closeElectronDiagnosticSession(diagnosticSession).catch(cleanup => console.error("Could not close failed Capsule relaunch:", cleanup));
    throw error;
  }
}

export async function collectReleaseAcceptance(input: AcceptanceInput & Readonly<{
  installedRoot: string; runtimeProofRoot: string; hotAcceptanceReceipt?: string;
  firstInstallRoot?: string; firstInstallNamespace?: string;
  baselineCandidate?: boolean;
}>): Promise<void> {
  if (input.hotAcceptanceReceipt != null && input.shell !== "electron") throw new Error("hot acceptance requires Electron");
  if ((input.firstInstallRoot != null || input.firstInstallNamespace != null)
    && (!input.hotAcceptanceReceipt || !input.firstInstallRoot || !input.firstInstallNamespace)) throw new Error("first-install evidence requires both roots and a hot receipt");
  const diagnostics = input.shell === "electron" ? describeElectronRuntimeDiagnostics(await session(input)) : undefined;
  const first = input.firstInstallRoot == null ? undefined : describeElectronRuntimeDiagnostics(await session({ ...input, namespace: input.firstInstallNamespace }));
  await acceptInstalledRelease({ installedRoot: input.installedRoot, runtimeProofRoot: input.runtimeProofRoot,
    ...(input.namespace == null ? {} : { namespace: input.namespace }),
    ...(input.baselineCandidate ? { baselineCandidate: true } : {}),
    publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target,
    ...(diagnostics == null ? {} : { runtimeLog: diagnostics.runtimeLog }),
    ...(first == null ? {} : { firstInstallRoot: input.firstInstallRoot, firstInstallRuntimeLog: first.runtimeLog }),
    ...(input.hotAcceptanceReceipt == null ? {} : { hotAcceptanceReceipt: input.hotAcceptanceReceipt,
      standaloneState: diagnostics!.standaloneState, standaloneGenerationsRoot: diagnostics!.standaloneGenerationsRoot }) }, input.receipt);
}
