import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, join } from "node:path";

import {
  createClosureDistributionManifest,
  validateClosureCandidateManifest,
  validateClosureDistributionManifest,
  type ClosureCandidateManifest,
  type ClosureDigest,
  type ClosureDistributionManifest,
} from "@open-design/closure/protocol";

import {
  isReleaseChannel,
  releaseMetadataVersionFields,
  type ReleaseChannel,
  type ReleasePlatform,
} from "@open-design/release";

type UpdaterFixtureChannel = ReleaseChannel;
export type UpdaterFixturePlatform = Exclude<ReleasePlatform, "linux">;

type ClosureFixtureFile = {
  body?: Buffer;
  contentType: string;
  path: string;
  size: number;
};

type ClosureFixtureFiles = {
  archive: ClosureFixtureFile;
  inventory: ClosureFixtureFile;
  manifest: ClosureFixtureFile;
  provenance: ClosureFixtureFile;
};

export type UpdaterFixtureOptions = {
  artifactBody?: Buffer | string;
  artifactPath?: string;
  channel?: UpdaterFixtureChannel;
  closureBlobDir?: string;
  closureDistributionManifestPath?: string;
  closureManifestPath?: string;
  closureShellVersionMin?: string;
  controlInstallationVersionMin?: string;
  controlInstallationVersionUrl?: string;
  host?: string;
  includePayload?: boolean;
  launcherSchema?: number;
  platform?: UpdaterFixturePlatform;
  payloadBody?: Buffer | string;
  payloadPath?: string;
  port?: number;
  rebaseClosureUrl?: boolean;
  version?: string;
};

export type UpdaterFixtureInfo = {
  artifactPath: string | null;
  artifactUrl: string;
  channel: UpdaterFixtureChannel;
  checksumUrl: string;
  closureArchiveUrl: string | null;
  closureDistributionManifestPath: string | null;
  closureManifestPath: string | null;
  metadataUrl: string;
  origin: string;
  payloadChecksumUrl: string | null;
  payloadPath: string | null;
  payloadSha256: string | null;
  payloadUrl: string | null;
  platform: UpdaterFixturePlatform;
  sha256: string;
  version: string;
};

export type UpdaterFixtureServer = {
  close(): Promise<void>;
  info: UpdaterFixtureInfo;
};

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", rejectHash);
    stream.on("end", resolveHash);
  });
  return hash.digest("hex");
}

function sha256Canonical(value: string): ClosureDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function inspectClosureDistributionBlobs(
  manifest: ClosureDistributionManifest,
  blobRoot: string,
): Promise<Map<ClosureDigest, Readonly<{ path: string; size: number }>>> {
  const files = new Map<ClosureDigest, Readonly<{ path: string; size: number }>>();
  for (const artifact of Object.values(manifest.blobs)) {
    const path = join(blobRoot, artifact.digest.slice("sha256:".length));
    const file = await stat(path).catch(() => null);
    if (file == null || !file.isFile() || file.size !== artifact.size) {
      throw new Error(`Closure distribution blob is missing or has the wrong size: ${artifact.digest}`);
    }
    if (`sha256:${await sha256File(path)}` !== artifact.digest) {
      throw new Error(`Closure distribution blob digest does not match: ${artifact.digest}`);
    }
    files.set(artifact.digest, Object.freeze({ path, size: file.size }));
  }
  return files;
}

function rebaseClosureDistributionManifest(
  manifest: ClosureDistributionManifest,
  origin: string,
  version: string,
  shellVersionMin?: string,
): ClosureDistributionManifest {
  const shell = shellVersionMin == null
    ? manifest.compatibility.shell
    : Object.fromEntries(Object.entries(manifest.compatibility.shell).map(([type, compatibility]) => [type, {
        ...compatibility,
        version: { ...compatibility.version, min: shellVersionMin },
      }]));
  return createClosureDistributionManifest({
    blobs: Object.fromEntries(Object.entries(manifest.blobs).map(([digest, artifact]) => [digest, {
      ...artifact,
      url: `${origin}/${manifest.identity.channel}/blobs/${digest.slice("sha256:".length)}`,
    }])),
    compatibility: { shell },
    identity: {
      channel: manifest.identity.channel,
      protocolVersion: manifest.identity.protocolVersion,
      version,
    },
    required: manifest.required,
    resources: manifest.resources,
    schemaVersion: manifest.schemaVersion,
  }, sha256Canonical);
}

