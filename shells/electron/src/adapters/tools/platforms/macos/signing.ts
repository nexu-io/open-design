import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { MacBaseSigner, MacNotaryAuthentication } from "@open-design/electron-kit/distribution";

export async function electronMacSigningPolicy() {
  const value = JSON.parse(await readFile(new URL("../../../../../config/platforms/macos/signing.json", import.meta.url), "utf8"));
  if (value.schemaVersion !== 1 || !/^[A-Z0-9]{10}$/u.test(value.teamIdentifier)
    || !/^[a-f0-9]{64}$/u.test(value.certificateSha256)) throw new Error("invalid Electron macOS signing declaration");
  const signer: MacBaseSigner = { teamIdentifier: value.teamIdentifier, certificateSha256: value.certificateSha256 };
  return { signer, entitlements: fileURLToPath(new URL("../../../../../config/platforms/macos/entitlements.plist", import.meta.url)) };
}

/** The existing native tool environment is an explicit injection boundary;
 * credentials never enter scenes, base manifests, receipts or plan identities. */
export async function electronMacDistributionSigning(env: NodeJS.ProcessEnv = process.env) {
  const policy = await electronMacSigningPolicy();
  const encoded = env.CSC_LINK?.trim();
  if (!encoded || !/^[A-Za-z0-9+/=\r\n]+$/u.test(encoded)) throw new Error("Electron macOS signing requires an injected base64 PKCS12 certificate");
  const certificate = Buffer.from(encoded, "base64");
  if (certificate.length === 0) throw new Error("Electron macOS signing certificate is empty");
  let notary: MacNotaryAuthentication;
  if (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) {
    if (env.APPLE_TEAM_ID !== policy.signer.teamIdentifier) throw new Error("Electron macOS notarization team differs from signing declaration");
    notary = { kind: "apple-id", appleId: env.APPLE_ID, password: env.APPLE_APP_SPECIFIC_PASSWORD, teamId: env.APPLE_TEAM_ID };
  } else if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) {
    notary = { kind: "api-key", keyPath: env.APPLE_API_KEY, keyId: env.APPLE_API_KEY_ID, issuer: env.APPLE_API_ISSUER };
  } else if (env.APPLE_KEYCHAIN_PROFILE) {
    notary = { kind: "keychain", profile: env.APPLE_KEYCHAIN_PROFILE };
  } else throw new Error("Electron macOS distribution requires notarization credentials");
  return { ...policy, certificate, password: env.CSC_KEY_PASSWORD ?? "", notary };
}
