import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { required, storageConfigFromEnv } from "./common.ts";
import { reserveVersion, writeGithubOutputs } from "./beta-version-reservation.ts";

const releaseChannel = required("RELEASE_CHANNEL");
if (releaseChannel === "stable") throw new Error("reserve-version only supports counted channels");

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
  channel: releaseChannel as never,
  lane,
  manualOverride,
  maxAttempts,
  metadataDir,
  publicOrigin,
  storage: storageConfigFromEnv(),
});

writeGithubOutputs({
  ...(releaseChannel === "beta" ? { beta_number: String(reservation.releaseNumber), beta_version: reservation.releaseVersion } : {}),
  release_name: `Open Design ${releaseChannel === "betas" ? "Betas" : releaseChannel[0]?.toUpperCase() ?? ""}${releaseChannel === "betas" ? "" : releaseChannel.slice(1)} ${reservation.releaseVersion}`,
  release_number: String(reservation.releaseNumber),
  release_version: reservation.releaseVersion,
  state_source: `reserved ${objectKey}`,
  version_lock_key: objectKey,
  version_lock_url: url,
});

console.log(`reserved ${releaseChannel} version ${reservation.releaseVersion} at ${objectKey}`);
console.log(`reservation: ${join(metadataDir, "reserved-version.lock.json")}`);