function close(server: Server): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

function serverOrigin(server: Server): string {
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("updater fixture did not listen on TCP");
  return `http://127.0.0.1:${address.port}`;
}

type ParsedRange = { end: number; start: number } | "invalid" | "unsatisfiable" | null;

function parseNonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseByteRange(value: string | undefined, size: number): ParsedRange {
  if (value == null) return null;
  if (!value.startsWith("bytes=")) return "invalid";
  const spec = value.slice("bytes=".length).trim();
  if (spec.length === 0 || spec.includes(",")) return "invalid";

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (match == null) return "invalid";
  const [, startText, endText] = match;
  if (startText == null || endText == null || (startText.length === 0 && endText.length === 0)) {
    return "invalid";
  }
  if (size <= 0) return "unsatisfiable";

  if (startText.length === 0) {
    const suffixLength = parseNonNegativeInteger(endText);
    if (suffixLength == null || suffixLength === 0) return "invalid";
    return {
      end: size - 1,
      start: Math.max(size - suffixLength, 0),
    };
  }

  const start = parseNonNegativeInteger(startText);
  if (start == null) return "invalid";
  const end = endText.length === 0 ? size - 1 : parseNonNegativeInteger(endText);
  if (end == null || start > end) return "invalid";
  if (start >= size) return "unsatisfiable";
  return {
    end: Math.min(end, size - 1),
    start,
  };
}

