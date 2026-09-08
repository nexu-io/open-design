import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { findSidecarProcesses, getSidecarStatus, stopSidecar, type SidecarStamp } from "@open-design/sidecar";
import { standaloneHostControlRequestTimeoutMs } from "@open-design/standalone";
import { resolveElectronSessionNamespace } from "@open-design/electron-kit";
import carrier from "../../../../config/carrier.json" with { type: "json" };
import resourceDeclaration from "../../../../config/standalone.json" with { type: "json" };
import { validateElectronPhysicalResourceSet } from "../../standalone/physical-resources.ts";

// Tool control-plane observations shared by dev and installed adapters.
// These projections do not acquire lifecycle authority or retire shared resources.
/** Control-plane availability is not product readiness. */
export async function waitForElectronProductReady(input: Readonly<{
  readStatus(): Promise<unknown>;
  assertAlive(): void;
}>): Promise<unknown> {
  let deadline = Date.now() + 120_000;
  let observedDeadline = false;
  while (Date.now() < deadline) {
    const status = await input.readStatus();
    if (status != null && typeof status === "object" && "state" in status) {
      if (status.state === "running") return status;
      if (status.state === "failed" || status.state === "stopping") throw new Error(`Electron startup ${status.state}`);
      if (!observedDeadline && "startupDeadline" in status && typeof status.startupDeadline === "string") {
        const declared = Date.parse(status.startupDeadline);
        if (!Number.isFinite(declared) || declared > Date.now() + 3_600_000) throw new Error("Electron startup deadline is invalid");
        deadline = declared + 5_000;
        observedDeadline = true;
      }
    }
    input.assertAlive();
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("Electron did not become product-ready in time; inspect the Shell and its logs to diagnose startup");
}

// The outer process must outlive its bounded host release and physical cleanup.
const termGraceMs = carrier.shutdownTimeoutMs;
if (!Number.isSafeInteger(termGraceMs) || termGraceMs <= standaloneHostControlRequestTimeoutMs({ operation: "lifecycle.release" })) {
  throw new Error("Electron graceful shutdown budget must exceed its host release budget");
}
export const electronGracefulStopOptions = Object.freeze({ termGraceMs });

export async function observeElectronLifecycle(stamp: SidecarStamp, controlRuntimeRoot: string): Promise<unknown> {
  const status = await getSidecarStatus(stamp, { timeoutMs: 1_000 }).catch(() => null);
  return observeElectronDiagnostics(controlRuntimeRoot, status);
}

export async function waitForElectronGeneration(stamp: SidecarStamp, pid: number, controlRuntimeRoot: string): Promise<unknown> {
  return waitForElectronProductReady({
    async readStatus() {
      const status = await getSidecarStatus(stamp, { generationPid: pid, timeoutMs: 800 }).catch(() => null);
      if (status != null) await observeElectronDiagnostics(controlRuntimeRoot, status);
      return status;
    },
    assertAlive() {
      try { process.kill(pid, 0); }
      catch { throw new Error("Electron generation exited before product readiness; inspect the Shell logs to diagnose startup"); }
    },
  });
}

export async function stopElectronGeneration(stamp: SidecarStamp) {
  const electron = await stopSidecar(stamp, electronGracefulStopOptions);
  // Shell shutdown owns guarded retirement. Tools only observe survivors;
  // neither attachment counts nor an orphan authorize extra shared-resource stops.
  const remainingPids = Object.freeze([...new Set([...electron.remainingPids, ...await findElectronRuntimeSurvivors(stamp)])]);
  return Object.freeze({ electron, remainingPids });
}

/** Observe all declared resources; never infer physical exit from attachment counts. */
export async function findElectronRuntimeSurvivors(scope: Readonly<{ channel: string; namespace: string }>): Promise<readonly number[]> {
  const namespaces = [resolveElectronSessionNamespace(scope.namespace, "interactive")];
  try { namespaces.push(resolveElectronSessionNamespace(scope.namespace, "headless")); }
  catch { /* A valid interactive namespace can be too long for a headless suffix. */ }
  const resources = validateElectronPhysicalResourceSet(resourceDeclaration).resources;
  const observations = await Promise.all(namespaces.flatMap(namespace => resources.map(resource =>
    findSidecarProcesses({ ...resource.stamp, channel: scope.channel, namespace }))));
  return Object.freeze([...new Set(observations.flatMap(processes => processes.map(({ pid }) => pid)))]);
}

type LogRoot = Readonly<{ scope: "shell" | "product"; path: string }>;

function logRoots(value: unknown): readonly LogRoot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((root): root is LogRoot => root != null && typeof root === "object"
    && (root.scope === "shell" || root.scope === "product") && typeof root.path === "string" && isAbsolute(root.path))
    .map(({ scope, path }) => ({ scope, path }));
}

/** Diagnostic locations survive exit; process state and CDP never do. */
export async function observeElectronDiagnostics(controlRuntimeRoot: string, status: unknown): Promise<unknown> {
  const path = join(controlRuntimeRoot, "diagnostic-log-roots.json");
  if (status != null) {
    const roots = logRoots(typeof status === "object" && "logRoots" in status ? status.logRoots : null);
    if (roots.length > 0) {
      await mkdir(controlRuntimeRoot, { recursive: true });
      // Concurrent identical observations are harmless; incomplete reads are
      // treated as unavailable diagnostics, never as lifecycle authority.
      await writeFile(path, JSON.stringify(roots), "utf8");
    }
    return status;
  }
  const roots = await readFile(path, "utf8").then((text) => logRoots(JSON.parse(text))).catch(() => []);
  return Object.freeze({ state: "idle", logRoots: roots });
}
