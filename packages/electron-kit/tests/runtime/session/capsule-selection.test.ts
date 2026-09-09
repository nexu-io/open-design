import { generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { canonicalJson, sha256Hex, signDocument, standaloneTreeSha256 } from "@open-design/standalone";
import { validateElectronCapsuleManifest } from "@/contracts/capsule.js";
import { ElectronActivationAttempt, inspectElectronStartup } from "@/runtime/session/activation.js";
import { armElectronCapsuleSelection, commitElectronCapsuleSelection, readElectronCapsuleSelection } from "@/runtime/session/capsule-selection.js";
import { recoverElectronStartup } from "@/runtime/session/recovery.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "capsule-selection-runtime-")); roots.push(runtimeRoot);
  const root = await mkdtemp(join(tmpdir(), "capsule-selection-content-")); roots.push(root);
  const code = Buffer.from('throw new Error("selection must never execute Capsule");');
  await writeFile(join(root, "capsule.cjs"), code);
  const manifest = validateElectronCapsuleManifest({ schemaVersion: 1, protocol: "electron-capsule-v6", version: "1.0.0", target: "darwin-arm64", entrypoint: "capsule.cjs",
    requires: { carrierVersion: "1.0.0" }, provides: { shellVersion: "2.0.0" },
    archive: { sha256: "a".repeat(64), size: 100, treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", sha256: sha256Hex(code), size: code.length }]) } });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const capsule = { root, envelope: signDocument(manifest, [{ keyId: "test", privateKey }]), trustedKeys: { test: publicKey },
    carrier: { target: "darwin-arm64" as const, shell: { type: "electron", version: "1.0.0", buildHash: "b".repeat(64), digest: "c".repeat(64) } } };
  return { runtimeRoot, capsule, expectedRevision: 0, closureGenerationId: "d".repeat(64) };
}

it("arms verified exact bytes without code execution and commits only the mounted pair", async () => {
  const input = await fixture();
  const armed = await armElectronCapsuleSelection(input);
  expect(armed).toMatchObject({ revision: 1, current: null, pending: { closureGenerationId: input.closureGenerationId } });
  const bytes = await readFile(join(input.runtimeRoot, "capsule-selection.json"), "utf8");
  await expect(commitElectronCapsuleSelection(input.runtimeRoot, { ...input.capsule, revision: 1 }, "e".repeat(64))).rejects.toThrow("exact prepared Closure");
  expect(await readFile(join(input.runtimeRoot, "capsule-selection.json"), "utf8")).toBe(bytes);
  await commitElectronCapsuleSelection(input.runtimeRoot, { ...input.capsule, revision: 1 }, input.closureGenerationId);
  expect(await readElectronCapsuleSelection(input.runtimeRoot)).toMatchObject({ revision: 2, pending: null, current: armed.pending });
});

it("refuses stale or overlapping arms without replacing the selected target", async () => {
  const input = await fixture();
  await armElectronCapsuleSelection(input);
  await expect(armElectronCapsuleSelection(input)).rejects.toThrow("stale");
  await expect(armElectronCapsuleSelection({ ...input, expectedRevision: 1 })).rejects.toThrow("already pending");
  await expect(commitElectronCapsuleSelection(input.runtimeRoot, { ...input.capsule, revision: 0 }, input.closureGenerationId)).rejects.toThrow("changed during startup");
  expect((await readElectronCapsuleSelection(input.runtimeRoot)).revision).toBe(1);
});

it("preserves the committed Capsule but blocks startup after SIGKILL between carrier commits", async () => {
  const input = await fixture();
  const armed = await armElectronCapsuleSelection(input);
  // Compile the owning implementation for a real child process. The private
  // commit stays private; this adds neither a runtime hook nor a public export.
  const program = await build({
    stdin: { contents: `
      import { acquireElectronSessionLease } from "@/runtime/session/lease.js";
      import { ElectronActivationAttempt } from "@/runtime/session/activation.js";
      import { commitElectronCapsuleSelection } from "@/runtime/session/capsule-selection.js";
      const root = ${JSON.stringify(input.runtimeRoot)};
      await acquireElectronSessionLease(root);
      await ElectronActivationAttempt.begin(root);
      await commitElectronCapsuleSelection(root, ${JSON.stringify({ ...armed.pending, revision: armed.revision })}, ${JSON.stringify(input.closureGenerationId)});
      process.send("capsule-committed");
      await new Promise(() => {});
    `, resolveDir: process.cwd() },
    alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) },
    bundle: true, packages: "external", platform: "node", format: "esm", write: false,
  });
  const child = spawn(process.execPath, ["--input-type=module", "-e", program.outputFiles[0]!.text], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  child.stderr!.on("data", chunk => { stderr += String(chunk); });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    child.once("message", message => message === "capsule-committed" ? resolve() : reject(new Error("unexpected commit checkpoint")));
    timeout = setTimeout(() => reject(new Error(`commit fixture timed out: ${stderr}`)), 5_000);
  });
  try {
    await Promise.race([ready, exited.then(() => { throw new Error(`commit fixture exited early: ${stderr}`); })]);
    clearTimeout(timeout);
    const selectionBytes = await readFile(join(input.runtimeRoot, "capsule-selection.json"), "utf8");
    const activationBytes = await readFile(join(input.runtimeRoot, "activation.json"), "utf8");
    child.kill("SIGKILL");
    await exited;
    expect(child.signalCode).toBe("SIGKILL");
    expect(await readFile(join(input.runtimeRoot, "capsule-selection.json"), "utf8")).toBe(selectionBytes);
    expect(await readFile(join(input.runtimeRoot, "activation.json"), "utf8")).toBe(activationBytes);
    expect(await readElectronCapsuleSelection(input.runtimeRoot)).toMatchObject({ revision: 2, current: armed.pending, pending: null });
    expect(await inspectElectronStartup(input.runtimeRoot)).toMatchObject({ required: true, activation: { state: "starting" } });
    await expect(ElectronActivationAttempt.begin(input.runtimeRoot)).rejects.toThrow("explicit exact recovery required");
    const target = { capsuleManifestSha256: sha256Hex(canonicalJson(input.capsule.envelope)), closureGenerationId: input.closureGenerationId };
    await recoverElectronStartup({ runtimeRoot: input.runtimeRoot, target, selectTarget: async () => target,
      repair: async () => { await armElectronCapsuleSelection({ ...input, expectedRevision: 2, recovery: true }); } });
    const recovered = await ElectronActivationAttempt.begin(input.runtimeRoot);
    await commitElectronCapsuleSelection(input.runtimeRoot, { ...input.capsule, revision: 3 }, input.closureGenerationId);
    await recovered.commit();
    expect(await inspectElectronStartup(input.runtimeRoot)).toMatchObject({ required: false, activation: { state: "running" } });
  } finally {
    clearTimeout(timeout);
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
    await exited;
  }
});

