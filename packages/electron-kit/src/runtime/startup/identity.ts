import type { Protocol } from "electron";
import { prepareElectronNamespacePaths, type ElectronPathApp } from "../session/namespace-paths.js";
import { claimElectronSingleInstanceLock, type ElectronSingleInstanceApp } from "../session/single-instance.js";
import { applyElectronPreflight, type ElectronPreflightApp, type ElectronPreflightTopology } from "./preflight/index.js";
import { ElectronStartupCancelledError } from "./cancellation.js";

/** Entire pre-ready identity boundary. No product module is needed to claim a
 * process or suppress activation, including losing second instances. */
export async function prepareElectronCarrierIdentity(input: Readonly<{
  app: ElectronPreflightApp & ElectronPathApp & ElectronSingleInstanceApp & Readonly<{
    setName(name: string): void;
    setActivationPolicy(policy: "regular" | "accessory" | "prohibited"): void;
  }>;
  protocol: Pick<Protocol, "registerSchemesAsPrivileged">;
  platform: NodeJS.Platform;
  productName: string;
  scheme: string;
  channel: string;
  namespace: string;
  preflight: ElectronPreflightTopology;
  presentation: "headless" | "interactive";
}>): Promise<Readonly<{ paths: Awaited<ReturnType<typeof prepareElectronNamespacePaths>>; preflight: ReturnType<typeof applyElectronPreflight> }> | null> {
  const preflight = applyElectronPreflight(input.app, input.preflight);
  if (input.platform === "darwin" && input.presentation === "headless") input.app.setActivationPolicy("prohibited");
  input.app.setName(input.productName);
  input.protocol.registerSchemesAsPrivileged([{ scheme: input.scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  const paths = await prepareElectronNamespacePaths(input.app, { channel: input.channel, namespace: input.namespace, productName: input.productName });
  if (!await claimElectronSingleInstanceLock(input.app)) return null;
  return Object.freeze({ paths, preflight });
}

/** Module loading owns no product processes yet. A quit during its asynchronous
 * work must never continue into product/window creation afterwards. */
export async function loadElectronCarrierCapsule<T>(app: Readonly<{
  on(event: "before-quit", listener: () => void): void;
  removeListener(event: "before-quit", listener: () => void): void;
}>, load: () => Promise<T>): Promise<T> {
  let cancelled = false;
  const beforeQuit = () => { cancelled = true; };
  app.on("before-quit", beforeQuit);
  try {
    const result = await load();
    if (cancelled) throw new ElectronStartupCancelledError();
    return result;
  } catch (error) {
    if (cancelled) throw new ElectronStartupCancelledError();
    throw error;
  } finally { app.removeListener("before-quit", beforeQuit); }
}
