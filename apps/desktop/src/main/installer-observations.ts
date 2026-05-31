import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { DesktopUpdateChannel } from "@open-design/sidecar-proto";

export const INSTALLER_OBSERVATION_SCHEMA_VERSION = 1;
export const INSTALLER_OBSERVATION_KIND = "installer_apply_observation";

export type InstallerObservationArtifactType = "dmg" | "installer";
export type InstallerObservationResult = "pending" | "success" | "not_applied" | "unknown";
export type InstallerObservationReason =
  | "installer_open_requested"
  | "installer_open_failed"
  | "app_version_matches"
  | "app_version_unchanged"
  | "expired"
  | "identity_mismatch";

export type InstallerObservationSummary = {
  arch: string;
  artifactType: InstallerObservationArtifactType;
  attemptedAt: string;
  channel: DesktopUpdateChannel;
  flowId: string;
  fromVersion: string;
  kind: typeof INSTALLER_OBSERVATION_KIND;
  namespace: string;
  platform: string;
  reason: InstallerObservationReason;
  result: InstallerObservationResult;
  schemaVersion: typeof INSTALLER_OBSERVATION_SCHEMA_VERSION;
  toVersion: string;
  updatedAt: string;
};

export type PendingInstallerObservationInput = {
  arch: string;
  artifactType: InstallerObservationArtifactType;
  attemptedAt: string;
  channel: DesktopUpdateChannel;
  flowId?: string;
  fromVersion: string;
  namespace: string;
  platform: string;
  root: string;
  toVersion: string;
};

export type InstallerObservationHandle = {
  flowId: string;
  summaryPath: string;
};

export function isSafeInstallerObservationFlowId(flowId: string): boolean {
  return (
    flowId.length > 0 &&
    flowId.length <= 128 &&
    flowId !== "." &&
    flowId !== ".." &&
    /^[A-Za-z0-9._-]+$/.test(flowId)
  );
}

function assertSafeFlowId(flowId: string): void {
  if (!isSafeInstallerObservationFlowId(flowId)) {
    throw new Error(`installer observation flow_id is not a safe path segment: ${flowId}`);
  }
}

function containsPath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

export function installerObservationSummaryPath(root: string, flowId: string): string {
  if (!isAbsolute(root)) throw new Error(`installer observation root must be absolute: ${root}`);
  assertSafeFlowId(flowId);
  const resolvedRoot = resolve(root);
  const summaryPath = resolve(resolvedRoot, flowId, "summary.json");
  if (!containsPath(resolvedRoot, summaryPath)) {
    throw new Error("installer observation summary path escaped observation root");
  }
  return summaryPath;
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

export async function writePendingInstallerObservation(
  input: PendingInstallerObservationInput,
): Promise<InstallerObservationHandle> {
  const flowId = input.flowId ?? randomUUID();
  const summaryPath = installerObservationSummaryPath(input.root, flowId);
  const summary: InstallerObservationSummary = {
    arch: input.arch,
    artifactType: input.artifactType,
    attemptedAt: input.attemptedAt,
    channel: input.channel,
    flowId,
    fromVersion: input.fromVersion,
    kind: INSTALLER_OBSERVATION_KIND,
    namespace: input.namespace,
    platform: input.platform,
    reason: "installer_open_requested",
    result: "pending",
    schemaVersion: INSTALLER_OBSERVATION_SCHEMA_VERSION,
    toVersion: input.toVersion,
    updatedAt: input.attemptedAt,
  };
  await writeJson(summaryPath, summary);
  return { flowId, summaryPath };
}

export async function markInstallerObservationOpenFailed(
  handle: InstallerObservationHandle,
  failedAt: string,
): Promise<void> {
  const parsed = JSON.parse(await readFile(handle.summaryPath, "utf8")) as Record<string, unknown>;
  await writeJson(handle.summaryPath, {
    ...parsed,
    reason: "installer_open_failed",
    result: "unknown",
    updatedAt: failedAt,
  });
}