it("keeps failed startup blocked and permits only intent-bound recovery rearm", async () => {
  const input = await fixture();
  const activation = await ElectronActivationAttempt.begin(input.runtimeRoot);
  await expect(armElectronCapsuleSelection(input)).rejects.toThrow("incomplete startup");
  await activation.fail(new Error("startup interrupted"));
  await expect(armElectronCapsuleSelection({ ...input, recovery: true })).rejects.toThrow("exact recovery intent");
  const target = { capsuleManifestSha256: sha256Hex(canonicalJson(input.capsule.envelope)), closureGenerationId: input.closureGenerationId };
  await recoverElectronStartup({ runtimeRoot: input.runtimeRoot, target, selectTarget: async () => { throw new Error("must not rediscover"); },
    repair: async () => {
      await expect(armElectronCapsuleSelection({ ...input, recovery: true, closureGenerationId: "e".repeat(64) })).rejects.toThrow("exact recovery intent");
      await armElectronCapsuleSelection({ ...input, recovery: true });
    } });
  expect(await readElectronCapsuleSelection(input.runtimeRoot)).toMatchObject({ revision: 1, current: null, pending: { closureGenerationId: input.closureGenerationId } });
});

it("refuses untrusted or damaged candidates before arming", async () => {
  const input = await fixture();
  await expect(armElectronCapsuleSelection({ ...input, capsule: { ...input.capsule, trustedKeys: {} } })).rejects.toThrow("signature verification");
  await writeFile(join(input.capsule.root, "capsule.cjs"), "tampered");
  await expect(armElectronCapsuleSelection(input)).rejects.toThrow("digest mismatch");
  expect(await readElectronCapsuleSelection(input.runtimeRoot)).toMatchObject({ revision: 0, pending: null });
});

it("preserves malformed selection metadata instead of treating it as a first install", async () => {
  const input = await fixture(), path = join(input.runtimeRoot, "capsule-selection.json");
  await writeFile(path, "{");
  await expect(readElectronCapsuleSelection(input.runtimeRoot)).rejects.toThrow();
  await expect(armElectronCapsuleSelection(input)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("{");
  const empty = JSON.stringify({ schemaVersion: 1, revision: 3, current: null, pending: null });
  await writeFile(path, empty);
  await expect(readElectronCapsuleSelection(input.runtimeRoot)).rejects.toThrow("invalid Electron Capsule selection state");
  expect(await readFile(path, "utf8")).toBe(empty);
});
