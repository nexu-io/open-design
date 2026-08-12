import { winResources } from "./resources.js";

export const CLOSURE_PLATFORM_TARGETS = Object.freeze({
  DARWIN_ARM64: "darwin-arm64",
  DARWIN_X64: "darwin-x64",
  WIN32_X64: "win32-x64",
} as const);

export type ClosurePlatformTarget =
  (typeof CLOSURE_PLATFORM_TARGETS)[keyof typeof CLOSURE_PLATFORM_TARGETS];

export type ClosureArchiveInvocation = Readonly<{
  args: readonly string[];
  command: string;
}>;

export function resolveHostClosurePlatformTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ClosurePlatformTarget | null {
  if (platform === "darwin" && arch === "arm64") return CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64;
  if (platform === "darwin" && arch === "x64") return CLOSURE_PLATFORM_TARGETS.DARWIN_X64;
  if (platform === "win32" && arch === "x64") return CLOSURE_PLATFORM_TARGETS.WIN32_X64;
  return null;
}

export function normalizeClosurePlatformTarget(value: string | undefined): ClosurePlatformTarget {
  const candidate = value ?? resolveHostClosurePlatformTarget();
  if (candidate === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64) return candidate;
  if (candidate === CLOSURE_PLATFORM_TARGETS.DARWIN_X64) return candidate;
  if (candidate === CLOSURE_PLATFORM_TARGETS.WIN32_X64) return candidate;
  throw new Error(`unsupported Closure platform target: ${String(candidate)}`);
}

export function resolveClosureArchiveInvocation(options: Readonly<{
  artifactPath: string;
  target: ClosurePlatformTarget;
}>): ClosureArchiveInvocation {
  if (
    options.target === CLOSURE_PLATFORM_TARGETS.DARWIN_ARM64
    || options.target === CLOSURE_PLATFORM_TARGETS.DARWIN_X64
  ) {
    return {
      args: ["-X", "-q", "-r", "-D", options.artifactPath, "."],
      command: "zip",
    };
  }
  return {
    args: [
      "a",
      "-tzip",
      "-mx=5",
      "-mta=off",
      "-mtc=off",
      "-mtm=off",
      options.artifactPath,
      ".\\*",
    ],
    command: winResources.sevenZipExe,
  };
}
