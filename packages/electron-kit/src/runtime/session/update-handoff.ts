import type { StandaloneShellIdentity, StandaloneShellUpdaterPort, StandaloneShellUpdaterSnapshot } from "@open-design/standalone";

import type { ElectronInstallerHandoff } from "../../update/installation/contracts.js";

export type ElectronObservedInstallerHandoff = Readonly<{
  handoff: ElectronInstallerHandoff;
  installAttemptId: string;
}>;

export type ElectronInstallerRecovery =
  | Readonly<{ state: "continue"; snapshot: StandaloneShellUpdaterSnapshot }>
  | Readonly<{ state: "arm-and-quit"; snapshot: StandaloneShellUpdaterSnapshot; request: ElectronObservedInstallerHandoff }>;

export async function resolveElectronInstallerRecovery(input: Readonly<{
  shell: StandaloneShellIdentity;
  updater: Pick<StandaloneShellUpdaterPort, "confirmInstalled" | "readSnapshot">;
}>): Promise<ElectronInstallerRecovery> {
  let snapshot = await input.updater.readSnapshot();
  if (snapshot.state === "applying" || snapshot.state === "handed-off") {
    snapshot = (await input.updater.confirmInstalled(input.shell)).snapshot;
  }
  if ((snapshot.state === "applying" || snapshot.state === "handed-off") && snapshot.handoff != null && snapshot.installAttemptId != null) {
    return Object.freeze({
      state: "arm-and-quit" as const,
      snapshot,
      request: Object.freeze({ handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId }),
    });
  }
  return Object.freeze({ state: "continue" as const, snapshot });
}

export async function observeElectronInstallerHandoff(input: Readonly<{
  afterRevision: number;
  isClosing(): boolean;
  onHandoff(request: ElectronObservedInstallerHandoff): Promise<void>;
  updater: Pick<StandaloneShellUpdaterPort, "readSnapshot" | "waitForChange">;
}>): Promise<void> {
  let snapshot = await input.updater.readSnapshot();
  while (!input.isClosing()) {
    if (snapshot.revision > input.afterRevision
      && (snapshot.state === "applying" || snapshot.state === "handed-off")
      && snapshot.handoff != null
      && snapshot.installAttemptId != null) {
      await input.onHandoff({ handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId });
      return;
    }
    snapshot = await input.updater.waitForChange(snapshot.revision, 1_000);
  }
}
