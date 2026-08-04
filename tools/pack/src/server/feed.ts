import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const ARCHIVE_NAME_PATTERN =
  /^open-design-server-([A-Za-z0-9][A-Za-z0-9._+-]*)-(darwin|linux|win32)-(arm64|x64)\.(tar\.gz|zip)$/;

export type ServerFeedArchiveEntry = {
  archiveName: string;
  archivePath: string;
  platform: "darwin" | "linux" | "win32";
  arch: "arm64" | "x64";
  sha256: string;
};

export type ServerReleaseFeedResult = {
  appVersion: string;
  archiveEntries: ServerFeedArchiveEntry[];
  feedRoot: string;
  latestVersionPath: string;
  sha256SumsPath: string;
  versionPrefix: string;
  versionRoot: string;
};

function cleanVersion(value: string, label: string): string {
  const normalized = value.trim().replace(/^v(?=\d)/, "");
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(normalized) ||
    normalized.includes("..")
  ) {
    throw new Error(`${label} must be a non-empty path-safe value`);
  }
  return normalized;
}

export function formatSha256SumsEntry(sha256: string, archiveName: string): string {
  const normalized = sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`invalid SHA-256 value for ${archiveName}`);
  }
  if (archiveName.includes("/") || archiveName.includes("\\") || archiveName.includes("..")) {
    throw new Error(`archive name must be a single path segment: ${archiveName}`);
  }
  return `${normalized}  ${archiveName}\n`;
}

export function formatSha256Sums(
  entries: ReadonlyArray<{ archiveName: string; sha256: string }>,
): string {
  const sorted = [...entries].sort((left, right) =>
    left.archiveName.localeCompare(right.archiveName),
  );
  return sorted
    .map((entry) => formatSha256SumsEntry(entry.sha256, entry.archiveName))
    .join("");
}

export async function hashFileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

function hashBytesSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function writeSha256SumsFile(
  path: string,
  entries: ReadonlyArray<{ archiveName: string; sha256: string }>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, formatSha256Sums(entries), "utf8");
}

