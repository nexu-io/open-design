import {
  LauncherProtocolError,
  normalizeLauncherGeneration,
  normalizeLauncherHandoffId,
  normalizeLauncherVersion,
  type LauncherAttemptDescriptor,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPointer,
} from "@open-design/shell/update";

export const LAUNCHER_AFTER_QUIT_FLAG = "--od-launcher-after-quit" as const;
export const LAUNCHER_AFTER_QUIT_TARGET_PID_ARG = "--od-launcher-target-pid" as const;
export const LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG = "--od-launcher-timeout-ms" as const;
export const LAUNCHER_HANDOFF_RESUME_ARG = "--od-launcher-resume-handoff" as const;
export const LAUNCHER_DELEGATED_GENERATION_ARG = "--od-launcher-delegated-generation" as const;
export const LAUNCHER_DELEGATED_VERSION_ARG = "--od-launcher-delegated-version" as const;

export type LauncherTargetSelection =
  | { pointer: LauncherVersionPointer; reason: "active"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "active-delegated"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "active-resume"; selected: true }
  | { pointer: LauncherVersionPointer; reason: "last-successful"; selected: true }
  | { reason: "no-runtime-target"; selected: false };

export type LauncherAfterQuitRequest = {
  targetPid: number;
  timeoutMs: number;
};

export type LauncherHandoffResumeRequest = {
  handoffId: string;
};

type ParsedComparableVersion = {
  nums: [number, number, number];
  pre: string[];
};

function numberPart(value: string | undefined): number {
  return value != null && /^[0-9]+$/.test(value) ? Number(value) : 0;
}

