import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";

import type { ToolPackConfig } from "../config/index.js";
import { runPnpm } from "./commands.js";

type ShellPackReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.pack.build";
  channel: string;
  namespace: string;
  releaseVersion: string;
  shellVersion: string;
  identity: Readonly<{
    appId: string;
    appBundleName: string;
    executableName: string;
    productName: string;
    version: string;
  }>;
  distribution: Readonly<{
    schemaVersion: 1;
    platform: "mac" | "win";
    outputRoot: string;
    artifacts: readonly string[];
  }>;
}>;

function artifact(receipt: ShellPackReceipt, suffix: string): string | null {
  return receipt.distribution.artifacts.find((path) => path.toLowerCase().endsWith(suffix)) ?? null;
}

export async function packMac(config: ToolPackConfig) {
  if (config.standaloneBootstrapUrl == null) {
    throw new Error("tools-pack mac build requires --standalone-bootstrap-url (or OD_ELECTRON_STANDALONE_BOOTSTRAP_URL)");
  }
  const version = config.appVersion ?? "0.1.0";
  const channel = releaseChannelFromVersion(version)
    ?? releaseChannelFromNamespace(config.namespace)
    ?? "stable";
  const requestPath = join(config.roots.output.namespaceRoot, "shell-pack-request.json");
  const receiptPath = join(config.roots.output.namespaceRoot, "shell-pack-receipt.json");
  await mkdir(config.roots.output.namespaceRoot, { recursive: true });
  await writeFile(requestPath, `${JSON.stringify({
    schemaVersion: 1,
    operation: "electron.pack.build",
    bootstrapUrl: config.standaloneBootstrapUrl,
    channel,
    installationRoot: join(config.roots.cacheRoot, "standalone", channel),
    namespace: config.namespace,
    outputDirectory: config.roots.output.namespaceRoot,
    releaseVersion: version,
  }, null, 2)}\n`, "utf8");
  const startedAt = Date.now();
  await runPnpm(config, ["--filter", "@open-design/shell-electron", "pack:adapter", "--", "--request", requestPath, "--receipt", receiptPath]);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as ShellPackReceipt;
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.pack.build" || receipt.distribution.platform !== "mac") {
    throw new Error("Shell pack adapter returned an invalid mac receipt");
  }
  const appPath = artifact(receipt, ".app");
  if (appPath == null) throw new Error("Shell pack adapter did not produce a mac app bundle");
  return Object.freeze({
    schemaVersion: 1 as const,
    operation: "tools-pack.build" as const,
    platform: "mac" as const,
    channel,
    namespace: config.namespace,
    releaseVersion: version,
    shellVersion: receipt.shellVersion,
    identity: receipt.identity,
    appPath,
    dmgPath: artifact(receipt, ".dmg"),
    artifacts: receipt.distribution.artifacts,
    outputRoot: receipt.distribution.outputRoot,
    receiptPath,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    timings: [Object.freeze({ phase: "shell-pack", durationMs: Date.now() - startedAt })],
  });
}
