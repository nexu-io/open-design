#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { FossilBootloader, StandaloneStore, StandaloneUpdater, VersionedLauncher, supportsInstalledShell, verifyStandaloneMetadata, type SignedStandaloneChannelHead, type SignedStandaloneMetadata } from "@open-design/standalone";
import { FileFixtureLifecyclePort, TERMINAL_SHELL_IDENTITY, TERMINAL_SHELL_VERSION, applyTerminalUpdate, assertOfficialNodeVersion } from "./index.js";

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (fallback == null) throw new Error(`missing ${name}`);
    return fallback;
  }
  const value = process.argv[index + 1];
  if (value == null) throw new Error(`missing value for ${name}`);
  return value;
}

async function readArtifact(url: string): Promise<Uint8Array> {
  if (url.startsWith("file://")) return readFile(new URL(url));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`artifact request failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function hostTarget(): "darwin-arm64" | "win32-x64" {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  return option("--target") as "darwin-arm64" | "win32-x64";
}

async function installedChannel(root: string): Promise<string | undefined> {
  let entries: string[];
  try { entries = await readdir(join(root, "namespaces")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const channels = new Set<string>();
  for (const entry of entries.filter((name) => name.startsWith("terminal-"))) {
    try {
      const binding = JSON.parse(await readFile(join(root, "namespaces", entry, "binding.json"), "utf8")) as { channel?: unknown };
      if (typeof binding.channel === "string") channels.add(binding.channel);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (channels.size > 1) throw new Error("multiple Terminal channels are installed; pass --channel");
  return channels.values().next().value;
}

async function main(): Promise<void> {
  const runtimeVersion = assertOfficialNodeVersion();
  const command = process.argv[2];
  const root = resolve(option("--root"));
  const channelIndex = process.argv.indexOf("--channel");
  const requestedChannel = channelIndex < 0 ? undefined : process.argv[channelIndex + 1];
  let envelope: SignedStandaloneMetadata | undefined;
  let trustedInstallKeys: Map<string, string> | undefined;
  let resolvedChannel = requestedChannel;
  if (command === "install") {
    envelope = JSON.parse(await readFile(resolve(option("--metadata")), "utf8")) as SignedStandaloneMetadata;
    const publicKey = await readFile(resolve(option("--public-key")), "utf8");
    const keyId = option("--key-id", envelope.signatures[0]?.keyId);
    trustedInstallKeys = new Map([[keyId, publicKey]]);
    verifyStandaloneMetadata(envelope, trustedInstallKeys);
    if (resolvedChannel !== undefined && resolvedChannel !== envelope.metadata.channel) throw new Error("install channel does not match signed metadata");
    resolvedChannel = envelope.metadata.channel;
  } else if (resolvedChannel === undefined) {
    resolvedChannel = await installedChannel(root);
  }
  const namespace = option("--namespace", resolvedChannel == null ? "terminal-local" : `terminal-${resolvedChannel}`);
  if (resolvedChannel !== undefined && namespace !== `terminal-${resolvedChannel}`) throw new Error("namespace must match its exact channel");
  const store = new StandaloneStore(root, namespace);
  const lifecycle = new FileFixtureLifecyclePort(root, namespace);
  const launcher = new VersionedLauncher(store, lifecycle);
  let output: unknown;
  if (command === "install") {
    if (envelope === undefined || trustedInstallKeys === undefined) throw new Error("install metadata was not initialized");
    const shell = { shell: "terminal", target: hostTarget(), shellVersion: TERMINAL_SHELL_VERSION, runtime: { name: "node", version: runtimeVersion } };
    if (!supportsInstalledShell(envelope, shell)) throw new Error(`signed metadata requires a different Terminal shell for ${envelope.metadata.releaseVersion}`);
    const generation = await store.prepare(envelope, trustedInstallKeys, readArtifact);
    await store.commit(generation.id);
    output = { schemaVersion: 1, shell: TERMINAL_SHELL_IDENTITY.shell, operation: "install", generation };
  } else if (command === "start") {
    await store.activatePrepared();
    output = await new FossilBootloader(async () => launcher).start();
  } else if (command === "update" || command === "apply-update") {
    const channel = option("--channel");
    const headUrl = option("--channel-head");
    const trusted = JSON.parse(await readFile(resolve(option("--trusted-keys")), "utf8")) as Record<string, string>;
    const updater = new StandaloneUpdater(
      channel,
      "closure",
      { shell: "terminal", target: hostTarget(), shellVersion: TERMINAL_SHELL_VERSION, runtime: { name: "node", version: runtimeVersion } },
      trusted,
      store,
      { readChannelHead: async () => JSON.parse(Buffer.from(await readArtifact(headUrl)).toString("utf8")) as SignedStandaloneChannelHead, readArtifact },
    );
    const preparation = await updater.prepareLatest();
    output = command === "apply-update"
      ? await applyTerminalUpdate(updater, launcher, preparation)
      : preparation;
  } else if (command === "status") {
    output = await launcher.status();
  } else if (command === "stop") {
    output = await launcher.stop();
  } else if (command === "inspect") {
    output = { shell: TERMINAL_SHELL_IDENTITY, state: await store.readState(), lifecycle: await launcher.status() };
  } else {
    throw new Error("usage: open-design-terminal <install|update|apply-update|start|status|inspect|stop> --root <path> [options]");
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

await main();
