import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicalJson,
  signStandaloneChannelHead,
  signStandaloneShellMetadata,
  signDocument,
  sweepStandaloneStore,
  type StandaloneChannelHead,
  type StandaloneShellMetadata,
} from "@open-design/standalone";

import { ElectronReleaseExactFeed, resolveElectronChannelHeadOverride } from "@/adapters/standalone/release-feed.js";
import { ElectronStandaloneHostUpdater } from "@/adapters/standalone/host-updater.js";
import { ElectronStandaloneShellCandidateLedger } from "@/adapters/standalone/shell-updater-candidate.js";
import { ElectronStandaloneShellUpdaterLedger } from "@/adapters/standalone/shell-updater-ledger.js";
import { writeCapsuleSeed } from "./fixtures/capsule.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(releaseVersion = "0.2.0-betahyx.2", options: { channel?: string; target?: string; badSignature?: boolean; archiveSha256?: string; treeSha256?: string; minimumCarrierVersion?: string; omitCapsule?: boolean } = {}) {
  const cacheRoot = await mkdtemp(join(tmpdir(), "electron-release-feed-"));
  roots.push(cacheRoot);
  const keys = generateKeyPairSync("ed25519");
  const artifact = Buffer.from("signed electron distribution");
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  const channel = options.channel ?? "betahyx", base = `https://releases.invalid/${channel}/${releaseVersion}`;
  const channelHeadUrl = `https://releases.invalid/${channel}/latest/channel-head.json`;
  const metadataUrl = `${base}/electron-metadata.json`;
  const artifactUrl = `${base}/electron.dmg`;
  const capsuleUrl = `${base}/capsule.json`;
  const seed = await writeCapsuleSeed({ root: cacheRoot, privateKey: keys.privateKey, keyId: "release",
    moduleSource: 'throw new Error("preparation must not execute Capsule"); export const createElectronCapsuleDefinition = () => {}; export const runElectronCapsule = () => {};',
  });
  const capsuleArchive = await readFile(seed.archiveFile);
  const archive = seed.envelope.document.archive;
  const capsuleArchiveUrl = `${base}/capsule.zip`;
  const capsule = { schemaVersion: 1, protocol: "electron-capsule-v4", version: "0.2.0", target: options.target ?? "darwin-arm64", entrypoint: "capsule.cjs",
    requires: { carrierVersion: options.minimumCarrierVersion ?? "0.1.0" }, provides: { shellVersion: "0.2.0" },
    archive: { ...archive, sha256: options.archiveSha256 ?? archive.sha256, treeSha256: options.treeSha256 ?? archive.treeSha256 } };
  const capsuleBytes = Buffer.from(canonicalJson(signDocument(capsule, [{ keyId: "release", privateKey: options.badSignature ? generateKeyPairSync("ed25519").privateKey : keys.privateKey }])));
  const document: StandaloneShellMetadata = {
    schemaVersion: 1,
    channel,
    releaseVersion,
    sourceCommit: "a".repeat(40),
    publishedAt: "2026-09-04T00:00:00.000Z",
    distributions: [{
      shell: { type: "electron", version: "0.2.0", buildHash: "b".repeat(64) },
      target: "darwin-arm64",
      artifact: { url: artifactUrl, sha256: artifactSha256, size: artifact.byteLength, mediaType: "application/x-apple-diskimage" },
      platformTrust: { platform: "macos", mode: "verify-only", designatedRequirement: 'identifier "io.open-design.test"', teamIdentifier: "adhoc" },
      updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" },
      ...(options.omitCapsule ? {} : { capsule: { schemaVersion: 1,
        manifest: { url: capsuleUrl, sha256: createHash("sha256").update(capsuleBytes).digest("hex"), size: capsuleBytes.byteLength },
        archive: { url: capsuleArchiveUrl, sha256: archive.sha256, size: archive.size },
      } }),
    }],
  };
  const metadata = Buffer.from(canonicalJson(signStandaloneShellMetadata(document, [{ keyId: "release", privateKey: keys.privateKey }])));
  const head: StandaloneChannelHead = {
    schemaVersion: 1,
    channel,
    publishedAt: "2026-09-04T00:00:00.000Z",
    lanes: { electron: { releaseVersion, url: metadataUrl, sha256: createHash("sha256").update(metadata).digest("hex"), size: metadata.byteLength } },
  };
  const channelHead = Buffer.from(canonicalJson(signStandaloneChannelHead(head, [{ keyId: "release", privateKey: keys.privateKey }])));
  const bodies = new Map<string, Buffer>([
    [channelHeadUrl, channelHead],
    [metadataUrl, metadata],
    [artifactUrl, artifact],
    [capsuleUrl, capsuleBytes],
    [capsuleArchiveUrl, capsuleArchive],
  ]);
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const body = bodies.get(String(input));
    return new Response(body == null ? "missing" : new Uint8Array(body), { status: body == null ? 404 : 200 });
  }) as typeof fetch;
  const feed = new ElectronReleaseExactFeed({
    cacheRoot,
    channel,
    channelHeadUrl,
    currentReleaseVersion: channel === "stable" ? "0.1.0" : `0.1.0-${channel}.1`,
    fetch: fetcher,
    shell: { type: "electron", version: "0.1.0", buildHash: "c".repeat(64), digest: "d".repeat(64) },
    target: "darwin-arm64",
    trustedKeys: new Map([["release", keys.publicKey]]),
  });
  return { artifact, bodies, cacheRoot, feed, fetcher, metadataUrl, capsuleUrl, capsuleArchiveUrl, capsuleArchive, capsule };
}

