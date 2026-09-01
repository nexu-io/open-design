#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import {
  canonicalJson,
  sha256Hex,
  signStandaloneChannelHead,
  signStandaloneMetadata,
  signStandaloneShellMetadata,
  type StandaloneMetadata,
  type StandaloneShellDistribution,
  type StandaloneSigner,
  type StandaloneShellMetadata,
} from "@open-design/standalone";
import { OFFICIAL_NODE_VERSION, TERMINAL_SHELL_VERSION } from "./index.js";

type Target = "darwin-arm64" | "win32-x64";
type SceneArtifact = { kind: "closure" | "official-node" | "terminal-shell"; target?: Target; path: string; sha256: string; size: number };
type TerminalScene = {
  schemaVersion: 1;
  owner: "shells/terminal";
  closureVersion: string;
  standaloneVersion: string;
  terminalShellVersion: string;
  officialNodeVersion: string;
  artifacts: SceneArtifact[];
};
type SceneBuildRequest = {
  schemaVersion: 1;
  operation: "terminal.scene.build";
  standaloneVersion: string;
  closureVersion: string;
  closureArtifactFile: string;
  targets: Array<{ target: Target; nodeArchiveFile: string; nodeArchiveSha256: string }>;
  sceneDirectory: string;
};
type ScenePromoteRequest = {
  schemaVersion: 1;
  operation: "terminal.scene.promote";
  sceneDirectory: string;
  sourceCommit: string;
  channel: string;
  releaseVersion: string;
  publishedAt: string;
  artifactBaseUrl: string;
  outputDirectory: string;
  signers: Array<{ keyId: string; privateKeyFile: string }>;
};

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || value == null) throw new Error(`missing ${name}`);
  return value;
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonicalJson(value), "utf8");
}

async function described(path: string): Promise<{ sha256: string; size: number }> {
  const bytes = await readFile(path);
  return { sha256: sha256Hex(bytes), size: bytes.byteLength };
}

async function copyDescribed(source: string, destination: string): Promise<{ sha256: string; size: number }> {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return described(destination);
}

