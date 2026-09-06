import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  acceptedShellBaselineIdentity,
  createAcceptedShellBaselineReceipt,
  resolveAcceptedShellBaseline,
  type AcceptedShellBaselinePayload,
} from "../src/exact/accepted-baseline.js";

const CLOSURE_IDENTITY = `sha256:${"c".repeat(64)}` as const;
const baseline: AcceptedShellBaselinePayload = {
  artifact: { sha256: "a".repeat(64), size: 123 },
  channel: "betahyx",
  seed: {
    closure: { sha256: "b".repeat(64), size: 45 },
    standalone: { sha256: "d".repeat(64), size: 67 },
  },
  shell: { buildHash: "e".repeat(64), type: "electron", version: "0.1.0" },
  target: "darwin-arm64",
};
const ACCEPTED_IDENTITIES = [`sha256:${"1".repeat(64)}`, `sha256:${"2".repeat(64)}`] as const;
const SOURCE_COMMIT = "f".repeat(40);

function acceptance(value: AcceptedShellBaselinePayload = baseline) {
  return {
    schemaVersion: 1, operation: "exact.acceptance", status: "accepted", channel: value.channel,
    releaseVersion: "0.1.0-betahyx.4", sourceCommit: SOURCE_COMMIT, target: value.target,
    shell: value.shell,
    artifact: { url: "https://releases.example/electron.dmg", ...value.artifact },
    installed: {
      shell: value.shell, target: value.target, proof: { files: { seeds: [
        { file: "standalone-launcher.mjs", ...value.seed.standalone },
        { file: "closure.mjs", ...value.seed.closure },
      ] } },
    },
  };
}

function acceptedReceipt(value: AcceptedShellBaselinePayload = baseline) {
  const bytes = Buffer.from(`${JSON.stringify(createAcceptedShellBaselineReceipt(acceptance(value), ACCEPTED_IDENTITIES))}\n`);
  return { bytes, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const };
}

describe("accepted Shell baseline resolution", () => {
  it("promotes only a complete installed Electron acceptance into a baseline receipt", () => {
    const receipt = createAcceptedShellBaselineReceipt(acceptance(), ACCEPTED_IDENTITIES);
    expect(receipt.baseline).toEqual(baseline);
    expect(receipt.baselineIdentity).toBe(acceptedShellBaselineIdentity(baseline));
    expect(() => createAcceptedShellBaselineReceipt({
      schemaVersion: 1, operation: "exact.acceptance", status: "accepted", channel: "betahyx",
      releaseVersion: "0.1.0-betahyx.4", sourceCommit: SOURCE_COMMIT, target: "darwin-arm64",
      shell: baseline.shell, artifact: baseline.artifact,
      installed: { shell: baseline.shell, target: "darwin-arm64", proof: { files: { seeds: [] } } },
    }, ACCEPTED_IDENTITIES)).toThrow(/Closure seed/u);
  });

  it("bootstraps a cold channel from current Closure and forces full acceptance", () => {
    const resolved = resolveAcceptedShellBaseline({ channel: "betahyx", currentClosureIdentity: CLOSURE_IDENTITY, target: "win32-x64" });
    expect(resolved.mode).toBe("bootstrap");
    expect(resolved.requiredAcceptance).toBe("full");
    expect(resolved.acceptedIdentities).toEqual([]);
    expect(resolved.baseline).toEqual({ channel: "betahyx", seed: { closureIdentity: CLOSURE_IDENTITY }, target: "win32-x64" });
  });

  it("reuses an exactly bound accepted baseline for hot acceptance", () => {
    const receipt = acceptedReceipt();
    const resolved = resolveAcceptedShellBaseline({ acceptedReceipt: receipt, channel: "betahyx", currentClosureIdentity: CLOSURE_IDENTITY, target: "darwin-arm64" });
    expect(resolved.mode).toBe("accepted");
    expect(resolved.requiredAcceptance).toBe("hot");
    expect(resolved.baselineIdentity).toBe(acceptedShellBaselineIdentity(baseline));
    expect(resolved.acceptedReceiptSha256).toBe(receipt.sha256);
    expect(resolved.acceptedIdentities).toEqual([...ACCEPTED_IDENTITIES].sort());
  });

  it("fails closed on receipt, payload, or scope drift", () => {
    const receipt = acceptedReceipt();
    expect(() => resolveAcceptedShellBaseline({
      acceptedReceipt: { ...receipt, sha256: `sha256:${"0".repeat(64)}` },
      channel: "betahyx", currentClosureIdentity: CLOSURE_IDENTITY, target: "darwin-arm64",
    })).toThrow(/receipt digest mismatch/u);

    const changed = Buffer.from(receipt.bytes);
    const document = JSON.parse(changed.toString("utf8")) as { baselineIdentity: string };
    document.baselineIdentity = `sha256:${"f".repeat(64)}`;
    const changedBytes = Buffer.from(`${JSON.stringify(document)}\n`);
    expect(() => resolveAcceptedShellBaseline({
      acceptedReceipt: { bytes: changedBytes, sha256: `sha256:${createHash("sha256").update(changedBytes).digest("hex")}` },
      channel: "betahyx", currentClosureIdentity: CLOSURE_IDENTITY, target: "darwin-arm64",
    })).toThrow(/payload digest mismatch/u);

    expect(() => resolveAcceptedShellBaseline({
      acceptedReceipt: receipt, channel: "somechan", currentClosureIdentity: CLOSURE_IDENTITY, target: "darwin-arm64",
    })).toThrow(/scope mismatch/u);
  });
});