describe("Electron release-exact feed", () => {
  it("consumes stable bare versions and rejects a stable downgrade through the same signed feed", async () => {
    const current = await fixture("0.2.0", { channel: "stable" });
    expect(await current.feed.check()).toMatchObject({ candidateId: "0.2.0" });
    const downgrade = await fixture("0.0.9", { channel: "stable" });
    await expect(downgrade.feed.check()).rejects.toThrow("would downgrade");
  });
  it("prepares exact Capsule bytes through the shared cache without activating or rediscovering", async () => {
    const { feed, bodies, fetcher, capsuleArchiveUrl, capsule, cacheRoot } = await fixture();
    const candidate = (await feed.check())!;
    const before = await readdir(cacheRoot);
    bodies.delete("https://releases.invalid/betahyx/latest/channel-head.json");
    const [prepared, concurrent] = await Promise.all([feed.prepareCapsule(candidate), feed.prepareCapsule(candidate)]);
    expect(concurrent).toEqual(prepared);
    expect(prepared.envelope.document).toEqual(capsule);
    expect(await readdir(prepared.root)).toEqual(["capsule.cjs"]);
    const module = await readFile(join(prepared.root, "capsule.cjs"), "utf8");
    expect(module).toContain("createElectronCapsuleDefinition");
    expect(await sweepStandaloneStore(cacheRoot)).toEqual({ discardedBlobs: 0, discardedMaterializations: 0 });
    bodies.delete(capsuleArchiveUrl);
    await writeFile(join(prepared.root, "capsule.cjs"), "corrupt materialization");
    const repaired = await feed.prepareCapsule(candidate);
    expect(repaired.root).toBe(prepared.root);
    expect(await readFile(join(repaired.root, "capsule.cjs"), "utf8")).toBe(module);
    expect(vi.mocked(fetcher).mock.calls.filter(([url]) => String(url) === capsuleArchiveUrl)).toHaveLength(1);
    expect((await readdir(cacheRoot)).filter(name => !before.includes(name)).sort()).toEqual(["capsule", "locks"]);
    expect((await readdir(join(cacheRoot, "capsule"))).sort()).toEqual(["blobs", "downloads", "locks", "materialized", "staging", "trash"]);
  });

  it.each([{ minimumCarrierVersion: "9.0.0" }, { badSignature: true }, { target: "win32-x64" }])("refuses Capsule before archive acquisition when trust or carrier compatibility fails %j", async options => {
    const { feed, fetcher, capsuleArchiveUrl } = await fixture(undefined, options);
    await expect(feed.prepareCapsule((await feed.check())!)).rejects.toThrow();
    expect(vi.mocked(fetcher).mock.calls.some(([url]) => String(url) === capsuleArchiveUrl)).toBe(false);
  });

  it("rejects downloaded Capsule corruption and a signed but incorrect materialized tree", async () => {
    const damaged = await fixture();
    damaged.bodies.set(damaged.capsuleArchiveUrl, Buffer.alloc(damaged.capsuleArchive.length));
    await expect(damaged.feed.prepareCapsule((await damaged.feed.check())!)).rejects.toThrow();
    const wrongTree = await fixture(undefined, { treeSha256: "0".repeat(64) });
    await expect(wrongTree.feed.prepareCapsule((await wrongTree.feed.check())!)).rejects.toThrow("tree failed verification");
  });

  it("resolves Capsule from the fixed signed candidate without rereading latest", async () => {
    const { feed, bodies, fetcher, capsule } = await fixture();
    const head = await feed.readChannelHead("betahyx");
    bodies.set("https://releases.invalid/betahyx/latest/channel-head.json", Buffer.from("changed latest"));
    const checking = feed.checkFromHead(head);
    head.head.lanes.electron!.releaseVersion = "0.2.0-betahyx.999";
    const candidate = await checking;
    expect((await feed.readCapsule(candidate!)).document).toEqual(capsule);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects missing Capsule references and changed manifest bytes", async () => {
    await expect((await fixture(undefined, { omitCapsule: true })).feed.check()).rejects.toThrow();
    const { feed, bodies, capsuleUrl } = await fixture();
    const candidate = await feed.check();
    bodies.set(capsuleUrl, Buffer.from("{}"));
    await expect(feed.readCapsule(candidate!)).rejects.toThrow("exact lane binding");
  });

  it.each([{ target: "win32-x64" }, { badSignature: true }, { archiveSha256: "0".repeat(64) }])("rejects an unauthenticated or mismatched Capsule manifest %j", async options => {
    const { feed } = await fixture(undefined, options);
    await expect(feed.readCapsule((await feed.check())!)).rejects.toThrow();
  });
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
    const lifecycle = { async beginTransition(): Promise<never> { throw new Error("check/download must not reserve a host transition"); } };
    const firstHost = new ElectronStandaloneHostUpdater("electron", lifecycle, ledger, { authorityRoot: cacheRoot, feed, candidates });
    expect(await firstHost.invoke("check")).toMatchObject({ outcome: "accepted", snapshot: { state: "available", candidateId: "0.2.0-betahyx.2" } });

    const replacementHost = new ElectronStandaloneHostUpdater("electron", lifecycle, ledger, { authorityRoot: cacheRoot, feed, candidates });
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