function endWithOptionalBody(request: IncomingMessage, response: ServerResponse, body: Buffer | string): void {
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendArtifact(
  request: IncomingMessage,
  response: ServerResponse,
  artifactBody: Buffer,
  contentType: string,
): void {
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("content-type", contentType);
  const range = parseByteRange(request.headers.range, artifactBody.byteLength);
  if (range === "invalid" || range === "unsatisfiable") {
    response.statusCode = 416;
    response.setHeader("content-range", `bytes */${artifactBody.byteLength}`);
    response.end();
    return;
  }

  if (range != null) {
    const body = artifactBody.subarray(range.start, range.end + 1);
    response.statusCode = 206;
    response.setHeader("content-length", String(body.byteLength));
    response.setHeader("content-range", `bytes ${range.start}-${range.end}/${artifactBody.byteLength}`);
    endWithOptionalBody(request, response, body);
    return;
  }

  response.setHeader("content-length", String(artifactBody.byteLength));
  endWithOptionalBody(request, response, artifactBody);
}

function sendFileArtifact(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  size: number,
  contentType: string,
): void {
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("content-type", contentType);
  const range = parseByteRange(request.headers.range, size);
  if (range === "invalid" || range === "unsatisfiable") {
    response.statusCode = 416;
    response.setHeader("content-range", `bytes */${size}`);
    response.end();
    return;
  }

  if (range != null) {
    response.statusCode = 206;
    response.setHeader("content-length", String(range.end - range.start + 1));
    response.setHeader("content-range", `bytes ${range.start}-${range.end}/${size}`);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(path, { end: range.end, start: range.start }).pipe(response);
    return;
  }

  response.setHeader("content-length", String(size));
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
}

function normalizeChannel(value: string | undefined): UpdaterFixtureChannel {
  if (value == null || value.length === 0) return "stable";
  if (isReleaseChannel(value)) return value;
  throw new Error(`unsupported updater fixture channel: ${value}`);
}

function channelMetadata(channel: UpdaterFixtureChannel, version: string): Record<string, unknown> {
  return releaseMetadataVersionFields(channel, version);
}

function closureReleaseMetadata(
  manifest: ClosureCandidateManifest,
  files: ClosureFixtureFiles,
): Record<string, unknown> {
  const baseUrl = manifest.artifact.url.slice(0, -"closure.zip".length);
  return {
    assets: {
      archive: { size: files.archive.size, url: manifest.artifact.url },
      inventory: { size: files.inventory.size, url: `${baseUrl}inventory.json` },
      manifest: { size: files.manifest.size, url: `${baseUrl}manifest.json` },
      provenance: { size: files.provenance.size, url: `${baseUrl}provenance.json` },
    },
    manifest,
  };
}

export async function startUpdaterFixtureServer(options: UpdaterFixtureOptions = {}): Promise<UpdaterFixtureServer> {
  const channel = normalizeChannel(options.channel);
  const host = options.host ?? "127.0.0.1";
  const platform = options.platform ?? "mac";
  const port = options.port ?? 0;
  const version = options.version ?? "99.0.0";
  const platformKey = platform;
  const releaseTarget = platform === "mac" ? "mac_arm64" : platform === "macIntel" ? "mac_x64" : "win_x64";
  const targetArch = platform === "mac" ? "arm64" : "x64";
  const artifactKey = platform === "win" ? "installer" : "dmg";
  const artifactName = options.artifactPath != null
    ? basename(options.artifactPath)
    : platform === "win"
    ? `open-design-${version}-win-x64-setup.exe`
    : `open-design-${version}-mac-${targetArch}.dmg`;
  const contentType = platform === "win"
    ? "application/vnd.microsoft.portable-executable"
    : "application/x-apple-diskimage";
  const artifactFileStat = options.artifactPath == null ? null : await stat(options.artifactPath);
  if (artifactFileStat != null && (!artifactFileStat.isFile() || artifactFileStat.size <= 0)) {
    throw new Error(`updater fixture artifact path must be a non-empty file: ${options.artifactPath}`);
  }
  const artifactBody = Buffer.isBuffer(options.artifactBody)
    ? options.artifactBody
    : Buffer.from(options.artifactBody ?? `Open Design updater fixture ${version}\n`, "utf8");
  const artifactSize = artifactFileStat?.size ?? artifactBody.byteLength;
  const sha256 = options.artifactPath == null
    ? createHash("sha256").update(artifactBody).digest("hex")
    : await sha256File(options.artifactPath);
  const payloadName = options.payloadPath == null
    ? platform === "win"
      ? `open-design-${version}-win-x64-payload.7z`
      : `open-design-${version}-mac-${targetArch}-payload.zip`
    : basename(options.payloadPath);
  const artifactPathSegment = encodeURIComponent(artifactName);
  const payloadPathSegment = encodeURIComponent(payloadName);
  const includePayload = options.includePayload === true || options.payloadPath != null;
  const payloadBody = Buffer.isBuffer(options.payloadBody)
    ? options.payloadBody
    : Buffer.from(options.payloadBody ?? `Open Design launcher payload fixture ${version}\n`, "utf8");
  const payloadFileStat = options.payloadPath == null ? null : await stat(options.payloadPath);
  if (payloadFileStat != null && (!payloadFileStat.isFile() || payloadFileStat.size <= 0)) {
    throw new Error(`updater fixture payload path must be a non-empty file: ${options.payloadPath}`);
  }
  const payloadSize = payloadFileStat?.size ?? payloadBody.byteLength;
  const payloadSha256 = options.payloadPath == null
    ? createHash("sha256").update(payloadBody).digest("hex")
    : await sha256File(options.payloadPath);
  if (options.closureDistributionManifestPath != null && options.closureManifestPath != null) {
    throw new Error("updater fixture accepts either a legacy Closure manifest or a distribution manifest, not both");
  }
  const closureRoot = options.closureManifestPath == null ? null : dirname(options.closureManifestPath);
  const rawClosureManifest = options.closureManifestPath == null
    ? null
    : JSON.parse(await readFile(options.closureManifestPath, "utf8")) as unknown;
  const closureManifestRecord = rawClosureManifest != null && typeof rawClosureManifest === "object"
    ? rawClosureManifest as Record<string, unknown>
    : null;
  const isDistributionManifest = closureManifestRecord?.blobs != null
    && closureManifestRecord.required != null
    && closureManifestRecord.identity != null;
  let closureManifest: ClosureCandidateManifest | null = rawClosureManifest == null
    ? null
    : isDistributionManifest
      ? null
      : validateClosureCandidateManifest(rawClosureManifest);
  const rawClosureDistribution = options.closureDistributionManifestPath == null
    ? closureManifest == null ? rawClosureManifest : null
    : JSON.parse(await readFile(options.closureDistributionManifestPath, "utf8")) as unknown;
  let closureDistribution: ClosureDistributionManifest | null = rawClosureDistribution == null
    ? null
    : validateClosureDistributionManifest(rawClosureDistribution, sha256Canonical);
  const closureFilePaths = closureRoot == null
    ? null
    : {
        archive: join(closureRoot, "closure.zip"),
        inventory: join(closureRoot, "inventory.json"),
        manifest: join(closureRoot, "manifest.json"),
        provenance: join(closureRoot, "provenance.json"),
      };
  let closureFiles: ClosureFixtureFiles | null = null;
  if (closureManifest != null && closureFilePaths != null) {
    const expectedPlatform = platform === "mac" ? "darwin-arm64" : platform === "macIntel" ? "darwin-x64" : "win32-x64";
    if (closureManifest.identity.channel !== channel) {
      throw new Error(`Closure channel ${closureManifest.identity.channel} does not match updater channel ${channel}`);
    }
    if (closureManifest.identity.platform !== expectedPlatform) {
      throw new Error(`Closure platform ${closureManifest.identity.platform} does not match updater platform ${platform}`);
    }
    const fileEntries = await Promise.all(Object.entries(closureFilePaths).map(async ([label, filePath]) => {
      const metadata = await stat(filePath).catch(() => null);
      if (metadata == null || !metadata.isFile() || metadata.size <= 0) {
        throw new Error(`Closure ${label} fixture must be a non-empty file: ${filePath}`);
      }
      return [label, {
        contentType: label === "archive" ? "application/zip" : "application/json",
        path: filePath,
        size: metadata.size,
      }] as const;
    }));
    closureFiles = Object.fromEntries(fileEntries) as ClosureFixtureFiles;
  }
  const expectedClosureTarget = platform === "mac"
    ? "darwin-arm64"
    : platform === "macIntel"
      ? "darwin-x64"
      : "win32-x64";
  let distributionBlobFiles = new Map<ClosureDigest, Readonly<{ path: string; size: number }>>();
  if (closureDistribution != null) {
    if (closureDistribution.identity.channel !== channel) {
      throw new Error(
        `Closure channel ${closureDistribution.identity.channel} does not match updater channel ${channel}`,
      );
    }
    if (closureDistribution.required.targets[expectedClosureTarget] == null) {
      throw new Error(
        `Closure distribution does not contain updater target ${expectedClosureTarget}`,
      );
    }
    const closureBlobDir = options.closureBlobDir
      ?? (options.closureManifestPath == null ? null : join(dirname(options.closureManifestPath), "blobs"));
    if (closureBlobDir == null) {
      throw new Error("Closure distribution fixture requires --closure-blob-dir");
    }
    distributionBlobFiles = await inspectClosureDistributionBlobs(closureDistribution, closureBlobDir);
  }

  let info: UpdaterFixtureInfo | null = null;
  const server = createServer((request, response) => {
    if (info == null) {
      response.statusCode = 503;
      response.end("fixture not ready");
      return;
    }
    const path = new URL(request.url ?? "/", info.origin).pathname;
    if (
      path === `/${channel}/latest/metadata.json`
      || path === `/${channel}/versions/${encodeURIComponent(version)}/metadata.json`
    ) {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        channel,
        generatedAt: new Date().toISOString(),
        ...channelMetadata(channel, version),
        ...(closureDistribution == null
          ? {}
          : { closure: closureDistribution, releaseState: "complete" }),
        ...(closureManifest == null
          ? {}
          : {
              releaseState: "complete",
              releaseTargets: {
                [releaseTarget]: {
                  closure: closureReleaseMetadata(closureManifest, closureFiles!),
                  enabled: true,
                  status: "published",
                },
              },
            }),
        ...(options.launcherSchema != null ? { launcher: { schema: options.launcherSchema } } : {}),
        ...(options.controlInstallationVersionMin != null || options.controlInstallationVersionUrl != null
          ? {
              control: {
                shell: {
                  installation: {
                    version: {
                      ...(options.controlInstallationVersionMin != null ? { min: options.controlInstallationVersionMin } : {}),
                      ...(options.controlInstallationVersionUrl != null ? { url: options.controlInstallationVersionUrl } : {}),
                    },
                  },
                },
                launcher: {
                  version: {
                    ...(options.controlInstallationVersionMin != null ? { min: options.controlInstallationVersionMin } : {}),
                    ...(options.controlInstallationVersionUrl != null ? { url: options.controlInstallationVersionUrl } : {}),
                  },
                },
              },
            }
          : {}),
        platforms: {
          [platformKey]: {
            arch: targetArch,
            artifacts: {
              [artifactKey]: {
                contentType,
                name: artifactName,
                sha256Url: info.checksumUrl,
                size: artifactSize,
                url: info.artifactUrl,
              },
              ...(includePayload && info.payloadUrl != null && info.payloadChecksumUrl != null
                ? {
                    payload: {
                      contentType: platform === "win" ? "application/x-7z-compressed" : "application/zip",
                      name: payloadName,
                      sha256Url: info.payloadChecksumUrl,
                      size: payloadSize,
                      url: info.payloadUrl,
                    },
                  }
                : {}),
            },
            channel,
            enabled: true,
            feed: null,
            label: platform === "win" ? "Windows x64" : "macOS arm64",
            platform,
            platformKey,
            signed: false,
          },
        },
        version: 1,
      }));
      return;
    }
    if (closureDistribution != null) {
      const blobMatch = new RegExp(`^/${channel}/blobs/([0-9a-f]{64})$`, "u").exec(path);
      const digest = blobMatch?.[1] == null ? null : `sha256:${blobMatch[1]}` as ClosureDigest;
      const blob = digest == null ? null : distributionBlobFiles.get(digest);
      const artifact = digest == null ? null : closureDistribution.blobs[digest];
      if (blob != null && artifact != null) {
        sendFileArtifact(request, response, blob.path, blob.size, artifact.mediaType);
        return;
      }
    }
    if (closureFiles != null && info.closureArchiveUrl != null) {
      const closureBaseUrl = info.closureArchiveUrl.slice(0, -"closure.zip".length);
      const closureAssets = [
        { ...closureFiles.archive, url: info.closureArchiveUrl },
        { ...closureFiles.inventory, url: `${closureBaseUrl}inventory.json` },
        { ...closureFiles.manifest, url: `${closureBaseUrl}manifest.json` },
        { ...closureFiles.provenance, url: `${closureBaseUrl}provenance.json` },
      ];
      const asset = closureAssets.find((candidate) => new URL(candidate.url).pathname === path);
      if (asset != null) {
        if (asset.body == null) {
          sendFileArtifact(request, response, asset.path, asset.size, asset.contentType);
        } else {
          sendArtifact(request, response, asset.body, asset.contentType);
        }
        return;
      }
    }
    if (path === `/${channel}/versions/${version}/${artifactPathSegment}`) {
      if (options.artifactPath != null && artifactFileStat != null) {
        sendFileArtifact(request, response, options.artifactPath, artifactFileStat.size, contentType);
        return;
      }
      sendArtifact(request, response, artifactBody, contentType);
      return;
    }
    if (includePayload && path === `/${channel}/versions/${version}/${payloadPathSegment}`) {
      if (options.payloadPath != null && payloadFileStat != null) {
        sendFileArtifact(request, response, options.payloadPath, payloadFileStat.size, platform === "win" ? "application/x-7z-compressed" : "application/zip");
        return;
      }
      sendArtifact(request, response, payloadBody, platform === "win" ? "application/x-7z-compressed" : "application/zip");
      return;
    }
    if (path === `/${channel}/versions/${version}/${artifactPathSegment}.sha256`) {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(`${sha256}  ${artifactName}\n`);
      return;
    }
    if (includePayload && path === `/${channel}/versions/${version}/${payloadPathSegment}.sha256`) {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(`${payloadSha256}  ${payloadName}\n`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });

  await listen(server, port, host);
  const origin = serverOrigin(server);
  if (
    closureDistribution != null
    && (options.closureDistributionManifestPath != null || options.rebaseClosureUrl === true)
  ) {
    closureDistribution = rebaseClosureDistributionManifest(
      closureDistribution,
      origin,
      version,
      options.closureShellVersionMin,
    );
  }
  if (closureManifest != null && options.rebaseClosureUrl === true) {
    const closureArchiveUrl = `${origin}/${channel}/closure/${closureManifest.identity.platform}/versions/${closureManifest.identity.version}/closure.zip`;
    closureManifest = validateClosureCandidateManifest({
      ...closureManifest,
      artifact: {
        ...closureManifest.artifact,
        url: closureArchiveUrl,
      },
    });
    const manifestBody = Buffer.from(`${JSON.stringify(closureManifest, null, 2)}\n`, "utf8");
    if (closureFiles != null) {
      closureFiles.manifest = {
        ...closureFiles.manifest,
        body: manifestBody,
        size: manifestBody.byteLength,
      };
    }
  }
  const closureArchiveUrl = closureManifest?.artifact.url ?? null;
  if (closureDistribution != null) {
    const foreignBlob = Object.values(closureDistribution.blobs).find(
      (artifact) => new URL(artifact.url).origin !== origin,
    );
    if (foreignBlob != null) {
      await close(server);
      throw new Error(
        `Closure blob URL origin ${new URL(foreignBlob.url).origin} does not match fixture origin ${origin}`,
      );
    }
  }
  if (closureArchiveUrl != null && new URL(closureArchiveUrl).origin !== origin) {
    await close(server);
    throw new Error(
      `Closure artifact URL origin ${new URL(closureArchiveUrl).origin} does not match fixture origin ${origin}`,
    );
  }
  const artifactUrl = `${origin}/${channel}/versions/${version}/${artifactPathSegment}`;
  const payloadUrl = includePayload ? `${origin}/${channel}/versions/${version}/${payloadPathSegment}` : null;
  info = {
    artifactPath: options.artifactPath ?? null,
    artifactUrl,
    channel,
    checksumUrl: `${artifactUrl}.sha256`,
    closureArchiveUrl,
    closureDistributionManifestPath: options.closureDistributionManifestPath ?? null,
    closureManifestPath: options.closureManifestPath ?? null,
    metadataUrl: `${origin}/${channel}/latest/metadata.json`,
    origin,
    payloadChecksumUrl: payloadUrl == null ? null : `${payloadUrl}.sha256`,
    payloadPath: options.payloadPath ?? null,
    payloadSha256: includePayload ? payloadSha256 : null,
    payloadUrl,
    platform,
    sha256,
    version,
  };

  return {
    close: () => close(server),
    info,
  };
}
