import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";

export type UpdaterFixtureOptions = {
  artifactBody?: Buffer | string;
  channel?: "stable" | "beta";
  host?: string;
  port?: number;
  version?: string;
};

export type UpdaterFixtureInfo = {
  artifactUrl: string;
  channel: "stable" | "beta";
  checksumUrl: string;
  metadataUrl: string;
  origin: string;
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
  const port = options.port ?? 0;
  const version = options.version ?? "99.0.0";
  const artifactName = `open-design-${version}-mac-arm64.dmg`;
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
          mac: {
            arch: "arm64",
            artifacts: {
              dmg: {
                contentType: "application/x-apple-diskimage",
                name: artifactName,
                sha256Url: info.checksumUrl,
                size: artifactBody.byteLength,
                url: info.artifactUrl,
              },
            },
            enabled: true,
            feed: null,
            signed: false,
          },
        },
        version: 1,
      }));
      return;
    }
    if (path === `/${channel}/versions/${version}/${artifactName}`) {
      response.setHeader("content-length", String(artifactBody.byteLength));
      response.setHeader("content-type", "application/x-apple-diskimage");
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
    sha256,
    version,
  };

  return {
    close: () => close(server),
    info,
  };
}
