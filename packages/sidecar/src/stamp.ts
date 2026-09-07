import { createHash } from "node:crypto";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import type { ProcessStampContract } from "@open-design/platform";
import { readProcessStamp } from "@open-design/platform";

export const SIDECAR_STAMP_FIELDS = ["channel", "namespace", "source", "mode", "app"] as const;

export type SidecarStampField = (typeof SIDECAR_STAMP_FIELDS)[number];

export type SidecarStamp = {
  channel: string;
  namespace: string;
  source: string;
  mode: string;
  app: string;
};

export const SIDECAR_STAMP_FLAGS: Readonly<Record<SidecarStampField, string>> = Object.freeze({
  channel: "--od-stamp-channel",
  namespace: "--od-stamp-namespace",
  source: "--od-stamp-source",
  mode: "--od-stamp-mode",
  app: "--od-stamp-app",
});

/** Internal argv marker for a client-side launch attempt that has not claimed generation ownership. */
export const SIDECAR_LIFECYCLE_FLAG = "--od-sidecar-lifecycle";
export const SIDECAR_LAUNCHER_LIFECYCLE = "launcher";
const SIDECAR_LAUNCHER_ARG = `${SIDECAR_LIFECYCLE_FLAG}=${SIDECAR_LAUNCHER_LIFECYCLE}`;
export const SIDECAR_SUPERVISED_CONTEXT_ENV = "OD_SIDECAR_SUPERVISED_CONTEXT";

export type SupervisedSidecarContext = Readonly<{
  generationPid: number;
  resources: unknown;
  stamp: SidecarStamp;
}>;

function normalizeStampToken(value: unknown, field: SidecarStampField): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`sidecar stamp ${field} must be a non-empty string without surrounding whitespace`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`sidecar stamp ${field} contains unsupported characters: ${value}`);
  }
  return value;
}

export function normalizeSidecarStamp(input: unknown): SidecarStamp {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    throw new Error("sidecar stamp must be an object");
  }
  const value = input as Record<string, unknown>;
  const unexpected = Object.keys(value).filter((field) => !SIDECAR_STAMP_FIELDS.includes(field as SidecarStampField));
  if (unexpected.length > 0) throw new Error(`sidecar stamp contains unsupported fields: ${unexpected.join(", ")}`);
  return {
    channel: normalizeStampToken(value.channel, "channel"),
    namespace: normalizeStampToken(value.namespace, "namespace"),
    source: normalizeStampToken(value.source, "source"),
    mode: normalizeStampToken(value.mode, "mode"),
    app: normalizeStampToken(value.app, "app"),
  };
}

export const SIDECAR_STAMP_CONTRACT: ProcessStampContract<SidecarStamp, SidecarStamp> = Object.freeze({
  normalizeStamp: normalizeSidecarStamp,
  normalizeStampCriteria: normalizeSidecarStamp,
  stampFields: SIDECAR_STAMP_FIELDS,
  stampFlags: SIDECAR_STAMP_FLAGS,
});

export function readCurrentSidecarArgvStamp(): SidecarStamp {
  const stamp = readProcessStamp(process.argv.slice(1), SIDECAR_STAMP_CONTRACT);
  if (stamp == null) throw new Error("the five-field sidecar argv stamp is required");
  return stamp;
}

/** Read the resource identity supplied by either a launcher argv or its committed supervisor. */
export function readCurrentSidecarStamp(): SidecarStamp {
  return readSupervisedSidecarContext()?.stamp ?? readCurrentSidecarArgvStamp();
}

export function serializeSupervisedSidecarContext(
  stampInput: SidecarStamp,
  generationPid: number,
  resources: unknown,
): string {
  if (!Number.isSafeInteger(generationPid) || generationPid <= 0) {
    throw new Error("sidecar generation pid must be a positive safe integer");
  }
  return JSON.stringify({ generationPid, resources, stamp: normalizeSidecarStamp(stampInput) });
}

export function readSupervisedSidecarContext(
  env: NodeJS.ProcessEnv = process.env,
): SupervisedSidecarContext | null {
  const serialized = env[SIDECAR_SUPERVISED_CONTEXT_ENV];
  if (serialized == null) return null;
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`${SIDECAR_SUPERVISED_CONTEXT_ENV} must contain valid JSON`, { cause: error });
  }
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${SIDECAR_SUPERVISED_CONTEXT_ENV} must contain a context object`);
  }
  const context = value as Record<string, unknown>;
  const generationPid = Number(context.generationPid);
  if (!Number.isSafeInteger(generationPid) || generationPid <= 0) {
    throw new Error(`${SIDECAR_SUPERVISED_CONTEXT_ENV} contains an invalid generation pid`);
  }
  return Object.freeze({
    generationPid,
    resources: context.resources,
    stamp: normalizeSidecarStamp(context.stamp),
  });
}

export function isCurrentSidecarLauncher(): boolean {
  return process.argv.slice(1).includes(SIDECAR_LAUNCHER_ARG);
}

export function isSidecarLauncherCommand(command: string): boolean {
  return command.split(/\s+/).some((token) => token.replace(/^['"]|['"]$/g, "") === SIDECAR_LAUNCHER_ARG);
}

export function createSidecarLauncherArgs(stamp: SidecarStamp): string[] {
  const normalized = normalizeSidecarStamp(stamp);
  return [
    ...SIDECAR_STAMP_FIELDS.map((field) => `${SIDECAR_STAMP_FLAGS[field]}=${normalized[field]}`),
    SIDECAR_LAUNCHER_ARG,
  ];
}

export function removeSidecarLauncherArgs(args: readonly string[]): string[] {
  const stampPrefixes = SIDECAR_STAMP_FIELDS.map((field) => `${SIDECAR_STAMP_FLAGS[field]}=`);
  return args.filter((argument) =>
    argument !== SIDECAR_LAUNCHER_ARG &&
    !stampPrefixes.some((prefix) => argument.startsWith(prefix)),
  );
}

export function sidecarStampKey(stamp: SidecarStamp): string {
  const value = normalizeSidecarStamp(stamp);
  return SIDECAR_STAMP_FIELDS.map((field) => `${field}=${value[field]}`).join("\n");
}

export function resolvePrivateIpcPath(stamp: SidecarStamp, platform: NodeJS.Platform = process.platform): string {
  const principal = platform === "win32"
    ? (() => {
        try { return userInfo().username; } catch { return process.env.USERNAME ?? process.env.USER ?? "unknown"; }
      })()
    : String(process.getuid?.() ?? process.env.USER ?? "unknown");
  const digest = createHash("sha256").update(`${principal}\n${sidecarStampKey(stamp)}`).digest("hex").slice(0, 32);
  return platform === "win32"
    ? `\\\\.\\pipe\\open-design-sidecar-${digest}`
    : join(tmpdir(), `od-sidecar-${principal}`, `${digest}.sock`);
}
