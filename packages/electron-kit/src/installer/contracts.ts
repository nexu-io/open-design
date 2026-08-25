import type { StandaloneShellUpdaterSnapshot } from "@open-design/standalone";

export type ElectronInstallerHandoff = NonNullable<StandaloneShellUpdaterSnapshot["handoff"]>;

export type ElectronInstallerHandoffRequest = Readonly<{
  handoff: ElectronInstallerHandoff;
  installAttemptId: string;
  nodeExecutablePath: string;
  parentPid: number;
  runtimeRoot: string;
  mode?: "execute" | "verify-only";
  timeoutMs?: number;
}>;

export type ElectronInstallerHandoffReceipt = Readonly<{
  schemaVersion: 1;
  state: "armed";
  installAttemptId: string;
  artifactPath: string;
  artifactSha256: string;
  helperPath: string;
  resultPath: string;
  mode: "execute" | "verify-only";
  parentPid: number;
}>;
