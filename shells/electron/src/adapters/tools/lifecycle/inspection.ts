import { isAbsolute, resolve } from "node:path";
import { resolveElectronNamespacePaths, resolveElectronRuntimeLogPath, resolveElectronSessionNamespace } from "@open-design/electron-kit";
import { executeElectronCdpContractControl } from "@open-design/electron-kit/cdp";
export { readElectronInstalledManifest } from "@open-design/electron-kit/installation/inspection";
import { StandaloneStore } from "@open-design/standalone";
import { resolveElectronStandaloneStoreRoot } from "../../standalone/store-root.ts";

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
