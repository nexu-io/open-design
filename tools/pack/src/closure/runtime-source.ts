export function standaloneBootloaderSource(options: { minShellVersion: string }): string {
  return `import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createStandaloneBootloader } from "@open-design/standalone";
import { startStandaloneBody } from "./standalone/body.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const innerPath = join(root, "standalone", "bootloader.mjs");
let registeredBootloader = null;
if (existsSync(innerPath)) {
  const inner = await import(pathToFileURL(innerPath).href);
  if (typeof inner.handoff !== "function") {
    throw new Error("registered Standalone bootloader must export handoff()");
  }
  registeredBootloader = inner.handoff;
}

export const handoff = createStandaloneBootloader({
  shellCompatibility: {
    electron: { version: { min: ${JSON.stringify(options.minShellVersion)} } },
  },
  resolveRegisteredBootloader: () => registeredBootloader,
  start: startStandaloneBody,
});

export default handoff;
`;
}

export function standaloneBodySource(): string {
  return `import { existsSync } from "node:fs";
import { mkdir, realpath, symlink, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startSidecarStandalone } from "@open-design/standalone";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function sameWindowsPath(left, right) {
  const normalize = (value) => value.replaceAll("/", "\\\\").replace(/[\\\\]+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

/**
 * Node's Windows chdir still rejects paths beyond MAX_PATH even when file I/O
 * and the Electron manifest are long-path aware. Enter the verified Closure
 * through a generation-bound junction under the namespace runtime root so the
 * Next standalone server and native module resolution stay below that limit.
 */
export async function resolveOpenDesignClosureRuntimeRoot(request) {
  if (process.platform !== "win32") return root;
  const scope = request.handoff.scope;
  const digest = request.handoff.descriptor.standalone.digest.slice("sha256:".length, "sha256:".length + 16);
  const aliasParent = join(request.paths.runtimeRoot, "closure-aliases");
  const aliasRoot = join(aliasParent, [scope.channel, "g" + String(scope.generation), digest].join("-"));
  await mkdir(aliasParent, { recursive: true });
  const expectedRoot = await realpath(root);
  const currentRoot = await realpath(aliasRoot).catch(() => null);
  if (currentRoot != null && sameWindowsPath(currentRoot, expectedRoot)) return aliasRoot;
  if (currentRoot != null) await unlink(aliasRoot);
  await symlink(expectedRoot, aliasRoot, "junction").catch(async (error) => {
    const racedRoot = await realpath(aliasRoot).catch(() => null);
    if (racedRoot != null && sameWindowsPath(racedRoot, expectedRoot)) return;
    throw error;
  });
  const linkedRoot = await realpath(aliasRoot);
  if (!sameWindowsPath(linkedRoot, expectedRoot)) {
    throw new Error("Closure runtime alias does not resolve to the selected generation");
  }
  return aliasRoot;
}

export function resolveOpenDesignClosureLayout(runtimeRoot = root) {
  const webStaticRoot = join(runtimeRoot, "web", "static");
  if (!existsSync(join(webStaticRoot, "index.html"))) throw new Error("Closure static Web entry is missing");
  return Object.freeze({
    daemonCliEntry: join(runtimeRoot, "daemon", "daemon-cli.mjs"),
    daemonSidecarEntry: join(runtimeRoot, "daemon", "daemon-sidecar.mjs"),
    daemonStandaloneSidecarEntry: join(runtimeRoot, "daemon", "daemon-standalone-sidecar.mjs"),
    webSidecarEntry: join(runtimeRoot, "web", "web-sidecar.mjs"),
    webStandaloneSidecarEntry: join(runtimeRoot, "web", "web-standalone-sidecar.mjs"),
    webStaticRoot,
  });
}

export async function startStandaloneBody(request) {
  const layout = resolveOpenDesignClosureLayout(await resolveOpenDesignClosureRuntimeRoot(request));
  // Windows can spend more than the control plane's generic five-second
  // default loading a freshly materialized Electron-as-Node sidecar while
  // Defender scans its Closure tree. Hosted and older Intel Macs can likewise
  // cross that default on the first exact-version repair. Keep readiness
  // event-driven, but give those slower cold-start paths a bounded allowance
  // before declaring the child unavailable.
  const sidecarReadyTimeoutMs = process.platform === "win32"
    ? 120_000
    : process.platform === "darwin" && process.arch === "x64"
      ? 30_000
      : undefined;
  const childEnv = {
    ...process.env,
    OD_DAEMON_CLI_PATH: layout.daemonCliEntry,
    OD_NODE_BIN: process.execPath,
    // The normalized Standalone control plane supplies this channel-scoped
    // resource CAS root. Trust exactly that verified boundary; it is a sibling
    // of namespace generations by design, not part of one body component.
    OD_RESOURCE_TRUST_ROOT: request.paths.resourceRoot,
    OD_STANDALONE_ATTACHMENT_ID: request.attachment.id,
  };
  return await startSidecarStandalone(request, {
    daemon: {
      args: [layout.daemonStandaloneSidecarEntry],
      env: childEnv,
      executable: process.execPath,
      output: "inherit",
      readyTimeoutMs: sidecarReadyTimeoutMs,
    },
    web: {
      args: [layout.webStandaloneSidecarEntry],
      env: {
        ...childEnv,
        OD_WEB_STATIC_ROOT: layout.webStaticRoot,
      },
      executable: process.execPath,
      output: "inherit",
      readyTimeoutMs: sidecarReadyTimeoutMs,
    },
  });
}
`;
}

export function standaloneInnerBootloaderSource(options: { minShellVersion: string }): string {
  return `import { createStandaloneBootloader } from "@open-design/standalone";
import { startStandaloneBody } from "./body.mjs";

export const handoff = createStandaloneBootloader({
  shellCompatibility: {
    electron: { version: { min: ${JSON.stringify(options.minShellVersion)} } },
  },
  start: startStandaloneBody,
});

export default handoff;
`;
}