function tarOctal(value: number, length: number): Buffer {
  return Buffer.from(`${value.toString(8).padStart(length - 1, "0")}\0`, "ascii");
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  tarOctal(0o644, 8).copy(header, 100);
  tarOctal(0, 8).copy(header, 108);
  tarOctal(0, 8).copy(header, 116);
  tarOctal(size, 12).copy(header, 124);
  tarOctal(0, 12).copy(header, 136);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  Buffer.from(`${checksum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148);
  return header;
}

async function writeTar(destination: string, entries: Array<{ name: string; file: string }>): Promise<void> {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const bytes = await readFile(entry.file);
    chunks.push(tarHeader(entry.name, bytes.byteLength), bytes);
    const padding = (512 - (bytes.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  await writeFile(destination, Buffer.concat(chunks));
}

function assertScenePath(sceneRoot: string, path: string): string {
  const resolved = resolve(sceneRoot, path);
  const child = relative(sceneRoot, resolved);
  if (child.startsWith("..") || child === "") throw new Error(`unsafe Terminal scene path: ${path}`);
  return resolved;
}

async function buildScene(request: SceneBuildRequest, receiptPath: string): Promise<void> {
  if (!/^\d+\.\d+\.\d+$/.test(request.closureVersion) || !/^\d+\.\d+\.\d+$/.test(request.standaloneVersion)) throw new Error("invalid owner version");
  if (request.targets.length !== 2 || new Set(request.targets.map(({ target }) => target)).size !== 2) throw new Error("Terminal scene requires both targets");
  const lock = await json<{ version: string; targets: Record<Target, { archive: string; sha256: string }> }>(new URL("../node-lock.json", import.meta.url).pathname);
  if (lock.version !== OFFICIAL_NODE_VERSION) throw new Error("Terminal Node lock version differs from shell identity");
  const root = resolve(request.sceneDirectory);
  const artifacts: SceneArtifact[] = [];
  const closurePath = join(root, "payload", "closure", "fixture.mjs");
  const closure = await copyDescribed(resolve(request.closureArtifactFile), closurePath);
  artifacts.push({ kind: "closure", path: relative(root, closurePath), ...closure });
  for (const target of request.targets) {
    const locked = lock.targets[target.target];
    if (locked == null || locked.sha256 !== target.nodeArchiveSha256 || basename(target.nodeArchiveFile) !== locked.archive) throw new Error(`official Node lock mismatch: ${target.target}`);
    const nodePath = join(root, "payload", "terminal", target.target, locked.archive);
    const node = await copyDescribed(resolve(target.nodeArchiveFile), nodePath);
    if (node.sha256 !== locked.sha256) throw new Error(`official Node archive digest mismatch: ${target.target}`);
    artifacts.push({ kind: "official-node", target: target.target, path: relative(root, nodePath), ...node });
    const shellPath = join(root, "payload", "terminal", target.target, "terminal.mjs");
    const shell = await copyDescribed(new URL("./cli.mjs", import.meta.url).pathname, shellPath);
    artifacts.push({ kind: "terminal-shell", target: target.target, path: relative(root, shellPath), ...shell });
  }
  const scene: TerminalScene = {
    schemaVersion: 1,
    owner: "shells/terminal",
    closureVersion: request.closureVersion,
    standaloneVersion: request.standaloneVersion,
    terminalShellVersion: TERMINAL_SHELL_VERSION,
    officialNodeVersion: OFFICIAL_NODE_VERSION,
    artifacts,
  };
  const manifest = join(root, "scene.json");
  await writeJson(manifest, scene);
  await writeJson(receiptPath, { schemaVersion: 1, operation: "terminal.scene.build", owner: scene.owner, sceneDirectory: root, sceneManifest: manifest, sceneDigest: sha256Hex(canonicalJson(scene)) });
}

async function checkedScene(root: string): Promise<TerminalScene> {
  const scene = await json<TerminalScene>(join(root, "scene.json"));
  if (scene.schemaVersion !== 1 || scene.owner !== "shells/terminal") throw new Error("invalid Terminal scene");
  if (scene.terminalShellVersion !== TERMINAL_SHELL_VERSION || scene.officialNodeVersion !== OFFICIAL_NODE_VERSION) throw new Error("Terminal scene identity mismatch");
  for (const artifact of scene.artifacts) {
    const path = assertScenePath(root, artifact.path);
    const actual = await described(path);
    if (actual.sha256 !== artifact.sha256 || actual.size !== artifact.size) throw new Error(`Terminal scene artifact mismatch: ${artifact.path}`);
  }
  return scene;
}

async function loadSigners(values: ScenePromoteRequest["signers"]): Promise<StandaloneSigner[]> {
  return Promise.all(values.map(async ({ keyId, privateKeyFile }) => ({ keyId, privateKey: await readFile(resolve(privateKeyFile), "utf8") })));
}

async function promoteScene(request: ScenePromoteRequest, receiptPath: string): Promise<void> {
  if (!/^[a-f0-9]{40}$/.test(request.sourceCommit)) throw new Error("sourceCommit must be a full SHA");
  const sceneRoot = resolve(request.sceneDirectory);
  const scene = await checkedScene(sceneRoot);
  const output = resolve(request.outputDirectory);
  const base = request.artifactBaseUrl.replace(/\/$/, "");
  const signers = await loadSigners(request.signers);
  const closureSource = scene.artifacts.find(({ kind }) => kind === "closure");
  if (closureSource == null) throw new Error("Terminal scene lacks Closure content");
  const promoted: Array<{ kind: SceneArtifact["kind"] | "offline-seed"; target?: Target; path?: string; file: string; url: string; sha256: string; size: number }> = [];
  const promote = async (artifact: SceneArtifact, name: string) => {
    const file = join(output, name);
    const actual = await copyDescribed(assertScenePath(sceneRoot, artifact.path), file);
    if (actual.sha256 !== artifact.sha256 || actual.size !== artifact.size) throw new Error(`promotion changed ${artifact.path}`);
    const value = { ...artifact, file, url: `${base}/${name}` };
    promoted.push(value);
    return value;
  };
  const closure = await promote(closureSource, `closure-${scene.closureVersion}.mjs`);
  const distributions: StandaloneShellDistribution[] = [];
  for (const target of ["darwin-arm64", "win32-x64"] as const) {
    const nodeSource = scene.artifacts.find((item) => item.kind === "official-node" && item.target === target);
    const shellSource = scene.artifacts.find((item) => item.kind === "terminal-shell" && item.target === target);
    if (nodeSource == null || shellSource == null) throw new Error(`Terminal scene is incomplete: ${target}`);
    const node = await promote(nodeSource, basename(nodeSource.path));
    const shell = await promote(shellSource, `open-design-terminal-${scene.terminalShellVersion}-${target}.mjs`);
    const seedFile = join(output, `open-design-terminal-${scene.terminalShellVersion}-${target}-offline-seed.tar`);
    await writeTar(seedFile, [
      { name: "closure/fixture.mjs", file: closure.file },
      { name: `runtime/${basename(node.file)}`, file: node.file },
      { name: "shell/terminal.mjs", file: shell.file },
    ]);
    const seedBinding = await described(seedFile);
    const seed = { kind: "offline-seed" as const, target, file: seedFile, url: `${base}/${basename(seedFile)}`, ...seedBinding };
    promoted.push(seed);
    distributions.push({ shell: "terminal", target, shellVersion: scene.terminalShellVersion, runtime: { name: "node", version: scene.officialNodeVersion }, artifacts: [
      { kind: "official-node", url: node.url, sha256: node.sha256, size: node.size },
      { kind: "terminal-shell", url: shell.url, sha256: shell.sha256, size: shell.size },
      { kind: "offline-seed", url: seed.url, sha256: seed.sha256, size: seed.size },
    ] });
  }
  const metadata: StandaloneMetadata = {
    schemaVersion: 1,
    channel: request.channel,
    releaseVersion: request.releaseVersion,
    standaloneVersion: scene.standaloneVersion,
    sourceCommit: request.sourceCommit,
    publishedAt: request.publishedAt,
    components: [{ name: "closure-fixture", mode: "required", artifact: { entrypoint: "fixture.mjs", url: closure.url, sha256: closure.sha256, size: closure.size } }],
    shellCompatibility: distributions.map(({ shell, target, shellVersion, runtime }) => ({ shell, target, shellVersion, runtime })),
  };
  const closureMetadataFile = join(output, "closure-metadata.json");
  await writeJson(closureMetadataFile, signStandaloneMetadata(metadata, signers));
  const terminalMetadata: StandaloneShellMetadata = { schemaVersion: 1, channel: request.channel, releaseVersion: request.releaseVersion, sourceCommit: request.sourceCommit, publishedAt: request.publishedAt, distributions };
  const terminalMetadataFile = join(output, "terminal-metadata.json");
  await writeJson(terminalMetadataFile, signStandaloneShellMetadata(terminalMetadata, signers));
  const closureBinding = await described(closureMetadataFile);
  const terminalBinding = await described(terminalMetadataFile);
  const channelHeadFile = join(output, "channel-head.json");
  await writeJson(channelHeadFile, signStandaloneChannelHead({ schemaVersion: 1, channel: request.channel, publishedAt: request.publishedAt, lanes: {
    closure: { releaseVersion: request.releaseVersion, url: `${base}/closure-metadata.json`, ...closureBinding },
    terminal: { releaseVersion: request.releaseVersion, url: `${base}/terminal-metadata.json`, ...terminalBinding },
  } }, signers));
  const documents = await Promise.all([closureMetadataFile, terminalMetadataFile, channelHeadFile].map(async (file) => ({ file, ...await described(file) })));
  await writeJson(receiptPath, {
    schemaVersion: 1,
    operation: "terminal.scene.promote",
    owner: "shells/terminal",
    channel: request.channel,
    releaseVersion: request.releaseVersion,
    sourceCommit: request.sourceCommit,
    sceneDigest: sha256Hex(canonicalJson(scene)),
    artifacts: promoted.map(({ kind, target, file, url, sha256, size }) => ({ kind, target, file, url, sha256, size })),
    documents,
    closureMetadataFile,
    terminalMetadataFile,
    channelHeadFile,
  });
}

async function main(): Promise<void> {
  const request = await json<SceneBuildRequest | ScenePromoteRequest>(argument("--request"));
  const receipt = resolve(argument("--receipt"));
  if (request.schemaVersion !== 1) throw new Error("unsupported Terminal scene request");
  if (request.operation === "terminal.scene.build") await buildScene(request, receipt);
  else if (request.operation === "terminal.scene.promote") await promoteScene(request, receipt);
  else throw new Error("unsupported Terminal scene operation");
}

await main();
