import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { ATTRIBUTION_CLAIM_PATH, type AttributionClaimResponse } from "@open-design/contracts";

import type { PackagedDesktopLogger } from "./logging.js";
import type { PackagedNamespacePaths } from "./paths.js";

const execFileAsync = promisify(execFile);
const OBSERVATION_FILE = "download-attribution.json";
const HANDLED_OBSERVATION_FILE = "download-attribution-handled.json";

export type PackagedDownloadAttribution = {
  token: string;
  rawUrl: string | null;
  source: "mac_where_froms" | "windows_zone_identifier" | "installer_observation_file";
  platform: "macos" | "windows" | "unknown";
};

export function extractDownloadAttributionTokenFromUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 2; i += 1) {
    const os = parts[i];
    const arch = parts[i + 1];
    const token = parts[i + 2];
    if (!/^(mac|macos|win|windows|linux)$/i.test(os)) continue;
    if (!/^[A-Za-z0-9._-]+$/.test(arch)) continue;
    if (/^[A-Za-z0-9_-]{8,160}$/.test(token)) return token;
  }
  return null;
}

export async function discoverPackagedDownloadAttribution(
  paths: PackagedNamespacePaths,
  logger?: Pick<PackagedDesktopLogger, "warn"> | null,
): Promise<PackagedDownloadAttribution | null> {
  const observed = await readInstallerObservation(paths.installerObservationRoot);
  const handledToken = await readHandledToken(paths.installerObservationRoot);
  if (observed) return observed.token === handledToken ? null : observed;
  if (process.platform === "darwin") {
    const discovered = await discoverMacWhereFromsAttribution(logger);
    return discovered?.token === handledToken ? null : discovered;
  }
  return null;
}

export async function claimPackagedDownloadAttribution(input: {
  attribution: PackagedDownloadAttribution | null;
  daemonUrl: string;
  installerObservationRoot?: string;
  logger?: Pick<PackagedDesktopLogger, "warn"> | null;
}): Promise<void> {
  if (!input.attribution) return;
  try {
    const response = await fetch(`${input.daemonUrl.replace(/\/+$/, "")}${ATTRIBUTION_CLAIM_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.attribution),
    });
    const claim = response.ok ? await response.json().catch(() => null) : null;
    if (input.installerObservationRoot && isTerminalClaim(claim)) {
      await writeHandledToken(input.installerObservationRoot, input.attribution.token);
    }
  } catch (error) {
    input.logger?.warn("failed to claim packaged download attribution", { error });
  }
}

function isTerminalClaim(value: unknown): value is AttributionClaimResponse {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status === "claimed"
    || status === "already_claimed"
    || status === "shared_installer"
    || status === "not_found";
}

async function readInstallerObservation(root: string): Promise<PackagedDownloadAttribution | null> {
  try {
    const parsed = JSON.parse(await readFile(join(root, OBSERVATION_FILE), "utf8")) as Record<string, unknown>;
    const rawUrl = typeof parsed.rawUrl === "string" ? parsed.rawUrl : null;
    const token = typeof parsed.token === "string"
      ? parsed.token
      : rawUrl
        ? extractDownloadAttributionTokenFromUrl(rawUrl)
        : null;
    if (!token) return null;
    return {
      token,
      rawUrl,
      source: "installer_observation_file",
      platform: process.platform === "win32" ? "windows" : "unknown",
    };
  } catch {
    return null;
  }
}

async function readHandledToken(root: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(join(root, HANDLED_OBSERVATION_FILE), "utf8")) as Record<string, unknown>;
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

async function writeHandledToken(root: string, token: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, HANDLED_OBSERVATION_FILE), JSON.stringify({ token, handledAt: new Date().toISOString() }));
}

async function discoverMacWhereFromsAttribution(
  logger?: Pick<PackagedDesktopLogger, "warn"> | null,
): Promise<PackagedDownloadAttribution | null> {
  const appBundle = resolveCurrentMacAppBundle(process.execPath);
  if (!appBundle) return null;
  const appQuarantine = await readXattrText(appBundle, "com.apple.quarantine");
  const quarantineId = parseQuarantineUuid(appQuarantine);
  if (!quarantineId) return null;
  const candidates = await listRecentDmgCandidates(join(homedir(), "Downloads"));
  for (const file of candidates) {
    const dmgQuarantine = await readXattrText(file, "com.apple.quarantine");
    if (parseQuarantineUuid(dmgQuarantine) !== quarantineId) continue;
    const urls = await readWhereFroms(file).catch((error: unknown) => {
      logger?.warn("failed to read mac whereFroms", { error, file });
      return [];
    });
    for (const rawUrl of urls) {
      const token = extractDownloadAttributionTokenFromUrl(rawUrl);
      if (token) return { token, rawUrl, source: "mac_where_froms", platform: "macos" };
    }
  }
  return null;
}

function resolveCurrentMacAppBundle(execPath: string): string | null {
  const marker = ".app/Contents/MacOS/";
  const idx = execPath.indexOf(marker);
  if (idx === -1) return null;
  return execPath.slice(0, idx + ".app".length);
}

function parseQuarantineUuid(value: string | null): string | null {
  if (!value) return null;
  const parts = value.trim().split(";");
  const uuid = parts[3]?.trim();
  return uuid && /^[A-Fa-f0-9-]{16,}$/.test(uuid) ? uuid : null;
}

async function listRecentDmgCandidates(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const withTimes = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /\.dmg$/i.test(entry.name))
        .map(async (entry) => {
          const path = join(root, entry.name);
          const info = await stat(path);
          return { path, mtimeMs: info.mtimeMs };
        }),
    );
    return withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 20).map((entry) => entry.path);
  } catch {
    return [];
  }
}

async function readXattrText(path: string, name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("xattr", ["-p", name, path], { timeout: 1500 });
    return String(stdout).trim();
  } catch {
    return null;
  }
}

async function readWhereFroms(path: string): Promise<string[]> {
  const { stdout } = await execFileAsync("xattr", ["-px", "com.apple.metadata:kMDItemWhereFroms", path], {
    timeout: 1500,
    maxBuffer: 1024 * 1024,
  });
  const bytes = Buffer.from(String(stdout).replace(/\s+/g, ""), "hex");
  const scratch = join(tmpdir(), `od-wherefroms-${process.pid}-${Date.now()}-${basename(path)}.plist`);
  await mkdir(dirname(scratch), { recursive: true });
  try {
    await writeFile(scratch, bytes);
    const converted = await execFileAsync("plutil", ["-convert", "json", "-o", "-", scratch], {
      timeout: 1500,
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(String(converted.stdout)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } finally {
    if (existsSync(scratch)) await rm(scratch, { force: true });
  }
}
