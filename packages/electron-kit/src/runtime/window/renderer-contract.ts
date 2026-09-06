import type { OpenDesignElectronBridge } from "@open-design/electron-contract";
import { installOpenDesignElectronContract } from "@open-design/electron-contract/provider";

export type ElectronRendererContractExposure = Readonly<{
  exposeInMainWorld(slot: string, bridge: OpenDesignElectronBridge): void;
}>;

/** Wire a declared product contract through Electron's isolated context. */
export function installElectronRendererContract(
  exposure: ElectronRendererContractExposure,
  bridge: OpenDesignElectronBridge,
): void {
  installOpenDesignElectronContract(exposure, bridge);
}
