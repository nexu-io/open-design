import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { signStandaloneMetadata, verifyDocument, verifyStandaloneMetadata, verifyStandaloneShellMetadata } from "@open-design/standalone";

import { prepareContent, finalizeContent } from "@/exact/content.ts";
import { capsuleFixture } from "./capsule-fixture.ts";

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
    const capsule = await capsuleFixture();
    const capsuleBytes = capsule.bytes;
    if (shellType === "electron") await writeFile(join(scene, "capsule.zip"), capsuleBytes);
    const manifest = {
      schemaVersion: 1,
      target: "darwin-arm64",
      shellVersion: "0.1.0",
      shellBuildHash: "a".repeat(64),
      closure: { sha256: digest(await readFile(closure)) },
      standalone: { sha256: digest(await readFile(launcher)) },
      ...(shellType !== "electron" ? {} : { capsule: { archiveFile: "capsule.zip", content: {
        schemaVersion: 1, protocol: "electron-capsule-v6", target: "darwin-arm64", entrypoint: "capsule.cjs",
        archive: capsule.archive,
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
      if (shellType === "electron") expect(prepared.shells[0].scenes[0].capsule.budget).toMatchObject({
        files: 1, archiveBytes: capsuleBytes.length, sha256: capsule.archive.sha256, budget: { revision: 1 },
      });
      const replayOutput = join(root, "replayed");
      await prepareContent({ ...prepareRequest, outputDirectory: replayOutput }, join(replayOutput, "prepare-receipt.json"));
      const replay = JSON.parse(await readFile(join(replayOutput, "prepare-receipt.json"), "utf8"));
      expect(await readFile(replay.contentMetadata.file)).toEqual(await readFile(prepared.contentMetadata.file));
      // A retained carrier seed is immutable installation history, not the
      // authority for this release's independently supplied Closure bytes.
      const sceneBefore = await readFile(manifestPath);
      const newClosure = join(root, "new-closure.mjs"), newLauncher = join(root, "new-launcher.mjs");
      await writeFile(newClosure, "new independently built Closure");
      await writeFile(newLauncher, "new independently built launcher");
      const independentOutput = join(root, "independent-content");
      await prepareContent({ ...prepareRequest, closureArtifactFile: newClosure, standaloneArtifactFile: newLauncher,
        outputDirectory: independentOutput }, join(independentOutput, "prepare-receipt.json"));
      const independent = JSON.parse(await readFile(join(independentOutput, "prepare-receipt.json"), "utf8"));
      expect(independent.closureArtifact.sha256).toBe(digest(await readFile(newClosure)));
      expect(independent.standaloneArtifact.sha256).toBe(digest(await readFile(newLauncher)));
      expect(independent.shells[0].scenes[0].shellBuildHash).toBe(manifest.shellBuildHash);
      expect(await readFile(manifestPath)).toEqual(sceneBefore);
      if (shellType === "electron") {
        const contentFile = join(root, "capsule-content.json"), archiveFile = join(root, "capsule.zip");
        await writeFile(contentFile, JSON.stringify(manifest.capsule!.content));
        await writeFile(archiveFile, "tampered");
        const product = { target: "darwin-arm64", contentFile, archiveFile };
        await expect(prepareContent({ ...prepareRequest, capsuleProducts: [] }, join(output, "rejected.json"))).rejects.toThrow("do not cover");
        await expect(prepareContent({ ...prepareRequest, capsuleProducts: [product, product] }, join(output, "rejected.json"))).rejects.toThrow("duplicate Capsule");
        await expect(prepareContent({ ...prepareRequest, capsuleProducts: [{ ...product, target: "darwin-x64" }] }, join(output, "rejected.json"))).rejects.toThrow("invalid or duplicate");
        await expect(prepareContent({ ...prepareRequest, capsuleProducts: [product] }, join(output, "rejected.json"))).rejects.toThrow("archive mismatch");
        await writeFile(contentFile, JSON.stringify({ ...manifest.capsule!.content, target: "darwin-x64" }));
        await expect(prepareContent({ ...prepareRequest, capsuleProducts: [product] }, join(output, "rejected.json"))).rejects.toThrow("target mismatch");
      }
      await expect(finalizeContent({
        prepareReceipt: join(output, "prepare-receipt.json"), contentMetadataFile: prepared.contentMetadata.file,
        closureArtifactFile: prepared.closureArtifact.file, standaloneArtifactFile: prepared.standaloneArtifact.file,
        contributions: [], outputDirectory: join(root, "incomplete"),
      }, join(root, "incomplete/pack-receipt.json"))).rejects.toThrow("requires Shell contributions");
      const currentContent = JSON.parse(await readFile(prepared.contentMetadata.file, "utf8"));
      const history = signStandaloneMetadata({ ...currentContent.metadata, shell: {
        [shellType]: { ...currentContent.metadata.shell[shellType], version: { min: "0.0.9" } },
      } }, "release-test", keys.privateKey);
      const historyFile = join(root, "previous-content.json");
      await writeFile(historyFile, JSON.stringify(history));
      for (const [name, floor] of [["verified-history", "0.0.9"], ["tampered-history", "0.1.0"]]) {
        if (name === "tampered-history") {
          history.metadata.shell[shellType]!.version.min = "0.0.1";
          await writeFile(historyFile, JSON.stringify(history));
        }
        const reused = join(root, name!);
        await prepareContent({ ...prepareRequest, previousContentMetadataFile: historyFile, outputDirectory: reused }, join(reused, "prepare-receipt.json"));
        const receipt = JSON.parse(await readFile(join(reused, "prepare-receipt.json"), "utf8"));
        expect(receipt.shells[0].minimumVersion).toBe(floor);
      }
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
        await writeFile(contributionFile, JSON.stringify({ ...contribution, updater: { protocol: "standalone-shell-updater-v4", handler: "sidecar-v1", interaction: "restart-and-install" } }));
      }
      await finalize();
      const metadata = JSON.parse(await readFile(join(finalDirectory, `documents/${shellType}-metadata.json`), "utf8"));
      const finalized = JSON.parse(await readFile(join(finalDirectory, "pack-receipt.json"), "utf8"));
      expect(() => verifyStandaloneShellMetadata(metadata, { "release-test": keys.publicKey })).not.toThrow();
      expect(metadata.document.distributions[0].updater == null).toBe(shellType === "terminal");
      expect(finalized.requiredAcceptances[0].updater == null).toBe(shellType === "terminal");
      expect(finalized.documents.some((file: { file: string }) => file.file.endsWith("capsule-darwin-arm64.json"))).toBe(shellType === "electron");
      if (shellType === "electron") {
        const capsule = metadata.document.distributions[0].capsule;
        const manifestBytes = await readFile(join(finalDirectory, "documents", "capsule-darwin-arm64.json"));
        expect(capsule).toEqual({ schemaVersion: 1,
          manifest: { url: `${prepareRequest.artifactBaseUrl}/capsule-darwin-arm64.json`, sha256: digest(manifestBytes), size: manifestBytes.byteLength },
          archive: { url: `${prepareRequest.artifactBaseUrl}/capsule-darwin-arm64-${digest(capsuleBytes)}.zip`, sha256: digest(capsuleBytes), size: capsuleBytes.byteLength },
        });
        expect(() => verifyDocument(metadata, { "release-test": keys.publicKey })).not.toThrow();
        const tampered = structuredClone(metadata);
        tampered.document.distributions[0].capsule.archive.sha256 = "e".repeat(64);
        expect(() => verifyDocument(tampered, { "release-test": keys.publicKey })).toThrow("signature");
      } else expect(metadata.document.distributions[0]).not.toHaveProperty("capsule");
      if (shellType === "electron") {
        // Same carrier, changed Capsule: do not inherit a floor proven for other code.
        const prior = signStandaloneMetadata({ ...currentContent.metadata, shell: {
          electron: { ...currentContent.metadata.shell.electron, version: { min: "0.0.9" } },
        } }, "release-test", keys.privateKey);
        await writeFile(historyFile, JSON.stringify(prior));
        const changedCapsule = await capsuleFixture("changed Capsule on unchanged carrier");
        const changedBytes = changedCapsule.bytes;
        await writeFile(join(scene, "capsule.zip"), changedBytes);
        const changedManifest = { ...manifest, capsule: { ...manifest.capsule!, content: {
          ...manifest.capsule!.content, archive: changedCapsule.archive,
        } } };
        await writeFile(manifestPath, JSON.stringify(changedManifest));
        const changedOutput = join(root, "changed-capsule");
        await prepareContent({ ...prepareRequest, outputDirectory: changedOutput, previousContentMetadataFile: historyFile,
          shells: [{ type: shellType, version: "0.1.0", scenes: [{ target: "darwin-arm64", sceneDirectory: scene, sceneManifestSha256: digest(await readFile(manifestPath)) }] }],
        }, join(changedOutput, "prepare-receipt.json"));
        const changed = JSON.parse(await readFile(join(changedOutput, "prepare-receipt.json"), "utf8"));
        expect(changed.shells[0].buildHash).not.toBe(prepared.shells[0].buildHash);
        expect(changed.shells[0].minimumVersion).toBe("0.1.0");
      }
    } finally {
      if (previous.key == null) delete process.env.OD_EXACT_ED25519_PRIVATE_KEY; else process.env.OD_EXACT_ED25519_PRIVATE_KEY = previous.key;
      if (previous.keyId == null) delete process.env.OD_EXACT_SIGNING_KEY_ID; else process.env.OD_EXACT_SIGNING_KEY_ID = previous.keyId;
    }
    const envelope = JSON.parse(await readFile(join(output, "documents/content-metadata.json"), "utf8"));
    expect(envelope.metadata).toMatchObject({ schemaVersion: 5, channel, releaseVersion, shell: { [shellType]: { version: { min: "0.1.0" } } } });
    expect(envelope.metadata).not.toHaveProperty("shellRequirements");
    expect(() => verifyStandaloneMetadata(envelope, { "release-test": keys.publicKey })).not.toThrow();
    expect(envelope.metadata.resources.some((resource: { id: string }) => resource.id.includes("capsule"))).toBe(false);
    expect(envelope.metadata.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "standalone-launcher" }),
      expect.objectContaining({ id: "closure" }),
      expect.objectContaining({ id: "open-design-web", materialization: expect.objectContaining({ type: "zip", entrypoint: "sidecar.mjs" }) }),
    ]));
    expect(await readFile(join(output, "artifacts/open-design-web.zip"), "utf8")).toBe("fixture zip bytes");
  });
});
