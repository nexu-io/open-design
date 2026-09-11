import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { assertMacBaseObjectsUnchanged, captureMacBaseSeal, verifyMacBaseSeal } from "@/distribution/macos/base-seal.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "base-seal-")); roots.push(root);
  const appPath = join(root, "Example.app"), framework = join(appPath, "Contents/Frameworks/Example.framework");
  await mkdir(join(framework, "Versions/A/Resources"), { recursive: true });
  await writeFile(join(framework, "Versions/A/Example"), "signed native code", { mode: 0o755 });
  await writeFile(join(framework, "Versions/A/Resources/data"), "sealed resource");
  await symlink("A", join(framework, "Versions/Current"));
  await symlink("Versions/Current/Example", join(framework, "Example"));
  const certificate = Buffer.from("public certificate fixture");
  const signer = { teamIdentifier: "ABC1234XYZ", certificateSha256: createHash("sha256").update(certificate).digest("hex") };
  const run = vi.fn(async (_command: string, args: readonly string[]) => {
    const extraction = args.find(arg => arg.startsWith("--extract-certificates="));
    if (extraction) await writeFile(`${extraction.slice("--extract-certificates=".length)}0`, certificate);
    return { stdout: "", stderr: `TeamIdentifier=${signer.teamIdentifier}\n` };
  });
  return { appPath, framework, signer, run };
}

it("reuses the nested seal across outer version and Capsule changes without invoking signing", async () => {
  const input = await fixture(), seal = await captureMacBaseSeal(input);
  await mkdir(join(input.appPath, "Contents/Resources"));
  await writeFile(join(input.appPath, "Contents/Info.plist"), "new release version");
  await writeFile(join(input.appPath, "Contents/Resources/capsule.zip"), "new bound capsule");
  await expect(verifyMacBaseSeal({ ...input, seal })).resolves.toBeUndefined();
  expect(input.run.mock.calls.every(([, args]) => !args.includes("--sign"))).toBe(true);
  expect(seal.objects).toHaveLength(1);
});

it.each(["code", "resource", "mode", "helper", "link"])("refuses changed %s without implicit re-signing", async kind => {
  const input = await fixture(), seal = await captureMacBaseSeal(input);
  if (kind === "code") await writeFile(join(input.framework, "Versions/A/Example"), "modified code");
  if (kind === "resource") await writeFile(join(input.framework, "Versions/A/Resources/data"), "modified resource");
  if (kind === "mode") await chmod(join(input.framework, "Versions/A/Example"), 0o644);
  if (kind === "helper") {
    await mkdir(join(input.appPath, "Contents/Frameworks/New Helper.app"));
    await writeFile(join(input.appPath, "Contents/Frameworks/New Helper.app/Info.plist"), "unexpected helper");
  }
  if (kind === "link") await symlink("../../../../outside", join(input.framework, "escape"));
  await expect(verifyMacBaseSeal({ ...input, seal })).rejects.toThrow(/changed|escapes/u);
  expect(input.run.mock.calls.every(([, args]) => !args.includes("--sign"))).toBe(true);
});

it("refuses a different certificate even for the same team", async () => {
  const input = await fixture();
  await expect(captureMacBaseSeal({ ...input, signer: { ...input.signer, certificateSha256: "a".repeat(64) } })).rejects.toThrow("certificate mismatch");
});

it("does not admit an invalid signature as a reusable seal", async () => {
  const input = await fixture();
  await expect(captureMacBaseSeal({ ...input, run: async () => { throw new Error("signature invalid"); } })).rejects.toThrow("signature invalid");
});

it.skipIf(process.platform !== "darwin" || !process.env.ELECTRON_TEST_SIGNED_APP)("reads real native signatures and public certificate fingerprints without modifying the application", async () => {
  const appPath = process.env.ELECTRON_TEST_SIGNED_APP!;
  const seal = await captureMacBaseSeal({ appPath, signer: {
    teamIdentifier: process.env.ELECTRON_TEST_SIGNER_TEAM!, certificateSha256: process.env.ELECTRON_TEST_SIGNER_SHA256!,
  } });
  expect(seal.objects.length).toBeGreaterThan(0);
  await expect(assertMacBaseObjectsUnchanged(appPath, seal)).resolves.toBeUndefined();
});
