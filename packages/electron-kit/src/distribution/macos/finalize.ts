import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertMacBaseObjectsUnchanged, type MacBaseSeal } from "./base-seal.js";

const execute = promisify(execFile);
export type MacNotaryAuthentication =
  | Readonly<{ kind: "apple-id"; appleId: string; password: string; teamId: string }>
  | Readonly<{ kind: "api-key"; keyPath: string; keyId: string; issuer: string }>
  | Readonly<{ kind: "keychain"; profile: string; keychain?: string }>;
type Run = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;
function authentication(input: MacNotaryAuthentication): string[] {
  const args = input.kind === "apple-id" ? ["--apple-id", input.appleId, "--password", input.password, "--team-id", input.teamId]
    : input.kind === "api-key" ? ["--key", input.keyPath, "--key-id", input.keyId, "--issuer", input.issuer]
    : ["--keychain-profile", input.profile, ...(input.keychain == null ? [] : ["--keychain", input.keychain])];
  if (args.some(value => typeof value !== "string" || value.trim() === "" || value.includes("\0"))) throw new Error("invalid macOS notarization authentication");
  return args;
}

/** Sign the outer app only. Nested code has its own verified, unchanged base
 * signatures. Notarization still submits the complete version-bound app. */
export async function finalizeMacBaseProjection(input: Readonly<{
  appPath: string; seal: MacBaseSeal; identity: string; keychain?: string;
  entitlements: string; notary: MacNotaryAuthentication; run?: Run;
}>): Promise<void> {
  if (!/^[a-fA-F0-9]{40}$/u.test(input.identity)) throw new Error("outer macOS signing requires an explicit certificate identity");
  const auth = authentication(input.notary);
  await assertMacBaseObjectsUnchanged(input.appPath, input.seal);
  const run: Run = input.run ?? ((command, args) => execute(command, [...args], { maxBuffer: 4 * 1024 * 1024 }));
  async function stage(name: string, command: string, args: string[]) {
    const start = performance.now();
    try {
      const result = await run(command, args);
      console.info(JSON.stringify({ event: "electron.distribution.stage", stage: name,
        durationMs: Math.round(performance.now() - start), status: "success" }));
      return result;
    } catch {
      // Child-process errors embed argv, which may include Apple credentials.
      console.info(JSON.stringify({ event: "electron.distribution.stage", stage: name,
        durationMs: Math.round(performance.now() - start), status: "failed" }));
      throw new Error(`macOS distribution ${name} failed`);
    }
  }
  await stage("outer-sign", "/usr/bin/codesign", ["--force", "--sign", input.identity, "--timestamp", "--options", "runtime",
    "--entitlements", input.entitlements, ...(input.keychain == null ? [] : ["--keychain", input.keychain]), input.appPath]);
  await assertMacBaseObjectsUnchanged(input.appPath, input.seal);
  await stage("signature-verify", "/usr/bin/codesign", ["--verify", "--deep", "--strict", input.appPath]);
  const scratch = await mkdtemp(join(tmpdir(), "electron-notary-"));
  try {
    const archive = join(scratch, "application.zip");
    await stage("notary-archive", "/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", input.appPath, archive]);
    const submitted = await stage("notary-submit", "/usr/bin/xcrun", ["notarytool", "submit", archive, ...auth, "--output-format", "json"]);
    let id: unknown;
    try { id = JSON.parse(submitted.stdout).id; } catch { throw new Error("macOS notarization returned invalid submission metadata"); }
    if (typeof id !== "string" || !/^[a-fA-F0-9-]{36}$/u.test(id)) throw new Error("macOS notarization omitted submission identity");
    console.info(JSON.stringify({ event: "electron.notarization.submitted", id }));
    const waited = await stage("notary-wait", "/usr/bin/xcrun", ["notarytool", "wait", id, ...auth, "--output-format", "json"]);
    let result: { id?: unknown; status?: unknown };
    try { result = JSON.parse(waited.stdout); } catch { throw new Error("macOS notarization returned invalid completion metadata"); }
    if (result.id !== id || result.status !== "Accepted") throw new Error(`macOS notarization was not accepted; submission ${id}`);
    await stage("staple", "/usr/bin/xcrun", ["stapler", "staple", input.appPath]);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
