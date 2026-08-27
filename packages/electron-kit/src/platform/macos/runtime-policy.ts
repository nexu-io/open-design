import {
  ELECTRON_MAC_RUNTIME_POLICY_SCHEMA_VERSION,
  type ElectronMacRuntimePolicy,
  type ElectronMacRuntimePolicyReceipt,
} from "./contracts.js";

export type ElectronMacRuntimeApp = Readonly<{
  setActivationPolicy(policy: "regular" | "accessory" | "prohibited"): void;
  dock?: Readonly<{
    hide(): void;
    show(): Promise<void>;
  }>;
}>;

export function validateElectronMacRuntimePolicy(value: ElectronMacRuntimePolicy): ElectronMacRuntimePolicy {
  if (
    value.schemaVersion !== ELECTRON_MAC_RUNTIME_POLICY_SCHEMA_VERSION
    || value.activationPolicy !== "regular"
    || value.dock.headless !== "hidden"
    || value.dock.interactive !== "visible"
    || value.dock.pinning !== "system-owned"
  ) {
    throw new Error("invalid Electron macOS runtime policy");
  }
  return structuredClone(value);
}

/**
 * Apply only process-local presentation. Dock pinning is persisted and matched
 * to the bundle identity by macOS; Electron has no pin/unpin API or pin state.
 */
export async function applyElectronMacRuntimePolicy(input: Readonly<{
  app: ElectronMacRuntimeApp;
  platform: NodeJS.Platform;
  policy: ElectronMacRuntimePolicy;
  presentation: "headless" | "interactive";
}>): Promise<ElectronMacRuntimePolicyReceipt> {
  const policy = validateElectronMacRuntimePolicy(input.policy);
  if (input.platform !== "darwin") {
    return Object.freeze({
      applied: false,
      activationPolicy: null,
      dockVisibility: "not-applicable",
      pinning: policy.dock.pinning,
    });
  }
  input.app.setActivationPolicy(policy.activationPolicy);
  if (input.presentation === "headless") input.app.dock?.hide();
  else await input.app.dock?.show();
  return Object.freeze({
    applied: true,
    activationPolicy: policy.activationPolicy,
    dockVisibility: input.presentation === "headless" ? policy.dock.headless : policy.dock.interactive,
    pinning: policy.dock.pinning,
  });
}
