export type ElectronSceneReceipt = Readonly<{
  schemaVersion: 1;
  sceneRoot: string;
  mainPath: string;
  manifestPath: string;
  nodeCarrierLockPath: string;
  sidecarPath: string;
  warmupPath: string;
}>;

export type ElectronDistributionReceipt = Readonly<{
  schemaVersion: 1;
  platform: "mac" | "win";
  outputRoot: string;
  artifacts: readonly string[];
}>;
