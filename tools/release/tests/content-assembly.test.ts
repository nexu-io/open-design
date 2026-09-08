import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareContent, finalizeContent } from "../src/exact/content.ts";

const roots: string[] = [];
afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))));

const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

describe("exact release control", () => {
  it.each(["electron", "terminal"].flatMap(shellType => ["betahyx", "stable", "prerelease"].map(channel => ({ shellType, channel }))))("signs $shellType/$channel contributions with real resource and optional updater capabilities", async ({ shellType, channel }) => {
    const releaseVersion = channel === "stable" ? "0.1.0" : `0.1.0-${channel}.1`;
    const root = await mkdtemp(join(tmpdir(), "exact-control-resource-"));
    roots.push(root);
    const scene = join(root, "scene"), output = join(root, "prepared");
    await mkdir(scene, { recursive: true });
    const closure = join(root, "closure.mjs"), launcher = join(root, "launcher.mjs"), resource = join(scene, "open-design-web.zip");
    await writeFile(closure, "export const closure = true;\n");
    await writeFile(launcher, "export const launcher = true;\n");
    await writeFile(resource, "fixture zip bytes");
    const capsuleBytes = Buffer.from("fixture Capsule archive");
    if (shellType === "electron") await writeFile(join(scene, "capsule.zip"), capsuleBytes);
    const manifest = {
      schemaVersion: 1,
      target: "darwin-arm64",
      shellVersion: "0.1.0",
      shellBuildHash: "a".repeat(64),
      closure: { sha256: digest(await readFile(closure)) },
      standalone: { sha256: digest(await readFile(launcher)) },
      ...(shellType !== "electron" ? {} : { capsule: { archiveFile: "capsule.zip", content: {
        schemaVersion: 1, protocol: "electron-capsule-v3", target: "darwin-arm64", entrypoint: "capsule.cjs",
        archive: { sha256: digest(capsuleBytes), size: capsuleBytes.byteLength, treeSha256: "d".repeat(64) },
      } } }),
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
      const prepareRequest = {
        channel,
        releaseVersion,
        sourceCommit: "c".repeat(40),
        publishedAt: "2026-09-05T00:00:00Z",
        standaloneVersion: "0.1.0",
        artifactBaseUrl: `https://releases.invalid/${channel}/${releaseVersion}`,
        closureArtifactFile: closure,
        standaloneArtifactFile: launcher,
        resourceReceiptFile: join(scene, "closure-resources.json"),
        shells: [{ type: shellType, version: "0.1.0", scenes: [{ target: "darwin-arm64", sceneDirectory: scene, sceneManifestSha256: digest(await readFile(manifestPath)) }] }],
        outputDirectory: output,
      };
      const resourceReceiptPath = join(scene, "closure-resources.json");
      await expect(prepareContent({ ...prepareRequest, releaseVersion: channel === "stable" ? "0.1.0-stable.1" : "0.1.0" }, join(output, "prepare-receipt.json"))).rejects.toThrow("release version must be");
      const resourceReceipt = JSON.parse(await readFile(resourceReceiptPath, "utf8"));
      await writeFile(resourceReceiptPath, JSON.stringify({ ...resourceReceipt, operation: "closure.resources.development" }));
      await expect(prepareContent(prepareRequest, join(output, "prepare-receipt.json"))).rejects.toThrow("resource receipt is invalid");
      await writeFile(resourceReceiptPath, JSON.stringify(resourceReceipt));
      await prepareContent(prepareRequest, join(output, "prepare-receipt.json"));
      const prepared = JSON.parse(await readFile(join(output, "prepare-receipt.json"), "utf8"));
      const contributionFile = join(root, "contribution.json"), finalDirectory = join(root, "final");
      const contribution = {
        schemaVersion: 1, operation: "shell.distribution.contribute", target: "darwin-arm64",
        shell: { type: shellType, version: "0.1.0", buildHash: "a".repeat(64) },
        artifact: { file: resource, sha256: digest(await readFile(resource)), size: (await readFile(resource)).byteLength, mediaType: "application/zip" },
        ...(shellType !== "electron" ? {} : {
          installIdentity: { appId: "test.app", executableName: "test", namespace: "test", productName: "test" },
          platformTrust: { platform: "macos", mode: "verify-only", designatedRequirement: "test", teamIdentifier: "adhoc" },
        }),
      };
      const finalize = () => finalizeContent({ prepareReceipt: join(output, "prepare-receipt.json"),
        contentMetadataFile: prepared.contentMetadata.file, closureArtifactFile: prepared.closureArtifact.file, standaloneArtifactFile: prepared.standaloneArtifact.file,
        contributions: [{ receipt: contributionFile, archiveFile: resource }], outputDirectory: finalDirectory,
      }, join(finalDirectory, "pack-receipt.json"));
      await writeFile(contributionFile, JSON.stringify({ ...contribution, updater: { protocol: "wrong" } }));
      await expect(finalize()).rejects.toThrow("invalid updater contract");
      await writeFile(contributionFile, JSON.stringify(contribution));
      if (shellType === "electron") {
        await expect(finalize()).rejects.toThrow("lacks updater contract");
        await writeFile(contributionFile, JSON.stringify({ ...contribution, updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" } }));
      }
      await finalize();
      const metadata = JSON.parse(await readFile(join(finalDirectory, `documents/${shellType}-metadata.json`), "utf8"));
      const finalized = JSON.parse(await readFile(join(finalDirectory, "pack-receipt.json"), "utf8"));
      expect(metadata.document.distributions[0].updater == null).toBe(shellType === "terminal");
      expect(finalized.requiredAcceptances[0].updater == null).toBe(shellType === "terminal");
      expect(finalized.documents.some((file: { file: string }) => file.file.endsWith("capsule-darwin-arm64.json"))).toBe(shellType === "electron");
    } finally {
      if (previous.key == null) delete process.env.OD_EXACT_ED25519_PRIVATE_KEY; else process.env.OD_EXACT_ED25519_PRIVATE_KEY = previous.key;
      if (previous.keyId == null) delete process.env.OD_EXACT_SIGNING_KEY_ID; else process.env.OD_EXACT_SIGNING_KEY_ID = previous.keyId;
    }
    const envelope = JSON.parse(await readFile(join(output, "documents/content-metadata.json"), "utf8"));
    expect(envelope.metadata).toMatchObject({ channel, releaseVersion });
    expect(envelope.metadata.resources.some((resource: { id: string }) => resource.id.includes("capsule"))).toBe(false);
    expect(envelope.metadata.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "standalone-launcher" }),
      expect.objectContaining({ id: "closure" }),
      expect.objectContaining({ id: "open-design-web", materialization: expect.objectContaining({ type: "zip", entrypoint: "sidecar.mjs" }) }),
    ]));
    expect(await readFile(join(output, "artifacts/open-design-web.zip"), "utf8")).toBe("fixture zip bytes");
  });
});
