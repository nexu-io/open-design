import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  loadElectronInstalledCapsuleSeed,
} from "@/adapters/standalone/installation.js";
import { loadElectronStandaloneAuthorityResources } from "@/adapters/standalone/installation.js";
import { withElectronInstallation } from "@/adapters/standalone/assemble-installation.js";
import { writeCapsuleSeed } from "./fixtures/capsule.js";

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
  const supervisor = Buffer.from("export default 'supervisor';\n");
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
  const capsule = await writeCapsuleSeed({ root, privateKey: keys.privateKey, keyId: "release" });
  const content = Buffer.from(canonicalJson(signStandaloneMetadata(metadata, "release", keys.privateKey)));
  const trust = Buffer.from(canonicalJson({
    schemaVersion: 1,
    keys: [{ keyId: "release", publicKey: keys.publicKey.export({ format: "pem", type: "spki" }).toString() }],
  }));
  const declaration = {
    schemaVersion: 3,
    channel: metadata.channel,
    releaseVersion: metadata.releaseVersion,
    target: "darwin-arm64",
    host: descriptor("standalone-host.mjs", host),
    updaterProvider: descriptor("electron-updater.mjs", host),
    supervisor: descriptor("supervisor.mjs", supervisor),
    content: descriptor("standalone-content.json", content),
    trust: descriptor("standalone-trust.json", trust),
    capsule: { manifest: descriptor("capsule-manifest.json", await readFile(capsule.manifestFile)), archive: descriptor("capsule.zip", await readFile(capsule.archiveFile)) },
    update: { channelHeadUrl: "https://releases.invalid/betahyx/latest/channel-head.json" },
    seeds: [
      { ...descriptor("standalone-launcher.mjs", launcher), blobSha256: launcherDigest },
      { ...descriptor("closure.mjs", closure), blobSha256: closureDigest },
    ],
  } as const;
  await Promise.all([
    writeFile(join(root, declaration.host.file), host),
    writeFile(join(root, declaration.updaterProvider.file), host),
    writeFile(join(root, declaration.supervisor.file), supervisor),
    writeFile(join(root, declaration.content.file), content),
    writeFile(join(root, declaration.trust.file), trust),
    writeFile(join(root, "capsule.zip"), await readFile(capsule.archiveFile)),
    writeFile(join(root, declaration.seeds[0].file), launcher),
    writeFile(join(root, declaration.seeds[1].file), closure),
    writeFile(join(root, ELECTRON_STANDALONE_INSTALLATION_FILE), canonicalJson(declaration)),
  ]);
  return { declaration, root, keys, capsule };
}

