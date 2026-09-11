import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** An owned temporary signing keychain; no search-list replacement. Only
 * the caller's callback receives its path and selected public certificate ID.
 * All subprocess errors are sanitized because security argv carries passwords. */
export async function withMacSigningIdentity<T>(input: Readonly<{
  certificate: Uint8Array; password: string; certificateSha256: string;
}>, action: (identity: Readonly<{ sha1: string; keychain: string }>) => Promise<T>): Promise<T> {
  if (process.platform !== "darwin" || input.certificate.length === 0 || !/^[a-f0-9]{64}$/u.test(input.certificateSha256)) {
    throw new Error("invalid macOS signing credentials");
  }
  const root = await mkdtemp(join(tmpdir(), "electron-signing-")), keychain = join(root, "signing.keychain-db");
  const password = randomBytes(24).toString("hex");
  let created = false;
  async function security(stage: string, args: string[]) {
    try { return await execute("/usr/bin/security", args, { timeout: 60_000, maxBuffer: 1024 * 1024 }); }
    catch { throw new Error(`macOS signing keychain ${stage} failed`); }
  }
  try {
    const p12 = join(root, "certificate.p12");
    await writeFile(p12, input.certificate, { mode: 0o600, flag: "wx" });
    await security("creation", ["create-keychain", "-p", password, keychain]); created = true;
    await security("unlock", ["unlock-keychain", "-p", password, keychain]);
    await security("settings", ["set-keychain-settings", "-lut", "21600", keychain]);
    await security("import", ["import", p12, "-k", keychain, "-P", input.password, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"]);
    await security("partition access", ["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychain]);
    const certificates = await security("public certificate inspection", ["find-certificate", "-a", "-p", keychain]);
    const pems = certificates.stdout.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu) ?? [];
    const selected = pems.map(pem => Buffer.from(pem.replace(/-----[^-]+-----|\s/gu, ""), "base64"))
      .filter(der => createHash("sha256").update(der).digest("hex") === input.certificateSha256);
    if (selected.length !== 1) throw new Error("macOS signing certificate differs from declared fingerprint");
    const sha1 = createHash("sha1").update(selected[0]!).digest("hex");
    const identities = await security("identity validation", ["find-identity", "-v", "-p", "codesigning", keychain]);
    if (!identities.stdout.toLowerCase().includes(sha1)) throw new Error("declared macOS signing identity is unavailable");
    return await action({ sha1, keychain });
  } finally {
    try { if (created) await security("cleanup", ["delete-keychain", keychain]); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
}
