import { describeElectronRuntimeDiagnostics, updateElectronClosureThroughCdp, type ElectronDiagnosticSession } from "@open-design/shell-electron/lifecycle/inspection";
import { writeObject } from "./control-common.ts";
import { acceptInstalledRelease } from "./control-release.ts";
import { readPublishedAcceptance } from "./installed-acceptance.ts";

type AcceptanceInput = Readonly<{ publication: string; policy: string; shell: string; target: string; receipt: string; baseUserDataRoot?: string }>;
async function session(input: AcceptanceInput): Promise<ElectronDiagnosticSession> {
  if (input.shell !== "electron" || !input.baseUserDataRoot) throw new Error("Electron acceptance requires --base-user-data-root");
  const { required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
  if (typeof required.installIdentity?.namespace !== "string") throw new Error("published Electron acceptance lacks namespace");
  return { baseUserDataRoot: input.baseUserDataRoot, channel: policy.channel, namespace: required.installIdentity.namespace, presentation: "headless" };
}

export async function updateAcceptanceClosure(input: AcceptanceInput): Promise<void> {
  await writeObject(input.receipt, await updateElectronClosureThroughCdp(await session(input)));
}

export async function collectReleaseAcceptance(input: AcceptanceInput & Readonly<{
  installedRoot: string; runtimeProofRoot: string; hotAcceptanceReceipt?: string;
  firstInstallRoot?: string; firstInstallUserDataRoot?: string;
}>): Promise<void> {
  if (input.hotAcceptanceReceipt != null && input.shell !== "electron") throw new Error("hot acceptance requires Electron");
  if ((input.firstInstallRoot != null || input.firstInstallUserDataRoot != null)
    && (!input.hotAcceptanceReceipt || !input.firstInstallRoot || !input.firstInstallUserDataRoot)) throw new Error("first-install evidence requires both roots and a hot receipt");
  const diagnostics = input.shell === "electron" ? describeElectronRuntimeDiagnostics(await session(input)) : undefined;
  const first = input.firstInstallRoot == null ? undefined : describeElectronRuntimeDiagnostics(await session({ ...input, baseUserDataRoot: input.firstInstallUserDataRoot }));
  await acceptInstalledRelease({ installedRoot: input.installedRoot, runtimeProofRoot: input.runtimeProofRoot,
    publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target,
    ...(diagnostics == null ? {} : { runtimeLog: diagnostics.runtimeLog }),
    ...(first == null ? {} : { firstInstallRoot: input.firstInstallRoot, firstInstallRuntimeLog: first.runtimeLog }),
    ...(input.hotAcceptanceReceipt == null ? {} : { hotAcceptanceReceipt: input.hotAcceptanceReceipt,
      standaloneState: diagnostics!.standaloneState, standaloneGenerationsRoot: diagnostics!.standaloneGenerationsRoot }) }, input.receipt);
}
