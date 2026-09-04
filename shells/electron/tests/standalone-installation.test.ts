import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalJson,
  signStandaloneMetadata,
  type StandaloneMetadata,
} from "@open-design/standalone";

import {
  ELECTRON_STANDALONE_INSTALLATION_FILE,
  loadElectronStandaloneInstallation,
} from "@/adapters/standalone/installation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

function descriptor(file: string, bytes: Uint8Array) {
  return Object.freeze({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  });
}

async function installedFixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-standalone-installation-"));
  roots.push(root);
  const host = Buffer.from("export default 'host';\n");
  const launcher = Buffer.from("export default 'launcher';\n");
  const closure = Buffer.from("export default 'closure';\n");
  const launcherDigest = createHash("sha256").update(launcher).digest("hex");
  const closureDigest = createHash("sha256").update(closure).digest("hex");
  const metadata: StandaloneMetadata = {
    schemaVersion: 4,
    channel: "betahyx",
    releaseVersion: "0.1.0-betahyx.1",
    standaloneVersion: "0.1.0",
    sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
    publishedAt: "2026-09-04T00:00:00.000Z",
    blobs: {
      [launcherDigest]: { sha256: launcherDigest, size: launcher.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://releases.invalid/launcher.mjs" }] },
      [closureDigest]: { sha256: closureDigest, size: closure.byteLength, mediaType: "text/javascript", sources: [{ kind: "remote", url: "https://releases.invalid/closure.mjs" }] },
    },
    resources: [
      { id: "standalone-launcher", component: "standalone.launcher", blob: launcherDigest, sync: true, materialization: { type: "file", entrypoint: "launcher.mjs" } },
      { id: "closure", component: "standalone.resource", blob: closureDigest, sync: true, materialization: { type: "file", entrypoint: "closure.mjs" } },
    ],
    shellRequirements: [{ type: "electron", minVersion: "0.1.0", buildHash: "a".repeat(64) }],
  };
  const keys = generateKeyPairSync("ed25519");
  const content = Buffer.from(canonicalJson(signStandaloneMetadata(metadata, "release", keys.privateKey)));
  const trust = Buffer.from(canonicalJson({
    schemaVersion: 1,
    keys: [{ keyId: "release", publicKey: keys.publicKey.export({ format: "pem", type: "spki" }).toString() }],
  }));
  const declaration = {
    schemaVersion: 1,
    channel: metadata.channel,
    releaseVersion: metadata.releaseVersion,
    target: "darwin-arm64",
    host: descriptor("standalone-host.mjs", host),
    content: descriptor("standalone-content.json", content),
    trust: descriptor("standalone-trust.json", trust),
    seeds: [
      { ...descriptor("standalone-launcher.mjs", launcher), blobSha256: launcherDigest },
      { ...descriptor("closure.mjs", closure), blobSha256: closureDigest },
    ],
  } as const;
  await Promise.all([
    writeFile(join(root, declaration.host.file), host),
    writeFile(join(root, declaration.content.file), content),
    writeFile(join(root, declaration.trust.file), trust),
    writeFile(join(root, declaration.seeds[0].file), launcher),
    writeFile(join(root, declaration.seeds[1].file), closure),
    writeFile(join(root, ELECTRON_STANDALONE_INSTALLATION_FILE), canonicalJson(declaration)),
  ]);
  return { declaration, root };
}

describe("Electron Standalone installed authority input", () => {
  it("verifies the exact release, trust root, host, and complete offline seed set", async () => {
    const fixture = await installedFixture();
    const installation = await loadElectronStandaloneInstallation({
      resourceRoot: fixture.root,
      channel: "betahyx",
      target: "darwin-arm64",
    });

    expect(installation.declaration).toEqual(fixture.declaration);
    expect(installation.envelope.metadata.releaseVersion).toBe("0.1.0-betahyx.1");
    expect(installation.trustedKeys.has("release")).toBe(true);
    expect(Object.keys(installation.candidates).sort()).toEqual(fixture.declaration.seeds.map(({ blobSha256 }) => blobSha256).sort());
    expect(installation.hostPath).toBe(join(fixture.root, "standalone-host.mjs"));
  });

  it("rejects installed byte drift before trusting content", async () => {
    const fixture = await installedFixture();
    await writeFile(join(fixture.root, fixture.declaration.content.file), "{}\n");
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64" }))
      .rejects.toThrow("content size does not match");
  });

  it("rejects a symlinked installed resource even when its bytes match", async () => {
    const fixture = await installedFixture();
    const host = join(fixture.root, fixture.declaration.host.file);
    const moved = join(fixture.root, "moved-host.mjs");
    await writeFile(moved, "export default 'host';\n");
    await rm(host);
    await symlink(moved, host);
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64" }))
      .rejects.toThrow("host must be a regular installed file");
  });

  it("rejects channel, target, and incomplete seed bindings", async () => {
    const fixture = await installedFixture();
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "preview", target: "darwin-arm64" }))
      .rejects.toThrow("escaped its exact channel");
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "betahyx", target: "win32-x64" }))
      .rejects.toThrow("target does not match");

    const incomplete = { ...fixture.declaration, seeds: [fixture.declaration.seeds[0]] };
    await writeFile(join(fixture.root, ELECTRON_STANDALONE_INSTALLATION_FILE), canonicalJson(incomplete));
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64" }))
      .rejects.toThrow("offline seeds do not exactly cover");
  });
});
