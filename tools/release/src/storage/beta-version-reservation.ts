import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { githubInfo, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
import { getStorageObjectText, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";
import { parseCountedReleaseVersion, type CountedReleaseChannel } from "@open-design/release";

export type CountedVersionReservation = {
  baseVersion: string;
  channel: CountedReleaseChannel;
  createdAt: string;
  kind: "version-reservation";
  lane: string;
  owner: Record<string, unknown>;
  releaseNumber: number;
  releaseVersion: string;
  state: "reserved";
  version: 1;
};

export type BetaVersionReservation = CountedVersionReservation & {
  betaNumber?: number;
  channel: "beta";
};

function requiredCountedChannel(): CountedReleaseChannel {
  const channel = required("RELEASE_CHANNEL");
  if (channel === "stable") throw new Error("version reservation only supports counted release channels");
  return channel as CountedReleaseChannel;
}

export function parseCountedVersion(value: string, channel: CountedReleaseChannel): { baseVersion: string; releaseNumber: number; releaseVersion: string } {
  const parsed = parseCountedReleaseVersion(value, channel);
  if (parsed == null) {
    throw new Error(`release version must be x.y.z-${channel}.N; got ${value}`);
  }
  return {
    baseVersion: parsed.baseVersion,
    releaseNumber: parsed.number,
    releaseVersion: value,
  };
}

export function parseBetaVersion(value: string): { baseVersion: string; betaNumber: number; releaseVersion: string } {
  const parsed = parseCountedVersion(value, "beta");
  return { baseVersion: parsed.baseVersion, betaNumber: parsed.releaseNumber, releaseVersion: parsed.releaseVersion };
}

export function versionLockObjectKey(releaseVersion: string, channel: CountedReleaseChannel = "beta"): string {
  return `${channel}/versions/${releaseVersion}/version.lock.json`;
}

function sameOwner(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return left.repository === right.repository &&
    left.workflow === right.workflow &&
    left.runId === right.runId &&
    left.commit === right.commit;
}

export async function readVersionReservation(storage: StorageConfig, objectKey: string): Promise<CountedVersionReservation | null> {
  const text = await getStorageObjectText({ ...storage, objectKey });
  if (text == null) return null;
  const parsed = JSON.parse(text.replace(/^\uFEFF/u, "")) as CountedVersionReservation;
  return parsed;
}

export function validateVersionReservation(reservation: CountedVersionReservation, releaseVersion: string, channel: CountedReleaseChannel = "beta"): string | null {
  const owner = githubInfo();
  if (reservation.kind !== "version-reservation") return `kind=${String(reservation.kind)}`;
  if (reservation.channel !== channel) return `channel=${String(reservation.channel)}`;
  if (reservation.releaseVersion !== releaseVersion) return `releaseVersion=${String(reservation.releaseVersion)}`;
  if (reservation.state !== "reserved") return `state=${String(reservation.state)}`;
  if (!sameOwner(reservation.owner, owner)) {
    return `owner=${JSON.stringify(reservation.owner)} current=${JSON.stringify(owner)}`;
  }
  return null;
}

export async function assertCurrentVersionReservation(storage: StorageConfig, releaseVersion: string, objectKey = versionLockObjectKey(releaseVersion), channel: CountedReleaseChannel = "beta"): Promise<CountedVersionReservation> {
  const reservation = await readVersionReservation(storage, objectKey);
  if (reservation == null) {
    throw new Error(`missing ${channel} version reservation: ${objectKey}`);
  }
  const invalidReason = validateVersionReservation(reservation, releaseVersion, channel);
  if (invalidReason != null) {
    throw new Error(`${channel} version reservation is not owned by this run: ${objectKey}: ${invalidReason}`);
  }
  return reservation;
}

export async function reserveVersion(options: {
  baseVersion: string;
  candidateVersion: string;
  channel?: CountedReleaseChannel;
  lane: string;
  manualOverride: boolean;
  maxAttempts: number;
  metadataDir: string;
  publicOrigin: string;
  storage: StorageConfig;
}): Promise<{ objectKey: string; reservation: CountedVersionReservation; url: string }> {
  const channel = options.channel ?? "beta";
  const candidate = parseCountedVersion(options.candidateVersion, channel);
  if (candidate.baseVersion !== options.baseVersion) {
    throw new Error(`candidate baseVersion ${candidate.baseVersion} does not match ${options.baseVersion}`);
  }

  const attempts = options.manualOverride ? 1 : options.maxAttempts;
  for (let offset = 0; offset < attempts; offset += 1) {
    const releaseNumber = candidate.releaseNumber + offset;
    const releaseVersion = `${options.baseVersion}-${channel}.${releaseNumber}`;
    const objectKey = versionLockObjectKey(releaseVersion, channel);
    const reservation: CountedVersionReservation = {
      baseVersion: options.baseVersion,
      channel,
      createdAt: new Date().toISOString(),
      kind: "version-reservation",
      lane: options.lane,
      owner: githubInfo(),
      releaseNumber,
      releaseVersion,
      state: "reserved",
      version: 1,
    };
    const bodyPath = join(options.metadataDir, "version.lock.json");
    writeJson(bodyPath, reservation);

    const result = await putStorageObjectWithStatus({
      ...options.storage,
      bodyPath,
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "application/json; charset=utf-8",
      headers: { "if-none-match": "*" },
      objectKey,
    });
    const accept = (reservation: CountedVersionReservation) => {
      writeJson(join(options.metadataDir, "reserved-version.lock.json"), reservation);
      return {
        objectKey,
        reservation,
        url: publicUrl(options.publicOrigin, `${channel}/versions/${releaseVersion}`, "version.lock.json"),
      };
    };
    if (result.ok) {
      return accept(await assertCurrentVersionReservation(options.storage, releaseVersion, objectKey, channel));
    }
    if (result.status !== 412) {
      throw new Error(`version reservation PUT ${objectKey} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
    }
    // A 412 means the lock object already exists. The conditional PUT is not
    // idempotent, so this can be an ambiguous-success: a transient reset (the
    // exact failure the network retry recovers from) can drop the response
    // after R2 already created OUR lock, and the retried PUT then sees 412.
    // Read the lock back — if this run owns it, the reservation truly succeeded.
    // Only a lock owned by a different run is a real collision.
    const existing = await readVersionReservation(options.storage, objectKey);
    if (existing != null && validateVersionReservation(existing, releaseVersion, channel) == null) {
      return accept(existing);
    }
    if (options.manualOverride) {
      throw new Error(`release_version ${releaseVersion} is already reserved at ${objectKey}`);
    }
    console.log(`${channel} version ${releaseVersion} is already reserved; trying next release number`);
  }

  throw new Error(`failed to reserve a ${channel} version after ${attempts} attempts starting at ${options.candidateVersion}`);
}

export function writeGithubOutputs(outputs: Record<string, string>): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0) return;
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n");
  writeFileSync(outputPath, `${lines}\n`, { flag: "a" });
}
