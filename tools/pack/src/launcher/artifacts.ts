import {
  LAUNCHER_HOST_CONTRACT_VERSION,
  type LauncherHostEnvironment,
} from "@open-design/launcher-proto";

export function buildLauncherHostEnvironment(input: Omit<LauncherHostEnvironment, "contractVersion">): LauncherHostEnvironment {
  return { contractVersion: LAUNCHER_HOST_CONTRACT_VERSION, ...input };
}
