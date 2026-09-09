import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  acceptedShellBaselineIdentity,
  createAcceptedShellBaselineReceipt,
  resolveAcceptedShellBaseline,
  type AcceptedShellBaselinePayload,
} from "@/exact/accepted-baseline.js";

const baseline: AcceptedShellBaselinePayload = {
  artifact: { sha256: "a".repeat(64), size: 123 },
  channel: "betahyx",
  installation: {
    content: { sha256: "b".repeat(64), size: 45 },
    capsule: { manifest: { sha256: "d".repeat(64), size: 67 }, archive: { sha256: "9".repeat(64), size: 100 } },
  },
  shell: { buildHash: "e".repeat(64), type: "electron", version: "0.1.0" },
  target: "darwin-arm64",
};
const SOURCE_COMMIT = "f".repeat(40);

function acceptance(value: AcceptedShellBaselinePayload = baseline) {
  return {
    schemaVersion: 1, operation: "exact.acceptance", status: "accepted", channel: value.channel,
    releaseVersion: "0.1.0-betahyx.4", sourceCommit: SOURCE_COMMIT, target: value.target,
    shell: value.shell,
    artifact: { url: "https://releases.example/electron.dmg", ...value.artifact },
    installed: {
      shell: value.shell, target: value.target, proof: { files: {
        content: { file: "standalone-content.json", ...value.installation.content },
        capsule: { manifest: { file: "capsule-manifest.json", ...value.installation.capsule.manifest },
          archive: { file: "capsule.zip", ...value.installation.capsule.archive } },
      } },
    },
  };
}

function acceptedReceipt(value: AcceptedShellBaselinePayload = baseline) {
  const bytes = Buffer.from(`${JSON.stringify(createAcceptedShellBaselineReceipt(acceptance(value)))}\n`);
  return { bytes, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const };
}

describe("accepted Shell baseline resolution", () => {
  it("rejects retired receipts and missing or substituted Capsule proof", () => {
    const old = { ...createAcceptedShellBaselineReceipt(acceptance()), schemaVersion: 1 };
    const bytes = Buffer.from(JSON.stringify(old));
    expect(() => resolveAcceptedShellBaseline({ channel: "betahyx", target: "darwin-arm64",
      acceptedReceipt: { bytes, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
    })).toThrow("receipt identity is invalid");
    const invalid = acceptance();
    invalid.installed.proof.files.capsule.archive.file = "closure.mjs";
    expect(() => createAcceptedShellBaselineReceipt(invalid)).toThrow("capsule.zip binding");
    const original = acceptance();
    const missing = { ...original, installed: { ...original.installed, proof: { files: { content: original.installed.proof.files.content } } } };
    expect(() => createAcceptedShellBaselineReceipt(missing)).toThrow("Capsule is invalid");
  });
  it("promotes only a complete installed Electron acceptance into a baseline receipt", () => {
    const receipt = createAcceptedShellBaselineReceipt(acceptance());
    expect(receipt.baseline).toEqual(baseline);
    expect(receipt.baselineIdentity).toBe(acceptedShellBaselineIdentity(baseline));
    expect(() => createAcceptedShellBaselineReceipt({
      schemaVersion: 1, operation: "exact.acceptance", status: "accepted", channel: "betahyx",
      releaseVersion: "0.1.0-betahyx.4", sourceCommit: SOURCE_COMMIT, target: "darwin-arm64",
      shell: baseline.shell, artifact: baseline.artifact,
      installed: { shell: baseline.shell, target: "darwin-arm64", proof: { files: { seeds: [] } } },
    })).toThrow(/retired seeds/u);
  });

  it("reports a missing baseline without inventing a Closure or workload identity", () => {
    const resolved = resolveAcceptedShellBaseline({ channel: "betahyx", target: "win32-x64" });
    expect(resolved.mode).toBe("bootstrap");
    expect(resolved).not.toHaveProperty("acceptedIdentities");
    expect(resolved).toEqual({ mode: "bootstrap", channel: "betahyx", target: "win32-x64", schemaVersion: 3 });
  });

  it("reuses an exactly bound accepted baseline for hot acceptance", () => {
    const receipt = acceptedReceipt();
    const resolved = resolveAcceptedShellBaseline({ acceptedReceipt: receipt, channel: "betahyx", target: "darwin-arm64" });
    expect(resolved.mode).toBe("accepted");
    if (resolved.mode !== "accepted") throw new Error("expected accepted baseline");
    expect(resolved.baselineIdentity).toBe(acceptedShellBaselineIdentity(baseline));
    expect(resolved.acceptedReceiptSha256).toBe(receipt.sha256);
    expect(resolved).not.toHaveProperty("acceptedIdentities");
  });

  it("fails closed on receipt, payload, or scope drift", () => {
    const receipt = acceptedReceipt();
    expect(() => resolveAcceptedShellBaseline({
      acceptedReceipt: { ...receipt, sha256: `sha256:${"0".repeat(64)}` },
      channel: "betahyx", target: "darwin-arm64",
    })).toThrow(/receipt digest mismatch/u);

    const changed = Buffer.from(receipt.bytes);
    const document = JSON.parse(changed.toString("utf8")) as { baselineIdentity: string };
    document.baselineIdentity = `sha256:${"f".repeat(64)}`;
    const changedBytes = Buffer.from(`${JSON.stringify(document)}\n`);
    expect(() => resolveAcceptedShellBaseline({
      acceptedReceipt: { bytes: changedBytes, sha256: `sha256:${createHash("sha256").update(changedBytes).digest("hex")}` },
      channel: "betahyx", target: "darwin-arm64",
    })).toThrow(/payload digest mismatch/u);

    expect(() => resolveAcceptedShellBaseline({
      acceptedReceipt: receipt, channel: "somechan", target: "darwin-arm64",
    })).toThrow(/scope mismatch/u);
  });
});
