import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { activateStableRelease } from "../src/storage/stable-activation.js";

const roots: string[] = [];
const originalGhScript = process.env.OPEN_DESIGN_GH_NODE_SCRIPT;

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
  if (originalGhScript == null) delete process.env.OPEN_DESIGN_GH_NODE_SCRIPT;
  else process.env.OPEN_DESIGN_GH_NODE_SCRIPT = originalGhScript;
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-stable-activation-"));
  roots.push(root);
  const manifestDir = join(root, "manifests");
  const metadataDir = join(root, "metadata");
  const metadataPath = join(metadataDir, "metadata.json");
  await Promise.all([mkdir(manifestDir, { recursive: true }), mkdir(metadataDir, { recursive: true })]);
  const desired = Buffer.from(`${JSON.stringify({ releaseVersion: "1.1.0" })}\n`);
  await writeFile(metadataPath, desired);
  for (const target of ["mac_arm64", "mac_x64", "win_x64"]) {
    await writeFile(join(manifestDir, `${target}.json`), `${JSON.stringify({ feed: null, platformKey: target })}\n`);
  }

  const previousMetadata = Buffer.from(`${JSON.stringify({ releaseVersion: "1.0.0" })}\n`);
  const objects = new Map<string, Buffer>([["stable/latest/metadata.json", previousMetadata]]);
  for (const target of ["mac_arm64", "mac_x64", "win_x64"]) {
    objects.set(`stable/latest/platforms/${target}.json`, Buffer.from(`previous-${target}`));
  }
  const etag = (bytes: Buffer) => `"${createHash("md5").update(bytes).digest("hex")}"`;
  const server = createServer(async (request, response) => {
    const objectKey = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname)
      .replace(/^\/bucket\//u, "");
    const current = objects.get(objectKey);
    if (request.method === "GET") {
      if (current == null) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("etag", etag(current));
      response.end(current);
      return;
    }
    if (request.method === "PUT") {
      const ifMatch = request.headers["if-match"];
      const ifNoneMatch = request.headers["if-none-match"];
      if (
        (ifNoneMatch === "*" && current != null)
        || (typeof ifMatch === "string" && (current == null || ifMatch !== etag(current)))
      ) {
        response.statusCode = 412;
        response.end("PreconditionFailed");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      objects.set(objectKey, Buffer.concat(chunks));
      response.statusCode = 200;
      response.end();
      return;
    }
    if (request.method === "DELETE") {
      if (current == null || request.headers["if-match"] !== etag(current)) {
        response.statusCode = 412;
        response.end("PreconditionFailed");
        return;
      }
      objects.delete(objectKey);
      response.statusCode = 204;
      response.end();
      return;
    }
    response.statusCode = 405;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("object store did not bind");
  return {
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error))),
    input: {
      manifestDir,
      metadataDir,
      metadataPath,
      releaseVersion: "1.1.0",
      repository: "nexu-io/open-design",
      storage: {
        accessKeyId: "test",
        bucket: "bucket",
        endpointUrl: `http://127.0.0.1:${address.port}`,
        region: "auto",
        secretAccessKey: "test",
      },
      versionTag: "open-design-v1.1.0",
    },
    objects,
    previous: new Map(objects),
  };
}

describe("stable activation", () => {
  it("restores every latest object when the GitHub projection fails", async () => {
    const state = await fixture();
    const scriptPath = join(roots[0], "fake-gh.mjs");
    await writeFile(scriptPath, [
      "const args = process.argv.slice(2);",
      "if (args[0] === 'release' && args[1] === 'edit') process.exit(1);",
      "process.exit(0);",
      "",
    ].join("\n"));
    process.env.OPEN_DESIGN_GH_NODE_SCRIPT = scriptPath;
    try {
      await expect(activateStableRelease(state.input)).rejects.toThrow();
      expect([...state.objects.keys()].sort()).toEqual([...state.previous.keys()].sort());
      for (const [key, bytes] of state.previous) expect(state.objects.get(key)).toEqual(bytes);
    } finally {
      await state.close();
    }
  });

  it("commits R2 latest before confirming the GitHub projection", async () => {
    const state = await fixture();
    const scriptPath = join(roots[0], "fake-gh.mjs");
    await writeFile(scriptPath, [
      "const args = process.argv.slice(2);",
      "if (args[0] === 'release' && args[1] === 'view') {",
      "  console.log(JSON.stringify({ isDraft: false, tagName: 'open-design-v1.1.0' }));",
      "}",
      "if (args[0] === 'api') {",
      "  console.log('open-design-v1.1.0');",
      "}",
      "process.exit(0);",
      "",
    ].join("\n"));
    process.env.OPEN_DESIGN_GH_NODE_SCRIPT = scriptPath;
    try {
      await expect(activateStableRelease(state.input)).resolves.toMatchObject({ state: "activated" });
      expect(JSON.parse(state.objects.get("stable/latest/metadata.json")?.toString("utf8") ?? "{}").releaseVersion).toBe("1.1.0");
    } finally {
      await state.close();
    }
  });
});
