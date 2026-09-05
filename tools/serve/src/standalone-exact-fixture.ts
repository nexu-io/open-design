import { createHash, generateKeyPairSync } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";

import {
  canonicalJson,
  signStandaloneChannelHead,
  signStandaloneMetadata,
  type ArtifactReference,
  type StandaloneChannelHead,
  type StandaloneMetadata,
} from "@open-design/standalone";

export type StandaloneExactFixtureOptions = Readonly<{
  channel: string;
  closurePath: string;
  host?: string;
  launcherPath: string;
  port?: number;
  publishedAt?: string;
  releaseVersion: string;
  resources?: readonly Readonly<{
    entrypoint: string;
    file: string;
    id: string;
    path: string;
    treeSha256: string;
  }>[];
  shell: Readonly<{ buildHash: string; type: string; version: string }>;
  sourceCommit?: string;
  standaloneVersion?: string;
}>;

export type StandaloneExactFixtureInfo = Readonly<{
  bootstrapUrl: string;
  channel: string;
  channelHeadUrl: string;
  origin: string;
  releaseVersion: string;
}>;

export type StandaloneExactFixtureServer = Readonly<{
  close(): Promise<void>;
  info: StandaloneExactFixtureInfo;
}>;

type FixtureFile = Readonly<{
  body: Buffer;
  contentType: string;
  file: string;
  sha256: string;
  size: number;
  url: string;
}>;

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
  if (address == null || typeof address === "string") throw new Error("Standalone exact fixture did not listen on TCP");
  return `http://127.0.0.1:${address.port}`;
}

