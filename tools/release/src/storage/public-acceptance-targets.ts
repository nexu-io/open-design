import type { ReleaseTarget } from "@open-design/release";

export type ClosureTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";
export type PublicArtifactKind = "dmg" | "installer";

export const publicAcceptanceTargets: Record<ReleaseTarget, {
  artifactKind: PublicArtifactKind;
  buildJsonField: "dmgPath" | "installerPath";
  closureTarget: ClosureTarget;
  lifecycleStep: "mac-shell-lifecycle" | "win-shell-lifecycle";
}> = {
  mac_arm64: {
    artifactKind: "dmg",
    buildJsonField: "dmgPath",
    closureTarget: "darwin-arm64",
    lifecycleStep: "mac-shell-lifecycle",
  },
  mac_x64: {
    artifactKind: "dmg",
    buildJsonField: "dmgPath",
    closureTarget: "darwin-x64",
    lifecycleStep: "mac-shell-lifecycle",
  },
  win_x64: {
    artifactKind: "installer",
    buildJsonField: "installerPath",
    closureTarget: "win32-x64",
    lifecycleStep: "win-shell-lifecycle",
  },
};
