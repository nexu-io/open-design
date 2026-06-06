import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { githubInfo, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
import { getStorageObjectText, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

const betaVersionPattern = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/;

export type BetaVersionReservation = {
  baseVersion: string;
  betaNumber: number;
  channel: "beta";
  createdAt: string;
  kind: "version-reservation";
  lane: string;
  owner: Record<string, unknown>;
  releaseVersion: string;
  state: "reserved";
  version: 1;
};

export function parseBetaVersion(value: string): { baseVersion: string; betaNumber: number; releaseVersion: string } {
  const match = betaVersionPattern.exec(value);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`release version must be x.y.z-beta.N; got ${value}`);
  }
  const betaNumber = Number(match[2]);
  if (!Number.isSafeInteger(betaNumber) || betaNumber < 1) {
    throw new Error(`release version beta number must be a positive integer; got ${value}`);
  }
  return {
    baseVersion: match[1],
    betaNumber,
    releaseVersion: value,
  };
}

export function versionLockObjectKey(releaseVersion: string): string {
  return `beta/versions/${releaseVersion}/version.lock.json`;
}

function sameOwner(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return left.repository === right.repository &&
    left.workflow === right.workflow &&
    left.runId === right.runId &&
    left.runAttempt === right.runAttempt &&
    left.commit === right.commit;
}

export async function readVersionReservation(storage: StorageConfig, objectKey: string): Promise<BetaVersionReservation | null> {
  const text = await getStorageObjectText({ ...storage, objectKey });
  if (text == null) return null;
  const parsed = JSON.parse(text.replace(/^\uFEFF/u, "")) as BetaVersionReservation;
  return parsed;
}

export function validateVersionReservation(reservation: BetaVersionReservation, releaseVersion: string): string | null {
  const owner = githubInfo();
  if (reservation.kind !== "version-reservation") return `kind=${String(reservation.kind)}`;
  if (reservation.channel !== "beta") return `channel=${String(reservation.channel)}`;
  if (reservation.releaseVersion !== releaseVersion) return `releaseVersion=${String(reservation.releaseVersion)}`;
  if (reservation.state !== "reserved") return `state=${String(reservation.state)}`;
  if (!sameOwner(reservation.owner, owner)) {
    return `owner=${JSON.stringify(reservation.owner)} current=${JSON.stringify(owner)}`;
  }
  return null;
}

export async function assertCurrentVersionReservation(storage: StorageConfig, releaseVersion: string, objectKey = versionLockObjectKey(releaseVersion)): Promise<BetaVersionReservation> {
  const reservation = await readVersionReservation(storage, objectKey);
  if (reservation == null) {
    throw new Error(`missing beta version reservation: ${objectKey}`);
  }
  const invalidReason = validateVersionReservation(reservation, releaseVersion);
  if (invalidReason != null) {
    throw new Error(`beta version reservation is not owned by this run: ${objectKey}: ${invalidReason}`);
  }
  return reservation;
}

export async function reserveVersion(options: {
  baseVersion: string;
  candidateVersion: string;
  lane: string;
  manualOverride: boolean;
  maxAttempts: number;
  metadataDir: string;
  publicOrigin: string;
  storage: StorageConfig;
}): Promise<{ objectKey: string; reservation: BetaVersionReservation; url: string }> {
  const candidate = parseBetaVersion(options.candidateVersion);
  if (candidate.baseVersion !== options.baseVersion) {
    throw new Error(`candidate baseVersion ${candidate.baseVersion} does not match ${options.baseVersion}`);
  }

  const attempts = options.manualOverride ? 1 : options.maxAttempts;
  for (let offset = 0; offset < attempts; offset += 1) {
    const betaNumber = candidate.betaNumber + offset;
    const releaseVersion = `${options.baseVersion}-beta.${betaNumber}`;
    const objectKey = versionLockObjectKey(releaseVersion);
    const reservation: BetaVersionReservation = {
      baseVersion: options.baseVersion,
      betaNumber,
      channel: "beta",
      createdAt: new Date().toISOString(),
      kind: "version-reservation",
      lane: options.lane,
      owner: githubInfo(),
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
    if (result.ok) {
      const readBack = await assertCurrentVersionReservation(options.storage, releaseVersion, objectKey);
      writeJson(join(options.metadataDir, "reserved-version.lock.json"), readBack);
      return {
        objectKey,
        reservation: readBack,
        url: publicUrl(options.publicOrigin, `beta/versions/${releaseVersion}`, "version.lock.json"),
      };
    }
    if (result.status !== 412) {
      throw new Error(`version reservation PUT ${objectKey} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
    }
    if (options.manualOverride) {
      throw new Error(`release_version ${releaseVersion} is already reserved at ${objectKey}`);
    }
    console.log(`beta version ${releaseVersion} is already reserved; trying next beta number`);
  }

  throw new Error(`failed to reserve a beta version after ${attempts} attempts starting at ${options.candidateVersion}`);
}

export function writeGithubOutputs(outputs: Record<string, string>): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0) return;
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n");
  writeFileSync(outputPath, `${lines}\n`, { flag: "a" });
}
