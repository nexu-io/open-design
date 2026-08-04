import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..", "..");
const tsxCliPath = require.resolve("tsx/cli");

type StorageRequest = {
  ifNoneMatch: string | null;
  method: string;
  objectKey: string;
};

async function startStorageServer(): Promise<{
  close: () => Promise<void>;
  endpointUrl: string;
  objects: Map<string, Buffer>;
  requests: StorageRequest[];
}> {
  const objects = new Map<string, Buffer>();
  const requests: StorageRequest[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? "/", "http://storage.test").pathname;
      const objectKey = decodeURIComponent(pathname.replace(/^\/test-bucket\//, ""));
      const method = request.method ?? "GET";
      requests.push({
        ifNoneMatch:
          typeof request.headers["if-none-match"] === "string"
            ? request.headers["if-none-match"]
            : null,
        method,
        objectKey,
      });

      if (method === "GET") {
        const existing = objects.get(objectKey);
        if (existing == null) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.statusCode = 200;
        response.setHeader("etag", `"${createHash("sha256").update(existing).digest("hex")}"`);
        response.end(existing);
        return;
      }

      if (method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (request.headers["if-none-match"] === "*" && objects.has(objectKey)) {
          response.statusCode = 412;
          response.end("precondition failed");
          return;
        }
        objects.set(objectKey, Buffer.concat(chunks));
        response.statusCode = 200;
        response.end();
        return;
      }

      response.statusCode = 405;
      response.end();
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address() as AddressInfo;
  return {
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((error) => (error == null ? resolvePromise() : reject(error)));
      }),
    endpointUrl: `http://127.0.0.1:${address.port}`,
    objects,
    requests,
  };
}

async function writeServerFeed(
  feedRoot: string,
  version: string,
  archiveBody: string,
): Promise<{ archiveName: string; sha256Sums: string }> {
  const archiveName = `open-design-server-${version}-linux-x64.tar.gz`;
  const versionRoot = join(feedRoot, `v${version}`);
  const sha256 = createHash("sha256").update(archiveBody, "utf8").digest("hex");
  const sha256Sums = `${sha256}  ${archiveName}\n`;
  await mkdir(join(feedRoot, "latest"), { recursive: true });
  await mkdir(versionRoot, { recursive: true });
  await writeFile(join(feedRoot, "latest", "VERSION"), `${version}\n`, "utf8");
  await writeFile(join(versionRoot, "SHA256SUMS"), sha256Sums, "utf8");
  await writeFile(join(versionRoot, archiveName), archiveBody, "utf8");
  await writeFile(join(versionRoot, `${archiveName}.sha256`), sha256Sums, "utf8");
  return { archiveName, sha256Sums };
}

async function publishServerFeed(options: {
  endpointUrl: string;
  feedRoot: string;
  outputsPath: string;
  version: string;
}): Promise<void> {
  await execFileAsync(
    process.execPath,
    [tsxCliPath, "tools/release/src/index.ts", "publish-server"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_OUTPUTS_PATH: options.outputsPath,
        RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
        RELEASE_PUBLISH_SIDE_EFFECTS: "true",
        RELEASE_SERVER_FEED_DIR: options.feedRoot,
        RELEASE_STORAGE_ACCESS_KEY_ID: "test-access-key",
        RELEASE_STORAGE_BUCKET: "test-bucket",
        RELEASE_STORAGE_ENDPOINT: options.endpointUrl,
        RELEASE_STORAGE_REGION: "auto",
        RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
        RELEASE_VERSION: options.version,
      },
    },
  );
}

