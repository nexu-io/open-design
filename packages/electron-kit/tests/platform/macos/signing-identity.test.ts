import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, it, vi } from "vitest";
import { withMacSigningIdentity } from "@/platform/macos/signing-identity.js";

it.skipIf(process.platform !== "darwin").each([false, true])("registers the owned keychain and preserves unrelated entries after signing (failure=%s)", async failure => {
  const certificate = Buffer.from("public fixture certificate"), sha1 = createHash("sha1").update(certificate).digest("hex");
  const certificateSha256 = createHash("sha256").update(certificate).digest("hex");
  let current = ["/fixture/login.keychain-db"], owned = "";
  const run = vi.fn(async (_command: string, args: string[]) => {
    let stdout = "";
    if (args[0] === "create-keychain") owned = args.at(-1)!;
    if (args[0] === "list-keychains") {
      if (args.includes("-s")) current = args.slice(args.indexOf("-s") + 1);
      else stdout = current.map(path => `    "${path}"`).join("\n");
    }
    if (args[0] === "find-certificate") stdout = `-----BEGIN CERTIFICATE-----\n${certificate.toString("base64")}\n-----END CERTIFICATE-----`;
    if (args[0] === "find-identity") stdout = `1) ${sha1.toUpperCase()} "fixture"`;
    return { stdout, stderr: "" };
  });
  const operation = withMacSigningIdentity({ certificate, certificateSha256, password: "private-fixture", run }, async identity => {
    expect(identity).toEqual({ sha1, keychain: owned });
    expect(current).toEqual([owned, "/fixture/login.keychain-db"]);
    current.push("/fixture/concurrent.keychain-db");
    if (failure) throw new Error("signing failed");
    return "signed";
  });
  if (failure) await expect(operation).rejects.toThrow("signing failed");
  else await expect(operation).resolves.toBe("signed");
  expect(current).toEqual(["/fixture/login.keychain-db", "/fixture/concurrent.keychain-db"]);
  expect(run.mock.calls.at(-1)![1]).toEqual(["delete-keychain", owned]);
  await expect(access(dirname(owned))).rejects.toThrow("ENOENT");
});
