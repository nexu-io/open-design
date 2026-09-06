import type { OpenDesignElectronBridge, OpenDesignElectronGlobalScope } from "./protocol.js";

// The concrete contextBridge slot is deliberately private. Consumers and
// producers share declarations and accessors, never the physical locator.
const electronContractSlot = "__od_electron_contract_7c6f3a9d";

export function readElectronContractCandidate(scope: OpenDesignElectronGlobalScope): unknown {
  if (electronContractSlot in scope) return scope[electronContractSlot];
  const windowValue = scope.window;
  if (typeof windowValue === "object" && windowValue != null && electronContractSlot in windowValue) {
    return (windowValue as Record<string, unknown>)[electronContractSlot];
  }
  return undefined;
}

export function exposeElectronContract(
  expose: (slot: string, bridge: OpenDesignElectronBridge) => void,
  bridge: OpenDesignElectronBridge,
): void {
  expose(electronContractSlot, bridge);
}

export function installElectronContractForTesting(
  scope: OpenDesignElectronGlobalScope,
  bridge: OpenDesignElectronBridge,
): () => void {
  const windowValue = scope.window;
  const targets = [
    scope,
    ...(typeof windowValue === "object" && windowValue != null && windowValue !== scope
      ? [windowValue as OpenDesignElectronGlobalScope]
      : []),
  ];
  const previous = targets.map((target) => ({
    had: Object.prototype.hasOwnProperty.call(target, electronContractSlot),
    target,
    value: target[electronContractSlot],
  }));
  for (const target of targets) {
    Object.defineProperty(target, electronContractSlot, {
      configurable: true,
      value: bridge,
      writable: true,
    });
  }
  return () => {
    for (const entry of previous) {
      if (entry.had) {
        Object.defineProperty(entry.target, electronContractSlot, {
          configurable: true,
          value: entry.value,
          writable: true,
        });
      } else {
        delete entry.target[electronContractSlot];
      }
    }
  };
}
