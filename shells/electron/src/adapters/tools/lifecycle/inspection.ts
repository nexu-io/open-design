import { isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveElectronNamespacePaths, resolveElectronRuntimeLogPath, resolveElectronSessionNamespace } from "@open-design/electron-kit";
import { executeElectronCdpContractControl } from "@open-design/electron-kit/cdp";
export { callElectronCdp, withElectronCdp, inspectElectronCdpStatus, type ElectronCdpConnection, type ElectronCdpMessage } from "@open-design/electron-kit/cdp";
export { readElectronInstalledManifest } from "@open-design/electron-kit/installation/inspection";
import { StandaloneStore } from "@open-design/standalone";
import { resolveElectronStandaloneStoreRoot } from "../../standalone/store-root.ts";
export { inspectElectronSelectedCapsule } from "./capsule-inspection.ts";

export type ElectronDiagnosticSession = Readonly<{
  baseUserDataRoot: string; channel: string; namespace: string; presentation: "headless" | "interactive";
}>;

/** Uses producer-owned location contracts; creates no directory or runtime. */
export function describeElectronRuntimeDiagnostics(session: ElectronDiagnosticSession) {
  if (!isAbsolute(session.baseUserDataRoot) || resolve(session.baseUserDataRoot) !== session.baseUserDataRoot
    || (session.presentation !== "headless" && session.presentation !== "interactive")) throw new Error("invalid Electron diagnostic session");
  const scope = { channel: session.channel, namespace: resolveElectronSessionNamespace(session.namespace, session.presentation) };
  const paths = resolveElectronNamespacePaths(session.baseUserDataRoot, scope);
  const store = new StandaloneStore(resolveElectronStandaloneStoreRoot(paths.runtimeRoot), scope);
  return Object.freeze({ runtimeLog: resolveElectronRuntimeLogPath(paths.runtimeRoot),
    standaloneState: store.diagnosticPaths.stateFile, standaloneGenerationsRoot: store.diagnosticPaths.generationsRoot });
}

/** Exercise the declared Closure updater through native CDP, with no file RPC. */
export async function updateElectronClosureThroughCdp(session: ElectronDiagnosticSession) {
  describeElectronRuntimeDiagnostics(session);
  const result = await executeElectronCdpContractControl({ schemaVersion: 1, operation: "electron.cdp.contract.invoke", session, timeoutMs: 120_000, close: true,
    invocations: [{ path: ["updater", "status"], args: [] }, { path: ["updater", "check"], args: ["closure"] },
      { path: ["updater", "apply"], args: ["closure", { force: true }], settleOnContextDestroyed: true }, { path: ["updater", "status"], args: [] }] });
  return Object.freeze({ schemaVersion: 1, operation: "electron.cdp.contract.invoked", ...result });
}

/** Prepare through the public Shell updater without authorizing a restart or installer. */
export async function prepareElectronShellThroughCdp(session: ElectronDiagnosticSession) {
  describeElectronRuntimeDiagnostics(session);
  const result = await executeElectronCdpContractControl({ schemaVersion: 1, operation: "electron.cdp.contract.invoke", session, timeoutMs: 120_000, close: false,
    invocations: [{ path: ["updater", "status"], args: [] }, { path: ["updater", "check"], args: ["shell"] },
      { path: ["updater", "download"], args: ["shell"] }, { path: ["updater", "status"], args: [] }] });
  return Object.freeze({ schemaVersion: 1, operation: "electron.cdp.contract.invoked", ...result });
}

/** Authorization is explicit; transport loss is not proof that replacement completed. */
export async function applyElectronShellThroughCdp(session: ElectronDiagnosticSession) {
  describeElectronRuntimeDiagnostics(session);
  const result = await executeElectronCdpContractControl({ schemaVersion: 1, operation: "electron.cdp.contract.invoke", session, timeoutMs: 120_000, close: false,
    invocations: [{ path: ["updater", "apply"], args: ["shell", { force: true }], settleOnContextDestroyed: true }] });
  return Object.freeze({ schemaVersion: 1, operation: "electron.cdp.contract.invoked", ...result });
}

/** Best-effort native close for a caller-owned relaunch, even without a bridge. */
export async function closeElectronDiagnosticSession(session: ElectronDiagnosticSession) {
  describeElectronRuntimeDiagnostics(session);
  return executeElectronCdpContractControl({ schemaVersion: 1, operation: "electron.cdp.contract.invoke", session,
    timeoutMs: 5_000, close: true, invocations: [] });
}

/** Observe the current launch without issuing CDP calls or closing the product. */
export async function waitForElectronStartup(session: ElectronDiagnosticSession, startedAfter: number, timeoutMs = 540_000) {
  if (!Number.isFinite(startedAfter)) throw new Error("Startup observation requires the launch timestamp");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error("Startup observation timeout is invalid");
  const diagnostics = describeElectronRuntimeDiagnostics(session);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let events: Array<{ event: string; attemptId?: string; timestamp: string }> = [];
    try {
      const log = await readFile(diagnostics.runtimeLog, "utf8");
      events = log.split("\n").slice(0, -1).filter(Boolean).map(line => JSON.parse(line))
        .filter(event => Date.parse(event.timestamp) >= startedAfter);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const startup = events.findLast(event => event.event === "startup.committed");
    // The carrier emits these only after validating Capsule's renderer-mounted signal.
    if (startup && typeof startup.attemptId === "string" && events.some(event => event.attemptId === startup.attemptId && event.event === "capsule.startup.ready")) return startup;
    if (events.some(event => event.event === "startup.failed")) throw new Error("Installed Electron startup failed; inspect runtime log: " + diagnostics.runtimeLog);
    if (Date.now() >= deadline) throw new Error("Installed Electron startup did not commit; inspect runtime log: " + diagnostics.runtimeLog);
    await new Promise(done => setTimeout(done, 100));
  }
}

/** Observe committed product startup before closing through native CDP. */
export async function inspectElectronStartupThroughCdp(session: ElectronDiagnosticSession, startedAfter: number, timeoutMs = 540_000) {
  const deadline = Date.now() + timeoutMs;
  const startup = await waitForElectronStartup(session, startedAfter, timeoutMs);
  const result = await executeElectronCdpContractControl({ schemaVersion: 1, operation: "electron.cdp.contract.invoke", session,
    timeoutMs: Math.max(1_000, Math.min(120_000, deadline - Date.now())), close: true,
    invocations: [{ path: ["updater", "status"], args: [] }] });
  return { ...result, attemptId: startup.attemptId };
}

/** A CDP disconnect is not process-exit evidence, especially after relaunch. */
export async function waitForElectronShutdown(session: ElectronDiagnosticSession, startedAfter: number, timeoutMs = 90_000) {
  const diagnostics = describeElectronRuntimeDiagnostics(session), deadline = Date.now() + timeoutMs;
  if (!Number.isFinite(startedAfter) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("invalid shutdown observation bound");
  for (;;) {
    const events = (await readFile(diagnostics.runtimeLog, "utf8")).split("\n").slice(0, -1).filter(Boolean)
      .map(line => JSON.parse(line) as { event: string; attemptId: string; timestamp: string })
      .filter(event => Date.parse(event.timestamp) >= startedAfter);
    const startup = events.findLast(event => event.event === "startup.committed");
    if (startup && events.some(event => event.attemptId === startup.attemptId && event.event === "shutdown.complete")) return;
    if (Date.now() >= deadline) throw new Error("Installed Electron shutdown did not complete: " + diagnostics.runtimeLog);
    await new Promise(done => setTimeout(done, 100));
  }
}
