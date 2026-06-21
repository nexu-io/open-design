import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type ReleaseStorageFixtureOptions = {
  host?: string;
  port?: number;
};

export type ReleaseStorageFixtureInfo = {
  bucket: string;
  endpointUrl: string;
  origin: string;
};

export type ReleaseStorageFixtureServer = {
  close(): Promise<void>;
  getObject(key: string): Buffer | null;
  info: ReleaseStorageFixtureInfo;
  listObjectKeys(): string[];
};

type StoredObject = {
  body: Buffer;
  cacheControl: string | null;
  contentType: string | null;
  etag: string;
};

const BUCKET = "open-design-release-fixture";

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
  if (address == null || typeof address === "string") throw new Error("release storage fixture did not listen on TCP");
  return `http://127.0.0.1:${address.port}`;
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolveRead, rejectRead) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", rejectRead);
    request.on("end", () => resolveRead(Buffer.concat(chunks)));
  });
}

function objectKeyFromRequest(request: IncomingMessage, response: ServerResponse): string | null {
  const url = new URL(request.url ?? "/", "http://fixture.local");
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0).map(decodeURIComponent);
  if (segments[0] !== BUCKET || segments.length < 2) {
    response.statusCode = 404;
    response.end("bucket or object not found");
    return null;
  }
  return segments.slice(1).join("/");
}

function etag(body: Buffer): string {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

function preconditionFailed(response: ServerResponse): void {
  response.statusCode = 412;
  response.end("precondition failed");
}

export async function startReleaseStorageFixtureServer(
  options: ReleaseStorageFixtureOptions = {},
): Promise<ReleaseStorageFixtureServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const objects = new Map<string, StoredObject>();

  const server = createServer((request, response) => {
    void (async () => {
      const key = objectKeyFromRequest(request, response);
      if (key == null) return;

      if (request.method === "PUT") {
        const current = objects.get(key);
        const ifNoneMatch = request.headers["if-none-match"];
        const ifMatch = request.headers["if-match"];
        if (ifNoneMatch === "*" && current != null) {
          preconditionFailed(response);
          return;
        }
        if (typeof ifMatch === "string" && ifMatch.length > 0 && current?.etag !== ifMatch) {
          preconditionFailed(response);
          return;
        }

        const body = await readBody(request);
        const stored = {
          body,
          cacheControl: typeof request.headers["cache-control"] === "string" ? request.headers["cache-control"] : null,
          contentType: typeof request.headers["content-type"] === "string" ? request.headers["content-type"] : null,
          etag: etag(body),
        };
        objects.set(key, stored);
        response.statusCode = 200;
        response.setHeader("etag", stored.etag);
        response.end("ok");
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        const stored = objects.get(key);
        if (stored == null) {
          response.statusCode = 404;
          response.end("not found");
          return;
        }
        response.statusCode = 200;
        response.setHeader("etag", stored.etag);
        response.setHeader("content-length", String(stored.body.byteLength));
        if (stored.cacheControl != null) response.setHeader("cache-control", stored.cacheControl);
        if (stored.contentType != null) response.setHeader("content-type", stored.contentType);
        response.end(request.method === "HEAD" ? undefined : stored.body);
        return;
      }

      response.statusCode = 405;
      response.end("method not allowed");
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });

  await listen(server, port, host);
  const origin = serverOrigin(server);

  return {
    close: () => close(server),
    getObject: (key: string) => objects.get(key)?.body ?? null,
    info: {
      bucket: BUCKET,
      endpointUrl: origin,
      origin,
    },
    listObjectKeys: () => [...objects.keys()].sort(),
  };
}
