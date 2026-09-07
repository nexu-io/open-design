import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicalJson,
  signStandaloneChannelHead,
  signStandaloneShellMetadata,
  type StandaloneChannelHead,
  type StandaloneShellMetadata,
} from "@open-design/standalone";

import { ElectronReleaseExactFeed, resolveElectronChannelHeadOverride } from "@/adapters/standalone/release-feed.js";
import { StandaloneHostLifecycle } from "@open-design/standalone";
import { ElectronStandaloneHostUpdater } from "@/adapters/standalone/host-updater.js";
import { ElectronStandaloneShellCandidateLedger } from "@/adapters/standalone/shell-updater-candidate.js";
import { ElectronStandaloneShellUpdaterLedger } from "@/adapters/standalone/shell-updater-ledger.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(releaseVersion = "0.2.0-betahyx.2") {
  const cacheRoot = await mkdtemp(join(tmpdir(), "electron-release-feed-"));
  roots.push(cacheRoot);
  const keys = generateKeyPairSync("ed25519");
  const artifact = Buffer.from("signed electron distribution");
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  const metadataUrl = "https://releases.invalid/betahyx/0.2.0-betahyx.2/electron-metadata.json";
  const artifactUrl = "https://releases.invalid/betahyx/0.2.0-betahyx.2/electron.dmg";
  const document: StandaloneShellMetadata = {
    schemaVersion: 1,
    channel: "betahyx",
    releaseVersion,
    sourceCommit: "a".repeat(40),
    publishedAt: "2026-09-04T00:00:00.000Z",
    distributions: [{
      shell: { type: "electron", version: "0.2.0", buildHash: "b".repeat(64) },
      target: "darwin-arm64",
      artifact: { url: artifactUrl, sha256: artifactSha256, size: artifact.byteLength, mediaType: "application/x-apple-diskimage" },
      platformTrust: { platform: "macos", mode: "verify-only", designatedRequirement: 'identifier "io.open-design.test"', teamIdentifier: "adhoc" },
      updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" },
    }],
  };
  const metadata = Buffer.from(canonicalJson(signStandaloneShellMetadata(document, [{ keyId: "release", privateKey: keys.privateKey }])));
  const head: StandaloneChannelHead = {
    schemaVersion: 1,
    channel: "betahyx",
    publishedAt: "2026-09-04T00:00:00.000Z",
    lanes: { electron: { releaseVersion, url: metadataUrl, sha256: createHash("sha256").update(metadata).digest("hex"), size: metadata.byteLength } },
  };
  const channelHead = Buffer.from(canonicalJson(signStandaloneChannelHead(head, [{ keyId: "release", privateKey: keys.privateKey }])));
  const bodies = new Map<string, Buffer>([
    ["https://releases.invalid/betahyx/latest/channel-head.json", channelHead],
    [metadataUrl, metadata],
    [artifactUrl, artifact],
  ]);
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const body = bodies.get(String(input));
    return new Response(body == null ? "missing" : new Uint8Array(body), { status: body == null ? 404 : 200 });
  }) as typeof fetch;
  const feed = new ElectronReleaseExactFeed({
    cacheRoot,
    channel: "betahyx",
    channelHeadUrl: "https://releases.invalid/betahyx/latest/channel-head.json",
    currentReleaseVersion: "0.1.0-betahyx.1",
    fetch: fetcher,
    shell: { type: "electron", version: "0.1.0", buildHash: "c".repeat(64), digest: "d".repeat(64) },
    target: "darwin-arm64",
    trustedKeys: new Map([["release", keys.publicKey]]),
  });
  return { artifact, bodies, cacheRoot, feed, fetcher, metadataUrl };
}

describe("Electron release-exact feed", () => {
  it("accepts one explicit signed-feed override without exposing an environment backdoor", () => {
    expect(resolveElectronChannelHeadOverride(["electron", "--od-channel-head-url=https://releases.invalid/betahyx/candidate/channel-head.json"]))
      .toBe("https://releases.invalid/betahyx/candidate/channel-head.json");
    expect(resolveElectronChannelHeadOverride(["electron"])).toBeUndefined();
    expect(() => resolveElectronChannelHeadOverride(["electron", "--od-channel-head-url=https://a.invalid/head", "--od-channel-head-url=https://b.invalid/head"]))
      .toThrow("exactly once");
    expect(() => resolveElectronChannelHeadOverride(["electron", "--od-channel-head-url=https://user:secret@releases.invalid/head"]))
      .toThrow("invalid");
  });

  it("verifies signed head and Shell metadata before downloading the exact artifact", async () => {
    const { artifact, feed, fetcher } = await fixture();
    const candidate = await feed.check();
    expect(candidate).toMatchObject({ candidateId: "0.2.0-betahyx.2", distribution: { target: "darwin-arm64", shell: { type: "electron", version: "0.2.0" } } });
    const downloaded = await feed.download(candidate!);
    expect(await readFile(downloaded.path)).toEqual(artifact);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects metadata that differs from its signed lane digest", async () => {
    const { bodies, feed, metadataUrl } = await fixture();
    bodies.set(metadataUrl, Buffer.from("{}"));
    await expect(feed.check()).rejects.toThrow("failed exact lane binding");
  });

  it("rejects a signed channel head that would downgrade the installed exact release", async () => {
    const { feed } = await fixture("0.0.9-betahyx.1");
    await expect(feed.check()).rejects.toThrow("would downgrade");
  });

  it("recovers a verified available candidate and reaches ready after host replacement", async () => {
    const { cacheRoot, feed } = await fixture();
    const scope = { channel: "betahyx", namespace: "release-feed" };
    const ledger = new ElectronStandaloneShellUpdaterLedger(cacheRoot, scope, "electron");
    const candidates = new ElectronStandaloneShellCandidateLedger(cacheRoot, scope, feed);
    const firstHost = new ElectronStandaloneHostUpdater("electron", new StandaloneHostLifecycle(scope), ledger, { authorityRoot: cacheRoot, feed, candidates });
    expect(await firstHost.invoke("check")).toMatchObject({ outcome: "accepted", snapshot: { state: "available", candidateId: "0.2.0-betahyx.2" } });

    const replacementHost = new ElectronStandaloneHostUpdater("electron", new StandaloneHostLifecycle(scope), ledger, { authorityRoot: cacheRoot, feed, candidates });
    const downloaded = await replacementHost.invoke("download");
    expect(downloaded).toMatchObject({
      outcome: "accepted",
      snapshot: {
        state: "ready",
        handoff: { releaseVersion: "0.2.0-betahyx.2", target: "darwin-arm64", shell: { version: "0.2.0" } },
      },
    });
    expect(downloaded.snapshot.handoff?.artifact.path).toContain("/installer/artifacts/sha256/");
    expect(downloaded.snapshot.handoff?.artifact.path).not.toContain("/blobs/");
  });
});