describe("Electron Standalone installed authority input", () => {
  it("verifies the signed Capsule baseline without loading Closure content first", async () => {
    const fixture = await installedFixture();
    await writeFile(join(fixture.root, fixture.declaration.content.file), "broken Closure metadata");
    const seed = await loadElectronInstalledCapsuleSeed({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64", carrierVersion: "0.1.0" });
    expect(seed.envelope).toEqual(fixture.capsule.envelope);
    expect(seed.archivePath).toBe(join(fixture.root, "capsule.zip"));
    expect(seed.trustedKeys.has("release")).toBe(true);
    await expect(loadElectronInstalledCapsuleSeed({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64", carrierVersion: "0.0.9" })).rejects.toThrow("compatible carrier");
  });

  it("rejects Capsule signatures even if the installation descriptor matches the substituted bytes", async () => {
    const fixture = await installedFixture();
    const changed = Buffer.from(canonicalJson({ ...fixture.capsule.envelope, document: { ...fixture.capsule.envelope.document, version: "9.0.0" } }));
    await writeFile(fixture.capsule.manifestFile, changed);
    await writeFile(join(fixture.root, ELECTRON_STANDALONE_INSTALLATION_FILE), canonicalJson({ ...fixture.declaration,
      capsule: { ...fixture.declaration.capsule, manifest: descriptor("capsule-manifest.json", changed) } }));
    await expect(loadElectronInstalledCapsuleSeed({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64", carrierVersion: "0.1.0" })).rejects.toThrow();
  });

  it("refuses changed Capsule bytes and retired installation schemas", async () => {
    const fixture = await installedFixture();
    await writeFile(join(fixture.root, "capsule.zip"), "tampered archive");
    await expect(loadElectronInstalledCapsuleSeed({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64", carrierVersion: "0.1.0" })).rejects.toThrow("Capsule archive size");
    await writeFile(join(fixture.root, ELECTRON_STANDALONE_INSTALLATION_FILE), canonicalJson({ ...fixture.declaration, schemaVersion: 2 }));
    await expect(loadElectronInstalledCapsuleSeed({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64", carrierVersion: "0.1.0" })).rejects.toThrow("unsupported Electron Standalone installation schema");
  });

  it("assembles local input files and discards only its temporary product installation", async () => {
    const fixture = await installedFixture();
    let staged = "";
    const result = await withElectronInstallation({
      input: { channel: "betahyx", releaseVersion: fixture.declaration.releaseVersion,
        channelHeadUrl: fixture.declaration.update.channelHeadUrl,
        contentFile: join(fixture.root, fixture.declaration.content.file), trustFile: join(fixture.root, fixture.declaration.trust.file),
        seedFiles: fixture.declaration.seeds.map(seed => join(fixture.root, seed.file)),
        capsule: { manifestFile: fixture.capsule.manifestFile, archiveFile: fixture.capsule.archiveFile },
      }, outputDirectory: fixture.root, target: "darwin-arm64", carrierVersion: "0.1.0",
    }, async installation => {
      staged = installation.resourceDirectory;
      expect(staged).not.toBe(fixture.root);
      const loaded = await loadElectronStandaloneInstallation({ resourceRoot: staged, channel: "betahyx", target: "darwin-arm64" });
      return loaded.declaration.releaseVersion;
    });
    expect(result).toBe(fixture.declaration.releaseVersion);
    await expect(readFile(join(staged, ELECTRON_STANDALONE_INSTALLATION_FILE))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(fixture.root, ELECTRON_STANDALONE_INSTALLATION_FILE), "utf8")).not.toBe("");
  });
  it("preserves accepted scene authority bytes instead of rebuilding them during distribution", async () => {
    const fixture = await installedFixture();
    await withElectronInstallation({
      input: { channel: "betahyx", releaseVersion: fixture.declaration.releaseVersion,
        channelHeadUrl: fixture.declaration.update.channelHeadUrl,
        contentFile: join(fixture.root, fixture.declaration.content.file), trustFile: join(fixture.root, fixture.declaration.trust.file),
        seedFiles: fixture.declaration.seeds.map(seed => join(fixture.root, seed.file)),
        capsule: { manifestFile: fixture.capsule.manifestFile, archiveFile: fixture.capsule.archiveFile },
      }, outputDirectory: fixture.root, target: "darwin-arm64", carrierVersion: "0.1.0",
      authority: {
        host: { name: "standalone-host.mjs", path: join(fixture.root, fixture.declaration.host.file) },
        updaterProvider: { name: "electron-updater.mjs", path: join(fixture.root, fixture.declaration.updaterProvider.file) },
        supervisor: { name: "supervisor.mjs", path: join(fixture.root, fixture.declaration.supervisor.file) },
      },
    }, async installation => {
      for (const file of ["standalone-host.mjs", "electron-updater.mjs", "supervisor.mjs"]) {
        expect(await readFile(join(installation.resourceDirectory, file))).toEqual(await readFile(join(fixture.root, file)));
      }
    });
  });
  it("uses the installed descriptor schema for build resource projection", async () => {
    const fixture = await installedFixture();
    await writeFile(join(fixture.root, ELECTRON_STANDALONE_INSTALLATION_FILE), canonicalJson({
      ...fixture.declaration,
      host: { ...fixture.declaration.host, ignored: true },
    }));
    await expect(loadElectronStandaloneAuthorityResources(fixture.root)).rejects.toThrow("fields must be exactly");
  });
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
    await expect(loadElectronStandaloneAuthorityResources(fixture.root)).resolves.toEqual([
      { name: "standalone-installation.json", path: join(fixture.root, "standalone-installation.json") },
      { name: "standalone-host.mjs", path: join(fixture.root, "standalone-host.mjs") },
      { name: "electron-updater.mjs", path: join(fixture.root, "electron-updater.mjs") },
      { name: "supervisor.mjs", path: join(fixture.root, "supervisor.mjs") },
      { name: "standalone-content.json", path: join(fixture.root, "standalone-content.json") },
      { name: "standalone-trust.json", path: join(fixture.root, "standalone-trust.json") },
      { name: "capsule-manifest.json", path: join(fixture.root, "capsule-manifest.json") },
      { name: "capsule.zip", path: join(fixture.root, "capsule.zip") },
      { name: "standalone-launcher.mjs", path: join(fixture.root, "standalone-launcher.mjs") },
      { name: "closure.mjs", path: join(fixture.root, "closure.mjs") },
    ]);
  });

  it("rejects updater provider byte drift before launch", async () => {
    const fixture = await installedFixture();
    await writeFile(join(fixture.root, fixture.declaration.updaterProvider.file), "tampered");
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64" }))
      .rejects.toThrow("Electron updater provider");
    await expect(loadElectronStandaloneAuthorityResources(fixture.root)).rejects.toThrow("electron-updater.mjs size does not match");
  });

  it("rejects installed byte drift before trusting content", async () => {
    const fixture = await installedFixture();
    await writeFile(join(fixture.root, fixture.declaration.content.file), "{}\n");
    await expect(loadElectronStandaloneInstallation({ resourceRoot: fixture.root, channel: "betahyx", target: "darwin-arm64" }))
      .rejects.toThrow("content size does not match");
    await expect(loadElectronStandaloneAuthorityResources(fixture.root)).rejects.toThrow("standalone-content.json size does not match");
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
