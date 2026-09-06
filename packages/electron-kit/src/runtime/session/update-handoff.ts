import type { StandaloneShellIdentity, StandaloneShellUpdaterPort, StandaloneShellUpdaterSnapshot } from "@open-design/standalone";

import type { ElectronInstallerHandoff } from "../../update/installation/contracts.js";

export type ElectronObservedInstallerHandoff = Readonly<{
  handoff: ElectronInstallerHandoff;
  installAttemptId: string;
}>;

export type ElectronInstallerRecovery =
  | Readonly<{ state: "continue"; snapshot: StandaloneShellUpdaterSnapshot }>
  | Readonly<{ state: "replacement-confirmation-required"; snapshot: StandaloneShellUpdaterSnapshot; request: ElectronObservedInstallerHandoff }>
  | Readonly<{ state: "recovery-required"; snapshot: StandaloneShellUpdaterSnapshot; request: ElectronObservedInstallerHandoff }>;

const OBSERVATION_RECOVERY_WINDOW_MS = 30_000;

function transientControlTransportError(error: unknown): boolean {
  const candidate = error as { code?: unknown };
  return ["ECONNREFUSED", "ECONNRESET", "ENOENT", "EPIPE"].includes(String(candidate?.code ?? ""))
    || (error instanceof Error && (error.message.includes("IPC request timed out") || error.message.includes("IPC socket closed")));
}

export async function resolveElectronInstallerRecovery(input: Readonly<{
  shell: StandaloneShellIdentity;
  updater: Pick<StandaloneShellUpdaterPort, "readSnapshot">;
}>): Promise<ElectronInstallerRecovery> {
  const snapshot = await input.updater.readSnapshot();
  if ((snapshot.state === "applying" || snapshot.state === "handed-off") && snapshot.handoff != null && snapshot.installAttemptId != null) {
    const expected = snapshot.handoff.shell;
    const replacement = input.shell.type === expected.type && input.shell.version === expected.version && input.shell.buildHash === expected.buildHash;
    return Object.freeze({
      state: replacement ? "replacement-confirmation-required" as const : "recovery-required" as const,
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
  let snapshot: StandaloneShellUpdaterSnapshot | null = null;
  let recoveryStartedAt: number | null = null;
  while (!input.isClosing()) {
    try {
      snapshot ??= await input.updater.readSnapshot();
      if (snapshot.revision > input.afterRevision
        && (snapshot.state === "applying" || snapshot.state === "handed-off")
        && snapshot.handoff != null
        && snapshot.installAttemptId != null) {
        await input.onHandoff({ handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId });
        return;
      }
      snapshot = await input.updater.waitForChange(snapshot.revision, 1_000);
      recoveryStartedAt = null;
    } catch (error) {
      if (input.isClosing()) return;
      if (!transientControlTransportError(error)) throw error;
      recoveryStartedAt ??= Date.now();
      if (Date.now() - recoveryStartedAt >= OBSERVATION_RECOVERY_WINDOW_MS) throw error;
      snapshot = null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
