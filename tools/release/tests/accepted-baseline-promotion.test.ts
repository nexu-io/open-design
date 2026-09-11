import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cac } from "cac";
import { registerExactCommands } from "@/exact/commands.ts";

import { baselineCandidateMode, executeExactReleaseControl, inspectAcceptedElectronBaseline } from "@/exact/control-release.js";
import { createAcceptedShellBaselineReceipt } from "@/exact/accepted-baseline.ts";
import { writeReleasePolicy } from "@/policy/release-profile.js";

const roots: string[] = [];
const sourceCommit = "a".repeat(40);
const releaseVersion = "1.2.3-betahyx.4";
const storageBase = "https://storage.invalid/release";
const publicBase = "https://releases.invalid";

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "accepted-baseline-promotion-"));
  roots.push(root);
  const policyRequest = join(root, "policy-request.json"), policyReceipt = join(root, "policy.json");
  const target = {
    endpointUrl: "https://storage.invalid", bucket: "release", publicBaseUrl: publicBase,
    latestChannelHeadUrl: `${storageBase}/betahyx/latest/channel-head.json`,
  };
  await writeFile(policyRequest, JSON.stringify({
    schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation", channel: "betahyx",
    releaseVersion, sourceCommit, sourceRef: "refs/heads/main",
    switches: { endUserDistribution: false, stableAuthorized: false }, target,
  }));
  await writeReleasePolicy(policyRequest, policyReceipt);

  const channelHeadBody = Buffer.from('{"head":{"lanes":{"electron":{"releaseVersion":"1.2.3-betahyx.4"}}}}\n');
  const channelHeadFile = join(root, "channel-head.json");
  await writeFile(channelHeadFile, channelHeadBody);
  const shell = { buildHash: "7".repeat(64), type: "electron", version: "1.2.3" };
  const artifactBody = Buffer.from("accepted signed Electron artifact\n");
  const required = {
    artifact: { mediaType: "application/x-apple-diskimage", sha256: createHash("sha256").update(artifactBody).digest("hex"), size: artifactBody.byteLength, url: `${publicBase}/betahyx/${releaseVersion}/electron.dmg` },
    installIdentity: { executableName: "open-design-betahyx", namespace: "betahyx" },
    platformTrust: { designatedRequirement: 'identifier "io.open-design.betahyx"', mode: "formal", platform: "macos", teamIdentifier: "ABC1234XYZ" },
    shell,
    shellMetadata: { sha256: "d".repeat(64), size: 50, url: `${publicBase}/betahyx/${releaseVersion}/electron-metadata.json` },
    target: "darwin-arm64",
    updater: { channel: "betahyx", mechanism: "standalone" },
  };
  const publishReceipt = join(root, "publish.json"), activationReceipt = join(root, "activation.json"), acceptanceCredential = join(root, "acceptance.json");
  await writeFile(publishReceipt, JSON.stringify({
    schemaVersion: 1, operation: "exact.publish", profile: "exact-validation", channel: "betahyx", releaseVersion, sourceCommit,
    target, latestChannelHeadUrl: target.latestChannelHeadUrl,
    channelHead: { file: channelHeadFile, sha256: createHash("sha256").update(channelHeadBody).digest("hex"), size: channelHeadBody.byteLength },
    requiredAcceptances: [required],
  }));
  await writeFile(activationReceipt, JSON.stringify({
    schemaVersion: 1, operation: "exact.activate", profile: "exact-validation", channel: "betahyx", releaseVersion, sourceCommit,
    latestChannelHeadUrl: target.latestChannelHeadUrl,
  }));
  await writeFile(acceptanceCredential, JSON.stringify({
    schemaVersion: 1, operation: "exact.acceptance", status: "accepted", channel: "betahyx", releaseVersion, sourceCommit,
    ...required,
    installed: { shell, target: "darwin-arm64", proof: { files: {
      content: { file: "standalone-content.json", sha256: "e".repeat(64), size: 40 },
      capsule: { manifest: { file: "capsule-manifest.json", sha256: "f".repeat(64), size: 60 },
        archive: { file: "capsule.zip", sha256: "9".repeat(64), size: 100 } },
    } } },
  }));
  return { acceptanceCredential, activationReceipt, artifactBody, channelHeadBody, policyReceipt, publishReceipt, root };
}

