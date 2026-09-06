import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { executeExactReleaseControl } from "../src/exact/control-release.js";
import { createExactPlanFromRegistryFile } from "../src/exact/plan.js";
import { createExactReleasePlanFromRegistryFile } from "../src/exact/release-plan.js";
import { writeReleasePolicy } from "../src/policy/release-profile.js";

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
  const repository = join(root, "repository");
  const ids = [
    "electron.contract.build", "electron.contract.test", "electron.shell.build", "electron.shell.test", "closure.build", "closure.test",
    "electron.distribution", "electron.acceptance.full", "closure.acceptance.hot",
  ];
  for (const id of ids) {
    await mkdir(join(repository, id), { recursive: true });
    await writeFile(join(repository, id, "input.txt"), `${id}\n`);
  }
  const registry = join(root, "registry.json");
  await writeFile(registry, JSON.stringify({
    schemaVersion: 1,
    identities: Object.fromEntries(ids.map((id) => [id, {
      parameters: id === "closure.acceptance.hot" ? ["target", "acceptedShellBaseline"] : ["target"],
      schemaVersion: 1,
      sourceSets: [id],
    }])),
    sourceSets: Object.fromEntries(ids.map((id) => [id, { paths: [id] }])),
  }));

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
  const identityPlan = await createExactPlanFromRegistryFile({
    acceptedShellBaseline: `sha256:${"0".repeat(64)}`, registryPath: registry, root: repository, target: "darwin-arm64",
  });
  const shell = { buildHash: identityPlan.nodes["electron.shell.build"].identity.slice("sha256:".length), type: "electron", version: "1.2.3" };
  const artifactBody = Buffer.from("accepted signed Electron artifact\n");
  const required = {
    artifact: { mediaType: "application/x-apple-diskimage", sha256: createHash("sha256").update(artifactBody).digest("hex"), size: artifactBody.byteLength, url: `${publicBase}/betahyx/${releaseVersion}/electron.dmg` },
    installIdentity: { executableName: "open-design-betahyx", namespace: "betahyx" },
    platformTrust: { designatedRequirement: 'identifier "io.open-design.betahyx"', mode: "verify-only", platform: "macos", teamIdentifier: "adhoc" },
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
    installed: { shell, target: "darwin-arm64", proof: { files: { seeds: [
      { file: "standalone-launcher.mjs", sha256: "e".repeat(64), size: 40 },
      { file: "closure.mjs", sha256: "f".repeat(64), size: 60 },
    ] } } },
  }));
  return { acceptanceCredential, activationReceipt, artifactBody, channelHeadBody, policyReceipt, publishReceipt, registry, repository, root };
}

describe("accepted Electron baseline promotion", () => {
  it("publishes an immutable self-contained snapshot and advances its target pointer with CAS", async () => {
    const input = await fixture();
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
      activationReceipt: input.activationReceipt, policyReceipt: input.policyReceipt, acceptanceCredential: input.acceptanceCredential,
      registry: input.registry, root: input.repository,
    };
    const receiptPath = join(input.root, "promotion.json");
    await executeExactReleaseControl(request, receiptPath);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    expect(receipt).toMatchObject({ operation: "exact.baseline.promote", target: "darwin-arm64", snapshot: { replayed: false }, pointer: { replayed: false } });
    expect(receipt.acceptedIdentities).toHaveLength(8);
    const pointerStorageUrl = `${storageBase}/betahyx/accepted/electron/darwin-arm64/latest.json`;
    const pointer = JSON.parse(objects.get(pointerStorageUrl)!.body.toString("utf8"));
    expect(pointer).toMatchObject({ releaseVersion, sourceCommit, receipt: { url: expect.stringContaining(`${publicBase}/betahyx/accepted/electron/darwin-arm64/`) } });
    const snapshotStorageUrl = pointer.receipt.url.replace(publicBase, storageBase);
    const snapshot = JSON.parse(objects.get(snapshotStorageUrl)!.body.toString("utf8"));
    expect(snapshot.acceptance).toMatchObject({ operation: "exact.acceptance", installed: { target: "darwin-arm64" } });

    const replayPath = join(input.root, "promotion-replay.json");
    await executeExactReleaseControl(request, replayPath);
    expect(JSON.parse(await readFile(replayPath, "utf8"))).toMatchObject({ snapshot: { replayed: true }, pointer: { replayed: true } });

    await writeFile(join(input.repository, "closure.build", "input.txt"), "changed Closure\n");
    const releasePlan = await createExactReleasePlanFromRegistryFile({
      acceptedReceipt: { bytes: objects.get(snapshotStorageUrl)!.body, sha256: pointer.receipt.sha256 },
      availableIdentities: new Set(), channel: "betahyx", registryPath: input.registry, root: input.repository, target: "darwin-arm64",
    });
    expect(releasePlan.actions.map(({ id }) => id)).toContain("closure.acceptance.hot");
    const releasePlanPath = join(input.root, "release-plan.json");
    await writeFile(releasePlanPath, JSON.stringify(releasePlan));
    const stagedDirectory = join(input.root, "staged"), stagedReceipt = join(stagedDirectory, "shell-contribution.json");
    await executeExactReleaseControl({
      schemaVersion: 1, operation: "exact.baseline.stage", policyReceipt: input.policyReceipt, releasePlan: releasePlanPath,
      registry: input.registry, root: input.repository, channel: "betahyx", releaseVersion, sourceCommit, target: "darwin-arm64",
      outputDirectory: stagedDirectory,
    }, stagedReceipt);
    const staged = JSON.parse(await readFile(stagedReceipt, "utf8"));
    expect(staged).toMatchObject({ operation: "shell.distribution.contribute", artifact: { sha256: snapshot.acceptance.artifact.sha256 } });
    expect(await readFile(staged.artifact.file)).toEqual(input.artifactBody);

    objects.set(pointerStorageUrl, {
      body: Buffer.from(JSON.stringify({ ...pointer, releaseVersion: "1.2.3-betahyx.5" })), etag: '"newer"',
    });
    await expect(executeExactReleaseControl(request, join(input.root, "regression.json"))).rejects.toThrow("would not advance");
  });
});