function digest(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

async function sourceFile(path: string, file: string, contentType: string, url: string): Promise<FixtureFile> {
  const details = await stat(path);
  if (!details.isFile() || details.size < 1) throw new Error(`Standalone exact fixture source must be a non-empty file: ${path}`);
  const body = await readFile(path);
  return Object.freeze({ body, contentType, file, sha256: digest(body), size: body.byteLength, url });
}

function artifact(file: FixtureFile): ArtifactReference {
  return Object.freeze({ sha256: file.sha256, size: file.size, url: file.url });
}

function jsonFile(file: string, value: unknown, url: string): FixtureFile {
  const body = Buffer.from(canonicalJson(value));
  return Object.freeze({ body, contentType: "application/json; charset=utf-8", file, sha256: digest(body), size: body.byteLength, url });
}

export async function startStandaloneExactFixtureServer(
  options: StandaloneExactFixtureOptions,
): Promise<StandaloneExactFixtureServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const routes = new Map<string, FixtureFile>();
  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.end("method not allowed");
      return;
    }
    const route = routes.get(new URL(request.url ?? "/", "http://fixture.local").pathname);
    if (route == null) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-type", route.contentType);
    response.setHeader("content-length", String(route.size));
    response.setHeader("etag", `"${route.sha256}"`);
    response.end(request.method === "HEAD" ? undefined : route.body);
  });

  await listen(server, port, host);
  try {
    const origin = serverOrigin(server);
    const releaseRoot = `/${encodeURIComponent(options.channel)}/versions/${encodeURIComponent(options.releaseVersion)}`;
    const publishedAt = options.publishedAt ?? new Date().toISOString();
    const sourceCommit = options.sourceCommit ?? "0".repeat(40);
    const standaloneVersion = options.standaloneVersion ?? "0.1.0";
    const launcher = await sourceFile(
      options.launcherPath,
      "standalone-launcher.mjs",
      "text/javascript",
      `${origin}${releaseRoot}/standalone-launcher.mjs`,
    );
    const closure = await sourceFile(
      options.closurePath,
      "closure.mjs",
      "text/javascript",
      `${origin}${releaseRoot}/closure.mjs`,
    );
    const resources = await Promise.all((options.resources ?? []).map(async (resource) => {
      if (!/^[a-z][a-z0-9-]{0,63}$/u.test(resource.id)
        || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(resource.file)
        || !/^[a-f0-9]{64}$/u.test(resource.treeSha256)) {
        throw new Error(`Standalone exact fixture resource is invalid: ${resource.id}`);
      }
      return Object.freeze({
        ...resource,
        file: await sourceFile(resource.path, resource.file, "application/zip", `${origin}${releaseRoot}/${resource.file}`),
      });
    }));
    const metadata: StandaloneMetadata = {
      schemaVersion: 4,
      channel: options.channel,
      releaseVersion: options.releaseVersion,
      standaloneVersion,
      sourceCommit,
      publishedAt,
      blobs: {
        [launcher.sha256]: { sha256: launcher.sha256, size: launcher.size, mediaType: launcher.contentType, sources: [{ kind: "remote", url: launcher.url }] },
        [closure.sha256]: { sha256: closure.sha256, size: closure.size, mediaType: closure.contentType, sources: [{ kind: "remote", url: closure.url }] },
        ...Object.fromEntries(resources.map(({ file }) => [file.sha256, { sha256: file.sha256, size: file.size, mediaType: file.contentType, sources: [{ kind: "remote" as const, url: file.url }] }])),
      },
      resources: [
        { id: "standalone-launcher", component: "standalone.launcher", blob: launcher.sha256, sync: true, materialization: { type: "file", entrypoint: "launcher.mjs" } },
        { id: "closure", component: "standalone.resource", blob: closure.sha256, sync: true, materialization: { type: "file", entrypoint: "closure.mjs" } },
        ...resources.map((resource) => ({
          id: resource.id,
          component: "standalone.resource" as const,
          blob: resource.file.sha256,
          sync: true as const,
          materialization: { type: "zip" as const, entrypoint: resource.entrypoint, treeSha256: resource.treeSha256 },
        })),
      ],
      shellRequirements: [{ type: options.shell.type, minVersion: options.shell.version, buildHash: options.shell.buildHash }],
    };
    const keys = generateKeyPairSync("ed25519");
    const signer = [{ keyId: "local-exact", privateKey: keys.privateKey }] as const;
    const contentUrl = `${origin}${releaseRoot}/content-metadata.json`;
    const content = jsonFile("content-metadata.json", signStandaloneMetadata(metadata, signer), contentUrl);
    const trustUrl = `${origin}/${encodeURIComponent(options.channel)}/trust/keys.json`;
    const trust = jsonFile("standalone-trust.json", {
      schemaVersion: 1,
      keys: [{
        keyId: "local-exact",
        publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
      }],
    }, trustUrl);
    const channelHeadUrl = `${origin}/${encodeURIComponent(options.channel)}/latest/channel-head.json`;
    const head: StandaloneChannelHead = {
      schemaVersion: 1,
      channel: options.channel,
      publishedAt,
      lanes: { content: { ...artifact(content), releaseVersion: options.releaseVersion } },
    };
    const channelHead = jsonFile("channel-head.json", signStandaloneChannelHead(head, signer), channelHeadUrl);
    const bootstrapUrl = `${origin}/${encodeURIComponent(options.channel)}/bootstrap.json`;
    const bootstrap = jsonFile("bootstrap.json", {
      schemaVersion: 1,
      channel: options.channel,
      releaseVersion: options.releaseVersion,
      channelHeadUrl,
      content: { ...artifact(content), file: "standalone-content.json" },
      trust: { ...artifact(trust), file: "standalone-trust.json" },
      seeds: [
        { ...artifact(launcher), blobSha256: launcher.sha256, component: "standalone.launcher", file: launcher.file },
        { ...artifact(closure), blobSha256: closure.sha256, component: "standalone.resource", file: closure.file },
        ...resources.map(({ file }) => ({ ...artifact(file), blobSha256: file.sha256, component: "standalone.resource" as const, file: file.file })),
      ],
    }, bootstrapUrl);

    for (const file of [launcher, closure, ...resources.map((resource) => resource.file), content, trust, channelHead, bootstrap]) {
      routes.set(new URL(file.url).pathname, file);
    }
    return Object.freeze({
      close: () => close(server),
      info: Object.freeze({ bootstrapUrl, channel: options.channel, channelHeadUrl, origin, releaseVersion: options.releaseVersion }),
    });
  } catch (error) {
    await close(server).catch(() => undefined);
    throw error;
  }
}
