import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signDocument, standaloneTreeSha256 } from "@open-design/standalone";
import { createElectronCapsuleLoader } from "@/runtime/startup/capsule.js";
import { validateElectronCapsuleManifest } from "@/contracts/capsule.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(source = 'module.exports.createElectronCapsuleDefinition = () => ({ pid: process.pid });', startup = true) {
  const root = await mkdtemp(join(tmpdir(), "capsule-load-")); roots.push(root);
  const body = Buffer.from(`${source}\n${startup ? 'module.exports.runElectronCapsule = async () => {};' : ''}`), entrypoint = join(root, "capsule.cjs");
  await writeFile(entrypoint, body);
  const manifest = validateElectronCapsuleManifest({ schemaVersion: 1, protocol: "electron-capsule-v3", version: "1.0.0", target: "darwin-arm64", entrypoint: "capsule.cjs",
    requires: { carrierVersion: "1.0.0" }, provides: { shellVersion: "2.0.0" },
    archive: { sha256: "a".repeat(64), size: 100, treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", sha256: createHash("sha256").update(body).digest("hex"), size: body.byteLength }]) } });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { root, entrypoint, envelope: signDocument(manifest, [{ keyId: "test", privateKey }]), trustedKeys: { test: publicKey }, carrier: { target: "darwin-arm64" as const, version: "1.0.0" } };
}
describe("verified Capsule loading", () => {
  it("requires the versioned startup entry and rejects the former definition-only protocol", async () => {
    const input = await fixture('module.exports.createElectronCapsuleDefinition = () => ({});', false);
    await expect(createElectronCapsuleLoader()(input)).rejects.toThrow("startup entry");
    expect(() => validateElectronCapsuleManifest({ ...input.envelope.document, protocol: "electron-capsule-v1" }))
      .toThrow("unsupported Capsule manifest");
    expect(() => validateElectronCapsuleManifest({ ...input.envelope.document, protocol: "electron-capsule-v2" }))
      .toThrow("unsupported Capsule manifest");
  });
  it("loads once in the current process and rejects in-process replacement", async () => {
    const input = await fixture(), load = createElectronCapsuleLoader();
    const [first, second] = await Promise.all([load(input), load(input)]);
    expect(second).toBe(first);
    expect(first.createElectronCapsuleDefinition({} as never)).toMatchObject({ pid: process.pid });
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
    await expect(loaded.createElectronCapsuleDefinition({} as never)).resolves.toMatchObject({ platform: process.platform });
  });
});
