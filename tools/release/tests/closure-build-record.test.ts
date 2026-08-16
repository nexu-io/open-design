import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closureBuildPrefix,
  rebindClosureContribution,
  registerClosureBuild,
  resolveClosureBuild,
} from "../src/storage/closure/build-record.js";

const body = `sha256:${"a".repeat(64)}` as const;
const launcher = `sha256:${"b".repeat(64)}` as const;
const native = `sha256:${"c".repeat(64)}` as const;

function artifact(digest: `sha256:${string}`) {
  return { digest, mediaType: "application/zip", size: 10, url: `https://old.example/beta/versions/0.19.4-beta.1/closure/blobs/${digest.slice(7)}` };
}

const releaseEnv = [
  "GITHUB_OUTPUT",
  "RELEASE_CHANNEL",
  "RELEASE_CLOSURE_BLOB_ROOT",
  "RELEASE_CLOSURE_BUILD_DIGEST",
  "RELEASE_CLOSURE_BUILD_KIND",
  "RELEASE_CLOSURE_BUILD_TOKEN",
  "RELEASE_CLOSURE_CONTRIBUTION_JSON_PATH",
  "RELEASE_PUBLIC_ORIGIN",
  "RELEASE_STORAGE_ACCESS_KEY_ID",
  "RELEASE_STORAGE_BUCKET",
  "RELEASE_STORAGE_ENDPOINT",
  "RELEASE_STORAGE_REGION",
  "RELEASE_STORAGE_SECRET_ACCESS_KEY",
  "RELEASE_VERSION",
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of releaseEnv) delete process.env[name];
});

