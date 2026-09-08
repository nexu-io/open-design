import { createHash, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signDocument, standaloneTreeSha256 } from "@open-design/standalone";
import { createElectronCapsuleLoader, inspectElectronCapsule } from "@/runtime/startup/capsule.js";
import { validateElectronCapsuleManifest } from "@/contracts/capsule.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(source = 'module.exports.createElectronCapsuleDefinition = () => ({ pid: process.pid });', startup = true) {
  const root = await mkdtemp(join(tmpdir(), "capsule-load-")); roots.push(root);
  const body = Buffer.from(`${source}\n${startup ? 'module.exports.runElectronCapsule = async () => {};' : ''}`), entrypoint = join(root, "capsule.cjs");
  await writeFile(entrypoint, body);
  const manifest = validateElectronCapsuleManifest({ schemaVersion: 1, protocol: "electron-capsule-v5", version: "1.0.0", target: "darwin-arm64", entrypoint: "capsule.cjs",
    requires: { carrierVersion: "1.0.0" }, provides: { shellVersion: "2.0.0" },
    archive: { sha256: "a".repeat(64), size: 100, treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", sha256: createHash("sha256").update(body).digest("hex"), size: body.byteLength }]) } });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { root, entrypoint, envelope: signDocument(manifest, [{ keyId: "test", privateKey }]), trustedKeys: { test: publicKey },
    carrier: { target: "darwin-arm64" as const, shell: { type: "electron", version: "1.0.0", buildHash: "b".repeat(64), digest: "c".repeat(64) } } };
}
describe("verified Capsule loading", () => {
  it("loads the public verification leaf under plain Node without an Electron host", () => {
    expect(() => execFileSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      const capsule = await import("@open-design/electron-kit/capsule-loader");
      await assert.rejects(import("@open-design/electron-kit/capsule"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
      assert.equal(typeof capsule.inspectElectronCapsule, "function");
      assert.equal(typeof capsule.createElectronCapsuleLoader, "function");
      assert.equal(Object.keys(createRequire(import.meta.url).cache).some(path => /node_modules.*(?:electron|electron-builder|esbuild)\\//u.test(path)), false);
    `], { stdio: "pipe", timeout: 10000 })).not.toThrow();
  });
  it("inspects a signed broken module without evaluating it or arming a load", async () => {
    const input = await fixture('throw new Error("candidate code ran");');
    const inspected = await inspectElectronCapsule(input);
    expect(inspected).toMatchObject({ manifest: input.envelope.document, shell: { version: "2.0.0" }, entrypoint: { path: "capsule.cjs" } });
    await expect(createElectronCapsuleLoader()(input)).rejects.toThrow("candidate code ran");
  });
  it("does not let a successful inspection authorize substituted executable bytes", async () => {
    const input = await fixture();
    await inspectElectronCapsule(input);
    await writeFile(input.entrypoint, 'throw new Error("substitution executed");');
    await expect(createElectronCapsuleLoader()(input)).rejects.toThrow("digest mismatch");
  });
  it("keeps inspection trust and compatibility checks identical to execution", async () => {
    const input = await fixture('throw new Error("candidate code ran");');
    await expect(inspectElectronCapsule({ ...input, trustedKeys: {} })).rejects.toThrow("signature verification");
    await expect(inspectElectronCapsule({ ...input, carrier: { ...input.carrier, target: "darwin-x64" } })).rejects.toThrow();
    await expect(inspectElectronCapsule({ ...input, carrier: { ...input.carrier, shell: { ...input.carrier.shell, version: "0.1.0" } } })).rejects.toThrow();
    await mkdir(join(input.root, "extra"));
    await expect(inspectElectronCapsule(input)).rejects.toThrow("inventory mismatch");
  });
  it("does not take composite identity from executable module exports", async () => {
    const input = await fixture('module.exports.shell = {type:"electron", version:"99.0.0"}; module.exports.createElectronCapsuleDefinition = () => ({});');
    const loaded = await createElectronCapsuleLoader()(input);
    expect(loaded.shell.version).toBe(input.envelope.document.provides.shellVersion);
    expect(loaded.shell.version).not.toBe("99.0.0");
    expect(Object.isFrozen(loaded.shell)).toBe(true);
    expect(input.carrier.shell.version).toBe("1.0.0");
  });
  it("requires the versioned startup entry and rejects the former definition-only protocol", async () => {
    const input = await fixture('module.exports.createElectronCapsuleDefinition = () => ({});', false);
    await expect(createElectronCapsuleLoader()(input)).rejects.toThrow("startup entry");
    expect(() => validateElectronCapsuleManifest({ ...input.envelope.document, protocol: "electron-capsule-v1" }))
      .toThrow("unsupported Capsule manifest");
    expect(() => validateElectronCapsuleManifest({ ...input.envelope.document, protocol: "electron-capsule-v2" }))
      .toThrow("unsupported Capsule manifest");
    expect(() => validateElectronCapsuleManifest({ ...input.envelope.document, protocol: "electron-capsule-v3" }))
      .toThrow("unsupported Capsule manifest");
    expect(() => validateElectronCapsuleManifest({ ...input.envelope.document, protocol: "electron-capsule-v4" }))
      .toThrow("unsupported Capsule manifest");
  });
  it("loads once in the current process and rejects in-process replacement", async () => {
    const input = await fixture(), load = createElectronCapsuleLoader();
    const [first, second] = await Promise.all([load(input), load(input)]);
    expect(second).toBe(first);
    expect(first.createElectronCapsuleDefinition({} as never, first.shell)).toMatchObject({ pid: process.pid });
    expect(first.shell.version).toBe("2.0.0");
    expect(first.shell.digest).not.toBe(input.carrier.shell.digest);
    await expect(load({ ...input, carrier: { ...input.carrier, shell: { ...input.carrier.shell, digest: "d".repeat(64) } } })).rejects.toThrow("new carrier process");
    await expect(load(await fixture())).rejects.toThrow("new carrier process");
  });
  it("rejects untrusted signatures and modified bytes before executing them", async () => {
    const input = await fixture('throw new Error("must not execute");');
    await expect(createElectronCapsuleLoader()({ ...input, trustedKeys: {} })).rejects.toThrow("signature verification");
    await writeFile(input.entrypoint, 'throw new Error("changed code executed");');
    await expect(createElectronCapsuleLoader()(input)).rejects.toThrow("digest mismatch");
  });
  it("rejects extra files and keeps an interrupted load failed", async () => {
    const input = await fixture(), load = createElectronCapsuleLoader();
    await mkdir(join(input.root, "unexpected"));
    await expect(load(input)).rejects.toThrow("inventory mismatch");
    await rm(join(input.root, "unexpected"), { recursive: true });
    await expect(load(input)).rejects.toThrow("inventory mismatch");
  });
  it("supports native dynamic imports without a second process", async () => {
    const input = await fixture('module.exports.createElectronCapsuleDefinition = () => import("node:os").then(os => ({ platform: os.platform() }));');
    const loaded = await createElectronCapsuleLoader()(input);
    await expect(loaded.createElectronCapsuleDefinition({} as never, loaded.shell)).resolves.toMatchObject({ platform: process.platform });
  });
});
