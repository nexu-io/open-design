import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";

export type UpdaterFixtureOptions = {
  artifactBody?: Buffer | string;
  channel?: "stable" | "beta";
  host?: string;
  platform?: "mac" | "win";
  port?: number;
  version?: string;
};

export type UpdaterFixtureInfo = {
  artifactUrl: string;
  channel: "stable" | "beta";
  checksumUrl: string;
  metadataUrl: string;
  origin: string;
  platform: "mac" | "win";
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

function prereleaseCounterParts(version: string): { baseVersion: string; number: number } | null {
  const prerelease = /^(\d+\.\d+\.\d+)-.+\.(\d+)$/.exec(version);
  if (prerelease?.[1] != null && prerelease[2] != null) {
    return { baseVersion: prerelease[1], number: Number(prerelease[2]) };
  }
  const nightly = /^(\d+\.\d+\.\d+)\.nightly\.(\d+)$/i.exec(version);
  if (nightly?.[1] != null && nightly[2] != null) {
    return { baseVersion: nightly[1], number: Number(nightly[2]) };
  }
  return null;
}

function channelMetadata(channel: "stable" | "beta", version: string): Record<string, unknown> {
  if (channel === "stable") {
    return {
      baseVersion: version,
      releaseVersion: version,
      stableVersion: version,
    };
  }

  const countedVersion = prereleaseCounterParts(version);
  if (countedVersion == null) {
    throw new Error(`beta updater fixture version must match x.y.z-<label>.N; got ${version}`);
  }
  return {
    baseVersion: countedVersion.baseVersion,
    betaNumber: countedVersion.number,
    betaVersion: version,
  };
}

export async function startUpdaterFixtureServer(options: UpdaterFixtureOptions = {}): Promise<UpdaterFixtureServer> {
  const channel = options.channel ?? "stable";
  const host = options.host ?? "127.0.0.1";
  const platform = options.platform ?? "mac";
  const port = options.port ?? 0;
  const version = options.version ?? "99.0.0";
  const platformKey = platform === "win" ? "win" : "mac";
  const artifactKey = platform === "win" ? "installer" : "dmg";
  const artifactName = platform === "win"
    ? `open-design-${version}-win-x64-setup.exe`
    : `open-design-${version}-mac-arm64.dmg`;
  const contentType = platform === "win"
    ? "application/vnd.microsoft.portable-executable"
    : "application/x-apple-diskimage";
  const artifactBody = Buffer.isBuffer(options.artifactBody)
    ? options.artifactBody
    : Buffer.from(options.artifactBody ?? `Open Design updater fixture ${version}\n`, "utf8");
  const sha256 = createHash("sha256").update(artifactBody).digest("hex");

  let info: UpdaterFixtureInfo | null = null;
  const server = createServer((request, response) => {
    if (info == null) {
      response.statusCode = 503;
      response.end("fixture not ready");
      return;
    }
    const path = new URL(request.url ?? "/", info.origin).pathname;
    if (path === `/${channel}/latest/metadata.json`) {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        channel,
        generatedAt: new Date().toISOString(),
        ...channelMetadata(channel, version),
        platforms: {
          [platformKey]: {
            arch: platform === "win" ? "x64" : "arm64",
            artifacts: {
              [artifactKey]: {
                contentType,
                name: artifactName,
                sha256Url: info.checksumUrl,
                size: artifactBody.byteLength,
                url: info.artifactUrl,
              },
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
    if (path === `/${channel}/versions/${version}/${artifactName}`) {
      response.setHeader("content-length", String(artifactBody.byteLength));
      response.setHeader("content-type", contentType);
      response.end(artifactBody);
      return;
    }
    if (path === `/${channel}/versions/${version}/${artifactName}.sha256`) {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(`${sha256}  ${artifactName}\n`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });

  await listen(server, port, host);
  const origin = serverOrigin(server);
  const artifactUrl = `${origin}/${channel}/versions/${version}/${artifactName}`;
  info = {
    artifactUrl,
    channel,
    checksumUrl: `${artifactUrl}.sha256`,
    metadataUrl: `${origin}/${channel}/latest/metadata.json`,
    origin,
    platform,
    sha256,
    version,
  };

  return {
    close: () => close(server),
    info,
  };
}
