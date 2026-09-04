import type { KeyObject } from "node:crypto";

import {
  canonicalJson,
  ensureStandaloneBlob,
  sha256Hex,
  verifyStandaloneChannelHead,
  verifyStandaloneShellMetadata,
  type SignedStandaloneChannelHead,
  type SignedStandaloneShellMetadata,
  type StandaloneShellDistribution,
  type StandaloneShellIdentity,
  type StandaloneUpdateSource,
} from "@open-design/standalone";

import type { ElectronStandaloneTarget } from "./installation.js";

export type ElectronReleaseExactCandidate = Readonly<{
  candidateId: string;
  distribution: StandaloneShellDistribution;
  metadata: SignedStandaloneShellMetadata;
}>;

type Fetch = typeof globalThis.fetch;

function releaseOrder(value: string, channel: string): readonly number[] {
  const match = new RegExp(`^(\\d+)\\.(\\d+)\\.(\\d+)-${channel}\\.(\\d+)$`).exec(value);
  if (match == null) throw new Error(`Electron release does not belong to exact channel ${channel}`);
  return match.slice(1).map(Number);
}

function compareRelease(left: string, right: string, channel: string): number {
  const a = releaseOrder(left, channel);
  const b = releaseOrder(right, channel);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

async function bytes(fetcher: Fetch, url: string, label: string, expected?: Readonly<{ sha256: string; size: number }>): Promise<Uint8Array> {
  const response = await fetcher(url, { redirect: "error" });
  if (!response.ok) throw new Error(`${label} request failed: ${response.status}`);
  const value = new Uint8Array(await response.arrayBuffer());
  if (value.byteLength > 1024 * 1024) throw new Error(`${label} exceeds the metadata size limit`);
  if (expected != null && (value.byteLength !== expected.size || sha256Hex(value) !== expected.sha256)) throw new Error(`${label} failed exact lane binding`);
  return value;
}

function json<T>(value: Uint8Array, label: string): T {
  try { return JSON.parse(Buffer.from(value).toString("utf8")) as T; }
  catch (error) { throw new Error(`${label} is not valid JSON`, { cause: error }); }
}

export class ElectronReleaseExactFeed implements StandaloneUpdateSource {
  readonly prepare: StandaloneUpdateSource["prepare"];

  constructor(private readonly options: Readonly<{
    cacheRoot: string;
    channel: string;
    channelHeadUrl: string;
    currentReleaseVersion: string;
    fetch?: Fetch;
    shell: StandaloneShellIdentity;
    target: ElectronStandaloneTarget;
    trustedKeys: ReadonlyMap<string, KeyObject>;
  }>) {
    this.prepare = Object.freeze({ fetch: options.fetch });
  }

  async readChannelHead(channel: string): Promise<SignedStandaloneChannelHead> {
    if (channel !== this.options.channel) throw new Error("Electron content updater escaped its installed channel");
    const fetcher = this.options.fetch ?? globalThis.fetch;
    return json<SignedStandaloneChannelHead>(await bytes(fetcher, this.options.channelHeadUrl, "Electron channel head"), "Electron channel head");
  }

  async readDocument(url: string): Promise<Uint8Array> {
    return await bytes(this.options.fetch ?? globalThis.fetch, url, "Electron release document");
  }

  async check(): Promise<ElectronReleaseExactCandidate | null> {
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const envelope = await this.readChannelHead(this.options.channel);
    verifyStandaloneChannelHead(envelope, this.options.trustedKeys);
    if (envelope.head.channel !== this.options.channel) throw new Error("Electron channel head escaped its installed channel");
    const lane = envelope.head.lanes.electron;
    if (lane == null) throw new Error("Electron channel head lacks the electron lane");
    const order = compareRelease(lane.releaseVersion, this.options.currentReleaseVersion, this.options.channel);
    if (order < 0) throw new Error("Electron channel head would downgrade the installed exact release");
    const metadata = json<SignedStandaloneShellMetadata>(await bytes(fetcher, lane.url, "Electron Shell metadata", lane), "Electron Shell metadata");
    verifyStandaloneShellMetadata(metadata, this.options.trustedKeys);
    if (metadata.document.channel !== this.options.channel || metadata.document.releaseVersion !== lane.releaseVersion) {
      throw new Error("Electron Shell metadata escaped its signed lane identity");
    }
    const candidate = this.validateCandidate({ candidateId: lane.releaseVersion, distribution: metadata.document.distributions.find(({ shell, target }) => shell.type === "electron" && target === this.options.target), metadata });
    const distribution = candidate.distribution;
    if (order === 0) {
      if (distribution.shell.version === this.options.shell.version && distribution.shell.buildHash === this.options.shell.buildHash) return null;
      throw new Error("Electron immutable exact release collides with the installed Shell identity");
    }
    return candidate;
  }

  validateCandidate(value: unknown): ElectronReleaseExactCandidate {
    if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("persisted Electron release candidate is invalid");
    const candidate = value as Partial<ElectronReleaseExactCandidate>;
    if (typeof candidate.candidateId !== "string" || candidate.metadata == null) throw new Error("persisted Electron release candidate is invalid");
    verifyStandaloneShellMetadata(candidate.metadata, this.options.trustedKeys);
    const document = candidate.metadata.document;
    if (document.channel !== this.options.channel || document.releaseVersion !== candidate.candidateId) throw new Error("persisted Electron release candidate escaped its signed identity");
    const order = compareRelease(candidate.candidateId, this.options.currentReleaseVersion, this.options.channel);
    if (order < 0) throw new Error("persisted Electron release candidate would downgrade the installed exact release");
    const distribution = document.distributions.find(({ shell, target }) => shell.type === "electron" && target === this.options.target);
    if (distribution == null || candidate.distribution == null || canonicalJson(distribution) !== canonicalJson(candidate.distribution)) throw new Error(`persisted Electron release candidate lacks target ${this.options.target}`);
    if (distribution.updater?.handler !== "sidecar-v1") throw new Error("Electron Shell distribution lacks the production updater handler");
    if (order === 0 && (distribution.shell.version !== this.options.shell.version || distribution.shell.buildHash !== this.options.shell.buildHash)) {
      throw new Error("persisted Electron immutable exact release collides with the installed Shell identity");
    }
    return Object.freeze({ candidateId: candidate.candidateId, distribution: structuredClone(distribution), metadata: structuredClone(candidate.metadata) });
  }

  async download(candidate: ElectronReleaseExactCandidate): Promise<Readonly<{ path: string; candidate: ElectronReleaseExactCandidate }>> {
    const artifact = candidate.distribution.artifact;
    const downloaded = await ensureStandaloneBlob(this.options.cacheRoot, {
      sha256: artifact.sha256,
      size: artifact.size,
      mediaType: artifact.mediaType,
      sources: [{ kind: "remote", url: artifact.url }],
    }, { fetch: this.options.fetch, resourceId: "electron-shell-distribution" });
    return Object.freeze({ path: downloaded.path, candidate });
  }
}
