import type { ReleaseTarget } from "../storage/common.ts";

export type MacSignMode = "unsigned" | "signed" | "notarized";
export type WinX64SignMode = "unsigned" | "signed";
export type PlatformSignMode = MacSignMode | WinX64SignMode;

export type ReleaseParameterMatrix = {
  mac_arm64: { signMode: MacSignMode };
  mac_x64: { signMode: MacSignMode };
  win_x64: { signMode: WinX64SignMode };
};

export const defaultReleaseParameterMatrix: ReleaseParameterMatrix = {
  mac_arm64: { signMode: "notarized" },
  mac_x64: { signMode: "notarized" },
  win_x64: { signMode: "unsigned" },
};

function parseMacSignMode(value: string, label: string): MacSignMode {
  if (value === "unsigned" || value === "signed" || value === "notarized") return value;
  throw new Error(`${label} must be unsigned, signed, or notarized; got ${value}`);
}

function parseWinSignMode(value: string, label: string): WinX64SignMode {
  if (value === "unsigned" || value === "signed") return value;
  throw new Error(`${label} must be unsigned or signed; got ${value}`);
}

export function releaseParameterMatrixFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ReleaseParameterMatrix {
  return {
    mac_arm64: {
      signMode: parseMacSignMode(
        env.RELEASE_MAC_ARM64_SIGN_MODE ?? defaultReleaseParameterMatrix.mac_arm64.signMode,
        "RELEASE_MAC_ARM64_SIGN_MODE",
      ),
    },
    mac_x64: {
      signMode: parseMacSignMode(
        env.RELEASE_MAC_X64_SIGN_MODE ?? defaultReleaseParameterMatrix.mac_x64.signMode,
        "RELEASE_MAC_X64_SIGN_MODE",
      ),
    },
    win_x64: {
      signMode: parseWinSignMode(
        env.RELEASE_WIN_X64_SIGN_MODE ?? defaultReleaseParameterMatrix.win_x64.signMode,
        "RELEASE_WIN_X64_SIGN_MODE",
      ),
    },
  };
}

export function signModeForTarget(
  target: ReleaseTarget,
  matrix: ReleaseParameterMatrix,
): PlatformSignMode {
  return matrix[target].signMode;
}
