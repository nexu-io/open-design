export const ELECTRON_MAC_RUNTIME_POLICY_SCHEMA_VERSION = 1 as const;

export type ElectronMacRuntimePolicy = Readonly<{
  schemaVersion: typeof ELECTRON_MAC_RUNTIME_POLICY_SCHEMA_VERSION;
  activationPolicy: "regular";
  dock: Readonly<{
    headless: "hidden";
    interactive: "visible";
    pinning: "system-owned";
  }>;
}>;

export type ElectronMacRuntimePolicyReceipt = Readonly<{
  applied: boolean;
  activationPolicy: "regular" | null;
  dockVisibility: "hidden" | "not-applicable" | "visible";
  pinning: "system-owned";
}>;