function parseComparableLauncherVersion(value: string): ParsedComparableVersion {
  const cleaned = value.trim().replace(/^v/i, "").split("+", 1)[0] ?? "";
  const nightlyMatch = /^(\d+)\.(\d+)\.(\d+)\.nightly\.(\d+)$/i.exec(cleaned);
  if (nightlyMatch?.[1] != null && nightlyMatch[2] != null && nightlyMatch[3] != null && nightlyMatch[4] != null) {
    return {
      nums: [Number(nightlyMatch[1]), Number(nightlyMatch[2]), Number(nightlyMatch[3])],
      pre: ["nightly", nightlyMatch[4]],
    };
  }

  const prereleaseSeparator = cleaned.indexOf("-");
  const core = prereleaseSeparator === -1 ? cleaned : cleaned.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : cleaned.slice(prereleaseSeparator + 1);
  const nums = core.split(".");
  return {
    nums: [numberPart(nums[0]), numberPart(nums[1]), numberPart(nums[2])],
    pre: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function compareLauncherIdentifier(a: string, b: string): number {
  const aNum = /^[0-9]+$/.test(a) ? Number(a) : null;
  const bNum = /^[0-9]+$/.test(b) ? Number(b) : null;
  if (aNum != null && bNum != null) return Math.sign(aNum - bNum);
  if (aNum != null) return -1;
  if (bNum != null) return 1;
  return a.localeCompare(b);
}

export function compareLauncherVersions(a: string, b: string): number {
  const left = parseComparableLauncherVersion(a);
  const right = parseComparableLauncherVersion(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left.nums[index] ?? 0) - (right.nums[index] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0;
  if (left.pre.length === 0) return 1;
  if (right.pre.length === 0) return -1;
  const max = Math.max(left.pre.length, right.pre.length);
  for (let index = 0; index < max; index += 1) {
    const l = left.pre[index];
    const r = right.pre[index];
    if (l == null) return -1;
    if (r == null) return 1;
    const delta = compareLauncherIdentifier(l, r);
    if (delta !== 0) return delta;
  }
  return 0;
}

function normalizePositiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new LauncherProtocolError(`${label} must be a positive safe integer`);
  }
  return parsed;
}

function valueAfterArg(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function normalizePointer(value: LauncherVersionPointer | null): LauncherVersionPointer | null {
  if (value == null) return null;
  return {
    generation: normalizeLauncherGeneration(value.generation),
    version: normalizeLauncherVersion(value.version),
  };
}

export function buildLauncherAfterQuitArgs(request: LauncherAfterQuitRequest): string[] {
  return [
    LAUNCHER_AFTER_QUIT_FLAG,
    LAUNCHER_AFTER_QUIT_TARGET_PID_ARG,
    normalizePositiveInteger(request.targetPid, "launcher after-quit target pid").toString(),
    LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG,
    normalizePositiveInteger(request.timeoutMs, "launcher after-quit timeout").toString(),
  ];
}

export function parseLauncherAfterQuitArgs(args: readonly string[]): LauncherAfterQuitRequest | null {
  if (!args.includes(LAUNCHER_AFTER_QUIT_FLAG)) return null;
  return {
    targetPid: normalizePositiveInteger(
      valueAfterArg(args, LAUNCHER_AFTER_QUIT_TARGET_PID_ARG),
      "launcher after-quit target pid",
    ),
    timeoutMs: normalizePositiveInteger(
      valueAfterArg(args, LAUNCHER_AFTER_QUIT_TIMEOUT_MS_ARG),
      "launcher after-quit timeout",
    ),
  };
}

/**
 * A parent that pre-arms attempt.json passes the pointer to the child so the
 * child can distinguish its current launch from a previous failed attempt.
 */
export function buildLauncherDelegatedArgs(pointer: LauncherVersionPointer): string[] {
  return [
    LAUNCHER_DELEGATED_GENERATION_ARG,
    normalizeLauncherGeneration(pointer.generation).toString(),
    LAUNCHER_DELEGATED_VERSION_ARG,
    normalizeLauncherVersion(pointer.version),
  ];
}

export function parseLauncherDelegatedArgs(args: readonly string[]): LauncherVersionPointer | null {
  if (!args.includes(LAUNCHER_DELEGATED_GENERATION_ARG)) return null;
  return {
    generation: normalizeLauncherGeneration(valueAfterArg(args, LAUNCHER_DELEGATED_GENERATION_ARG)),
    version: normalizeLauncherVersion(valueAfterArg(args, LAUNCHER_DELEGATED_VERSION_ARG)),
  };
}

export function buildLauncherHandoffResumeArgs(request: LauncherHandoffResumeRequest): string[] {
  return [LAUNCHER_HANDOFF_RESUME_ARG, normalizeLauncherHandoffId(request.handoffId)];
}

export function parseLauncherHandoffResumeArgs(args: readonly string[]): LauncherHandoffResumeRequest | null {
  if (!args.includes(LAUNCHER_HANDOFF_RESUME_ARG)) return null;
  return {
    handoffId: normalizeLauncherHandoffId(valueAfterArg(args, LAUNCHER_HANDOFF_RESUME_ARG)),
  };
}

export function selectLauncherRuntimeTarget(input: {
  attempted?: LauncherAttemptDescriptor | null;
  delegated?: LauncherVersionPointer | null;
  resume?: LauncherVersionPointer | null;
  runtime: LauncherRuntimeDescriptor;
}): LauncherTargetSelection {
  const active = normalizePointer(input.runtime.active);
  const lastSuccessful = normalizePointer(input.runtime.lastSuccessful);
  const delegated = input.delegated == null ? null : normalizePointer(input.delegated);
  const resume = input.resume == null ? null : normalizePointer(input.resume);
  const attempted = input.attempted == null
    ? null
    : {
        generation: normalizeLauncherGeneration(input.attempted.generation),
        version: normalizeLauncherVersion(input.attempted.version),
      };

  if (active == null) {
    return lastSuccessful == null
      ? { reason: "no-runtime-target", selected: false }
      : { pointer: lastSuccessful, reason: "last-successful", selected: true };
  }

  if (
    attempted != null &&
    attempted.version === active.version &&
    attempted.generation === active.generation
  ) {
    if (
      resume != null &&
      resume.version === active.version &&
      resume.generation === active.generation
    ) {
      return { pointer: active, reason: "active-resume", selected: true };
    }
    if (
      delegated != null &&
      delegated.version === active.version &&
      delegated.generation === active.generation
    ) {
      return { pointer: active, reason: "active-delegated", selected: true };
    }
    if (lastSuccessful == null) return { pointer: active, reason: "active", selected: true };
    return { pointer: lastSuccessful, reason: "last-successful", selected: true };
  }

  return { pointer: active, reason: "active", selected: true };
}
