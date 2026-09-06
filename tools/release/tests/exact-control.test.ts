import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeExactPackControl } from "../src/exact/control-pack.js";

const roots: string[] = [];
afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))));

const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

describe("exact release control", () => {
  it("promotes Closure resources into signed content instead of fixture-only metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "exact-control-resource-"));
    roots.push(root);
    const scene = join(root, "scene"), output = join(root, "prepared");
    await mkdir(scene, { recursive: true });
    const closure = join(root, "closure.mjs"), launcher = join(root, "launcher.mjs"), resource = join(scene, "open-design-web.zip");
    await writeFile(closure, "export const closure = true;\n");
    await writeFile(launcher, "export const launcher = true;\n");
    await writeFile(resource, "fixture zip bytes");
    const manifest = {
      schemaVersion: 1,
      target: "darwin-arm64",
      shellVersion: "0.1.0",
      shellBuildHash: "a".repeat(64),
      closure: { sha256: digest(await readFile(closure)) },
      standalone: { sha256: digest(await readFile(launcher)) },
    };
    const manifestPath = join(scene, "scene.json");
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(join(scene, "closure-resources.json"), JSON.stringify({
      schemaVersion: 1,
      operation: "closure.resources.build",
      resources: [{
        id: "open-design-web",
        file: "open-design-web.zip",
        entrypoint: "sidecar.mjs",
        sha256: digest(await readFile(resource)),
        size: (await readFile(resource)).byteLength,
        treeSha256: "b".repeat(64),
      }],
    }));
    const keys = generateKeyPairSync("ed25519");
    const previous = { keyId: process.env.OD_EXACT_SIGNING_KEY_ID, key: process.env.OD_EXACT_ED25519_PRIVATE_KEY };
    process.env.OD_EXACT_SIGNING_KEY_ID = "release-test";
    process.env.OD_EXACT_ED25519_PRIVATE_KEY = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    try {
      await executeExactPackControl({
        schemaVersion: 1,
        operation: "exact.prepare",
        channel: "betahyx",
        releaseVersion: "0.1.0-betahyx.1",
        sourceCommit: "c".repeat(40),
        publishedAt: "2026-09-05T00:00:00Z",
        standaloneVersion: "0.1.0",
        artifactBaseUrl: "https://releases.invalid/betahyx/0.1.0-betahyx.1",
        closureArtifactFile: closure,
        standaloneArtifactFile: launcher,
        resourceReceiptFile: join(scene, "closure-resources.json"),
        shells: [{ type: "electron", version: "0.1.0", scenes: [{ target: "darwin-arm64", sceneDirectory: scene, sceneManifestSha256: digest(await readFile(manifestPath)) }] }],
        outputDirectory: output,
      }, join(output, "prepare-receipt.json"));
    } finally {
      if (previous.key == null) delete process.env.OD_EXACT_ED25519_PRIVATE_KEY; else process.env.OD_EXACT_ED25519_PRIVATE_KEY = previous.key;
      if (previous.keyId == null) delete process.env.OD_EXACT_SIGNING_KEY_ID; else process.env.OD_EXACT_SIGNING_KEY_ID = previous.keyId;
    }
    const envelope = JSON.parse(await readFile(join(output, "documents/content-metadata.json"), "utf8"));
    expect(envelope.metadata.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "standalone-launcher" }),
      expect.objectContaining({ id: "closure" }),
      expect.objectContaining({ id: "open-design-web", materialization: expect.objectContaining({ type: "zip", entrypoint: "sidecar.mjs" }) }),
    ]));
    expect(await readFile(join(output, "artifacts/open-design-web.zip"), "utf8")).toBe("fixture zip bytes");
  });
});
