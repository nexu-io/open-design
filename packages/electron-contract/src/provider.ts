import { isOpenDesignElectronBridge } from "./detection.js";
import { exposeElectronContract } from "./locator.js";
import type { OpenDesignElectronBridge } from "./protocol.js";

export type ElectronContractExposure = Readonly<{
  exposeInMainWorld(slot: string, bridge: OpenDesignElectronBridge): void;
}>;

/** Install a declared renderer contract without exposing its physical slot. */
export function installOpenDesignElectronContract(
  exposure: ElectronContractExposure,
  bridge: OpenDesignElectronBridge,
): void {
  if (!isOpenDesignElectronBridge(bridge)) throw new Error("OpenDesign Electron contract is invalid");
  exposeElectronContract((slot, value) => exposure.exposeInMainWorld(slot, value), bridge);
}
