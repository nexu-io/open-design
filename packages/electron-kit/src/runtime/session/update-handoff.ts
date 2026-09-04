import type { StandaloneShellUpdaterPort } from "@open-design/standalone";

import type { ElectronInstallerHandoff } from "../../update/installation/contracts.js";

export type ElectronObservedInstallerHandoff = Readonly<{
  handoff: ElectronInstallerHandoff;
  installAttemptId: string;
}>;

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