function sha256(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function configureStorage(root: string, identityDigest: `sha256:${string}`): void {
  Object.assign(process.env, {
    GITHUB_OUTPUT: join(root, "github-output.txt"),
    RELEASE_CHANNEL: "beta",
    RELEASE_CLOSURE_BUILD_DIGEST: identityDigest,
    RELEASE_CLOSURE_BUILD_KIND: "shared",
    RELEASE_CLOSURE_BUILD_TOKEN: "shared",
    RELEASE_PUBLIC_ORIGIN: "https://releases.example",
    RELEASE_STORAGE_ACCESS_KEY_ID: "test-key",
    RELEASE_STORAGE_BUCKET: "releases",
    RELEASE_STORAGE_ENDPOINT: "https://storage.example",
    RELEASE_STORAGE_REGION: "auto",
    RELEASE_STORAGE_SECRET_ACCESS_KEY: "test-secret",
  });
}

describe("immutable Closure build record", () => {
  it("keeps build cache identity outside version projections", () => {
    expect(closureBuildPrefix("beta", "shared", body)).toBe(`beta/closure/builds/shared/${"a".repeat(64)}`);
    expect(closureBuildPrefix("beta", "target-darwin-arm64", native)).toBe(
      `beta/closure/builds/target-darwin-arm64/${"c".repeat(64)}`,
    );
  });

  it("rebinds shared bytes to the current autonomous version", () => {
    const rebound = rebindClosureContribution("shared", {
      body: { artifact: artifact(body), entryPath: "bootloader.mjs", treeDigest: body },
      channel: "beta",
      launcher: { artifact: artifact(launcher), entryPath: "launcher.mjs", handoffPath: "bootloader.mjs", treeDigest: launcher },
      protocolVersion: 1,
      resources: [],
      schemaVersion: 3,
      shellCompatibility: { electron: { version: { min: "0.19.2-beta.1" } } },
      version: "0.19.4-beta.1",
    }, {
      channel: "beta",
      publicOrigin: "https://releases.example",
      version: "0.19.4-beta.2",
    });
    expect(rebound.version).toBe("0.19.4-beta.2");
    expect("body" in rebound && rebound.body.artifact.url).toBe(
      `https://releases.example/beta/versions/0.19.4-beta.2/closure/blobs/${"a".repeat(64)}`,
    );
  });

  it("registers once and transactionally reuses the same bytes for a later version", async () => {
    const root = await mkdtemp(join(tmpdir(), "closure-build-record-"));
    const sourceBlobRoot = join(root, "source-blobs");
    const sourceContributionPath = join(root, "source-contribution.json");
    const bodyBytes = Buffer.from("body-bytes");
    const launcherBytes = Buffer.from("launcher-bytes");
    const bodyDigest = sha256(bodyBytes);
    const launcherDigest = sha256(launcherBytes);
    const identityDigest = sha256(Buffer.from("shared-build-input"));
    const objects = new Map<string, Buffer>();
    let puts = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const key = url.pathname.replace(/^\/releases\//u, "");
      if (init?.method === "PUT") {
        if (objects.has(key)) return new Response(null, { status: 412 });
        objects.set(key, Buffer.from(init.body as Buffer));
        puts += 1;
        return new Response(null, { status: 200 });
      }
      const bytes = objects.get(key);
      return bytes == null ? new Response(null, { status: 404 }) : new Response(Uint8Array.from(bytes), { status: 200 });
    });
    try {
      await mkdir(sourceBlobRoot, { recursive: true });
      await Promise.all([
        writeFile(join(sourceBlobRoot, bodyDigest.slice(7)), bodyBytes),
        writeFile(join(sourceBlobRoot, launcherDigest.slice(7)), launcherBytes),
      ]);
      await writeFile(sourceContributionPath, `${JSON.stringify({
        body: { artifact: { digest: bodyDigest, mediaType: "application/zip", size: bodyBytes.byteLength, url: "https://old/body" }, entryPath: "bootloader.mjs", treeDigest: bodyDigest },
        channel: "beta",
        launcher: { artifact: { digest: launcherDigest, mediaType: "application/zip", size: launcherBytes.byteLength, url: "https://old/launcher" }, entryPath: "launcher.mjs", handoffPath: "bootloader.mjs", treeDigest: launcherDigest },
        protocolVersion: 1,
        resources: [],
        schemaVersion: 3,
        shellCompatibility: { electron: { version: { min: "0.19.4-beta.1" } } },
        version: "0.19.4-beta.1",
      })}\n`);
      configureStorage(root, identityDigest);
      process.env.RELEASE_CLOSURE_BLOB_ROOT = sourceBlobRoot;
      process.env.RELEASE_CLOSURE_CONTRIBUTION_JSON_PATH = sourceContributionPath;
      await registerClosureBuild();
      expect(puts).toBe(3);

      const resolvedBlobRoot = join(root, "resolved", "blobs");
      const resolvedContributionPath = join(root, "resolved", "shared-contribution.json");
      process.env.RELEASE_CLOSURE_BLOB_ROOT = resolvedBlobRoot;
      process.env.RELEASE_CLOSURE_CONTRIBUTION_JSON_PATH = resolvedContributionPath;
      process.env.RELEASE_VERSION = "0.19.4-beta.2";
      await resolveClosureBuild();

      expect(await readFile(join(resolvedBlobRoot, bodyDigest.slice(7)))).toEqual(bodyBytes);
      expect(await readFile(join(resolvedBlobRoot, launcherDigest.slice(7)))).toEqual(launcherBytes);
      const resolved = JSON.parse(await readFile(resolvedContributionPath, "utf8")) as { body: { artifact: { url: string } }; version: string };
      expect(resolved.version).toBe("0.19.4-beta.2");
      expect(resolved.body.artifact.url).toContain("/beta/versions/0.19.4-beta.2/closure/blobs/");
      expect(await readFile(join(root, "github-output.txt"), "utf8")).toContain("state=hit");
      expect(puts).toBe(3);

      const launcherObjectKey = [...objects.keys()].find((key) => key.endsWith(launcherDigest.slice(7)));
      expect(launcherObjectKey).toBeDefined();
      objects.set(launcherObjectKey!, Buffer.from("corrupt"));
      process.env.RELEASE_VERSION = "0.19.4-beta.3";
      await expect(resolveClosureBuild()).rejects.toThrow(/immutable Closure build artifact is missing or corrupt/u);
      expect(await readFile(join(resolvedBlobRoot, bodyDigest.slice(7)))).toEqual(bodyBytes);
      expect(await readFile(join(resolvedBlobRoot, launcherDigest.slice(7)))).toEqual(launcherBytes);
      expect(JSON.parse(await readFile(resolvedContributionPath, "utf8")).version).toBe("0.19.4-beta.2");
      expect(await readFile(join(root, "github-output.txt"), "utf8")).not.toContain("state=miss");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