export async function writeServerLatestVersionPointer(
  path: string,
  version: string,
): Promise<void> {
  const cleaned = cleanVersion(version, "server feed version");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${cleaned}\n`, "utf8");
}

async function readSha256Sidecar(
  archivePath: string,
  archiveName: string,
): Promise<string | null> {
  const sidecarPath = `${archivePath}.sha256`;
  try {
    const raw = await readFile(sidecarPath, "utf8");
    const line = raw
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => value.length > 0);
    if (line == null) return null;
    const match = /^([0-9a-fA-F]{64})(?:\s+\*?\S+)?$/.exec(line);
    if (match == null) {
      throw new Error(`invalid SHA-256 sidecar for ${archiveName}: ${sidecarPath}`);
    }
    const named = /^\S+\s+\*?(\S+)$/.exec(line);
    if (named != null && basename(named[1]!) !== archiveName) {
      throw new Error(
        `SHA-256 sidecar name mismatch for ${archiveName}: expected ${archiveName}, got ${named[1]}`,
      );
    }
    return match[1]!.toLowerCase();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseArchiveName(archiveName: string): {
  appVersion: string;
  arch: "arm64" | "x64";
  platform: "darwin" | "linux" | "win32";
} {
  const match = ARCHIVE_NAME_PATTERN.exec(archiveName);
  if (match == null) {
    throw new Error(
      `archive name must match open-design-server-<version>-<platform>-<arch>.(tar.gz|zip): ${archiveName}`,
    );
  }
  return {
    appVersion: match[1]!,
    platform: match[2] as "darwin" | "linux" | "win32",
    arch: match[3] as "arm64" | "x64",
  };
}

export async function resolveServerFeedArchiveEntry(
  archivePathInput: string,
): Promise<ServerFeedArchiveEntry> {
  const archivePath = resolve(archivePathInput);
  const archiveName = basename(archivePath);
  const parsed = parseArchiveName(archiveName);
  await stat(archivePath).then((info) => {
    if (!info.isFile()) {
      throw new Error(`server archive is not a file: ${archivePath}`);
    }
  });
  const sidecarSha = await readSha256Sidecar(archivePath, archiveName);
  const sha256 = sidecarSha ?? (await hashFileSha256(archivePath));
  if (sidecarSha != null) {
    const actual = await hashFileSha256(archivePath);
    if (actual !== sidecarSha) {
      throw new Error(
        `SHA-256 sidecar mismatch for ${archiveName} (sidecar ${sidecarSha}, actual ${actual})`,
      );
    }
  }
  return {
    archiveName,
    archivePath,
    arch: parsed.arch,
    platform: parsed.platform,
    sha256,
  };
}

export async function collectServerFeedArchives(
  inputs: ReadonlyArray<string>,
): Promise<ServerFeedArchiveEntry[]> {
  if (inputs.length === 0) {
    throw new Error("at least one server archive path or archives directory is required");
  }

  const archivePaths = new Set<string>();
  for (const input of inputs) {
    const resolved = resolve(input);
    const info = await stat(resolved);
    if (info.isFile()) {
      archivePaths.add(resolved);
      continue;
    }
    if (!info.isDirectory()) {
      throw new Error(`server feed input is neither a file nor a directory: ${resolved}`);
    }
    const entries = await readdir(resolved, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".sha256")) continue;
      if (!ARCHIVE_NAME_PATTERN.test(entry.name)) continue;
      archivePaths.add(join(resolved, entry.name));
    }
  }

  if (archivePaths.size === 0) {
    throw new Error("no open-design-server archives found for feed preparation");
  }

  const archives = await Promise.all(
    [...archivePaths].sort().map((path) => resolveServerFeedArchiveEntry(path)),
  );
  const seenNames = new Set<string>();
  for (const archive of archives) {
    if (seenNames.has(archive.archiveName)) {
      throw new Error(`duplicate server archive in feed: ${archive.archiveName}`);
    }
    seenNames.add(archive.archiveName);
  }
  return archives;
}

function expectedServerVersionFiles(
  archiveEntries: ReadonlyArray<ServerFeedArchiveEntry>,
): Map<string, string> {
  const expected = new Map<string, string>();
  for (const entry of archiveEntries) {
    const sidecar = formatSha256SumsEntry(entry.sha256, entry.archiveName);
    expected.set(entry.archiveName, entry.sha256);
    expected.set(`${entry.archiveName}.sha256`, hashBytesSha256(sidecar));
  }
  expected.set(
    "SHA256SUMS",
    hashBytesSha256(
      formatSha256Sums(
        archiveEntries.map((entry) => ({
          archiveName: entry.archiveName,
          sha256: entry.sha256,
        })),
      ),
    ),
  );
  return expected;
}

async function existingServerVersionMatches(
  versionRoot: string,
  expected: ReadonlyMap<string, string>,
): Promise<boolean> {
  let info;
  try {
    info = await stat(versionRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (!info.isDirectory()) {
    throw new Error(
      `server feed version already exists with different content: ${versionRoot} is not a directory`,
    );
  }

  const entries = await readdir(versionRoot, { withFileTypes: true });
  const actualNames = entries.map((entry) => entry.name).sort();
  const expectedNames = [...expected.keys()].sort();
  if (
    entries.some((entry) => !entry.isFile()) ||
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(
      `server feed version already exists with different content: file set mismatch in ${versionRoot}`,
    );
  }

  for (const name of expectedNames) {
    const actualSha256 = await hashFileSha256(join(versionRoot, name));
    if (actualSha256 !== expected.get(name)) {
      throw new Error(
        `server feed version already exists with different content: ${join(versionRoot, name)}`,
      );
    }
  }
  return true;
}

async function writeServerVersionFiles(
  versionRoot: string,
  archiveEntries: ReadonlyArray<ServerFeedArchiveEntry>,
): Promise<void> {
  for (const entry of archiveEntries) {
    await copyFile(entry.archivePath, join(versionRoot, entry.archiveName));
    await writeFile(
      join(versionRoot, `${entry.archiveName}.sha256`),
      formatSha256SumsEntry(entry.sha256, entry.archiveName),
      "utf8",
    );
  }
  await writeSha256SumsFile(
    join(versionRoot, "SHA256SUMS"),
    archiveEntries.map((entry) => ({
      archiveName: entry.archiveName,
      sha256: entry.sha256,
    })),
  );
}

/**
 * Materialize the hosted bootstrap feed layout expected by install.sh/install.ps1:
 *   <feedRoot>/latest/VERSION
 *   <feedRoot>/v<version>/SHA256SUMS
 *   <feedRoot>/v<version>/<archive>
 */
export async function prepareServerReleaseFeed(options: {
  appVersion: string;
  archives: ReadonlyArray<string>;
  feedRoot: string;
  updateLatest?: boolean;
}): Promise<ServerReleaseFeedResult> {
  const appVersion = cleanVersion(options.appVersion, "--app-version");
  const feedRoot = resolve(options.feedRoot);
  const versionPrefix = `v${appVersion}`;
  const versionRoot = join(feedRoot, versionPrefix);
  const latestVersionPath = join(feedRoot, "latest", "VERSION");
  const sha256SumsPath = join(versionRoot, "SHA256SUMS");
  const archiveEntries = await collectServerFeedArchives(options.archives);

  for (const entry of archiveEntries) {
    const parsed = parseArchiveName(entry.archiveName);
    if (parsed.appVersion !== appVersion) {
      throw new Error(
        `archive version ${parsed.appVersion} does not match feed version ${appVersion}: ${entry.archiveName}`,
      );
    }
  }

  const expectedFiles = expectedServerVersionFiles(archiveEntries);
  const reusedExistingVersion = await existingServerVersionMatches(
    versionRoot,
    expectedFiles,
  );
  if (!reusedExistingVersion) {
    await mkdir(feedRoot, { recursive: true });
    const stagingRoot = await mkdtemp(join(feedRoot, `.${versionPrefix}-`));
    try {
      await writeServerVersionFiles(stagingRoot, archiveEntries);
      await existingServerVersionMatches(stagingRoot, expectedFiles);
      try {
        await rename(stagingRoot, versionRoot);
      } catch (error) {
        const concurrentVersionMatches = await existingServerVersionMatches(
          versionRoot,
          expectedFiles,
        );
        if (!concurrentVersionMatches) throw error;
      }
    } finally {
      await rm(stagingRoot, { force: true, recursive: true });
    }
  }

  if (options.updateLatest !== false) {
    await writeServerLatestVersionPointer(latestVersionPath, appVersion);
  }

  return {
    appVersion,
    archiveEntries,
    feedRoot,
    latestVersionPath,
    sha256SumsPath,
    versionPrefix,
    versionRoot,
  };
}
