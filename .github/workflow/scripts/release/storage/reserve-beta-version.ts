import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { required, storageConfigFromEnv } from "./common.ts";
import { reserveVersion, writeGithubOutputs } from "./beta-version-reservation.ts";

const releaseChannel = required("RELEASE_CHANNEL");
if (releaseChannel !== "beta") {
  throw new Error(`reserve-beta-version only supports beta, got ${releaseChannel}`);
}

const metadataDir = required("RELEASE_METADATA_DIR");
mkdirSync(metadataDir, { recursive: true });

const candidateVersion = required("RELEASE_VERSION_CANDIDATE");
const baseVersion = required("BASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const lane = required("RELEASE_LANE");
const manualOverride = process.env.RELEASE_VERSION_MANUAL_OVERRIDE === "true";
const maxAttempts = Number(process.env.RELEASE_VERSION_RESERVATION_MAX_ATTEMPTS ?? "200");
if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
  throw new Error(`RELEASE_VERSION_RESERVATION_MAX_ATTEMPTS must be a positive integer; got ${String(process.env.RELEASE_VERSION_RESERVATION_MAX_ATTEMPTS)}`);
}

const { objectKey, reservation, url } = await reserveVersion({
  baseVersion,
  candidateVersion,
  lane,
  manualOverride,
  maxAttempts,
  metadataDir,
  publicOrigin,
  storage: storageConfigFromEnv(),
});

writeGithubOutputs({
  beta_number: String(reservation.betaNumber),
  beta_version: reservation.releaseVersion,
  release_name: `Open Design Beta ${reservation.releaseVersion}`,
  state_source: `reserved ${objectKey}`,
  version_lock_key: objectKey,
  version_lock_url: url,
});

console.log(`reserved beta version ${reservation.releaseVersion} at ${objectKey}`);
console.log(`reservation: ${join(metadataDir, "reserved-version.lock.json")}`);