describe("accepted Electron baseline promotion", () => {
  it("activates reused behavioral evidence without promoting an untested installed baseline", async () => {
    const input = await fixture();
    const original = JSON.parse(await readFile(input.acceptanceCredential, "utf8"));
    const { installed: _installed, ...binding } = original;
    await writeFile(input.acceptanceCredential, JSON.stringify({ ...binding, operation: "exact.acceptance.reuse",
      origin: { ...original, releaseVersion: "1.2.3-betahyx.3" },
      evidence: { url: "https://cache.invalid/witness.zip", sha256: "c".repeat(64) } }));
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (request, init) => {
      expect(String(request)).toBe(`${storageBase}/betahyx/latest/channel-head.json`);
      expect(init?.method ?? "GET").toBe("GET");
      return new Response(new Uint8Array(input.channelHeadBody), { headers: { etag: '"head"' } });
    });
    await executeExactReleaseControl({ schemaVersion: 1, operation: "exact.activate", publishReceipt: input.publishReceipt,
      policyReceipt: input.policyReceipt, acceptanceCredentials: [input.acceptanceCredential] }, input.activationReceipt);
    const receipt = join(input.root, "preserved.json");
    await executeExactReleaseControl({ schemaVersion: 1, operation: "exact.baseline.promote", publishReceipt: input.publishReceipt,
      activationReceipt: input.activationReceipt, policyReceipt: input.policyReceipt, acceptanceCredential: input.acceptanceCredential }, receipt);
    expect(JSON.parse(await readFile(receipt, "utf8"))).toMatchObject({ operation: "exact.baseline.preserved",
      releaseVersion, validatedReleaseVersion: "1.2.3-betahyx.3" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("restricts candidate mode to the explicitly selected betahyx experiment", () => {
    expect(baselineCandidateMode(undefined, { channel: "stable", profile: "stable" } as never)).toBe(false);
    expect(baselineCandidateMode("candidate", { channel: "betahyx", profile: "exact-validation" })).toBe(true);
    for (const channel of ["stable", "prerelease", "another"]) {
      expect(() => baselineCandidateMode("candidate", { channel, profile: "exact-validation" } as never)).toThrow("restricted");
    }
    expect(() => baselineCandidateMode("unknown", { channel: "betahyx", profile: "exact-validation" })).toThrow("restricted");
  });
  it.each(["missing", "matching", "different", "tampered"])("inspects %s baseline using actual carrier metadata, without a source planner", async kind => {
    const input = await fixture();
    const acceptance = JSON.parse(await readFile(input.acceptanceCredential, "utf8"));
    acceptance.releaseVersion = "1.2.3-betahyx.3";
    if (kind === "different") acceptance.shell = acceptance.installed.shell = { ...acceptance.shell, buildHash: "8".repeat(64) };
    const snapshot = createAcceptedShellBaselineReceipt(acceptance), body = Buffer.from(JSON.stringify(snapshot));
    const snapshotUrl = `${publicBase}/betahyx/accepted/electron/darwin-arm64/snapshot.json`;
    const pointer = { schemaVersion: 1, operation: "electron.shell-baseline.latest", channel: "betahyx", target: "darwin-arm64",
      releaseVersion: acceptance.releaseVersion, sourceCommit, receipt: { url: snapshotUrl, size: body.length,
        sha256: `sha256:${kind === "tampered" ? "0".repeat(64) : createHash("sha256").update(body).digest("hex")}` } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async request => {
      const url = String(request), response = new Response(kind === "missing" ? null : url === snapshotUrl ? new Uint8Array(body) : JSON.stringify(pointer), { status: kind === "missing" ? 404 : 200 });
      Object.defineProperty(response, "url", { value: url }); return response;
    });
    const args = { publication: input.publishReceipt, policy: input.policyReceipt, target: "darwin-arm64",
      receipt: join(input.root, "inspect/result.json"), githubEnv: join(input.root, "environment") };
    if (kind === "tampered") {
      await expect(inspectAcceptedElectronBaseline(args)).rejects.toThrow("binding mismatch");
      await expect(readFile(args.githubEnv)).rejects.toThrow("ENOENT"); return;
    }
    const result = await inspectAcceptedElectronBaseline(args);
    expect(result.compatible).toBe(kind === "matching");
    expect(result.upgradeRequired).toBe(kind !== "missing");
    expect(result.reason).toBe(kind === "matching" ? "same-carrier" : kind === "missing" ? "baseline-missing" : "carrier-identity-changed");
    if (kind === "different") expect(JSON.parse(await readFile(result.baselineReceipt!, "utf8"))).toEqual(snapshot);
    expect(await readFile(args.githubEnv, "utf8")).toBe(`ELECTRON_ACCEPTANCE_MODE=${kind === "matching" ? "hot" : "full"}\n`);
    expect(result).not.toHaveProperty("acceptedIdentities");
    if (kind === "matching") {
      expect(JSON.parse(await readFile(result.baselineReceipt!, "utf8"))).toEqual(snapshot);
      const candidate = await inspectAcceptedElectronBaseline({ ...args, githubEnv: undefined,
        receipt: join(input.root, "candidate-inspection.json"), mode: "candidate" });
      expect(candidate).toMatchObject({ compatible: false, upgradeRequired: false, reason: "candidate-baseline", baselineCandidate: true });
      expect(candidate).not.toHaveProperty("baselineReceipt");
    }
  });

  it.each(["accepted", "candidate"])("publishes a %s snapshot with CAS and never activates a candidate", async mode => {
    const input = await fixture();
    if (mode === "candidate") {
      const credential = JSON.parse(await readFile(input.acceptanceCredential, "utf8"));
      credential.baselineCandidate = true;
      await writeFile(input.acceptanceCredential, JSON.stringify(credential));
    }
    const objects = new Map<string, { body: Buffer; etag: string }>([[
      `${storageBase}/betahyx/latest/channel-head.json`, { body: input.channelHeadBody, etag: '"head"' },
    ]]);
    let generation = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (request, init) => {
      const url = String(request), method = init?.method ?? "GET", current = objects.get(url);
      if (url === `${publicBase}/betahyx/${releaseVersion}/electron.dmg`) {
        const response = new Response(new Uint8Array(input.artifactBody), { status: 200 });
        Object.defineProperty(response, "url", { value: url });
        return response;
      }
      if (method === "GET") return new Response(current == null ? null : new Uint8Array(current.body), { status: current == null ? 404 : 200, headers: current == null ? {} : { etag: current.etag } });
      const headers = new Headers(init?.headers);
      if ((headers.get("If-None-Match") === "*" && current != null) || (headers.has("If-Match") && headers.get("If-Match") !== current?.etag)) {
        return new Response(null, { status: 412 });
      }
      const body = Buffer.from(init?.body as Uint8Array), etag = `"${++generation}"`;
      objects.set(url, { body, etag });
      return new Response(null, { status: 201, headers: { etag } });
    });
    const request = {
      schemaVersion: 1, operation: "exact.baseline.promote", publishReceipt: input.publishReceipt,
      mode,
      activationReceipt: input.activationReceipt, policyReceipt: input.policyReceipt, acceptanceCredential: input.acceptanceCredential,
    };
    const receiptPath = join(input.root, "promotion.json");
    if (mode === "candidate") {
      await executeExactReleaseControl({ schemaVersion: 1, operation: "exact.activate", publishReceipt: input.publishReceipt,
        policyReceipt: input.policyReceipt, acceptanceCredentials: [input.acceptanceCredential] }, input.activationReceipt);
      expect(JSON.parse(await readFile(input.activationReceipt, "utf8"))).toMatchObject({ operation: "exact.activation.deferred" });
      expect(generation).toBe(0);
      await expect(executeExactReleaseControl({ ...request, mode: "accepted" }, receiptPath)).rejects.toThrow("promotion authority");
    }
    const originalPublication = await readFile(input.publishReceipt);
    const relocatedHead = join(input.root, "relocated-head.json");
    await writeFile(relocatedHead, "tampered");
    if (mode === "accepted") await expect(executeExactReleaseControl({ ...request, channelHeadFile: relocatedHead }, receiptPath)).rejects.toThrow("binding verification failed");
    await writeFile(relocatedHead, input.channelHeadBody);
    const cli = cac("tools-release"); registerExactCommands(cli);
    cli.parse(["node", "tools-release", "baseline", "promote", "--mode", mode, "--publish-receipt", input.publishReceipt,
      "--activation-receipt", input.activationReceipt, "--policy", input.policyReceipt, "--acceptance", input.acceptanceCredential,
      "--channel-head", relocatedHead, "--receipt", receiptPath], { run: false });
    await cli.runMatchedCommand();
    expect(await readFile(input.publishReceipt)).toEqual(originalPublication);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    expect(receipt).toMatchObject({ operation: mode === "candidate" ? "exact.baseline.candidate" : "exact.baseline.promote", target: "darwin-arm64", snapshot: { replayed: false }, pointer: { replayed: false } });
    expect(receipt).not.toHaveProperty("acceptedIdentities");
    const pointerStorageUrl = `${storageBase}/betahyx/accepted/electron/darwin-arm64/latest.json`;
    const pointer = JSON.parse(objects.get(pointerStorageUrl)!.body.toString("utf8"));
    expect(pointer).toMatchObject({ releaseVersion, sourceCommit, receipt: { url: expect.stringContaining(`${publicBase}/betahyx/accepted/electron/darwin-arm64/`) } });
    const snapshotStorageUrl = pointer.receipt.url.replace(publicBase, storageBase);
    const snapshot = JSON.parse(objects.get(snapshotStorageUrl)!.body.toString("utf8"));
    expect(snapshot.acceptance).toMatchObject({ operation: "exact.acceptance", installed: { target: "darwin-arm64" } });

    const replayPath = join(input.root, "promotion-replay.json");
    await executeExactReleaseControl(request, replayPath);
    expect(JSON.parse(await readFile(replayPath, "utf8"))).toMatchObject({ snapshot: { replayed: true }, pointer: { replayed: true } });

    const snapshotFile = join(input.root, "baseline.json");
    const oldSnapshot = structuredClone(snapshot);
    oldSnapshot.releaseVersion = "1.2.3-betahyx.3";
    oldSnapshot.acceptance.releaseVersion = oldSnapshot.releaseVersion;
    await writeFile(snapshotFile, JSON.stringify(oldSnapshot));
    const stagedDirectory = join(input.root, "staged"), stagedReceipt = join(stagedDirectory, "shell-contribution.json");
    const stageRequest = {
      schemaVersion: 1, operation: "exact.baseline.fetch", policyReceipt: input.policyReceipt, baselineReceipt: snapshotFile,
      publishReceipt: input.publishReceipt, channel: "betahyx", releaseVersion, sourceCommit, target: "darwin-arm64", outputDirectory: stagedDirectory,
    };
    await expect(executeExactReleaseControl(stageRequest, stagedReceipt)).rejects.toThrow("requires current Shell test validation");
    const validationReceipt = join(input.root, "shell-test-result.json");
    const validation = { schemaVersion: 1, operation: "exact.validation", status: "passed", node: "electron.shell.test",
      sourceCommit, target: "darwin-arm64", executionPlatform: "darwin-arm64" };
    for (const invalid of [{ status: "failed" }, { sourceCommit: "f".repeat(40) }, { node: "closure.test" }, { executionPlatform: "linux-x64" }]) {
      await writeFile(validationReceipt, JSON.stringify({ ...validation, ...invalid }));
      await expect(executeExactReleaseControl({ ...stageRequest, validationReceipt }, stagedReceipt)).rejects.toThrow("validation binding mismatch");
    }
    await writeFile(validationReceipt, JSON.stringify(validation));
    await executeExactReleaseControl({ ...stageRequest, validationReceipt }, stagedReceipt);
    const staged = JSON.parse(await readFile(stagedReceipt, "utf8"));
    expect(staged).toMatchObject({ operation: "electron.baseline.fetch", artifact: { sha256: snapshot.acceptance.artifact.sha256 } });
    expect(await readFile(staged.artifact.file)).toEqual(input.artifactBody);

    objects.set(pointerStorageUrl, {
      body: Buffer.from(JSON.stringify({ ...pointer, releaseVersion: "1.2.3-betahyx.5" })), etag: '"newer"',
    });
    await expect(executeExactReleaseControl(request, join(input.root, "regression.json"))).rejects.toThrow("would not advance");
  });
});