describe("publish-server feed plan", () => {
  it("plans the hosted bootstrap objects without storage side effects", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-release-publish-server-"));
    const feedRoot = join(root, "feed");
    const outputsPath = join(root, "outputs.json");
    const version = "1.2.3";
    const versionRoot = join(feedRoot, `v${version}`);

    try {
      await mkdir(join(feedRoot, "latest"), { recursive: true });
      await mkdir(versionRoot, { recursive: true });
      await writeFile(join(feedRoot, "latest", "VERSION"), `${version}\n`, "utf8");
      await writeFile(
        join(versionRoot, "SHA256SUMS"),
        `${"a".repeat(64)}  open-design-server-${version}-darwin-arm64.tar.gz\n`,
        "utf8",
      );
      await writeFile(
        join(versionRoot, `open-design-server-${version}-darwin-arm64.tar.gz`),
        "archive\n",
        "utf8",
      );

      await execFileAsync(
        process.execPath,
        [tsxCliPath, "tools/release/src/index.ts", "publish-server"],
        {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            RELEASE_DRY_RUN_MODE: "plan",
            RELEASE_OUTPUTS_PATH: outputsPath,
            RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.ai",
            RELEASE_PUBLISH_SIDE_EFFECTS: "false",
            RELEASE_SERVER_FEED_DIR: feedRoot,
            RELEASE_VERSION: version,
          },
        },
      );

      const outputs = JSON.parse(await readFile(outputsPath, "utf8")) as {
        objectPrefix: string;
        publishSideEffectsEnabled: boolean;
        urls: {
          latestVersion: string;
          sha256Sums: string;
          versionRoot: string;
        };
        uploaded: Array<{ objectKey: string; url: string }>;
      };

      expect(outputs.publishSideEffectsEnabled).toBe(false);
      expect(outputs.objectPrefix).toBe("server");
      expect(outputs.urls).toEqual({
        latestVersion: "https://releases.open-design.ai/server/latest/VERSION",
        sha256Sums: "https://releases.open-design.ai/server/v1.2.3/SHA256SUMS",
        versionRoot: "https://releases.open-design.ai/server/v1.2.3",
      });
      expect(outputs.uploaded.map((entry) => entry.objectKey).sort()).toEqual([
        "server/latest/VERSION",
        "server/v1.2.3/SHA256SUMS",
        "server/v1.2.3/open-design-server-1.2.3-darwin-arm64.tar.gz",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("publish-server immutable version", () => {
  it("rejects a conflicting SHA256SUMS identity before archives or latest are written", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-release-server-conflict-"));
    const feedRoot = join(root, "feed");
    const outputsPath = join(root, "outputs.json");
    const version = "1.2.3";
    const storage = await startStorageServer();
    const identityKey = `server/v${version}/SHA256SUMS`;
    storage.objects.set(
      identityKey,
      Buffer.from(
        `${"a".repeat(64)}  open-design-server-${version}-linux-x64.tar.gz\n`,
        "utf8",
      ),
    );

    try {
      const { archiveName } = await writeServerFeed(
        feedRoot,
        version,
        "different-rebuilt-archive",
      );

      await expect(
        publishServerFeed({
          endpointUrl: storage.endpointUrl,
          feedRoot,
          outputsPath,
          version,
        }),
      ).rejects.toThrow(/immutable server object already exists with different content/i);

      expect(storage.objects.get(identityKey)?.toString("utf8")).toContain(
        "a".repeat(64),
      );
      expect(storage.requests).toEqual([
        { ifNoneMatch: "*", method: "PUT", objectKey: identityKey },
        { ifNoneMatch: null, method: "GET", objectKey: identityKey },
      ]);
      expect(storage.objects.has(`server/v${version}/${archiveName}`)).toBe(false);
      expect(storage.objects.has("server/latest/VERSION")).toBe(false);
    } finally {
      await storage.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reuses identical immutable objects and updates latest only after all are confirmed", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-release-server-idempotent-"));
    const feedRoot = join(root, "feed");
    const outputsPath = join(root, "outputs.json");
    const version = "1.2.3";
    const storage = await startStorageServer();

    try {
      const { archiveName } = await writeServerFeed(
        feedRoot,
        version,
        "identical-archive",
      );
      await publishServerFeed({
        endpointUrl: storage.endpointUrl,
        feedRoot,
        outputsPath,
        version,
      });
      storage.requests.length = 0;

      await publishServerFeed({
        endpointUrl: storage.endpointUrl,
        feedRoot,
        outputsPath,
        version,
      });

      expect(storage.requests).toEqual([
        {
          ifNoneMatch: "*",
          method: "PUT",
          objectKey: `server/v${version}/SHA256SUMS`,
        },
        {
          ifNoneMatch: null,
          method: "GET",
          objectKey: `server/v${version}/SHA256SUMS`,
        },
        {
          ifNoneMatch: "*",
          method: "PUT",
          objectKey: `server/v${version}/${archiveName}`,
        },
        {
          ifNoneMatch: null,
          method: "GET",
          objectKey: `server/v${version}/${archiveName}`,
        },
        {
          ifNoneMatch: "*",
          method: "PUT",
          objectKey: `server/v${version}/${archiveName}.sha256`,
        },
        {
          ifNoneMatch: null,
          method: "GET",
          objectKey: `server/v${version}/${archiveName}.sha256`,
        },
        {
          ifNoneMatch: null,
          method: "PUT",
          objectKey: "server/latest/VERSION",
        },
      ]);
      expect(storage.objects.get("server/latest/VERSION")?.toString("utf8")).toBe(
        `${version}\n`,
      );
    } finally {
      await storage.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not update latest when a version object conflicts after identity is locked", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-release-server-object-conflict-"));
    const feedRoot = join(root, "feed");
    const outputsPath = join(root, "outputs.json");
    const version = "1.2.3";
    const storage = await startStorageServer();

    try {
      const { archiveName, sha256Sums } = await writeServerFeed(
        feedRoot,
        version,
        "local-archive",
      );
      storage.objects.set(
        `server/v${version}/SHA256SUMS`,
        Buffer.from(sha256Sums, "utf8"),
      );
      storage.objects.set(
        `server/v${version}/${archiveName}`,
        Buffer.from("different-remote-archive", "utf8"),
      );
      storage.objects.set("server/latest/VERSION", Buffer.from("0.9.0\n", "utf8"));

      await expect(
        publishServerFeed({
          endpointUrl: storage.endpointUrl,
          feedRoot,
          outputsPath,
          version,
        }),
      ).rejects.toThrow(/immutable server object already exists with different content/i);

      expect(storage.requests).toEqual([
        {
          ifNoneMatch: "*",
          method: "PUT",
          objectKey: `server/v${version}/SHA256SUMS`,
        },
        {
          ifNoneMatch: null,
          method: "GET",
          objectKey: `server/v${version}/SHA256SUMS`,
        },
        {
          ifNoneMatch: "*",
          method: "PUT",
          objectKey: `server/v${version}/${archiveName}`,
        },
        {
          ifNoneMatch: null,
          method: "GET",
          objectKey: `server/v${version}/${archiveName}`,
        },
      ]);
      expect(storage.objects.get("server/latest/VERSION")?.toString("utf8")).toBe(
        "0.9.0\n",
      );
      expect(
        storage.objects.has(`server/v${version}/${archiveName}.sha256`),
      ).toBe(false);
    } finally {
      await storage.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});
