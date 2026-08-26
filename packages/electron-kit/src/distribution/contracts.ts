export type ElectronSceneReceipt = Readonly<{
  schemaVersion: 1;
  operation: "electron.scene.build";
  sceneRoot: string;
  sceneManifestPath: string;
  sceneManifestSha256: string;
  receiptPath: string;
  mainPath: string;
  shellManifestPath: string;
  nodeCarrierLockPath: string;
  runtimeConfigPath: string;
  sidecarPath: string;
}>;

export type ElectronDistributionReceipt = Readonly<{
  schemaVersion: 1;
  platform: "mac" | "win";
  outputRoot: string;
  artifacts: readonly string[];
}>;
